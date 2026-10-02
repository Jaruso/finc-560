/* SEC-powered, browser-computed annual performance and conditional forecast. */
(() => {
  "use strict";
  const M=window.CompanyForecast;
  const el=id=>document.getElementById(id);
  const colors={revenue:"#0b7f73",operating:"#365977",net:"#aa7840",baseline:"#8c9ba4"};
  const labels={revenue:"Revenue",operating:"Operating income",net:"Net income"};
  const cache=new Map();
  const CHART_IDS=["company-chart","equity-revenue","equity-operating","equity-net",
    "equity-margins","equity-cashflows","equity-fcf","equity-coverage","equity-balance"];
  const CHART_DEFAULTS=["company-chart","equity-margins","equity-cashflows","equity-fcf"];
  const FINANCIAL_METRICS=["revenue","operating","net"];
  const otherPlots=new Map(),otherPainting=new Set();
  let canvas=null;
  let manifest=null,company=null,sequence=0,scheduled=null;
  let activeTicker=null;
  const research=window.EquityResearchUI;
  const C=window.EquityComparison;
  const R=window.EquityResearch;
  const MAX_TICKERS=4;
  let stagedTickers=[],appliedTickers=[],comparisonData=new Map();
  let comparisonGeneration=0,comparisonController=null,scaleModes={};
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
  const settings=()=>({
    method:el("method").value,horizon:Number(el("horizon").value),
    growth:Number(el("growth").value),margin:Number(el("margin").value),
    projectionsEnabled:el("projections-enabled").checked,
    showKeys
  });
  let showKeys=false;
  function updateKeyButton(){
    const button=el("toggle-keys");
    button.setAttribute("aria-pressed",String(showKeys));
    button.textContent=showKeys?"Hide key":"Show key";
  }
  function updateProjectionControls(){
    const enabled=el("projections-enabled").checked;
    for(const control of document.querySelectorAll(".projection-dependent")){
      control.hidden=!enabled;
    }
    el("method").disabled=!enabled;
  }
  // Pill edits remain staged. No chart, news or API request runs before Analyze.
  const tickerPattern=/^[A-Z][A-Z.]{0,9}$/;
  const sameTickers=(a,b)=>a.length===b.length&&a.every((ticker,i)=>ticker===b[i]);
  const pillStatus=message=>{el("ticker-input-status").textContent=message;};
  function renderPills(){
    const host=el("ticker-pills");
    host.replaceChildren();
    for(const [index,ticker] of stagedTickers.entries()){
      const pill=document.createElement("span");
      pill.className="ticker-pill";
      const name=document.createElement("strong");
      name.textContent=ticker;
      pill.append(name);
      if(index===0){
        const primary=document.createElement("small");
        primary.textContent="Primary";
        pill.append(primary);
      }
      const remove=document.createElement("button");
      remove.type="button";
      remove.className="ticker-pill-remove";
      remove.setAttribute("aria-label","Remove "+ticker);
      remove.textContent="×";
      remove.addEventListener("click",()=>{
        stagedTickers=stagedTickers.filter(value=>value!==ticker);
        renderPills();
      });
      pill.append(remove);
      host.append(pill);
    }
    const count=el("ticker-count");
    count.textContent=stagedTickers.length+" of "+MAX_TICKERS;
    count.classList.toggle("is-pending",!sameTickers(stagedTickers,appliedTickers));
    el("ticker-add").disabled=stagedTickers.length>=MAX_TICKERS;
    el("analyze-tickers").disabled=!stagedTickers.length;
    pillStatus("");
  }
  function stageTicker(value){
    const ticker=String(value||"").trim().toUpperCase();
    if(!tickerPattern.test(ticker)){
      pillStatus("Enter a valid US ticker, such as NVDA or BRK.B.");
      return false;
    }
    if(stagedTickers.includes(ticker)){
      el("custom-ticker").value="";
      pillStatus(ticker+" is already selected.");
      return false;
    }
    if(stagedTickers.length>=MAX_TICKERS){
      pillStatus("Choose up to four equities. Remove a pill to make room.");
      return false;
    }
    stagedTickers.push(ticker);
    el("custom-ticker").value="";
    renderPills();
    el("custom-ticker").focus();
    return true;
  }
  async function comparisonCompany(ticker,signal){
    if(cache.has(ticker))return cache.get(ticker);
    const item=manifest.companies.find(row=>row.ticker===ticker);
    if(item){
      if(!/^data\/[A-Z.]{1,10}\.json$/.test(item.file))
        throw Error("Invalid published company data path.");
      const response=await fetch("./"+item.file,{cache:"no-cache",signal});
      if(!response.ok)throw Error("Published snapshot unavailable");
      const verified=M.verify(await response.json());
      if(verified.ticker!==ticker)throw Error("Snapshot ticker mismatch");
      cache.set(ticker,verified);
      return verified;
    }
    const base="https://finc-560-finnhub.joseph-caruso-pc.workers.dev/";
    const request=async endpoint=>{
      const response=await fetch(base+endpoint+"?symbol="+encodeURIComponent(ticker),{
        method:"GET",mode:"cors",cache:"no-store",signal
      });
      if(!response.ok)throw Error(endpoint+" HTTP "+response.status);
      return response.json();
    };
    const [profile,financials]=await Promise.all([
      request("profile"),request("financials")
    ]);
    const verified=M.verify(R.normalize(financials,profile,ticker));
    cache.set(ticker,verified);
    return verified;
  }
  async function applyTickers(){
    const pending=el("custom-ticker").value.trim();
    if(pending&&!stageTicker(pending))return;
    if(!stagedTickers.length){
      pillStatus("Add at least one ticker before analyzing.");
      return;
    }
    const generation=++comparisonGeneration;
    if(comparisonController)comparisonController.abort();
    comparisonController=new AbortController();
    const signal=comparisonController.signal;
    appliedTickers=[...stagedTickers];
    renderPills(); // Clear pending color now that selection has been applied.
    scaleModes={};
    comparisonData=new Map();
    pillStatus("Loading "+appliedTickers.join(" · ")+"…");
    const primary=appliedTickers[0],secondaries=appliedTickers.slice(1);
    if(company?.ticker===primary)comparisonData.set(primary,company);
    void loadCompany(primary);
    const results=await Promise.allSettled(secondaries.map(async ticker=>{
      const verified=await comparisonCompany(ticker,signal);
      if(signal.aborted||generation!==comparisonGeneration)return;
      comparisonData.set(ticker,verified);
      queueRender();
    }));
    if(signal.aborted||generation!==comparisonGeneration)return;
    const failed=secondaries.filter((ticker,i)=>results[i].status!=="fulfilled");
    pillStatus(failed.length
      ?"Comparable annual filings unavailable for "+failed.join(", ")+
        ". Available companies are shown; missing financial values are not inferred."
      :"");
    queueRender();
  }
  function createScaleControls(){
    for(const id of C.ABSOLUTE){
      const heading=el(id).closest(".chart-card").querySelector(".chart-heading");
      const group=document.createElement("div");
      group.className="equity-scale-switch";
      group.hidden=true;
      group.setAttribute("role","group");
      group.setAttribute("aria-label",id+" display scale");
      for(const mode of ["indexed","nominal"]){
        const button=document.createElement("button");
        button.type="button";
        button.className="secondary";
        button.dataset.mode=mode;
        button.textContent=mode==="indexed"?"Indexed":"Nominal";
        button.addEventListener("click",()=>{scaleModes[id]=mode;render();});
        group.append(button);
      }
      heading.append(group);
    }
  }
  function setScaleControls(comparing){
    for(const id of C.ABSOLUTE){
      const group=el(id).closest(".chart-card").querySelector(".equity-scale-switch");
      group.hidden=!comparing;
      for(const button of group.querySelectorAll("button")){
        const active=(scaleModes[id]||"indexed")===button.dataset.mode;
        button.classList.toggle("is-active",active);
        button.setAttribute("aria-pressed",String(active));
      }
    }
  }
  function setChartOptionReasons(reasons={}){
    for(const input of document.querySelectorAll("#chart-picker input[type='checkbox']")){
      const label=input.closest("label");
      label?.querySelector(".chart-option-warning")?.remove();
      input.removeAttribute("title");
      if(!reasons[input.value])continue;
      const message=reasons[input.value].join("\n");
      input.title=message;
      if(!label)continue;
      const warning=document.createElement("span");
      warning.className="chart-option-warning";
      warning.textContent="!";
      warning.setAttribute("role","img");
      warning.setAttribute("tabindex","0");
      warning.setAttribute("aria-label","Unavailable: "+message.replace(/\n/g,", "));
      warning.title=message;
      label.append(warning);
    }
  }
  function singleChartOptionReasons(rows){
    const missing={};
    const needs={
      "company-chart":["revenue_musd","operating_income_musd","net_income_musd"],
      "equity-revenue":["revenue_musd"],
      "equity-operating":["operating_income_musd"],
      "equity-net":["net_income_musd"],
      "equity-margins":["revenue_musd","operating_income_musd","net_income_musd"],
      "equity-cashflows":["cfo_musd","capex_musd"],
      "equity-fcf":["cfo_musd","capex_musd"],
      "equity-coverage":["operating_income_musd","interest_musd"],
      "equity-balance":["cash_musd","total_debt_musd"]
    };
    const labels={
      revenue_musd:"revenue",operating_income_musd:"operating income",
      net_income_musd:"net income",cfo_musd:"operating cash flow",
      capex_musd:"capex",interest_musd:"interest expense",
      cash_musd:"cash",total_debt_musd:"total debt"
    };
    for(const [id,keys] of Object.entries(needs)){
      const count=rows.filter(row=>keys.every(key=>Number.isFinite(row[key]))).length;
      if(count<2)missing[id]=[company.ticker+": requires at least two reported "+
        keys.map(key=>labels[key]).join(", ")+" values"];
    }
    return missing;
  }
  function renderComparisonSources(frames){
    const host=el("equity-comparison-sources");
    host.replaceChildren();
    const title=document.createElement("strong");
    title.textContent="Compared reporting periods and primary disclosures:";
    host.append(title);
    for(const frame of frames){
      const co=frame.company,entry=document.createElement("span");
      const label=frame.ticker+" · FY "+co.annual.at(-1).fiscal_end+
        (co.refresh_mode==="curated"?" · Verified snapshot":" · As-reported data")+
        (/unaudited/i.test(co.as_reported_note||"")?" · Includes unaudited figures":"");
      const source=String(co.data_source||"");
      // Only display trusted issuer/SEC or provider links taken from
      // verified metadata; do not let arbitrary remote text become a URL.
      if(/^https:\/\/(?:www\.sec\.gov|data\.sec\.gov|www\.microsoft\.com|microsoft\.com|finnhub\.io)\//.test(source)){
        const link=document.createElement("a");
        link.href=source;
        link.target="_blank";
        link.rel="noopener noreferrer";
        link.textContent=label;
        entry.append(link);
      }else entry.textContent=label;
      if(co.as_reported_note)entry.title=co.as_reported_note;
      host.append(entry);
    }
    host.hidden=false;
  }
  function renderComparisons(frames,assumptions){
    renderComparisonSources(frames);
    const comparisonContext=el("equity-comparison-context");
    comparisonContext.hidden=false;
    comparisonContext.textContent=frames.map((frame,index)=>
      frame.ticker+(index===0?" (primary)":"")).join(" · ")+
      (assumptions.projectionsEnabled
        ?" · Actual fiscal dates are preserved; dashed lines and shading mark each company's forecast period."
        :" · Only reported annual results; projections hidden.");
    const replacingUnified=canvas.selected().includes("company-chart");
    setChartOptionReasons(C.unavailable(frames));
    const available=new Set(C.available(frames).filter(id=>
      id!=="company-chart"));
    canvas.setAvailable([...available],
      ["equity-revenue","equity-operating","equity-net"],replacingUnified);
    const selected=new Set(canvas.selected());
    setScaleControls(true);
    const focused=selected.has("company-chart");
    el("fit-company-projection").hidden=true;
    el("chart-footnote").hidden=false;
    el("chart-footnote").textContent=focused
      ?"Each equity: revenue, operating income & net income · Solid = reported · Dashed = modeled."
      :"Compared equities use separate revenue, operating income, and net income charts · Marker = ticker.";
    // The quote card names only the primary equity; comparative context
    // and legends already identify the remaining selected companies.
    el("company-name").textContent=frames[0].name;
    for(const id of selected){
      if(!available.has(id))continue;
      let mode=scaleModes[id]||"indexed",chart;
      try{
        chart=C.study(frames,id,"net",mode,assumptions);
      }catch(error){
        if(mode!=="indexed"||!C.ABSOLUTE.includes(id)||
          !/Indexed view requires/.test(String(error)))throw error;
        scaleModes[id]="nominal";
        chart=C.study(frames,id,"net","nominal",assumptions);
        setScaleControls(true);
      }
      el(id+"-context").textContent=chart.context;
      if(id==="company-chart"){
        el("chart-heading").textContent=assumptions.projectionsEnabled?
          "Financial performance & forecast":"Financial performance";
        el("chart-footnote").textContent=assumptions.projectionsEnabled
          ?"Each equity: revenue, operating income & net income · Solid = reported · Dashed = modeled."
          :"Each equity: revenue, operating income & net income · Reported annual values only.";
        lastRenderedValues=null;
        queuedPlot={traces:chart.traces,layout:chart.layout};
        void plotLatest();
      }else extraPlot(id,chart.traces,chart.layout);
    }
  }
  const compactPlot=()=>window.matchMedia("(max-width:650px)").matches;
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
    cachedPlotHeight=Math.max(190,Math.floor(card.clientHeight-header.offsetHeight-pad-2));
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
        if(!canvas?.visible("company-chart"))continue;
        await window.Plotly.react("company-chart",traces,
          {...layout,height:fullChartHeight()},{
          responsive:true,displayModeBar:false,displaylogo:false,scrollZoom:false,
        });
      }
    }catch(error){showError(error);}
    finally{renderingPlot=false;}
  }
  function financialCharts(history,result){
    const showProjection=el("projections-enabled").checked;
    const assumptions=settings(),unit="USD billions";
    const xObserved=history.map(r=>r.fiscal_end);
    const xProjected=result.projected.map(r=>r.fiscal_end);
    const boundary=xObserved.at(-1),endDate=xProjected.at(-1);
    if(!history.length||boundary!==xProjected[0]||xObserved[0]>=endDate||
       FINANCIAL_METRICS.some(metric=>{
         const key=M.METRICS[metric];
         return history.at(-1)[key]!==result.projected[0][key];
       }))throw Error("Forecast must connect to all three final reported measures.");

    const adjusted=assumptions.growth!==0||assumptions.margin!==0;
    // Use ALL three financial measures for one stable y-axis. Historical
    // positions never jump merely because someone changes an assumption
    // or selects a different model.
    const context=[company.ticker,company.annual.at(-1).fiscal_end,
      el("history").value,showProjection?"projection":"reported-only"].join("|");
    if(scaleContext!==context){manualYRange=null;scaleContext=context;}
    const actual=FINANCIAL_METRICS.flatMap(metric=>
      history.map(r=>r[M.METRICS[metric]]/1000));
    const baselineReference=showProjection?
      ["cagr","linear"].flatMap(method=>{
        const stable=M.forecast(company,{method,horizon:3,growth:0,margin:0});
        return FINANCIAL_METRICS.flatMap(metric=>
          stable.projected.map(r=>r[M.METRICS[metric]]/1000));
      }):[];
    const referenceValues=actual.concat(baselineReference);
    const baseMin=Math.min(...referenceValues),baseMax=Math.max(...referenceValues);
    const basePadding=Math.max((baseMax-baseMin)*.14,Math.abs(baseMax)*.035,.5);
    const defaultYRange=[baseMin-basePadding,baseMax+basePadding];
    const range=manualYRange||defaultYRange;
    const shownValues=actual.slice();
    const traces=[];
    for(const metric of FINANCIAL_METRICS){
      const key=M.METRICS[metric],color=colors[metric],label=labels[metric];
      const values=history.map(r=>r[key]/1000);
      const forecast=result.projected.map(r=>r[key]/1000);
      const baseline=result.baseline.map(r=>r[key]/1000);
      traces.push({
        x:xObserved,y:values,type:"scatter",mode:"lines+markers",
        name:label,legendgroup:metric,legendrank:FINANCIAL_METRICS.indexOf(metric)+1,
        line:{color,width:2.65},marker:{color,size:4},
        hovertemplate:"FY ending %{x|%b %Y}<br>$%{y:,.2f}B"+
          "<extra>"+label+" · reported</extra>"
      });
      if(!showProjection)continue;
      shownValues.push(...forecast);
      // Profit-margin changes affect earnings, NEVER the revenue model.
      // Render dotted reference only for metrics whose adjustments matter.
      const showBaseline=metric==="revenue"?assumptions.growth!==0:adjusted;
      if(showBaseline){
        shownValues.push(...baseline);
        traces.push({
          x:xProjected,y:baseline,type:"scatter",mode:"lines",
          name:label+" · unadjusted",legendgroup:metric,showlegend:false,
          line:{color,width:1.65,dash:"dot"},opacity:.68,
          hovertemplate:"FY ending %{x|%b %Y}<br>$%{y:,.2f}B"+
            "<extra>"+label+" · unadjusted</extra>"
        });
      }
      traces.push({
        x:xProjected,y:forecast,type:"scatter",mode:"lines+markers",
        name:label+(showBaseline?" · scenario":" · forecast"),
        legendgroup:metric,showlegend:false,
        line:{color,width:2.35,dash:"dash"},marker:{color,size:4},
        hovertemplate:"FY ending %{x|%b %Y}<br>$%{y:,.2f}B"+
          "<extra>"+label+(showBaseline?" · scenario":" · forecast")+"</extra>"
      });
    }
    lastRenderedValues=shownValues;
    const overflow=shownValues.some(v=>v<range[0]||v>range[1]);
    const fitButton=el("fit-company-projection");
    fitButton.disabled=!showProjection||(!overflow&&!manualYRange);
    fitButton.textContent=overflow?"Fit projection":
      manualYRange?"Restore scale":"Scale locked";
    fitButton.title=overflow
      ?"Explicitly expand the vertical scale to include this scenario"
      :manualYRange?"Restore the fixed model-reference scale":
        "Vertical scale remains fixed while adjusting assumptions";

    const total=Date.parse(endDate)-Date.parse(xObserved[0]);
    const cutoff=showProjection
      ?(Date.parse(boundary)-Date.parse(xObserved[0]))/total:1;
    const layout={
      autosize:true,height:fullChartHeight(),
      margin:compactPlot()
        ?{l:53,r:8,t:47,b:35,autoexpand:false}
        :{l:66,r:18,t:65,b:47,autoexpand:false},
      paper_bgcolor:"#fff",plot_bgcolor:"#fff",
      font:{family:"Inter,system-ui,sans-serif",size:11,color:"#465865"},
      showlegend:assumptions.showKeys,hovermode:"closest",
      legend:{orientation:"h",x:.5,xanchor:"center",
        y:compactPlot()?1.045:1.12,font:{size:compactPlot()?9:10},
        groupclick:"togglegroup",autoexpand:false},
      xaxis:{type:"date",range:[xObserved[0],showProjection?endDate:boundary],
        tickformat:"%Y",dtick:"M12",showgrid:false,
        linecolor:"#dfe3e6",automargin:true},
      yaxis:{title:{text:unit,font:{size:11}},
        tickprefix:"$",ticksuffix:"B",gridcolor:"#edf1f2",
        range:range.slice(),zeroline:false,automargin:true},
      shapes:showProjection?[
        {type:"rect",xref:"x",yref:"paper",x0:boundary,x1:endDate,
          y0:0,y1:1,fillcolor:"rgba(11,127,115,.045)",line:{width:0},layer:"below"},
        {type:"line",xref:"x",yref:"paper",x0:boundary,x1:boundary,
          y0:0,y1:1,line:{color:"#92aba7",width:1.35,dash:"dash"}}
      ]:[],annotations:[],
      meta:{singleChart:true,continuousCalendar:true,cutoffFraction:cutoff,
        observedStart:xObserved[0],observedEnd:boundary,
        projectionStart:showProjection?boundary:null,
        projectionEnd:showProjection?endDate:null,
        projectionsEnabled:showProjection,measures:FINANCIAL_METRICS.slice(),
        unit,model:result.method,
        yScale:manualYRange?"manual-locked":"baseline-locked",
        defaultYRange:defaultYRange.slice(),
        projectionClipped:showProjection&&overflow}
    };
    el("chart-heading").textContent=showProjection?
      "Financial performance & forecast":"Financial performance";
    el("company-chart-context").textContent=
      "Latest FY "+boundary+" · "+
      (showProjection?assumptions.horizon+"-year modeled outlook":
        "Reported financial performance");
    el("chart-footnote").textContent=!showProjection
      ?"Color = financial measure · Solid = reported; projections hidden"
      :overflow
        ?"A scenario exceeds the locked common scale. Use Fit projection to see all three measures."
        :"Color = financial measure · Solid = reported · Dashed = forecast"+
          (adjusted?" · Dotted = unadjusted reference":"");
    queuedPlot={traces,layout};
    void plotLatest();
  }

  function availableEquityCharts(rows){
    const complete=(fn)=>rows.filter(fn).length>=2;
    const ids=["company-chart","equity-margins"];
    if(complete(r=>Number.isFinite(r.cfo_musd)&&Number.isFinite(r.capex_musd))){
      ids.push("equity-cashflows","equity-fcf");
    }
    if(complete(r=>Number.isFinite(r.interest_musd)&&r.interest_musd>0&&
        Number.isFinite(r.operating_income_musd)))ids.push("equity-coverage");
    if(complete(r=>Number.isFinite(r.cash_musd)&&
        Number.isFinite(r.total_debt_musd)))ids.push("equity-balance");
    return ids;
  }
  function extraHeight(id){
    const card=el(id).closest(".chart-card"),heading=card.querySelector(".chart-heading");
    const style=getComputedStyle(card);
    return Math.max(185,Math.floor(card.clientHeight-heading.offsetHeight-
      (parseFloat(style.paddingTop)||0)-(parseFloat(style.paddingBottom)||0)-3));
  }
  function extraPlot(id,traces,layout){
    if(!canvas.visible(id))return;
    otherPlots.set(id,{traces,layout});
    if(otherPainting.has(id))return;
    otherPainting.add(id);
    void (async()=>{
      try{
        while(otherPlots.has(id)){
          const next=otherPlots.get(id);otherPlots.delete(id);
          if(!canvas.visible(id))continue;
          await window.Plotly.react(id,next.traces,
            {...next.layout,height:extraHeight(id)},{
              responsive:true,displayModeBar:false,displaylogo:false,scrollZoom:false
            });
        }
      }catch(error){showError(error);}
      finally{otherPainting.delete(id);}
    })();
  }
  function renderExtraEquity(history,result,assumptions){
    const showProjection=assumptions.projectionsEnabled;
    const selected=new Set(canvas.selected());
    const xs=history.map(r=>r.fiscal_end);
    const xp=result.projected.map(r=>r.fiscal_end);
    const boundary=xs.at(-1),end=xp.at(-1);
    const latest=history.at(-1);
    const bcolor=colors.baseline;
    const value=n=>Number(n/1000);
    const complete=(fn)=>history.filter(fn);
    function note(id,text){el(id+"-context").textContent=text;}
    function base(id,{unit="USD billions",percent=false,zero=false,bar=false}={}){
      const cfg={
        autosize:true,height:extraHeight(id),
        margin:compactPlot()
          ?{l:52,r:8,t:39,b:34,autoexpand:false}
          :{l:61,r:12,t:45,b:43,autoexpand:false},
        paper_bgcolor:"#fff",plot_bgcolor:"#fff",
        font:{family:"Inter,system-ui,sans-serif",size:10,color:"#465865"},
        showlegend:assumptions.showKeys,hovermode:"closest",
        legend:{orientation:"h",x:.5,xanchor:"center",
          y:compactPlot()?1.04:1.16,
          font:{size:compactPlot()?9:10},itemwidth:30},
        xaxis:{type:"date",tickformat:"%Y",
          showgrid:false,linecolor:"#dfe3e6",automargin:true},
        yaxis:{title:percent?"Margin (%)":unit,
          ticksuffix:percent?"%":"B",tickprefix:percent?"":"$",
          gridcolor:"#edf1f2",automargin:true},
        shapes:[],annotations:[],meta:{
          source:"Verified reported SEC/Finnhub annual financial statements",
          ticker:company.ticker,metric:id,reportingCurrency:company.currency||"USD"
        }
      };
      if(zero)cfg.shapes=[{type:"line",xref:"paper",yref:"y",x0:0,x1:1,y0:0,y1:0,
        line:{color:"#95a9b0",width:1,dash:"dot"}}];
      if(bar)cfg.barmode="group";
      return cfg;
    }
    const line=(name,x,y,color,{dash="solid",percent=false,markers=false}={})=>({
      type:"scatter",mode:markers?"lines+markers":"lines",x,y,name,
      marker:{size:4,color},line:{width:2.25,color,dash},
      hovertemplate:"FY ending %{x|%b %Y}<br>"+
        (percent?"%{y:.2f}%":"$%{y:,.2f}B")+
        "<extra>"+name+"</extra>"
    });
    const addBoundary=(layout)=>{
      layout.xaxis.range=[xs[0],showProjection?end:boundary];
      if(!showProjection)return;
      layout.shapes.push(
        {type:"rect",xref:"x",yref:"paper",x0:boundary,x1:end,
          y0:0,y1:1,fillcolor:"rgba(11,127,115,.045)",line:{width:0},layer:"below"},
        {type:"line",xref:"x",yref:"paper",x0:boundary,x1:boundary,
          y0:0,y1:1,line:{color:"#93a9a8",width:1.2,dash:"dash"}}
      );
    };
    if(selected.has("equity-margins")){
      const margin=(row,key)=>row.revenue_musd>0?
        100*row[key]/row.revenue_musd:null;
      const opActual=history.map(r=>margin(r,"operating_income_musd"));
      const netActual=history.map(r=>margin(r,"net_income_musd"));
      const opFuture=result.projected.map(r=>margin(r,"operating_income_musd"));
      const netFuture=result.projected.map(r=>margin(r,"net_income_musd"));
      const cfg=base("equity-margins",{percent:true});
      addBoundary(cfg);
      cfg.yaxis.range=undefined;
      cfg.meta={...cfg.meta,scenarioGrowthPp:assumptions.growth,
        scenarioMarginPp:assumptions.margin};
      const traces=[
        line("Operating margin · reported",xs,opActual,colors.operating,{percent:true}),
        line("Net margin · reported",xs,netActual,colors.net,{percent:true})
      ];
      if(showProjection)traces.push(
        line("Operating margin · scenario",xp,opFuture,colors.operating,
          {percent:true,dash:"dash"}),
        line("Net margin · scenario",xp,netFuture,colors.net,
          {percent:true,dash:"dash"})
      );
      cfg.meta.projectionsEnabled=showProjection;
      note("equity-margins","Latest operating margin "+
        (opActual.at(-1)).toFixed(1)+"% · Net margin "+
        (netActual.at(-1)).toFixed(1)+"%"+
        (showProjection?" · Future margins are assumptions.":" · Reported annual results only."));
      extraPlot("equity-margins",traces,cfg);
    }
    if(selected.has("equity-cashflows")){
      const rows=complete(r=>Number.isFinite(r.cfo_musd)&&Number.isFinite(r.capex_musd));
      if(rows.length>=2){
        const cfg=base("equity-cashflows",{bar:true});
        cfg.yaxis.title="Cash flow and capex (USD billions)";
        const xx=rows.map(r=>r.fiscal_end),cfo=rows.map(r=>value(r.cfo_musd)),
          capex=rows.map(r=>Math.abs(value(r.capex_musd)));
        const latestValid=rows.at(-1);
        note("equity-cashflows","Latest disclosed FY "+latestValid.fiscal_end+
          " · Operating cash "+USD(latestValid.cfo_musd)+
          " · Capex "+USD(Math.abs(latestValid.capex_musd))+
          " · Reported years only.");
        extraPlot("equity-cashflows",[
          {type:"bar",name:"Operating cash flow",x:xx,y:cfo,
            marker:{color:colors.revenue},
            hovertemplate:"FY ending %{x|%b %Y}<br>$%{y:,.2f}B"+
              "<extra>Operating cash flow</extra>"},
          {type:"bar",name:"Capital expenditure",x:xx,y:capex,
            marker:{color:colors.net},
            hovertemplate:"FY ending %{x|%b %Y}<br>$%{y:,.2f}B"+
              "<extra>Capital outlay (absolute)</extra>"}
        ],cfg);
      }
    }
    if(selected.has("equity-fcf")){
      const rows=complete(r=>Number.isFinite(r.cfo_musd)&&Number.isFinite(r.capex_musd));
      if(rows.length>=2){
        const cfg=base("equity-fcf",{zero:true});
        cfg.yaxis.title="Reported FCF (USD billions)";
        const y=rows.map(r=>value(r.cfo_musd-Math.abs(r.capex_musd)));
        const latestValid=rows.at(-1);
        note("equity-fcf","Latest reported FCF "+
          USD(latestValid.cfo_musd-Math.abs(latestValid.capex_musd))+
          " · Operating cash less capex; negative values preserved.");
        extraPlot("equity-fcf",[
          line("Free cash flow",rows.map(r=>r.fiscal_end),y,colors.revenue,
            {markers:true})
        ],cfg);
      }
    }
    if(selected.has("equity-coverage")){
      const rows=complete(r=>Number.isFinite(r.operating_income_musd)&&
        Number.isFinite(r.interest_musd)&&r.interest_musd>0);
      if(rows.length>=2){
        const values=rows.map(r=>r.operating_income_musd/r.interest_musd);
        const cfg=base("equity-coverage",{zero:true});
        cfg.yaxis={title:"Operating income / interest (×)",
          ticksuffix:"×",gridcolor:"#edf1f2",automargin:true};
        note("equity-coverage","Latest disclosed interest coverage "+
          values.at(-1).toFixed(2)+"× · "+
          rows.at(-1).fiscal_end+" · No missing expenses inferred.");
        extraPlot("equity-coverage",[
          {type:"scatter",mode:"lines+markers",x:rows.map(r=>r.fiscal_end),
            y:values,name:"Reported interest coverage",
            marker:{color:colors.operating,size:4},
            line:{color:colors.operating,width:2.3},
            hovertemplate:"FY ending %{x|%b %Y}<br>%{y:.2f}×"+
              "<extra>Interest coverage</extra>"}
        ],cfg);
      }
    }
    if(selected.has("equity-balance")){
      const rows=complete(r=>Number.isFinite(r.cash_musd)&&
        Number.isFinite(r.total_debt_musd));
      if(rows.length>=2){
        const cfg=base("equity-balance",{bar:true});
        cfg.yaxis.title="Reported USD billions";
        const last=rows.at(-1),xx=rows.map(r=>r.fiscal_end);
        note("equity-balance","Latest FY "+last.fiscal_end+
          " · Cash "+USD(last.cash_musd)+" · Total debt "+USD(last.total_debt_musd)+
          " · No missing debt maturities inferred.");
        extraPlot("equity-balance",[
          {type:"bar",x:xx,y:rows.map(r=>value(r.cash_musd)),
            name:"Reported cash",marker:{color:colors.revenue},
            hovertemplate:"FY ending %{x|%b %Y}<br>$%{y:,.2f}B<extra>Cash</extra>"},
          {type:"bar",x:xx,y:rows.map(r=>value(r.total_debt_musd)),
            name:"Disclosed total debt",marker:{color:colors.operating},
            hovertemplate:"FY ending %{x|%b %Y}<br>$%{y:,.2f}B<extra>Total debt</extra>"}
        ],cfg);
      }
    }
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
      el("kpi-forecast-revenue").textContent=assumptions.projectionsEnabled
        ?USD(finish.revenue_musd):"—";
      el("kpi-forecast-profit").textContent=assumptions.projectionsEnabled
        ?USD(finish.net_income_musd):"—";
      el("preview-revenue").textContent=assumptions.projectionsEnabled
        ?USD(finish.revenue_musd):"—";
      el("preview-profit").textContent=assumptions.projectionsEnabled
        ?USD(finish.net_income_musd):"—";
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
      const compared=appliedTickers.map(ticker=>comparisonData.get(ticker))
        .filter(Boolean);
      if(compared.length>=2&&compared[0].ticker===company.ticker){
        const frames=C.prepare(compared,assumptions,el("history").value);
        renderComparisons(frames,assumptions);
        return;
      }
      setScaleControls(false);
      el("equity-comparison-sources").hidden=true;
      el("equity-comparison-context").hidden=true;
      // The selected chart set changes with actual statement coverage. Do not
      // imply debt or interest data exists for curated earnings-only snapshots.
      setChartOptionReasons(singleChartOptionReasons(history));
      canvas.setAvailable(availableEquityCharts(history));
      const focused=canvas.visible("company-chart");
      el("fit-company-projection").hidden=!focused||!assumptions.projectionsEnabled;
      el("chart-footnote").hidden=!focused;
      if(focused)financialCharts(history,result);
      else el("fit-company-projection").disabled=true;
      renderExtraEquity(history,result,assumptions);
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
    if(appliedTickers.includes(payload.ticker))comparisonData.set(payload.ticker,payload);
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
    canvas.setAvailable([]);
    setChartOptionReasons({});
    el("equity-comparison-sources").hidden=true;
    el("equity-comparison-context").hidden=true;
    el("company-name").textContent=ticker;
    el("company-empty").hidden=false;
    el("company-chart").hidden=true;
    el("company-empty-title").textContent="Checking financial statement coverage";
    el("company-empty-message").textContent="Looking for comparable annual filings for "+ticker+".";
    el("source-period").textContent="Awaiting 10-K data";
    el("data-refresh").textContent="Finnhub as-reported · Checking coverage";
    for(const id of ["kpi-revenue","kpi-profit","kpi-forecast-revenue","kpi-forecast-profit",
      "preview-revenue","preview-profit"])el(id).textContent="—";
    el("model-note").textContent="This company needs five comparable filings to enable financial forecasts.";
    el("backtest").textContent="Awaiting complete annual reports.";
    el("chart-footnote").textContent="No historical or modeled values are shown until source validation succeeds.";
    if(window.Plotly)window.Plotly.purge("company-chart");
  }
  function unavailableAnnual(details){
    if(company||activeTicker!==details.ticker)return;
    const p=details.profile||{};
    const international=(p.country&&p.country!=="US")||(p.currency&&p.currency!=="USD");
    el("company-name").textContent=p.name||details.ticker;
    el("company-empty-title").textContent=international
      ?"International company: financial history unavailable":"Annual financial history unavailable";
    el("company-empty-message").textContent=international
      ?"Finnhub returned no usable US 10-K history for "+details.ticker+
        ". It reports in "+(p.currency||"a non-USD currency")+
        ". Our annual models require five comparable USD SEC 10-K filings. "+
        "Finnhub's international standardized financial statements require premium access."
      :details.failed
        ?(details.reason||"Finnhub's financial statement request failed.")+
        " This is a request failure, not proof the company's filings are missing. "+
        "Quotes and recent company news may still be available."
        :details.validationWarning||
          ("Finnhub returned "+details.years+
          " usable fiscal years. Historical forecasts require at least five comparable annual reports.");
    el("source-period").textContent="No comparable annual filings";
    el("data-refresh").textContent="Quote and company profile available";
    el("model-note").textContent="Financial forecasts require five comparable verified annual filings; unavailable figures are never estimated.";
    el("backtest").textContent="Unavailable without sufficient annual reports.";
    if(appliedTickers[0]===details.ticker)
      pillStatus("Primary "+details.ticker+" lacks usable annual statements. Choose another primary and click Analyze.");
    el("chart-footnote").textContent="The historical chart is unavailable for this ticker; market data and profile may still be available.";
  }
  async function loadCompany(ticker){
    if(!manifest||!M||!research)return;
    ticker=String(ticker||"").trim().toUpperCase();
    if(!/^[A-Z][A-Z.]{0,9}$/.test(ticker))return;
    const generation=++sequence;
    activeTicker=ticker;
    el("company-name").textContent=ticker;
    resetQuote();
    el("data-error").hidden=true;
    scaleContext=null;manualYRange=null;lastRenderedValues=null;
    const item=manifest.companies.find(row=>row.ticker===ticker);
    // A former comparison may become primary without repeating its verified
    // annual-file request or losing its disclosures to a later rate limit.
    let curated=cache.get(ticker)||null;
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
      if(!window.Plotly||!M||!R||!C||!research||!window.ChartCanvas)
        throw Error("Financial chart renderer or research model unavailable.");
      canvas=ChartCanvas.create({
        ids:CHART_IDS,defaults:CHART_DEFAULTS,onChange:()=>{
          cachedPlotHeight=null;queueRender();
        }
      });
      canvas.setAvailable([]);
      createScaleControls();
      el("custom-ticker").addEventListener("keydown",event=>{
        if(event.key==="Enter"){
          event.preventDefault();
          stageTicker(el("custom-ticker").value);
        }else if(event.key==="Backspace"&&!el("custom-ticker").value){
          stagedTickers.pop();
          renderPills();
        }
      });
      el("ticker-add").addEventListener("click",()=>{
        stageTicker(el("custom-ticker").value);
      });
      el("symbol-form").addEventListener("submit",event=>{
        event.preventDefault();
        void applyTickers();
      });
      document.querySelectorAll("[data-research-example]").forEach(button=>{
        button.addEventListener("click",()=>{
          stageTicker(button.dataset.researchExample);
        });
      });
      el("projections-enabled").addEventListener("change",()=>{
        updateProjectionControls();
        scaleContext=null;
        manualYRange=null;
        queueRender();
      });
      el("toggle-keys").addEventListener("click",()=>{
        showKeys=!showKeys;
        updateKeyButton();
        queueRender();
      });
      updateKeyButton();
      updateProjectionControls();
      for(const id of ["method","horizon","history"]){
        el(id).addEventListener("change",queueRender);
      }
      for(const id of ["growth","margin"]){
        el(id).addEventListener("input",queueRender);
        el(id).addEventListener("change",queueRender);
      }
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
        el("method").value="cagr";el("horizon").value="1";
        el("growth").value="0";el("margin").value="0";
        el("history").value="5";
        el("projections-enabled").checked=true;
        showKeys=false;
        updateKeyButton();
        updateProjectionControls();
        canvas.reset();queueRender();
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
      stagedTickers=[m.companies[0].ticker];
      appliedTickers=[m.companies[0].ticker];
      renderPills();
      await loadCompany(m.companies[0].ticker);
    }catch(error){
      el("source-period").textContent="Unavailable";
      showError(error);
    }
  }
  initialize();
})();
