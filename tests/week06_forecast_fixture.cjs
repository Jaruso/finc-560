/* Deterministic browser test-only fixture; never published or presented as FRED. */
function makeFixture(){
  const observations=Array.from({length:190},(_,i)=>{
    const date=new Date(Date.UTC(2008,i,1)).toISOString().slice(0,10);
    return {
      date,
      dgs5:Number((1.9+.005*i+.3*Math.sin(i/22)).toFixed(5)),
      dgs10:Number((2.5+.006*i+.23*Math.sin(i/25)).toFixed(5)),
      policy:Number((1.75+.1*Math.cos(i/11)).toFixed(5))
    };
  });
  const last=observations.at(-1);
  const forecast=Array.from({length:25},(_,i)=>{
    const date=new Date(Date.UTC(Number(last.date.slice(0,4)),Number(last.date.slice(5,7))-1+i,1))
      .toISOString().slice(0,10);
    const y5=last.dgs5+.018*i, y10=last.dgs10+.009*i;
    return {date,month:i,y5,y10,spread:y10-y5,
      effect5_per_1pp:i?.42*Math.pow(.96,i-1):0,
      effect10_per_1pp:i?.22*Math.pow(.94,i-1):0};
  });
  const error=(base)=>Array.from({length:24},(_,i)=>({
    month:i+1,error_p10_pp:-base*(i+1),error_p90_pp:base*.8*(i+1),sample_count:60
  }));
  const metrics=[];
  for(const h of [6,12,24]){
    for(const m of ["5y","10y","spread"]){
      metrics.push({horizon_months:h,metric:m,origins:60,
        rmse_model_bp:20+h*2,rmse_no_change_bp:32+h*2});
    }
  }
  return {status:"ready",schema_version:2,observations,forecast,
    empirical_error_bands:{"5y":error(.011),"10y":error(.012),spread:error(.009)},
    backtest:{metrics,origin_count:60},
    model_parameters:{complete_training_months:189,lambda_per_month:.0609},
    latest_month_is_partial:true,
    latest_synchronized_daily_observation:"2023-10-20",
    retrieved_utc:"2023-10-20T18:00:00+00:00"};
}
module.exports={makeFixture};
