/* Keep Finnhub's historical filing loader for the main Equity chart canvas.
   The separate lower section is ticker-linked company news. */
(function(){
  "use strict";
  const R=window.EquityResearch;
  const API="https://finc-560-finnhub.joseph-caruso-pc.workers.dev";
  const el=id=>document.getElementById(id);
  let sequence=0,controller=null;
  async function get(path,ticker,signal){
    const response=await fetch(API+"/"+path+"?symbol="+encodeURIComponent(ticker),{
      method:"GET",mode:"cors",cache:"no-store",signal
    });
    if(!response.ok){
      const body=await response.json().catch(()=>({}));
      const source=body?.source==="gateway"?"Cloudflare proxy":
        body?.source==="provider"?"Finnhub":"API";
      const message=response.status===429
        ?source+" rate limit reached (HTTP 429). Retry after the quota window."
        :response.status===403
          ?source+" refused "+path+" (HTTP 403); check Finnhub plan access."
          :response.status===503
            ?"Cloudflare proxy is missing a runtime binding (HTTP 503)."
            :source+" returned HTTP "+response.status+" for "+path+".";
      throw Error(message);
    }
    return response.json();
  }
  async function load(ticker,curated,onAnnual,onUnavailable){
    const generation=++sequence;
    if(controller)controller.abort();
    const active=new AbortController();
    controller=active;
    // News must not depend on availability/coverage of annual SEC filings.
    window.CompanyNews.load(ticker,curated?.company);
    const [profile,reported]=await Promise.allSettled([
      get("profile",ticker,active.signal),
      get("financials",ticker,active.signal)
    ]);
    if(generation!==sequence||active.signal.aborted)return;
    const companyProfile=profile.status==="fulfilled"?profile.value:null;
    window.CompanyNews.setCompany(ticker,companyProfile?.name||curated?.company);
    let normalized=null;
    try{
      normalized=reported.status==="fulfilled"?
        R.normalize(reported.value,companyProfile,ticker):null;
    }catch(error){
      normalized={ticker,annual:[],warning:error.message};
    }
    const years=normalized?.annual?.length||0;
    if(!curated&&years<5&&typeof onUnavailable==="function"){
      onUnavailable({ticker,profile:companyProfile,years,
        failed:reported.status==="rejected",
        reason:reported.status==="rejected"?reported.reason?.message:null,
        validationWarning:normalized?.warning||null});
    }
    if(years>=5){
      const newest=normalized.annual.at(-1).fiscal_end;
      const published=curated?.annual?.at(-1)?.fiscal_end;
      if(!published||newest>=published){
        try{onAnnual(normalized);}
        catch(error){console.warn("Annual filing validation failed:",error.message);}
      }
    }
  }
  function init(){
    const form=el("symbol-form");
    form.addEventListener("submit",event=>{
      event.preventDefault();
      const ticker=el("custom-ticker").value.trim().toUpperCase();
      if(!/^[A-Z][A-Z.]{0,9}$/.test(ticker)){
        el("ticker-input-status").textContent=
          "Enter a ticker such as AAPL or BRK.B (1–10 letters/dots).";
        return;
      }
      el("ticker-input-status").textContent="";
      form.dispatchEvent(new CustomEvent("research-ticker",{
        bubbles:true,detail:{ticker}
      }));
    });
  }
  window.EquityResearchUI={init,load,setQuote(){},render(){}};
})();
