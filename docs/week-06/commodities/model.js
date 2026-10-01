/* Price-based, browser-run commodity scenarios; no stock revenue assumptions. */
(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.CommodityForecast=api;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  const MODELS=["mean","trend","unchanged"];
  const dateRE=/^\d{4}-\d{2}-01$/;
  const toMonth=d=>new Date(d+"T00:00:00Z");
  function shiftMonth(date,months){
    const d=toMonth(date);
    d.setUTCMonth(d.getUTCMonth()+months);
    return d.toISOString().slice(0,10);
  }
  function verify(snapshot){
    if(!snapshot||snapshot.schema_version!==1||snapshot.status!=="ready"||
      !Array.isArray(snapshot.commodities)||snapshot.commodities.length<3){
      throw Error("Verified FRED commodity snapshot is not available.");
    }
    const ids=new Set();
    for(const c of snapshot.commodities){
      if(ids.has(c.id)||!["wti","brent","gas"].includes(c.id)||
        !c.label||!c.unit||!/^https:\/\/fred.stlouisfed.org\/series\//.test(c.source_url||"")||
        !Array.isArray(c.observations)||c.observations.length<60)throw Error("Invalid commodity history.");
      ids.add(c.id);
      for(let i=0;i<c.observations.length;i++){
        const o=c.observations[i],prev=c.observations[i-1];
        if(!dateRE.test(o.date)||!Number.isFinite(o.value)||o.value<=0||
           (prev&&prev.date>=o.date))throw Error("Unordered or invalid commodity prices.");
      }
      if(c.last_observation!==c.observations.at(-1).date)throw Error("Commodity latest observation mismatch.");
    }
    if(ids.size!==3)throw Error("Missing selected commodity series.");
    return snapshot;
  }
  function stats(history){
    const values=history.map(o=>Math.log(o.value)),returns=[];
    for(let i=1;i<values.length;i++)returns.push(values[i]-values[i-1]);
    const tail=returns.slice(-60),mean=tail.reduce((a,b)=>a+b,0)/tail.length;
    const variance=tail.reduce((s,v)=>s+(v-mean)**2,0)/Math.max(1,tail.length-1);
    return {monthlyLogVolatility:Math.sqrt(variance),observationCount:history.length};
  }
  function fittedPrice(history,model,months){
    const current=Math.log(history.at(-1).value);
    if(model==="unchanged")return Array(months).fill(Math.exp(current));
    if(model==="trend"){
      const rows=history.slice(-Math.min(36,history.length)),logs=rows.map(x=>Math.log(x.value));
      const n=rows.length,mid=(n-1)/2,avg=logs.reduce((a,b)=>a+b,0)/n;
      let num=0,den=0;
      logs.forEach((v,i)=>{num+=(i-mid)*(v-avg);den+=(i-mid)**2;});
      const slope=Math.max(-.035,Math.min(.035,num/den));
      return Array.from({length:months},(_,i)=>Math.exp(current+slope*(i+1)));
    }
    const rows=history.slice(-Math.min(60,history.length));
    const logs=rows.map(x=>Math.log(x.value));
    const x=logs.slice(0,-1),y=logs.slice(1);
    const avg=x.reduce((a,b)=>a+b,0)/x.length;
    const ya=y.reduce((a,b)=>a+b,0)/y.length;
    let covariance=0,variance=0;
    x.forEach((v,i)=>{covariance+=(v-avg)*(y[i]-ya);variance+=(v-avg)**2;});
    const phi=Math.max(0,Math.min(.985,variance>1e-10?covariance/variance:0));
    // Anchored to the observed long-run log mean; conditional AR(1)
    // reversion, not an identified supply/demand structural equation.
    const longRun=logs.reduce((a,b)=>a+b,0)/logs.length;
    return Array.from({length:months},(_,i)=>
      Math.exp(longRun+Math.pow(phi,i+1)*(current-longRun)));
  }
  function forecast(commodity,{model="mean",horizon=6,shock=0,halfLife=6,vol=1}={}){
    if(!commodity||!Array.isArray(commodity.observations)||commodity.observations.length<60||
       !MODELS.includes(model)||![3,6,12].includes(horizon)||
       !Number.isInteger(shock)||Math.abs(shock)>30||
       ![3,6,12].includes(halfLife)||![0,1,2].includes(vol)){
      throw Error("Unsupported commodity forecasting inputs.");
    }
    const obs=commodity.observations,first=obs.at(-1),s=stats(obs);
    const projected=fittedPrice(obs,model,horizon);
    const baseline=[{date:first.date,price:first.value}];
    const scenario=[{...baseline[0]}];
    const low=[{...baseline[0]}],high=[{...baseline[0]}];
    projected.forEach((price,i)=>{
      const months=i+1,date=shiftMonth(first.date,months);
      const shockEffect=1+shock/100*Math.pow(.5,(months-1)/halfLife);
      const value=Math.max(.001,price*shockEffect);
      const spread=s.monthlyLogVolatility*Math.sqrt(months)*vol;
      baseline.push({date,price});
      scenario.push({date,price:value});
      low.push({date,price:value*Math.exp(-spread)});
      high.push({date,price:value*Math.exp(spread)});
    });
    return {model,horizon,shock,halfLife,vol,baseline,scenario,low,high,
      sigma:s.monthlyLogVolatility,latest:first.value,
      last_observation:first.date};
  }
  function history(c,months){
    if(!c||!Array.isArray(c.observations))throw Error("Commodity series missing.");
    if(months==="all")return c.observations;
    const n=Number(months);
    if(![24,60,120,240].includes(n))throw Error("Invalid commodity history window.");
    return c.observations.slice(-n);
  }
  return {verify,forecast,history,shiftMonth,stats,MODELS};
});
