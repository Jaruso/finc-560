/* Three independent equity research panels. Financial statements are never called "live"
   unless the as-reported endpoint returned valid, source-linked annual filings. */
(function(){
  "use strict";
  const R=window.EquityResearch;
  const API="https://finc-560-finnhub.joseph-caruso-pc.workers.dev";
  const el=id=>document.getElementById(id);
  let current=null,seq=0,controller=null,macroPromise=null;
  const USD=n=>!Number.isFinite(n)?"Unavailable":
    (n<0?"−":"")+"$"+Math.abs(n/1000).toLocaleString("en-US",{maximumFractionDigits:2})+"B";
  const fmt=(n,d=1)=>Number.isFinite(n)?n.toFixed(d):"Unavailable";
  const tiny=(n)=>Number.isFinite(n)?"$"+Math.max(0,n).toFixed(2):"Unavailable";
  function text(id,value){el(id).textContent=value;}
  function status(message){text("research-status",message);}
  function markUnavailable(target,reason){
    text(target+"-note",reason);
    const chart=el(target+"-chart");
    if(chart&&window.Plotly)window.Plotly.purge(chart);
    chart.hidden=true;
  }
  function chart(target,traces,layout){
    const node=el(target+"-chart");node.hidden=false;
    const base={paper_bgcolor:"#fff",plot_bgcolor:"#fff",
      font:{family:"Inter,system-ui,sans-serif",size:11,color:"#465865"},
      margin:{l:57,r:15,t:24,b:55},showlegend:true,
      legend:{orientation:"h",x:.5,xanchor:"center",y:1.18},autosize:true};
    void window.Plotly.react(node,traces,{...base,...layout},
      {displayModeBar:false,responsive:true,displaylogo:false}).catch(()=>{
      markUnavailable(target,"Chart rendering unavailable; figures remain available above.");
    });
  }
  function dataFor(){
    if(!current)return [];
    // Preserve vetted snapshots when Finnhub only returns a partial filing history.
    return current.normalized?.annual?.length>=5?
      current.normalized.annual:current.curated?.annual||current.normalized?.annual||[];
  }
  function showProfile(){
    if(!current)return;
    const p=current.profile;
    text("research-company",p?.name||current.curated?.company||current.ticker);
    text("research-sector",p?.finnhubIndustry||"Industry unavailable");
    // Finnhub does not guarantee the reporting currency also denominates market cap.
    const capCurrency=typeof p?.marketCapCurrency==="string" &&
      /^[A-Z]{3}$/.test(p.marketCapCurrency)?p.marketCapCurrency:null;
    text("research-market-cap",Number.isFinite(p?.marketCapitalization)?
      "Market cap "+p.marketCapitalization.toLocaleString("en-US",{maximumFractionDigits:1})+
      "M "+(capCurrency||"(currency unverified)"):"Market cap unavailable");
    const m=R.metricsSummary(current.metrics);
    text("research-metrics","Finnhub metrics · Beta "+fmt(m.beta,2)+
      " · P/E "+fmt(m.pe,1)+" · Current ratio "+fmt(m.currentRatio,2));
    const asReported=current.normalized?.annual?.length>=5;
    const source=asReported?current.normalized:current.curated;
    const filingHint=!source?.annual?.length&&p?.currency&&p.currency!=="USD"
      ?" · Reports in "+p.currency+"; this model requires five comparable USD SEC 10-K annual filings.":
      "";
    const liveEnd=asReported?current.normalized.annual.at(-1).fiscal_end:null;
    const curatedEnd=current.curated?.annual?.at(-1)?.fiscal_end;
    const olderThanCurated=asReported&&curatedEnd&&liveEnd<curatedEnd;
    text("research-source",olderThanCurated
      ?"Detailed Finnhub ratios: reported FY "+liveEnd+
        " (older than main chart's verified FY "+curatedEnd+"); historical periods differ"
      :asReported
        ?"As-reported 10-K filings · Latest FY "+liveEnd
        :source?.annual?.length
          ?"Verified dated financial snapshots · FY "+source.annual.at(-1).fiscal_end+
            " (Finnhub filing history insufficient or unavailable)"
          :"No verified complete five-year history; financial modeling unavailable."+filingHint);
    const sourceUrl=asReported?source.data_source:source?.data_source;
    const link=el("research-filing-link");
    if(typeof sourceUrl==="string"&&/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\//.test(sourceUrl)){
      link.href=sourceUrl;link.hidden=false;
    }else link.hidden=true;
  }
  function showHealth(){
    if(!current)return;
    const rows=dataFor();
    if(!rows.length){
      text("health-kpis","No verified annual statements");
      return markUnavailable("health","The financial-data feed did not return usable annual statements. No ratios have been fabricated.");
    }
    const h=R.health(rows),last=h.latest;
    text("health-kpis","Revenue "+USD(last.revenue)+
      " · Operating margin "+(last.operatingMargin===null?"Unavailable":fmt(last.operatingMargin)+"%")+
      " · FCF "+USD(last.fcf)+
      " · Interest coverage "+(last.coverage===null?"Unavailable":fmt(last.coverage,2)+"×")+
      " · Net debt / EBITDA "+(last.leverage===null?"Unavailable":fmt(last.leverage,2)+"×"));
    const observed=h.rows.filter(r=>r.fcf!==null&&r.interest!==null);
    if(observed.length<2){
      return markUnavailable("health","Cash flow and interest disclosures are incomplete. Revenue, operating margins and available ratios above still use reported values.");
    }
    text("health-note","Reported annual free cash flow (operating cash less capex) versus interest expense. Compare resources available to service debt; negative FCF is not clipped.");
    chart("health",[
      {type:"bar",name:"Free cash flow",x:observed.map(r=>r.year),
        y:observed.map(r=>r.fcf/1000),marker:{color:"#0b7f73"}},
      {type:"bar",name:"Interest expense",x:observed.map(r=>r.year),
        y:observed.map(r=>r.interest/1000),marker:{color:"#365977"}}
    ],{height:285,barmode:"group",yaxis:{title:"USD billions",zeroline:true,
      gridcolor:"#edf1f2"},xaxis:{title:"Fiscal year ended",type:"category"}});
  }
  function readScenario(){
    return {shockBps:Number(el("rate-shock").value),
      spreadBps:Number(el("spread-bps").value),
      exposedPercent:Number(el("exposed-pct").value)};
  }
  function showStress(){
    if(!current)return;
    const s=readScenario();
    text("scenario-inputs","10Y scenario deviation "+(s.shockBps>=0?"+":"")+s.shockBps+
      " bp · Hypothetical spread "+s.spreadBps+" bp · Repricing debt "+s.exposedPercent+"%");
    const rows=dataFor(),macro=current.macro;
    const result=R.stress(rows,macro,s);
    if(!result){
      text("stress-kpis","Unavailable");
      return markUnavailable("stress","Requires the published Treasury baseline plus disclosed debt, operating income and positive interest expense. No undisclosed debt maturities are inferred.");
    }
    text("stress-kpis","Treasury 10Y "+fmt(macro.observed10y,2)+"% → modeled "+
      fmt(result.rate,2)+"% · Incremental annual interest "+USD(result.extraInterest)+
      " · Stressed coverage "+(result.coverage===null?"N/M":fmt(result.coverage,2)+"×"));
    text("stress-note","Illustrative annual repricing at the 12-month Treasury model horizon; last-reported earnings are held constant. The debt exposure and credit spread are analyst assumptions, not company disclosures. Negative incremental interest represents modeled savings.");
    const points=[-200,-100,0,100,200].map(bp=>({
      bp,r:R.stress(rows,macro,{...s,shockBps:bp})
    }));
    chart("stress",[{type:"scatter",mode:"lines+markers",
      x:points.map(x=>x.bp),y:points.map(x=>x.r?.coverage??null),
      name:"Interest coverage",line:{color:"#365977",width:2.5},
      marker:{color:"#0b7f73",size:8},
      hovertemplate:"10Y shock: %{x:+d} bp<br>Coverage: %{y:.2f}×<extra></extra>"}],
    {height:285,showlegend:false,xaxis:{title:"Shock relative to modeled 10Y forecast (bp)",
        zeroline:true,zerolinecolor:"#b5c4c5",tickvals:[-200,-100,0,100,200]},
      yaxis:{title:"Interest coverage (×)",gridcolor:"#edf1f2"}});
  }
  function readValuation(){
    return {growth:Number(el("fcf-growth").value),discount:Number(el("discount-rate").value),
      terminal:Number(el("terminal-growth").value),tax:21};
  }
  function showValuation(){
    if(!current)return;
    const a=readValuation(),rows=dataFor();
    text("valuation-inputs","FCFF growth "+a.growth+"% · Discount "+a.discount+
      "% · Terminal growth "+a.terminal+"% · Assumed tax 21%");
    const shares=current.normalized?.shares_million||
      (Number.isFinite(current.profile?.shareOutstanding)?
        current.profile.shareOutstanding:null);
    const result=R.valuation(rows,shares,a);
    if(!result){
      text("valuation-kpis","Unavailable");
      return markUnavailable("valuation","Requires positive cash-flow proxy, disclosed interest, cash and total debt, and shares outstanding. This model deliberately does not substitute invented values.");
    }
    const quote=current.quote;
    text("valuation-kpis","Illustrative enterprise value "+USD(result.enterpriseValue)+
      " · Implied equity value/share "+tiny(result.perShare)+
      (Number.isFinite(quote?.c)&&quote.c>0?" · Quoted price "+tiny(quote.c):""));
    text("valuation-note","Illustrative five-year DCF sensitivity only: FCFF proxy = operating cash flow − capex + after-tax interest. Net debt deducted using latest reported figures; 21% assumed tax. It omits detailed debt schedules and working-capital forecasts. Values are scenario outputs, not price targets.");
    const discounts=[-2,-1,0,1,2].map(d=>a.discount+d).filter(d=>d>a.terminal);
    const growths=[-2,-1,0,1,2].map(g=>Math.max(-20,Math.min(25,a.growth+g)));
    const z=growths.map(g=>discounts.map(d=>{
      const v=R.valuation(rows,shares,{...a,growth:g,discount:d});
      return v?.perShare??null;
    }));
    chart("valuation",[{type:"heatmap",
      x:discounts,y:growths,z,
      colorscale:[[0,"#edf3f3"],[.5,"#88b6b0"],[1,"#0b7f73"]],
      colorbar:{title:"$/share",thickness:10,len:.82},
      hovertemplate:"Discount: %{x}%<br>FCFF growth: %{y}%<br>Implied: $%{z:.2f}/share<extra></extra>"}],
    {height:300,showlegend:false,margin:{l:63,r:50,t:18,b:54},
      xaxis:{title:"Assumed discount rate (%)",type:"category"},
      yaxis:{title:"5-year FCFF growth (%)",type:"category"}});
  }
  function render(){if(!current)return;showProfile();showHealth();showStress();showValuation();}
  async function fromAPI(path,symbol,signal){
    const response=await fetch(API+"/"+path+"?symbol="+encodeURIComponent(symbol),{
      method:"GET",mode:"cors",cache:"no-store",signal
    });
    if(!response.ok){
      const body=await response.json().catch(()=>({}));
      const source=body?.source==="gateway"?"Cloudflare proxy":
        body?.source==="provider"?"Finnhub":"API";
      const message=response.status===429
        ?source+" rate limit reached (HTTP 429). Retry after the quota window."
        :response.status===403
          ?source+" refused "+path+" (HTTP 403); verify Finnhub plan access."
          :response.status===503
            ?"Cloudflare proxy is missing a runtime binding (HTTP 503)."
            :source+" returned HTTP "+response.status+" for "+path+".";
      throw Error(message);
    }
    return response.json();
  }
  function macro(){
    if(!macroPromise){
      macroPromise=fetch("../data.json",{cache:"no-cache"})
        .then(r=>r.ok?r.json():null).then(R.macroSnapshot)
        .catch(()=>null);
    }
    return macroPromise;
  }
  async function load(ticker,curated,onAnnual,onUnavailable){
    const generation=++seq;
    if(controller)controller.abort();
    const active=new AbortController();
    controller=active;
    current={ticker,curated,profile:null,normalized:null,metrics:null,quote:null,macro:null};
    status("Loading company profile, financial metrics and reported statements…");
    render();
    const [profile,metrics,reported,m]=await Promise.allSettled([
      fromAPI("profile",ticker,active.signal),
      fromAPI("metrics",ticker,active.signal),
      fromAPI("financials",ticker,active.signal),
      macro()
    ]);
    if(generation!==seq||active.signal.aborted)return;
    current.profile=profile.status==="fulfilled"?profile.value:null;
    current.metrics=metrics.status==="fulfilled"?metrics.value:null;
    current.macro=m.status==="fulfilled"?m.value:null;
    try{
      current.normalized=reported.status==="fulfilled"?
        R.normalize(reported.value,current.profile,ticker):null;
    }catch(error){
      current.normalized={ticker,annual:[],warning:error.message};
    }
    const years=current.normalized?.annual.length||0;
    if(!curated&&years<5&&typeof onUnavailable==="function"){
      onUnavailable({ticker,profile:current.profile,years,
        failed:reported.status==="rejected",
        reason:reported.status==="rejected"?reported.reason?.message:null,
        validationWarning:current.normalized?.warning||null});
    }
    const issues=[
      profile.status==="rejected"?"profile unavailable":null,
      metrics.status==="rejected"?"basic metrics unavailable":null,
      reported.status==="rejected"?reported.reason?.message||"as-reported statements unavailable":null,
      current.normalized?.warning||null,
      !current.macro?"Treasury source unavailable":null
    ].filter(Boolean);
    status("Finnhub · "+(years>=5?years+" reported fiscal years loaded":years+
      " usable reported fiscal years")+
      (issues.length?" · "+issues.join("; "):" · Profile and metrics checked"));
    // Avoid replacing a newer curated year with an older third-party feed.
    if(years>=5){
      const newest=current.normalized.annual.at(-1).fiscal_end;
      const published=curated?.annual?.at(-1)?.fiscal_end;
      if(!published||newest>=published){
        try{onAnnual(current.normalized);}catch(error){status("Annual source validation failed: "+error.message);}
      }else status("Latest Finnhub FY "+newest+" predates verified FY "+published+
        "; retained newer published statements. "+(issues.length?issues.join("; "):""));
    }
    render();
  }
  function setQuote(ticker,quote){
    if(current?.ticker!==ticker)return;
    current.quote=quote;
    showValuation();
  }
  function init(){
    for(const name of ["rate-shock","spread-bps","exposed-pct"]){
      el(name).addEventListener("input",showStress);
    }
    for(const name of ["fcf-growth","discount-rate","terminal-growth"]){
      el(name).addEventListener("input",showValuation);
    }
    const form=el("symbol-form");
    form.addEventListener("submit",event=>{
      event.preventDefault();
      const symbol=el("custom-ticker").value.trim().toUpperCase();
      if(!/^[A-Z][A-Z.]{0,9}$/.test(symbol)){
        el("ticker-input-status").textContent="Enter a US ticker such as AAPL or BRK.B (1–10 letters/dots).";
        return;
      }
      el("ticker-input-status").textContent="";
      // loadCompany retains arbitrary tickers visibly in the Company selector.
      form.dispatchEvent(new CustomEvent("research-ticker",{bubbles:true,detail:{ticker:symbol}}));
    });
  }
  window.EquityResearchUI={init,load,setQuote,render};
})();
