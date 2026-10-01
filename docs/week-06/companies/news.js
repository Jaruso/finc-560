/* Recent publisher coverage is informational, not an algorithmic credit rating.
   The browser receives only sanitized, public news fields from the Worker. */
(function(){
  "use strict";
  const API="https://finc-560-finnhub.joseph-caruso-pc.workers.dev";
  const MAX=15,REFRESH_MS=15*60*1000;
  const el=id=>document.getElementById(id);
  let ticker=null,company=null,controller=null,sequence=0,updatedAt=0,loading=false;
  const iso=d=>d.toISOString().slice(0,10);
  const period=()=>{
    const end=new Date(),start=new Date(end);
    start.setUTCDate(start.getUTCDate()-29);
    return {from:iso(start),to:iso(end)};
  };
  const safeUrl=value=>{
    try{
      const url=new URL(value);
      return url.protocol==="https:"&&url.hostname?url.href:null;
    }catch{return null;}
  };
  const dateFormat=new Intl.DateTimeFormat("en-US",{
    timeZone:"America/New_York",month:"short",day:"numeric",year:"numeric",
    hour:"numeric",minute:"2-digit",timeZoneName:"short"
  });
  function status(message,kind=""){
    const node=el("news-status");
    node.textContent=message;node.dataset.state=kind;
  }
  function displayName(){
    el("news-company-title").textContent=company&&company!==ticker?
      "· "+company:"· "+(ticker||"");
  }
  function articlesFor(payload){
    if(!Array.isArray(payload))throw Error("Unexpected news response");
    const seen=new Set();
    return payload.filter(item=>{
      if(!item||typeof item.headline!=="string"||!item.headline.trim()||
        !safeUrl(item.url)||!Number.isFinite(item.datetime)||item.datetime<=0)return false;
      if(seen.has(item.url))return false;
      seen.add(item.url);
      return true;
    }).sort((a,b)=>b.datetime-a.datetime).slice(0,MAX);
  }
  function render(items){
    const target=el("news-list");
    target.replaceChildren();
    for(const article of items){
      const card=document.createElement("article");card.className="news-item";
      const meta=document.createElement("p");meta.className="news-item-meta";
      const publisher=document.createElement("span");
      publisher.textContent=typeof article.source==="string"&&article.source.trim()?
        article.source.trim():"Publisher not provided";
      const time=document.createElement("time");
      time.dateTime=new Date(article.datetime*1000).toISOString();
      time.textContent=dateFormat.format(new Date(article.datetime*1000));
      meta.append(publisher,time);
      const title=document.createElement("h3");title.className="news-item-title";
      const headline=document.createElement("a");
      headline.href=safeUrl(article.url);headline.target="_blank";
      headline.rel="noopener noreferrer";
      headline.textContent=article.headline.trim();
      title.append(headline);
      card.append(meta,title);
      if(typeof article.summary==="string"&&article.summary.trim()){
        const summary=document.createElement("p");summary.className="news-item-summary";
        const copy=article.summary.trim();
        summary.textContent=copy.length>300?copy.slice(0,297)+"…":copy;
        card.append(summary);
      }
      const link=document.createElement("a");
      link.href=headline.href;link.target="_blank";link.rel="noopener noreferrer";
      link.className="news-read-more";link.textContent="Read original ↗";
      card.append(link);
      target.append(card);
    }
  }
  async function load(next,preferredName,force=false){
    if(!/^[A-Z][A-Z.]{0,9}$/.test(next))return;
    const changed=next!==ticker;
    if(changed){
      ticker=next;company=preferredName||null;
      updatedAt=0;el("news-list").replaceChildren();
    }else if(preferredName)company=preferredName;
    if(!force&&!changed&&loading)return;
    const generation=++sequence;
    if(controller)controller.abort();
    controller=new AbortController();
    const signal=controller.signal;
    displayName();
    loading=true;el("news-refresh").disabled=true;
    const dates=period();
    status("Loading recent "+ticker+" news…");
    try{
      const url=new URL(API+"/news");
      url.search=new URLSearchParams({symbol:ticker,from:dates.from,to:dates.to}).toString();
      const response=await fetch(url,{method:"GET",mode:"cors",cache:"no-store",signal});
      if(!response.ok){
        const info=await response.json().catch(()=>({}));
        const source=info.source==="gateway"?"Cloudflare proxy":
          info.source==="provider"?"Finnhub":"News API";
        const message=response.status===429?
          source+" temporarily rate limited news. Try again in a minute.":
          response.status===403?
            "News isn't available under this Finnhub subscription (HTTP 403).":
            response.status===503?
              "The news proxy is not configured (HTTP 503).":
              "Unable to retrieve company news (HTTP "+response.status+").";
        throw Error(message);
      }
      const articles=articlesFor(await response.json());
      if(generation!==sequence||signal.aborted)return;
      render(articles);
      updatedAt=Date.now();
      status(articles.length
        ?"Showing "+articles.length+" recent "+ticker+" articles · "+dates.from+
          " to "+dates.to+" · Refreshed "+dateFormat.format(new Date(updatedAt))
        :"No articles returned for "+ticker+" from "+dates.from+" to "+dates.to+
          ". Coverage varies by issuer and Finnhub subscription.",
        articles.length?"ready":"empty");
    }catch(error){
      if(generation!==sequence||signal.aborted)return;
      const retained=el("news-list").children.length>0;
      status(error.message+(retained?" Showing previously loaded articles.":""),"error");
    }finally{
      if(generation===sequence){
        loading=false;el("news-refresh").disabled=false;
      }
    }
  }
  function setCompany(selected,name){
    if(ticker!==selected||!name)return;
    company=name;displayName();
  }
  function init(){
    el("news-refresh").addEventListener("click",()=>{
      if(ticker)void load(ticker,null,true);
    });
    setInterval(()=>{
      if(ticker&&!loading&&document.visibilityState==="visible"&&updatedAt&&
        Date.now()-updatedAt>=REFRESH_MS)void load(ticker,null,true);
    },REFRESH_MS);
    document.addEventListener("visibilitychange",()=>{
      if(ticker&&!loading&&document.visibilityState==="visible"&&updatedAt&&
        Date.now()-updatedAt>=REFRESH_MS)void load(ticker,null,true);
    });
  }
  init();
  window.CompanyNews={load,setCompany};
})();
