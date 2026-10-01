/* Small, browser-native annual company model; no hidden server forecasts. */
(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.CompanyForecast=api;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  const METRICS={
    revenue:"revenue_musd",operating:"operating_income_musd",net:"net_income_musd"
  };
  function verify(d){
    if(!d||d.schema_version!==1||d.status!=="ready"||
       !/^[A-Z.]{1,10}$/.test(d.ticker||"")||
       !Array.isArray(d.annual)||d.annual.length<5||
       !d.annual.every((r,i)=>/^\d{4}-\d\d-\d\d$/.test(r.fiscal_end||"") &&
         r.revenue_musd>0 && Object.values(METRICS).every(k=>Number.isFinite(r[k])) &&
         (!i || r.fiscal_end>d.annual[i-1].fiscal_end) &&
         r.filings && Object.values(r.filings).every(f=>f.filed && f.accession))){
      throw new Error("Verified comparable annual SEC financials are unavailable.");
    }
    return d;
  }
  function linearForecast(history, horizon){
    const rows=history.slice(-Math.min(6,history.length));
    const n=rows.length,xbar=(n-1)/2,ybar=rows.reduce((sum,r)=>sum+r.revenue_musd,0)/n;
    let cov=0,varX=0;
    rows.forEach((r,i)=>{cov+=(i-xbar)*(r.revenue_musd-ybar);varX+=(i-xbar)**2;});
    const slope=cov/varX;
    return Array.from({length:horizon},(_,j)=>Math.max(0,ybar+slope*((n-1)+(j+1)-xbar)));
  }
  function cagrForecast(history,horizon){
    const rows=history.slice(-Math.min(5,history.length));
    const growth=Math.pow(rows.at(-1).revenue_musd/rows[0].revenue_musd,1/(rows.length-1))-1;
    return Array.from({length:horizon},(_,j)=>rows.at(-1).revenue_musd*Math.pow(1+growth,j+1));
  }
  function weightedMargins(history){
    const rows=history.slice(-3);
    const denom=rows.length*(rows.length+1)/2;
    const avg=key=>rows.reduce((sum,r,i)=>
      sum+(i+1)*(r[key]/r.revenue_musd),0)/denom;
    return {operating:avg("operating_income_musd"),net:avg("net_income_musd")};
  }
  function nextFiscalDate(value,years){
    const d=new Date(value+"T00:00:00Z");
    if(Number.isNaN(d.getTime()))throw Error("Invalid fiscal year end");
    const targetMonth=d.getUTCMonth();
    d.setUTCFullYear(d.getUTCFullYear()+years);
    // Maintain end-of-February reporting on a leap-year transition.
    if(d.getUTCMonth()!==targetMonth)d.setUTCDate(0);
    return d.toISOString().slice(0,10);
  }
  function forecast(d,{method="cagr",horizon=3,growth=0,margin=0}={}){
    verify(d);
    if(!["cagr","linear"].includes(method)||![1,2,3].includes(horizon)||
       !Number.isFinite(growth)||Math.abs(growth)>20||
       !Number.isFinite(margin)||Math.abs(margin)>10){
      throw Error("Unsupported forecasting assumptions");
    }
    const history=d.annual;
    const latest=history.at(-1);
    const rev=(method==="linear"?linearForecast:cagrForecast)(history,horizon);
    const histMargin=weightedMargins(history);
    const projected=[{
      fiscal_end:latest.fiscal_end,revenue_musd:latest.revenue_musd,
      operating_income_musd:latest.operating_income_musd,
      net_income_musd:latest.net_income_musd,year:0
    }];
    const baseline=[{...projected[0]}];
    rev.forEach((base,j)=>{
      const year=j+1;
      const changed=Math.max(0,base*Math.pow(1+growth/100,year));
      const date=nextFiscalDate(latest.fiscal_end,year);
      const make=(r,m)=>({
        fiscal_end:date,year,
        revenue_musd:r,
        operating_income_musd:r*m.operating,
        net_income_musd:r*m.net
      });
      projected.push(make(changed,{
        operating:histMargin.operating+margin/100,
        net:histMargin.net+margin/100
      }));
      baseline.push(make(base,histMargin));
    });
    return {historical:history,projected,baseline,method,horizon,
      growth_pp:growth,margin_pp:margin,
      margin_assumptions:histMargin,
      note:"Revenue trend model plus trailing weighted accounting margins. Sensitivities are user-defined, not statistical forecast intervals."};
  }
  function history(d,count=5){
    verify(d);
    if(count==="all")return d.annual;
    const size=Number(count);
    if(![4,5,6,8].includes(size))throw Error("Invalid history window");
    return d.annual.slice(-size);
  }
  function backtestRevenue(d,method){
    verify(d);
    if(!["linear","cagr"].includes(method))throw Error("Invalid backtest method");
    // Refit only on data genuinely observed before the following fiscal year.
    const rows=d.annual,errors=[],naive=[];
    for(let origin=3;origin<rows.length-1;origin++){
      const available=rows.slice(0,origin+1);
      const prediction=(method==="linear"?linearForecast:cagrForecast)(available,1)[0];
      const actual=rows[origin+1].revenue_musd;
      errors.push((prediction-actual)**2);
      naive.push((rows[origin].revenue_musd-actual)**2);
    }
    return {
      n:errors.length,
      model_rmse_musd:Math.sqrt(errors.reduce((a,b)=>a+b,0)/errors.length),
      naive_rmse_musd:Math.sqrt(naive.reduce((a,b)=>a+b,0)/naive.length)
    };
  }
  return {verify,forecast,history,backtestRevenue,METRICS};
});
