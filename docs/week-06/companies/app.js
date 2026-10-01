/* SEC-powered, browser-computed annual performance and conditional forecast. */
(() => {
  "use strict";
  const M=window.CompanyForecast;
  const el=id=>document.getElementById(id);
  const colors={revenue:"#0b7f73",operating:"#365977",net:"#aa7840",baseline:"#8c9ba4"};
  const labels={revenue:"Revenue",operating:"Operating income",net:"Net income"};
  const cache=new Map();
  let manifest=null,company=null,sequence=0,scheduled=null;
  let activeTicker=null;
  const research=window.EquityResearchUI;
  // Public Worker address, not a credential. FINNHUB_TOKEN is server-side.
  const QUOTE_API="https://finc-560-finnhub.joseph-caruso-pc.workers.dev";
  let quoteController=null,quoteGeneration=0;
  function resetQuote(){
    quoteGeneration++;
    if(quoteController)quoteController.abort();
    quoteController=null;
    el("quote-price").textContent="—";
    el("quote-change").textContent="—";
    el("quote-change").className="market-change";
    el("quote-status").textContent="Loading latest market quote…";
    el("quote-refresh").disabled=true;
  }
  async function loadQuote(ticker){
    // Tickers are restricted to the verified published manifest.
    if(!ticker||activeTicker!==ticker)return;
    const generation=++quoteGeneration;
    if(quoteController)quoteController.abort();
    const controller=new AbortController();
    quoteController=controller;
    el("quote-refresh").disabled=true;
    try{
      const response=await fetch(QUOTE_API+"/quote?symbol="+encodeURIComponent(ticker),{
        method:"GET",mode:"cors",cache:"no-store",signal:controller.signal
      });
      if(!response.ok){
        if(response.status===429)throw Error("Quote requests temporarily limited. Try again shortly.");
        throw Error("Latest quote unavailable. Annual financial forecasts are unaffected.");
      }
      const quote=await response.json();
      if(!Number.isFinite(quote.c)||quote.c<=0)throw Error("Finnhub returned no usable market price.");
      if(generation!==quoteGeneration||activeTicker!==ticker)return;
      const change=Number.isFinite(quote.d)?quote.d:
        Number.isFinite(quote.pc)&&quote.pc>0?quote.c-quote.pc:null;
      const percentage=Number.isFinite(quote.dp)?quote.dp:
        change!==null&&quote.pc>0?change/quote.pc*100:null;
      el("quote-price").textContent=quote.c.toLocaleString("en-US",{
        style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2
      });
      el("quote-change").className="market-change"+(change===null?"":change<0?" is-down":" is-up");
      el("quote-change").textContent=change===null?"Change unavailable":
        (change>=0?"+":"−")+"$"+Math.abs(change).toFixed(2)+
        (percentage===null?"":" ("+(percentage>=0?"+":"−")+Math.abs(percentage).toFixed(2)+"%)");
      const stamp=Number.isFinite(quote.t)&&quote.t>=946684800&&
        quote.t<=Date.now()/1000+120?new Date(quote.t*1000):null;
      research.setQuote(ticker,quote);
      el("quote-status").textContent=stamp
        ?"Finnhub · As of "+stamp.toLocaleString("en-US",{
          month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"
        })+" · May be delayed"
        :"Finnhub latest quote · Time unavailable; may be delayed";
    }catch(error){
      if(generation!==quoteGeneration||activeTicker!==ticker)return;
      if(error.name==="AbortError")return;
      el("quote-price").textContent="—";
      el("quote-change").textContent="Unavailable";
      el("quote-change").className="market-change";
      el("quote-status").textContent=error.message||"Quote unavailable; annual forecasts still work.";
    }finally{
      if(generation===quoteGeneration){
        quoteController=null;
        el("quote-refresh").disabled=false;
      }
    }
  }
  // Manual range changes happen ONLY when the user explicitly presses
  // Fit projection. Dials, model choice and forecast horizon cannot rescale.
  let scaleContext=null,manualYRange=null,lastRenderedValues=null;
  const USD=n=>!Number.isFinite(n)?"—":"$"+(Math.abs(n)>=1000?
    (n/1000).toLocaleString("en-US",{maximumFractionDigits:1})+"B":
    n.toLocaleString("en-US",{maximumFractionDigits:0})+"M");
  const signed=n=>(n>0?"+":"")+n+" pp";
  const metricKey=()=>M.METRICS[el("metric").value];
  const settings=()=>({
    method:el("method").value,horizon:Number(el("horizon").value),
    growth:Number(el("growth").value),margin:Number(el("margin").value)
  });
  // Compute the plot viewport from the chart CARD, not the Plotly div
  // itself. The div includes Plotly's previous inline height and a flex
  // header; measuring it recursively would shrink the plot ~45px after
  // every slider movement despite an identical y-axis range.
  let cachedPlotHeight=null;
  const fullChartHeight=()=>{
    if(cachedPlotHeight!==null)return cachedPlotHeight;
    const card=el("company-chart").closest(".chart-card");
    const header=card.querySelector(".chart-heading");
    const style=window.getComputedStyle(card);
    const pad=(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0);
    cachedPlotHeight=Math.max(235,Math.floor(card.clientHeight-header.offsetHeight-pad-2));
    return cachedPlotHeight;
  };
  // Plotly.react is async; rapidly changing sliders must not let an older
  // render paint over the most recent scenario.
  let queuedPlot=null,renderingPlot=false;
  async function plotLatest(){
    if(renderingPlot)return;
    renderingPlot=true;
    try{
      while(queuedPlot){
        const {traces,layout}=queuedPlot;
        queuedPlot=null;
        await window.Plotly.react("company-chart",traces,layout,{
          responsive:true,displayModeBar:false,displaylogo:false,scrollZoom:false,
        });
      }
    }catch(error){showError(error);}
    finally{renderingPlot=false;}
  }
  function financialCharts(history,result){
    const key=metricKey(),metric=el("metric").value;
    const color=colors[metric],unit="USD billions";
    const actual=history.map(r=>r[key]/1000);
    const projected=result.projected.map(r=>r[key]/1000);
    const baseline=result.baseline.map(r=>r[key]/1000);
    const xObserved=history.map(r=>r.fiscal_end);
    const xProjected=result.projected.map(r=>r.fiscal_end);
    const boundary=xObserved.at(-1),endDate=xProjected.at(-1);
    if(boundary!==xProjected[0]||actual.at(-1)!==projected[0]||
       !history.length||xObserved[0]>=endDate){
      throw Error("Forecast must connect to the final reported fiscal year.");
    }
    const displayBaseline=settings().growth!==0||settings().margin!==0;
    // Lock scale for this COMPANY + MEASURE + HISTORICAL WINDOW. Two
    // unadjusted model baselines at the maximum 3-year horizon anchor the
    // default range: never include a live dial-adjusted projection here.
    const context=[company.ticker,company.annual.at(-1).fiscal_end,
      metric,el("history").value].join("|");
    if(scaleContext!==context){
      manualYRange=null;
      scaleContext=context;
    }
    const referenceValues=actual.concat(["cagr","linear"].flatMap(method=>
      M.forecast(company,{method,horizon:3,growth:0,margin:0})
        .projected.map(r=>r[key]/1000)));
    const baseMin=Math.min(...referenceValues),baseMax=Math.max(...referenceValues);
    const basePadding=Math.max((baseMax-baseMin)*.14,Math.abs(baseMax)*.035,.5);
    const defaultYRange=[baseMin-basePadding,baseMax+basePadding];
    const range=manualYRange||defaultYRange;
    const shownValues=actual.concat(projected,displayBaseline?baseline:[]);
    lastRenderedValues=shownValues;
    const overflow=shownValues.some(v=>v<range[0]||v>range[1]);
    const fitButton=el("fit-company-projection");
    fitButton.disabled=!overflow&&!manualYRange;
    fitButton.textContent=overflow?"Fit projection":
      manualYRange?"Restore scale":"Scale locked";
    fitButton.title=overflow
      ? "Explicitly expand the vertical scale to include this scenario"
      : manualYRange?"Restore the fixed model-reference scale":
        "Vertical scale remains fixed while adjusting assumptions";
    const observedTrace={
      x:xObserved,y:actual,type:"scatter",mode:"lines+markers",
      name:"Reported (solid)",legendrank:10,line:{color,width:2.7},marker:{color,size:5},
      hovertemplate:"FY ending %{x|%b %Y}<br>$%{y:,.2f}B<extra>Annual reported</extra>"
    };
    const scenarioTrace={
      x:xProjected,y:projected,type:"scatter",mode:"lines+markers",
      name:displayBaseline?"Adjusted scenario (dashed)":"Model forecast (dashed)",
      legendrank:20,
      line:{color,width:2.65,dash:"dash"},marker:{color,size:5},
      hovertemplate:"FY ending %{x|%b %Y}<br>$%{y:,.2f}B<extra>Browser model</extra>"
    };
    const baselineTrace={
      x:xProjected,y:baseline,type:"scatter",mode:"lines",
      name:"Unadjusted baseline (dotted)",legendrank:30,
      line:{color:colors.baseline,width:1.9,dash:"dot"},
      hovertemplate:"FY ending %{x|%b %Y}<br>$%{y:,.2f}B<extra>Unadjusted model</extra>"
    };
    // There is exactly one date and financial-value axis. Future width is
    // determined by its actual elapsed calendar duration, not split cards.
    const total=Date.parse(endDate)-Date.parse(xObserved[0]);
    const cutoff=(Date.parse(boundary)-Date.parse(xObserved[0]))/total;
    const layout={
      autosize:true,height:fullChartHeight(),
      margin:{l:66,r:18,t:68,b:47,autoexpand:false},
      paper_bgcolor:"#fff",plot_bgcolor:"#fff",
      font:{family:"Inter,system-ui,sans-serif",size:11,color:"#465865"},
      showlegend:true,hovermode:"closest",
      legend:{orientation:"h",x:.5,xanchor:"center",y:1.14,font:{size:10},autoexpand:false},
      xaxis:{
        type:"date",range:[xObserved[0],endDate],
        tickformat:"%Y",dtick:"M12",showgrid:false,
        linecolor:"#dfe3e6",automargin:true,
      },
      yaxis:{
        title:{text:unit,font:{size:11}},
        tickprefix:"$",ticksuffix:"B",
        gridcolor:"#edf1f2",range:range.slice(),
        zeroline:false,automargin:true,
      },
      shapes:[
        {type:"rect",xref:"x",yref:"paper",x0:boundary,x1:endDate,
          y0:0,y1:1,fillcolor:"rgba(11,127,115,.045)",line:{width:0},layer:"below"},
        {type:"line",xref:"x",yref:"paper",x0:boundary,x1:boundary,
          y0:0,y1:1,line:{color:"#92aba7",width:1.35,dash:"dash"}}
      ],
      // Projection shading and the style-specific legend replace repeated
      // labels floating above the observed/projected boundary.
      annotations:[],
      meta:{singleChart:true,continuousCalendar:true,cutoffFraction:cutoff,
        observedStart:xObserved[0],observedEnd:boundary,
        projectionStart:xProjected[0],projectionEnd:endDate,
        measure:metric,unit,model:result.method,
        yScale:manualYRange?"manual-locked":"baseline-locked",
        defaultYRange:defaultYRange.slice(),projectionClipped:overflow}
    };
    el("chart-heading").textContent=labels[metric];
    el("chart-footnote").textContent=overflow
      ? labels[metric]+" · Projection extends outside the locked scale. Use Fit projection to view it."
      : labels[metric]+" · "+unit+
        " · Solid = reported • Dashed = browser forecast • Dotted = unadjusted baseline";
    const traces=displayBaseline?
      [observedTrace,baselineTrace,scenarioTrace]:
      [observedTrace,scenarioTrace];
    queuedPlot={traces,layout};
    void plotLatest();
  }
  function render(){
    if(!company)return;
    try{
      const assumptions=settings();
      const result=M.forecast(company,assumptions);
      const history=M.history(company,el("history").value);
      const last=company.annual.at(-1);
      const finish=result.projected.at(-1);
      el("growth-value").textContent=signed(assumptions.growth);
      el("margin-value").textContent=signed(assumptions.margin);
      el("kpi-revenue").textContent=USD(last.revenue_musd);
      el("kpi-profit").textContent=USD(last.net_income_musd);
      el("kpi-forecast-revenue").textContent=USD(finish.revenue_musd);
      el("kpi-forecast-profit").textContent=USD(finish.net_income_musd);
      el("preview-revenue").textContent=USD(finish.revenue_musd);
      el("preview-profit").textContent=USD(finish.net_income_musd);
      el("model-note").textContent=assumptions.growth===0&&assumptions.margin===0?
        "Historical "+(assumptions.method==="cagr"?"CAGR":"OLS trend")+
        " revenue with recent weighted profit margins.":
        (assumptions.method==="cagr"?"CAGR":"OLS trend")+" · conditional "+(assumptions.growth>=0?"+":"")+assumptions.growth+
        " pp growth and "+(assumptions.margin>=0?"+":"")+assumptions.margin+
        " pp margin versus baseline; assumptions, not probabilities.";
      const back=M.backtestRevenue(company,assumptions.method);
      el("backtest").textContent="Model $"+(back.model_rmse_musd/1000).toFixed(1)+
        "B / no-change $"+(back.naive_rmse_musd/1000).toFixed(1)+
        "B ("+back.n+" historical one-year origins).";
      // Builds traces synchronously; Plotly failures are handled in plotLatest().
      financialCharts(history,result);
    }catch(error){showError(error);}
  }
  function queueRender(){
    if(scheduled!==null)return;
    scheduled=window.requestAnimationFrame(()=>{
      scheduled=null;
      render();
    });
  }
  function showError(error){
    el("data-error").hidden=false;
    el("data-error").textContent=String(error.message||error);
  }
  function showAnnual(payload){
    if(!payload)return;
    company=payload;
    el("company-empty").hidden=true;
    el("company-chart").hidden=false;
    el("company-name").textContent=payload.company;
    el("source-period").textContent="FY ending "+payload.annual.at(-1).fiscal_end;
    el("data-refresh").textContent=payload.refresh_mode==="finnhub-as-reported"
      ?"Finnhub 10-K financials · Retrieved "+payload.retrieved_utc.slice(0,10):
      payload.refresh_mode==="curated"?"Verified annual snapshot · "+payload.retrieved_utc.slice(0,10):
      "SEC refreshed "+payload.retrieved_utc.slice(0,10);
    const source=payload.data_source;
    if(source&&/^https:\/\/(?:data\.sec\.gov\/api\/xbrl\/companyfacts\/CIK\d{10}\.json|www\.sec\.gov\/Archives\/edgar\/data\/|(?:www\.)?microsoft\.com\/)/.test(source)){
      el("sec-link").href=source;
    }
    el("data-error").hidden=true;
    render();
  }
  function clearAnnual(ticker){
    company=null;
    el("company-name").textContent=ticker+" · Checking financial statements";
    el("company-empty").hidden=false;
    el("company-chart").hidden=true;
    el("company-empty-title").textContent="Checking financial statement coverage";
    el("company-empty-message").textContent="Looking for comparable annual filings for "+ticker+".";
    el("source-period").textContent="Awaiting 10-K data";
    el("data-refresh").textContent="Finnhub as-reported · Checking coverage";
    for(const id of ["kpi-revenue","kpi-profit","kpi-forecast-revenue","kpi-forecast-profit",
      "preview-revenue","preview-profit"])el(id).textContent="—";
    el("model-note").textContent="This company needs five comparable filings to enable revenue forecasts.";
    el("backtest").textContent="Awaiting complete annual reports.";
    el("chart-footnote").textContent="No historical or modeled values are shown until source validation succeeds.";
    if(window.Plotly)window.Plotly.purge("company-chart");
  }
  function unavailableAnnual(details){
    if(company||activeTicker!==details.ticker)return;
    const p=details.profile||{};
    const international=(p.country&&p.country!=="US")||(p.currency&&p.currency!=="USD");
    el("company-name").textContent=(p.name||details.ticker)+(p.exchange?" · "+p.exchange:"");
    el("company-empty-title").textContent=international
      ?"International company: financial history unavailable":"Annual financial history unavailable";
    el("company-empty-message").textContent=international
      ?"Finnhub returned no usable US 10-K history for "+details.ticker+
        ". It reports in "+(p.currency||"a non-USD currency")+
        ". Our annual models require five comparable USD SEC 10-K filings. "+
        "Finnhub's international standardized financial statements require premium access."
      :details.failed
        ?"Finnhub's financial statement request failed. Market quotes and company profile can still work."
        :"Finnhub returned "+details.years+" usable fiscal years. Historical forecasts require at least five comparable annual reports.";
    el("source-period").textContent="No comparable annual filings";
    el("data-refresh").textContent="Quote and company profile available";
    el("model-note").textContent="Financial forecasts require five comparable verified annual filings; unavailable figures are never estimated.";
    el("backtest").textContent="Unavailable without sufficient annual reports.";
    el("chart-footnote").textContent="The historical chart is unavailable for this ticker; market data and profile may still be available.";
  }
  async function loadCompany(ticker){
    if(!manifest||!M||!research)return;
    ticker=String(ticker||"").trim().toUpperCase();
    if(!/^[A-Z][A-Z.]{0,9}$/.test(ticker))return;
    const generation=++sequence;
    activeTicker=ticker;
    el("company-name").textContent="Loading "+ticker+"…";
    resetQuote();
    el("data-error").hidden=true;
    scaleContext=null;manualYRange=null;lastRenderedValues=null;
    const item=manifest.companies.find(row=>row.ticker===ticker);
    const oldCustom=[...el("ticker").options].find(o=>o.dataset.custom==="true");
    if(oldCustom)oldCustom.remove();
    if(!item){
      const option=document.createElement("option");
      option.dataset.custom="true";
      option.value=ticker;
      option.textContent=ticker+" · Custom";
      el("ticker").append(option);
    }
    el("ticker").value=ticker;
    let curated=null;
    try{
      if(item){
        curated=cache.get(ticker);
        if(!curated){
          if(!/^data\/[A-Z.]{1,10}\.json$/.test(item.file)){
            throw Error("Published manifest contains an invalid company data path.");
          }
          const response=await fetch("./"+item.file,{cache:"no-cache"});
          if(!response.ok)throw Error("Verified financial snapshots unavailable for "+ticker);
          curated=M.verify(await response.json());
          if(curated.ticker!==ticker)throw Error("Ticker does not match SEC snapshot");
          cache.set(ticker,curated);
        }
      }
      if(generation!==sequence)return;
      if(curated)showAnnual(curated);
      else clearAnnual(ticker);
      void loadQuote(ticker);
      void research.load(ticker,curated,normalized=>{
        if(generation!==sequence||activeTicker!==ticker)return;
        const validated=M.verify(normalized);
        // Do not replace a newer curated fiscal year with an older filing.
        if(curated&&validated.annual.at(-1).fiscal_end<curated.annual.at(-1).fiscal_end)return;
        showAnnual(validated);
      },unavailableAnnual);
    }catch(error){
      if(generation!==sequence)return;
      clearAnnual(ticker);
      // Keep the live profile, metrics and statement retrieval available
      // even when a featured local snapshot could not be retrieved.
      void loadQuote(ticker);
      void research.load(ticker,null,normalized=>{
        if(generation!==sequence)return;
        showAnnual(M.verify(normalized));
      },unavailableAnnual);
    }
  }
  async function initialize(){
    try{
      if(!window.Plotly||!M||!research)throw Error("Browser research or forecasting engine unavailable.");
      research.init();
      document.querySelectorAll("[data-research-example]").forEach(button=>{
        button.addEventListener("click",()=>{
          el("custom-ticker").value=button.dataset.researchExample;
          void loadCompany(button.dataset.researchExample);
        });
      });
      el("symbol-form").addEventListener("research-ticker",event=>{
        void loadCompany(event.detail.ticker);
      });
      for(const id of ["method","horizon","metric","history"]){
        el(id).addEventListener("change",queueRender);
      }
      for(const id of ["growth","margin"]){
        el(id).addEventListener("input",queueRender);
        el(id).addEventListener("change",queueRender);
      }
      el("ticker").addEventListener("change",()=>void loadCompany(el("ticker").value));
      el("quote-refresh").addEventListener("click",()=>{
        if(activeTicker)void loadQuote(activeTicker);
      });
      // Refresh displayed market quotes approximately once per minute, only in visible tabs.
      window.setInterval(()=>{
        if(activeTicker&&document.visibilityState==="visible")void loadQuote(activeTicker);
      },60000);
      el("fit-company-projection").addEventListener("click",()=>{
        if(!lastRenderedValues||!company)return;
        if(el("fit-company-projection").textContent==="Restore scale"){
          manualYRange=null;
        }else{
          // This change to the y-axis is *explicit*, never slider-driven.
          const lo=Math.min(...lastRenderedValues),hi=Math.max(...lastRenderedValues);
          const pad=Math.max((hi-lo)*.14,Math.abs(hi)*.035,.5);
          manualYRange=[lo-pad,hi+pad];
        }
        render();
      });
      el("reset").addEventListener("click",()=>{
        manualYRange=null;
        scaleContext=null;
        el("method").value="cagr";el("horizon").value="3";
        el("growth").value="0";el("margin").value="0";
        el("metric").value="revenue";el("history").value="5";
        queueRender();
      });
      let timer;
      window.addEventListener("resize",()=>{
        clearTimeout(timer);
        timer=setTimeout(()=>{cachedPlotHeight=null;render();},130);
      });
      const res=await fetch("./data/manifest.json",{cache:"no-cache"});
      if(!res.ok)throw Error("Featured SEC financial snapshots are not published yet.");
      const m=await res.json();
      if(m.status!=="ready"||!Array.isArray(m.companies)||m.companies.length<2){
        throw Error("Verified featured SEC data is not available yet.");
      }
      manifest=m;
      el("ticker").replaceChildren();
      for(const row of m.companies){
        const option=document.createElement("option");
        option.value=row.ticker;
        option.textContent=row.ticker;
        el("ticker").append(option);
      }
      el("ticker").disabled=false;
      await loadCompany(m.companies[0].ticker);
    }catch(error){
      el("source-period").textContent="Unavailable";
      showError(error);
    }
  }
  initialize();
})();
