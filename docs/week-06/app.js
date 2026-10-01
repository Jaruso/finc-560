/* Week 6: data-calibrated Diebold–Li baseline + conditional rate scenario. */
(() => {
  "use strict";
  const Model=window.ForecastModel;
  const el=id=>document.getElementById(id);
  const COLOR={five:"#365977",ten:"#0b7f73",historical:"#314b5c",bound:"#81939e",red:"#b84253"};
  const IDS=["chart-yields","chart-spread"];
  const latest=new Map(),queue=new Map(),drawing=new Set();
  let data=null,focused=false,frame=null;
  const pct=n=>Number(n).toFixed(2)+"%";
  const bps=n=>(n<0?"−":"+")+Math.abs(n*100).toFixed(0)+" bps";
  const selected=()=>el("chart-primary").value;
  const state=()=>({
    delta:Number(el("delta").value),
    horizon:Number(el("horizon").value),
    bands:el("show-bands").checked
  });
  const visible=id=>!el(id).closest(".chart-card").classList.contains("is-view-hidden");

  async function drain(id){
    if(drawing.has(id))return;
    drawing.add(id);
    try{
      while(queue.has(id)){
        const next=queue.get(id);
        queue.delete(id);
        await window.Plotly.react(id,next.traces,next.layout,{
          responsive:true,displayModeBar:true,displaylogo:false,scrollZoom:false,
          modeBarButtonsToRemove:["select2d","lasso2d","hoverCompareCartesian"]
        });
      }
    }catch(e){
      el("data-error").hidden=false;
      el("data-error").textContent="Unable to update forecast chart: "+(e.message||e);
    }finally{drawing.delete(id);}
  }
  function putPlot(id,traces,layout){
    latest.set(id,{traces,layout});
    if(visible(id)){queue.set(id,{traces,layout});void drain(id);}
  }
  function showChart(){
    const active=selected();
    IDS.forEach(id=>{
      const card=el(id).closest(".chart-card");
      card.classList.toggle("is-view-hidden",id!==active);
      card.setAttribute("aria-hidden",String(id!==active));
    });
    el("chart-stage").prepend(el(active).closest(".chart-card"));
    window.requestAnimationFrame(()=>{
      const previous=latest.get(active);
      if(previous){
        queue.set(active,{traces:previous.traces,
          layout:{...previous.layout,height:el(active).clientHeight||350}});
        void drain(active);
      }
    });
  }
  function plot(id,history,path){
    const isSpread=id==="chart-spread";
    const hx=history.map(r=>r.date),px=path.map(r=>r.date);
    const observed5=history.map(r=>r.dgs5);
    const observed10=history.map(r=>r.dgs10);
    const historicalSpread=history.map(r=>r.dgs10-r.dgs5);
    const st=state();
    const traces=isSpread?[
      {x:hx,y:historicalSpread,type:"scatter",mode:"lines",name:"Observed spread",
        line:{color:COLOR.historical,width:2.25},
        hovertemplate:"%{x|%b %Y}: %{y:.2f} pp<extra>FRED observed</extra>"}
    ]:[
      {x:hx,y:observed5,type:"scatter",mode:"lines",name:"5Y Treasury",
        line:{color:COLOR.five,width:2.35},legendgroup:"five",
        hovertemplate:"%{x|%b %Y}: %{y:.2f}%<extra>5Y observed</extra>"},
      {x:hx,y:observed10,type:"scatter",mode:"lines",name:"10Y Treasury",
        line:{color:COLOR.ten,width:2.35},legendgroup:"ten",
        hovertemplate:"%{x|%b %Y}: %{y:.2f}%<extra>10Y observed</extra>"}
    ];
    if(st.bands){
      if(isSpread){
        traces.push(
          {x:px,y:path.map(r=>r.lowSpread),type:"scatter",mode:"lines",
            name:"10th percentile historical error",legendgroup:"bounds",
            line:{color:COLOR.bound,width:1,dash:"dot"},
            hovertemplate:"%{x|%b %Y}: %{y:.2f} pp<extra>Historical-error lower bound</extra>"},
          {x:px,y:path.map(r=>r.highSpread),type:"scatter",mode:"lines",
            name:"90th percentile historical error",legendgroup:"bounds",
            line:{color:COLOR.bound,width:1,dash:"dot"},fill:"tonexty",
            fillcolor:"rgba(11,127,115,0.10)",
            hovertemplate:"%{x|%b %Y}: %{y:.2f} pp<extra>Historical-error upper bound</extra>"}
        );
      }else{
        for(const info of [
          {low:"low5",high:"high5",shade:"rgba(54,89,119,0.12)"},
          {low:"low10",high:"high10",shade:"rgba(11,127,115,0.12)"}
        ]){
          traces.push(
            {x:px,y:path.map(r=>r[info.low]),type:"scatter",mode:"lines",
              line:{width:0},showlegend:false,hoverinfo:"skip"},
            {x:px,y:path.map(r=>r[info.high]),type:"scatter",mode:"lines",
              fill:"tonexty",fillcolor:info.shade,
              line:{width:0},showlegend:false,hoverinfo:"skip"}
          );
        }
      }
    }
    if(isSpread){
      traces.push({x:px,y:path.map(r=>r.spread),type:"scatter",mode:"lines",
        name:"Model forecast / scenario",line:{color:COLOR.ten,width:2.55,dash:"dash"},
        hovertemplate:"%{x|%b %Y}: %{y:.2f} pp<extra>Modeled spread</extra>"});
    }else{
      for(const spec of [
        {name:"5Y model forecast",key:"y5",color:COLOR.five,group:"five"},
        {name:"10Y model forecast",key:"y10",color:COLOR.ten,group:"ten"}
      ]){
        traces.push({x:px,y:path.map(r=>r[spec.key]),type:"scatter",mode:"lines",
          name:spec.name,legendgroup:spec.group,showlegend:false,
          line:{color:spec.color,width:2.65,dash:"dash"},
          hovertemplate:"%{x|%b %Y}: %{y:.2f}%<extra>"+spec.name+"</extra>"});
      }
    }
    const base=px[0],end=px.at(-1),months=st.horizon;
    const recentCount=Math.min(history.length-1,Math.max(12,months));
    const rangeStart=focused?history[Math.max(0,history.length-1-recentCount)].date:hx[0];
    const focusStartIndex=Math.max(0,history.length-1-recentCount);
    let domainY=(isSpread?historicalSpread:observed5.concat(observed10))
      .slice(focused?focusStartIndex:0);
    // Combined view requires both maturities from the SAME observed period.
    if(!isSpread&&focused)domainY=observed5.slice(focusStartIndex).concat(observed10.slice(focusStartIndex));
    const futureKeys=isSpread?["spread","lowSpread","highSpread"]:["y5","low5","high5","y10","low10","high10"];
    const values=domainY.concat(path.flatMap(r=>futureKeys.map(key=>r[key])));
    if(isSpread)values.push(0);
    const lo=Math.min(...values),hi=Math.max(...values);
    const pad=Math.max((hi-lo)*.11,isSpread?.07:.14);
    const boundary=(Date.parse(base)-Date.parse(rangeStart))/(Date.parse(end)-Date.parse(rangeStart));
    const layout={
      autosize:true,height:el(id).clientHeight||350,
      margin:{l:55,r:16,t:62,b:49},paper_bgcolor:"#fff",plot_bgcolor:"#fff",
      font:{family:"Inter, system-ui, sans-serif",size:11,color:"#465865"},
      hovermode:"closest",showlegend:true,
      legend:{orientation:"h",x:.5,xanchor:"center",y:1.14,
        font:{size:10},itemwidth:32},
      xaxis:{type:"date",range:[rangeStart,end],showgrid:false,
        tickformat:focused?"%b '%y":"%Y",nticks:focused?8:10,
        linecolor:"#dfe3e6",tickfont:{size:10},automargin:true},
      yaxis:{title:{text:isSpread?"Spread (pp)":"Yield (%)",font:{size:11}},
        range:[lo-pad,hi+pad],zeroline:false,
        gridcolor:"#edf1f2",automargin:true},
      annotations:[
        {x:base,xref:"x",y:1.04,yref:"paper",showarrow:false,
          xanchor:"right",text:"<b>OBSERVED</b>",
          font:{size:10,color:COLOR.historical}},
        {x:end,xref:"x",y:1.04,yref:"paper",showarrow:false,
          xanchor:"right",text:st.delta===0?"<b>MODEL FORECAST</b>":"<b>CONDITIONAL SCENARIO</b>",
          font:{size:10,color:COLOR.ten}}
      ],
      shapes:[
        {type:"rect",xref:"x",yref:"paper",x0:base,x1:end,
          y0:0,y1:1,fillcolor:"rgba(11,127,115,0.04)",
          line:{width:0},layer:"below"},
        {type:"line",xref:"x",yref:"paper",x0:base,x1:base,
          y0:0,y1:1,line:{color:"#93a9a8",width:1.3,dash:"dash"}}
      ],
      meta:{equalTimeScale:true,boundaryFraction:boundary,
        observedStart:hx[0],forecastStart:base,forecastEnd:end,
        focused,trainedModel:"Diebold–Li AR(1)",conditionalShockBp:st.delta,
        empiricalBands:st.bands}
    };
    if(isSpread)layout.shapes.push({
      type:"line",xref:"x",yref:"y",x0:rangeStart,x1:end,
      y0:0,y1:0,line:{color:COLOR.red,width:1.3,dash:"dash"}
    });
    putPlot(id,traces,layout);
  }
  function summary(path){
    const s=state(),first=path[0],last=path.at(-1);
    el("delta-value").textContent=(s.delta<0?"−":s.delta>0?"+":"")+Math.abs(s.delta)+" bps";
    el("kpi-5").textContent=pct(first.y5);
    el("kpi-10").textContent=pct(first.y10);
    el("kpi-base-spread").textContent=bps(first.spread);
    el("kpi-terminal").textContent=bps(last.spread);
    el("preview-five").textContent=pct(last.y5);
    el("preview-ten").textContent=pct(last.y10);
    el("preview-spread").textContent=bps(last.spread);
    el("preview-spread").classList.toggle("is-inverted",last.spread<0);
    let msg="No modeled central-path inversion in this horizon.";
    if(first.spread<0)msg="Curve inverted at the latest observation.";
    else{
      for(let i=1;i<path.length;i++){
        if(path[i].spread<0&&path[i-1].spread>=0){
          msg="Central path crosses zero near month "+i+" (model-conditional, not guaranteed).";
          break;
        }
      }
    }
    el("kpi-crossing").textContent=msg;
    el("kpi-crossing").title=msg;
    el("scenario-status").textContent=s.delta===0?
      "Fitted model baseline; historical-error bands describe past out-of-sample errors.":
      "Conditional "+(s.delta<0?"negative":"positive")+" "+Math.abs(s.delta)+
      "-bp next-month DFF deviation. Historical association only; not a causal Fed-policy estimate.";
  }
  function render(){
    if(!data)return;
    const s=state();
    const history=Model.history(data,el("chart-context").value);
    const path=Model.forecast(data,s.delta,s.horizon);
    summary(path);
    plot("chart-yields",history,path);
    plot("chart-spread",history,path);
    const label=el("chart-context").selectedOptions[0].textContent.trim();
    const date=new Date(path[0].date+"T00:00:00Z")
      .toLocaleDateString("en-US",{month:"short",year:"numeric",timeZone:"UTC"});
    el("axis-explanation").textContent=focused?
      "Focused: latest "+Math.max(1,Math.min(history.length-1,Math.max(12,s.horizon)))+
      " months observed, then "+s.horizon+" modeled months. Continuous dates.":
      label+" of actual yields ending "+date+" → "+s.horizon+
      " months "+(s.delta===0?"model forecast":"conditional policy scenario")+
      ". Calendar distances are proportional; Focus projection for detail.";
  }
  function renderQueued(){
    if(!data)return;
    el("delta-value").textContent=(Number(el("delta").value)>0?"+":Number(el("delta").value)<0?"−":"")+
      Math.abs(Number(el("delta").value))+" bps";
    if(frame!==null)return;
    frame=window.requestAnimationFrame(()=>{frame=null;render();});
  }
  function fillValidation(){
    const body=el("backtest-table");body.replaceChildren();
    for(const row of data.backtest.metrics){
      const tr=document.createElement("tr");
      const metrics={ "5y":"5Y","10y":"10Y",spread:"10Y–5Y" };
      for(const value of [row.horizon_months,metrics[row.metric],
        row.rmse_model_bp.toFixed(1),row.rmse_no_change_bp.toFixed(1)]){
        const td=document.createElement("td");
        td.textContent=String(value);
        if(Number(value)===row.rmse_model_bp&&row.rmse_model_bp>row.rmse_no_change_bp)td.className="worse";
        tr.append(td);
      }
      body.append(tr);
    }
    el("model-status").textContent="Fitted Diebold–Li style · "+
      data.model_parameters.complete_training_months+" training months · 8 Treasury maturities";
  }
  function reset(){
    el("horizon").value="12";
    el("delta").value="0";
    el("show-bands").checked=true;
    el("chart-context").value="120";
    focused=false;
    el("focus-projection").setAttribute("aria-pressed","false");
    el("focus-projection").textContent="Focus projection";
    render();
  }
  async function initialize(){
    IDS.forEach(id=>{
      const card=el(id).closest(".chart-card");
      card.classList.toggle("is-view-hidden",id!==selected());
    });
    el("chart-primary").addEventListener("change",showChart);
    el("chart-context").addEventListener("change",render);
    el("horizon").addEventListener("change",renderQueued);
    el("delta").addEventListener("input",renderQueued);
    el("delta").addEventListener("change",renderQueued);
    el("show-bands").addEventListener("change",render);
    el("reset").addEventListener("click",reset);
    el("focus-projection").addEventListener("click",()=>{
      focused=!focused;
      el("focus-projection").setAttribute("aria-pressed",String(focused));
      el("focus-projection").textContent=focused?"Show full timeline":"Focus projection";
      render();
    });
    let resizing;
    window.addEventListener("resize",()=>{
      clearTimeout(resizing);resizing=setTimeout(showChart,150);
    });
    try{
      if(!window.Plotly||!Model)throw Error("Model renderer or Plotly unavailable.");
      const response=await fetch("./data.json",{cache:"no-store"});
      if(!response.ok)throw Error("Verified FRED model snapshot unavailable.");
      data=Model.verify(await response.json());
      el("data-date").textContent=data.latest_synchronized_daily_observation+
        (data.latest_month_is_partial?" (partial month)":"");
      el("data-refresh").textContent="FRED model refreshed "+data.retrieved_utc.slice(0,16).replace("T"," ")+" UTC";
      fillValidation();
      render();
    }catch(e){
      el("data-date").textContent="Unavailable";
      el("data-error").hidden=false;
      el("data-error").textContent=String(e.message||e)+
        " The dashboard will not substitute illustrative projections for missing fitted model data.";
      el("model-status").textContent="Awaiting verified fitted-model snapshot.";
    }
  }
  initialize();
})();
