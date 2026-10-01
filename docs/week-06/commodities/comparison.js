/* Multi-commodity, same-axis overlays. Raw units remain in hover and source metadata;
   multi-asset price comparisons use a 100-based index for commensurability. */
(function(root,factory){
  "use strict";
  const api=factory(root&&root.CommodityForecast||
    (typeof module!=="undefined"?require("./model.js"):null));
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.CommodityComparison=api;
})(typeof window!=="undefined"?window:null,function(M){
  "use strict";
  const COLORS=["#087d76","#38577d","#b27029","#89579b"];
  const MODELS=[
    {id:"mean",label:"Mean reversion",dash:"solid"},
    {id:"trend",label:"Recent trend",dash:"dash"},
    {id:"unchanged",label:"Unchanged price",dash:"dot"}
  ];
  const monthNames=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const flat=arrays=>arrays.reduce((out,items)=>out.concat(items),[]);
  const extrema=values=>{
    const finite=values.filter(Number.isFinite);
    if(!finite.length)throw Error("No comparable prices");
    const min=Math.min(...finite),max=Math.max(...finite);
    const pad=Math.max((max-min)*.14,Math.abs(max)*.04,.05);
    return [Math.max(0,min-pad),max+pad];
  };
  function prepare(commodities,months,opt){
    if(!Array.isArray(commodities)||commodities.length<2||commodities.length>4||
      new Set(commodities.map(c=>c.id)).size!==commodities.length)
      throw Error("Select two to four distinct commodity benchmarks.");
    const windows=commodities.map(c=>M.history(c,months));
    // Index all series to their first reported price on or after the first
    // shared visible month. There is no interpolation or forward-filling.
    const start=windows.map(w=>w[0].date).sort().at(-1);
    return commodities.map((commodity,i)=>{
      const history=windows[i].filter(row=>row.date>=start);
      if(history.length<3)throw Error("Not enough overlapping commodity observations.");
      const anchor=history[0].value;
      if(anchor<=0)throw Error("Commodity comparison anchor is not positive.");
      const forecast=M.forecast(commodity,opt);
      const toIndex=value=>value/anchor*100;
      return {commodity,history,forecast,anchor,color:COLORS[i],
        toIndex,start:history[0].date,last:history.at(-1).date,
        unit:commodity.unit};
    });
  }
  function commonRange(frames){
    const reference=flat(frames.map(frame=>{
      const observed=frame.history.map(r=>frame.toIndex(r.value));
      const baselines=flat(M.MODELS.map(model=>
        M.forecast(frame.commodity,{model,horizon:12,shock:0,vol:0})
          .baseline.map(r=>frame.toIndex(r.price))));
      return observed.concat(baselines);
    }));
    return extrema(reference);
  }
  function projectedRange(frames,opt){
    const values=flat(frames.map(frame=>{
      const f=frame.forecast,convert=frame.toIndex;
      return frame.history.map(p=>convert(p.value))
        .concat(f.scenario.map(p=>convert(p.price)),
          opt.shock?f.baseline.map(p=>convert(p.price)):[],
          opt.vol?f.low.concat(f.high).map(p=>convert(p.price)):[]);
    }));
    return extrema(values);
  }
  function line(frame,records,name,{dash="solid",width=2.2,showlegend=true,
    price=false,color=frame.color,rank=10}={}){
    const x=records.map(r=>r.date);
    const y=records.map(r=>price?frame.toIndex(r.price):r.value);
    const trace={x,y,type:"scatter",mode:"lines",name,legendrank:rank,
      showlegend,line:{color,width,dash},
      meta:{commodity:frame.commodity.id,unit:frame.unit,kind:dash}};
    if(price){
      trace.customdata=records.map(r=>r.price);
      trace.hovertemplate="%{x|%b %Y}: index %{y:,.2f}<br>"+
        "Underlying %{customdata:,.2f} "+frame.unit+"<extra>"+name+"</extra>";
    }else{
      trace.hovertemplate="%{x|%b %Y}: %{y:,.2f}%<extra>"+name+"</extra>";
    }
    return trace;
  }
  function prices(frames,opt){
    const traces=[];
    for(const frame of frames){
      const observed=frame.history.map(r=>({date:r.date,price:r.value}));
      traces.push(line(frame,observed,frame.commodity.label,
        {price:true,width:2.7,rank:10}));
    }
    for(const frame of frames){
      if(opt.shock)traces.push(line(frame,frame.forecast.baseline,
        frame.commodity.label+" baseline",{price:true,dash:"dot",width:1.4,
          showlegend:false,color:frame.color,rank:30}));
      // Keep bands for every commodity; alpha remains light and each pair is
      // contiguous in Plotly ordering so 'tonexty' fills its own band.
      if(opt.vol){
        const lower=line(frame,frame.forecast.low,frame.commodity.label+" low",
          {price:true,dash:"dot",width:1,showlegend:false,color:frame.color});
        const upper=line(frame,frame.forecast.high,frame.commodity.label+" high",
          {price:true,dash:"dot",width:1,showlegend:false,color:frame.color});
        upper.fill="tonexty";
        upper.fillcolor=frame.color+"14";
        traces.push(lower,upper);
      }
      traces.push(line(frame,frame.forecast.scenario,frame.commodity.label+" forecast",
        {price:true,dash:"dash",width:2.4,showlegend:false,rank:20}));
    }
    const lastDates=frames.map(f=>f.last);
    const ends=frames.map(f=>f.forecast.scenario.at(-1).date);
    const start=frames.map(f=>f.start).sort()[0],end=ends.sort().at(-1);
    const boundary=lastDates.sort()[0];
    return {
      traces,
      rangeX:[start,end],
      shapes:[
        {type:"rect",xref:"x",yref:"paper",x0:boundary,x1:end,y0:0,y1:1,
          fillcolor:"rgba(11,127,115,.045)",line:{width:0},layer:"below"},
        ...[...new Set(lastDates)].map(last=>({
          type:"line",xref:"x",yref:"paper",x0:last,x1:last,y0:0,y1:1,
          line:{color:"#96b0aa",dash:"dash",width:1}
        }))
      ],
      context:frames.length+" commodity series · Index 100 at first shared visible month"+
        (new Set(lastDates).size>1?" · Dashed forecast starts at each asset's own last verified month.":"")
    };
  }
  function timeChange(frame,months,cutoff){
    const lookup=new Map(frame.commodity.observations.map(r=>[r.date,r.value]));
    return frame.commodity.observations.flatMap(row=>{
      if(row.date<cutoff)return [];
      const prev=lookup.get(M.shiftMonth(row.date,-months));
      return Number.isFinite(prev)&&prev>0
        ?[{date:row.date,value:(row.value/prev-1)*100}]:[];
    });
  }
  function volatility(frame){
    const obs=frame.commodity.observations,rows=[];
    for(let i=12;i<obs.length;i++){
      if(obs[i].date<frame.start)continue;
      const samples=[];let contiguous=true;
      for(let j=i-11;j<=i;j++){
        if(M.shiftMonth(obs[j-1].date,1)!==obs[j].date){
          contiguous=false;break;
        }
        samples.push(Math.log(obs[j].value/obs[j-1].value));
      }
      if(!contiguous)continue;
      const average=samples.reduce((sum,n)=>sum+n,0)/samples.length;
      const sd=Math.sqrt(samples.reduce((sum,n)=>sum+(n-average)**2,0)/
        (samples.length-1))*100;
      rows.push({date:obs[i].date,value:sd});
    }
    return rows;
  }
  function study(frames,id,opt){
    if(id==="commodity-chart")return prices(frames,opt);
    const traces=[];
    const valueUnit=id==="commodity-seasonality"?"index":"percent";
    if(id==="commodity-models"){
      for(const frame of frames){
        for(const model of MODELS){
          const f=M.forecast(frame.commodity,{...opt,model:model.id,shock:0,vol:0});
          traces.push(line(frame,f.baseline,frame.commodity.label+" · "+model.label,
            {price:true,dash:model.dash,showlegend:model.id==="mean",
              width:model.id==="mean"?2.3:1.6}));
        }
      }
      return {traces,percent:false,category:false,zero:false,price:true,
        context:"Indexed model paths · Color = commodity · Solid = mean reversion, "+
          "dashed = trend, dotted = unchanged price."};
    }
    for(const frame of frames){
      let rows=[];
      if(id==="commodity-yoy")rows=timeChange(frame,12,frame.start);
      else if(id==="commodity-returns")rows=timeChange(frame,1,frame.start);
      else if(id==="commodity-vol")rows=volatility(frame);
      else if(id==="commodity-drawdown"){
        let peak=0;
        rows=frame.history.map(r=>{
          peak=Math.max(peak,r.value);
          return {date:r.date,value:(r.value/peak-1)*100};
        });
      }else if(id==="commodity-shock"){
        const f=frame.forecast;
        rows=f.scenario.map((r,i)=>({
          date:r.date,value:(r.price-f.baseline[i].price)/frame.anchor*100
        }));
      }else if(id==="commodity-seasonality"){
        const groups=Array.from({length:12},()=>[]);
        for(const row of frame.history)groups[Number(row.date.slice(5,7))-1].push(row.value);
        const overall=frame.history.reduce((s,r)=>s+r.value,0)/frame.history.length;
        rows=groups.map((g,i)=>({
          date:monthNames[i],
          value:g.length>=2?g.reduce((s,v)=>s+v,0)/g.length/overall*100:null
        }));
      }
      if(!rows.length)continue;
      const isSeason=id==="commodity-seasonality",isShock=id==="commodity-shock";
      const trace=line(frame,rows,frame.commodity.label,
        {showlegend:true,width:2.2});
      if(isSeason){
        trace.hovertemplate="%{x}: seasonality index %{y:,.1f}"+
          "<extra>"+frame.commodity.label+"</extra>";
      }else if(isShock){
        trace.hovertemplate="%{x|%b %Y}: %{y:,.2f} index points"+
          "<extra>"+frame.commodity.label+"</extra>";
      }
      traces.push(trace);
    }
    const contexts={
      "commodity-yoy":"Observed 12-month price change (%) · Each source uses its own recorded months.",
      "commodity-returns":"Observed adjacent-month price returns (%) · Each commodity has its own color.",
      "commodity-vol":"Trailing 12-month monthly-return standard deviation (%) · Historical observations only.",
      "commodity-drawdown":"Drawdown from each commodity's own peak within the displayed history (%).",
      "commodity-seasonality":"Each commodity's monthly average divided by its own selected-history mean (100).",
      "commodity-shock":"Index-point effect versus each commodity's own unadjusted baseline."
    };
    return {traces,percent:valueUnit==="percent"&&id!=="commodity-shock",
      index:id==="commodity-shock"||id==="commodity-seasonality",
      category:id==="commodity-seasonality",zero:id!=="commodity-vol",
      context:contexts[id]||"",price:false};
  }
  return {COLORS,MODELS,prepare,commonRange,projectedRange,prices,study};
});
