/* SEC-powered, browser-computed annual performance and conditional forecast. */
(() => {
  "use strict";
  const M=window.CompanyForecast;
  const el=id=>document.getElementById(id);
  const colors={revenue:"#0b7f73",operating:"#365977",net:"#aa7840",baseline:"#8c9ba4"};
  const labels={revenue:"Revenue",operating:"Operating income",net:"Net income"};
  const cache=new Map();
  let manifest=null,company=null,sequence=0,scheduled=null;
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
  const fullChartHeight=()=>el("company-chart").clientHeight||340;
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
      name:"Reported",line:{color,width:2.7},marker:{color,size:5},
      hovertemplate:"FY ending %{x|%b %Y}<br>$%{y:,.2f}B<extra>Annual reported</extra>"
    };
    const scenarioTrace={
      x:xProjected,y:projected,type:"scatter",mode:"lines+markers",
      name:displayBaseline?"Adjusted scenario":"Model forecast",
      line:{color,width:2.65,dash:"dash"},marker:{color,size:5},
      hovertemplate:"FY ending %{x|%b %Y}<br>$%{y:,.2f}B<extra>Browser model</extra>"
    };
    const baselineTrace={
      x:xProjected,y:baseline,type:"scatter",mode:"lines",
      name:"Unadjusted baseline",
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
      annotations:[
        {xref:"x",yref:"paper",x:boundary,y:1.055,xanchor:"right",
          xshift:-10,showarrow:false,text:"<b>REPORTED</b>",
          font:{size:10,color:"#314b5c"}},
        {xref:"x",yref:"paper",x:boundary,y:1.055,xanchor:"left",
          xshift:10,showarrow:false,
          text:displayBaseline?"<b>SCENARIO</b>":"<b>FORECAST</b>",
          font:{size:10,color:"#0b7f73"}}
      ],
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
      void financialCharts(history,result).catch(error=>showError(error));
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
  async function loadCompany(ticker){
    if(!manifest)return;
    const generation=++sequence;
    el("company-name").textContent="Loading "+ticker+"…";
    el("data-error").hidden=true;
    try{
      let payload=cache.get(ticker);
      if(!payload){
        // Do not construct URLs from untrusted user input. Ticker must be
        // an exact member of our verified published SEC manifest.
        const item=manifest.companies.find(row=>row.ticker===ticker);
        if(!item||!/^data\/[A-Z.]{1,10}\.json$/.test(item.file)){
          throw Error("That ticker is not in the refreshed featured dataset.");
        }
        const response=await fetch("./"+item.file,{cache:"no-cache"});
        if(!response.ok)throw Error("Financial statements unavailable for "+ticker);
        payload=M.verify(await response.json());
        if(payload.ticker!==ticker)throw Error("Ticker does not match SEC snapshot");
        cache.set(ticker,payload);
      }
      if(generation!==sequence)return;
      company=payload;
      el("company-name").textContent=payload.company;
      el("source-period").textContent="FY ending "+payload.annual.at(-1).fiscal_end;
      el("data-refresh").textContent=payload.refresh_mode==="curated"
        ? "Verified annual snapshot · "+payload.retrieved_utc.slice(0,10)
        : "SEC refreshed "+payload.retrieved_utc.slice(0,10);
      // The URL is validated against the SEC API origin before link use.
      const source=payload.data_source;
      if(source&&/^https:\/\/(?:data\.sec\.gov\/api\/xbrl\/companyfacts\/CIK\d{10}\.json|www\.sec\.gov\/Archives\/edgar\/data\/|(?:www\.)?microsoft\.com\/)/.test(source)){
        el("sec-link").href=source;
      }
      render();
    }catch(error){
      if(generation!==sequence)return;
      company=null;
      el("company-name").textContent="Financial data unavailable";
      showError(error);
    }
  }
  async function initialize(){
    try{
      if(!window.Plotly||!M)throw Error("Browser forecasting engine unavailable.");
      for(const id of ["method","horizon","metric","history"]){
        el(id).addEventListener("change",queueRender);
      }
      for(const id of ["growth","margin"]){
        el(id).addEventListener("input",queueRender);
        el(id).addEventListener("change",queueRender);
      }
      el("ticker").addEventListener("change",()=>void loadCompany(el("ticker").value));
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
        clearTimeout(timer);timer=setTimeout(render,130);
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
