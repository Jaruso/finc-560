/* Week 6: data-calibrated Diebold–Li baseline + conditional rate scenario. */
(() => {
  "use strict";
  const Model=window.ForecastModel;
  const el=id=>document.getElementById(id);
  const compactPlot=()=>window.matchMedia("(max-width:650px)").matches;
  const COLOR={five:"#365977",ten:"#0b7f73",historical:"#314b5c",bound:"#81939e",red:"#b84253"};
  const DEFAULT=["chart-yields","chart-spread","chart-curve","chart-accuracy"];
  const IDS=[...DEFAULT,"chart-policy","chart-five","chart-ten","chart-shock","chart-policy-gap"];
  const latest=new Map(),queue=new Map(),drawing=new Set();
  let selectedCharts=[...DEFAULT];
  let data=null,focused=false,showKeys=false,frame=null;
  const pct=n=>Number(n).toFixed(2)+"%";
  const bps=n=>(n<0?"−":"+")+Math.abs(n*100).toFixed(0)+" bps";
  const plotHeight=id=>{
    const card=el(id).closest(".chart-card");
    const heading=card.querySelector(".chart-heading");
    return Math.max(185,card.clientHeight-(heading?.offsetHeight||45)-25);
  };
  const state=()=>({
    delta:Number(el("delta").value),
    horizon:Number(el("horizon").value),
    bands:el("show-bands").checked,
    showKeys
  });
  function updateKeyButton(){
    const button=el("toggle-keys");
    button.setAttribute("aria-pressed",String(showKeys));
    button.textContent=showKeys?"Hide key":"Show key";
  }
  const visible=id=>!el(id).closest(".chart-card").classList.contains("is-view-hidden");

  async function drain(id){
    if(drawing.has(id))return;
    drawing.add(id);
    try{
      while(queue.has(id)){
        const next=queue.get(id);
        queue.delete(id);
        if(!visible(id))continue;
        await window.Plotly.react(id,next.traces,
          {...next.layout,height:plotHeight(id)},{
          responsive:true,displayModeBar:false,displaylogo:false,scrollZoom:false,
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
  function showCharts(){
    const selected=new Set(selectedCharts);
    const stage=el("chart-stage");
    for(const id of IDS){
      const card=el(id).closest(".chart-card");
      const active=selected.has(id);
      card.classList.toggle("is-view-hidden",!active);
      card.classList.toggle("is-featured",id===selectedCharts[0]);
      card.setAttribute("aria-hidden",String(!active));
    }
    // User selection order determines layout. Remaining hidden cards are
    // appended last so nth-child CSS cannot accidentally claim grid slots.
    for(const id of [...selectedCharts,...IDS.filter(id=>!selected.has(id))]){
      stage.append(el(id).closest(".chart-card"));
    }
    stage.dataset.count=String(selectedCharts.length);
    el("chart-count").textContent=selectedCharts.length+" of 4";
    window.requestAnimationFrame(()=>{
      for(const id of selectedCharts){
        const previous=latest.get(id);
        if(previous){
          queue.set(id,previous);
          void drain(id);
        }
      }
    });
  }
  function toggleChart(event){
    const input=event.target;
    if(!input.matches('input[type="checkbox"]'))return;
    const id=input.value;
    if(!IDS.includes(id))return;
    const status=el("chart-selection-status");
    if(input.checked){
      if(selectedCharts.length===4){
        input.checked=false;
        status.textContent="Four charts maximum. Deselect a chart to add another.";
        return;
      }
      selectedCharts.push(id);
    }else{
      if(selectedCharts.length===1){
        input.checked=true;
        status.textContent="Keep at least one chart on the canvas.";
        return;
      }
      selectedCharts=selectedCharts.filter(value=>value!==id);
    }
    status.textContent=selectedCharts.length+
      (selectedCharts.length===1?" chart":" charts")+
      " selected. Scenarios affect modeled views; observed charts remain unchanged.";
    showCharts();
  }
  function plot(id,history,path){
    const isSpread=id==="chart-spread";
    const hx=history.map(r=>r.date),px=path.map(r=>r.date);
    const observed5=history.map(r=>r.dgs5);
    const observed10=history.map(r=>r.dgs10);
    const historicalSpread=history.map(r=>r.dgs10-r.dgs5);
    const st=state();
    const traces=isSpread?[
      {x:hx,y:historicalSpread,type:"scatter",mode:"lines",name:"Observed spread (solid)",legendrank:10,
        line:{color:COLOR.historical,width:2.25},
        hovertemplate:"%{x|%b %Y}: %{y:.2f} pp<extra>FRED observed</extra>"}
    ]:[
      {x:hx,y:observed5,type:"scatter",mode:"lines",name:"5Y observed (solid)",legendrank:10,
        line:{color:COLOR.five,width:2.35},legendgroup:"five",
        hovertemplate:"%{x|%b %Y}: %{y:.2f}%<extra>5Y observed</extra>"},
      {x:hx,y:observed10,type:"scatter",mode:"lines",name:"10Y observed (solid)",legendrank:20,
        line:{color:COLOR.ten,width:2.35},legendgroup:"ten",
        hovertemplate:"%{x|%b %Y}: %{y:.2f}%<extra>10Y observed</extra>"}
    ];
    if(st.bands){
      if(isSpread){
        traces.push(
          {x:px,y:path.map(r=>r.lowSpread),type:"scatter",mode:"lines",
            name:"10th percentile historical error",legendgroup:"bounds",showlegend:false,
            line:{color:COLOR.bound,width:1,dash:"dot"},
            hovertemplate:"%{x|%b %Y}: %{y:.2f} pp<extra>Historical-error lower bound</extra>"},
          {x:px,y:path.map(r=>r.highSpread),type:"scatter",mode:"lines",
            name:"Historical error bounds (dotted)",legendgroup:"bounds",legendrank:50,
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
        name:st.delta===0?"Spread forecast (dashed)":"Spread scenario (dashed)",
        legendrank:30,line:{color:COLOR.ten,width:2.55,dash:"dash"},
        hovertemplate:"%{x|%b %Y}: %{y:.2f} pp<extra>Modeled spread</extra>"});
    }else{
      for(const spec of [
        {name:"5Y forecast (dashed)",scenario:"5Y scenario (dashed)",key:"y5",color:COLOR.five,group:"five",rank:30},
        {name:"10Y forecast (dashed)",scenario:"10Y scenario (dashed)",key:"y10",color:COLOR.ten,group:"ten",rank:40}
      ]){
        traces.push({x:px,y:path.map(r=>r[spec.key]),type:"scatter",mode:"lines",
          name:st.delta===0?spec.name:spec.scenario,legendgroup:spec.group,showlegend:true,legendrank:spec.rank,
          line:{color:spec.color,width:2.65,dash:"dash"},
          hovertemplate:"%{x|%b %Y}: %{y:.2f}%<extra>"+(st.delta===0?spec.name:spec.scenario)+"</extra>"});
      }
    }
    const base=px[0],end=px.at(-1),months=st.horizon;
    const recentCount=Math.min(history.length-1,Math.max(12,months));
    const rangeStart=focused?history[Math.max(0,history.length-1-recentCount)].date:hx[0];
    // LOCK THE Y SCALE: it must never depend on the chosen Fed-rate dial,
    // forecast horizon or visibility of error bands. Derive it exclusively
    // from the selected observed context and the full range of supported
    // 24-month policy scenarios (-100/0/+100 bp), including their bands.
    // A different history window/chart (or explicit Focus) changes context.
    const axisHistory=focused
      ? history.slice(Math.max(0,history.length-25))
      : history;
    const domainY=isSpread
      ? axisHistory.map(r=>r.dgs10-r.dgs5)
      : axisHistory.flatMap(r=>[r.dgs5,r.dgs10]);
    const futureKeys=isSpread
      ? ["spread","lowSpread","highSpread"]
      : ["y5","low5","high5","y10","low10","high10"];
    const envelope=[-100,0,100].flatMap(shock=>
      Model.forecast(data,shock,24).flatMap(r=>futureKeys.map(key=>r[key])));
    const values=domainY.concat(envelope);
    if(isSpread)values.push(0);
    const lo=Math.min(...values),hi=Math.max(...values);
    const pad=Math.max((hi-lo)*.11,isSpread?.07:.14);
    const boundary=(Date.parse(base)-Date.parse(rangeStart))/(Date.parse(end)-Date.parse(rangeStart));
    const layout={
      autosize:true,height:plotHeight(id),
      margin:compactPlot()
        ?{l:47,r:8,t:46,b:34,autoexpand:false}
        :{l:55,r:16,t:62,b:49,autoexpand:false},paper_bgcolor:"#fff",plot_bgcolor:"#fff",
      font:{family:"Inter, system-ui, sans-serif",size:11,color:"#465865"},
      hovermode:"closest",showlegend:st.showKeys,
      legend:{orientation:"h",x:.5,xanchor:"center",
        y:compactPlot()?1.035:1.14,
        font:{size:compactPlot()?9:10},itemwidth:32,autoexpand:false},
      xaxis:{type:"date",range:[rangeStart,end],showgrid:false,
        tickformat:focused?"%b '%y":"%Y",nticks:focused?8:10,
        linecolor:"#dfe3e6",tickfont:{size:10},automargin:true},
      yaxis:{title:{text:isSpread?"Spread (pp)":"Yield (%)",font:{size:11}},
        range:[lo-pad,hi+pad],zeroline:false,
        gridcolor:"#edf1f2",automargin:true},
      // Shading marks the projection period. Legend, not labels over the
      // plot, explains solid observations, dashed forecasts and dotted bounds.
      annotations:[],
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
        empiricalBands:st.bands,
        yScale:"locked-to-observed-context-and-supported-scenario-envelope"}
    };
    if(isSpread)layout.shapes.push({
      type:"line",xref:"x",yref:"y",x0:rangeStart,x1:end,
      y0:0,y1:0,line:{color:COLOR.red,width:1.3,dash:"dash"}
    });
    putPlot(id,traces,layout);
  }
  // Additional independent, related views are derived from the SAME verified
  // historical observations, fitted model and rolling backtest. No new API
  // data or pseudo-observations are manufactured for visual variety.
  function plotAdditional(id,history,path){
    const st=state(),hx=history.map(r=>r.date),px=path.map(r=>r.date);
    const observed=history.at(-1),terminal=path.at(-1);
    const historicalStart=focused
      ?history[Math.max(0,history.length-25)].date:hx[0];
    const end=px.at(-1);
    const context=id.endsWith("accuracy")?
      null:{range:[historicalStart,end],type:"date"};
    const sourceNote=el(id+"-context");
    const base={
      autosize:true,height:plotHeight(id),
      margin:compactPlot()
        ?{l:47,r:8,t:43,b:34,autoexpand:false}
        :{l:55,r:20,t:55,b:47,autoexpand:false},
      paper_bgcolor:"#fff",plot_bgcolor:"#fff",showlegend:st.showKeys,
      font:{family:"Inter, system-ui, sans-serif",size:10,color:"#465865"},
      hovermode:"closest",
      legend:{orientation:"h",x:.5,xanchor:"center",
        y:compactPlot()?1.035:1.16,
        font:{size:compactPlot()?9:10},itemwidth:30},
      xaxis:{type:"date",range:[historicalStart,end],
        tickformat:focused?"%b '%y":"%Y",nticks:8,
        linecolor:"#dfe3e6"},
      yaxis:{gridcolor:"#edf1f2",automargin:true},
      annotations:[],shapes:[],meta:{chartKind:id}
    };
    const line=(name,x,y,color,unit="%",dash="solid")=>({
      type:"scatter",mode:"lines",x,y,name,
      line:{color,width:dash==="dash"?2.5:2.2,dash},
      hovertemplate:"%{x|%b %Y}: %{y:.2f}"+unit+"<extra>"+name+"</extra>"
    });
    let traces=[];
    if(id==="chart-curve"){
      // A snapshot of synchronized, actually observed FRED Treasury yields.
      // The current model projects only the 5Y and 10Y series: do not invent
      // the six other maturities' future yields by interpolation.
      const maturities=[
        ["DGS1",1],["DGS2",2],["DGS3",3],["DGS5",5],
        ["DGS7",7],["DGS10",10],["DGS20",20],["DGS30",30]
      ];
      const snapshot=data.latest_treasury_yields||{};
      const last=data.observations.at(-1);
      const points=maturities.map(([series,years])=>({
        series,years,value:snapshot[series]??(
          series==="DGS5"?last.dgs5:series==="DGS10"?last.dgs10:null)
      })).filter(r=>Number.isFinite(r.value));
      traces=[{
        type:"scatter",mode:"lines+markers",
        name:"Observed Treasury yields",
        x:points.map(r=>r.years),y:points.map(r=>r.value),
        text:points.map(r=>r.years+"Y"),
        line:{color:COLOR.ten,width:2.5},
        marker:{color:COLOR.ten,size:7},
        hovertemplate:"%{text} Treasury: %{y:.2f}%<extra>FRED observed</extra>"
      }];
      const ticks=compactPlot()?[1,5,10,20,30]:[1,3,5,10,20,30];
      const values=points.map(r=>r.value);
      const lo=Math.min(...values),hi=Math.max(...values);
      const pad=Math.max(.14,(hi-lo)*.15);
      base.xaxis={type:"linear",title:"Treasury maturity (years)",
        range:[0,31],tickmode:"array",tickvals:ticks,
        ticktext:ticks.map(y=>y+"Y"),showgrid:false,
        linecolor:"#dfe3e6",zeroline:false};
      base.yaxis={title:"Observed yield (%)",
        range:[lo-pad,hi+pad],gridcolor:"#edf1f2",zeroline:false};
      base.margin={...base.margin,t:compactPlot()?20:28,b:compactPlot()?43:52};
      base.showlegend=false;
      base.meta={chartKind:id,observedOnly:true,
        snapshotDate:data.latest_synchronized_daily_observation,
        maturities:points.map(r=>r.years)};
      sourceNote.textContent="FRED observed · "+
        data.latest_synchronized_daily_observation+" · "+
        points.length+" of 8 verified maturities"+
        (points.length===8?" · No projection shown":
          " · Partial curve; awaiting remaining verified yields");
    }else if(id==="chart-policy"){
      traces=[line("Effective federal funds rate (observed)",hx,
        history.map(r=>r.policy),COLOR.historical)];
      sourceNote.textContent="Latest observed DFF "+
        pct(observed.policy)+" · Federal Reserve / FRED; no policy forecast.";
      base.xaxis.range=[historicalStart,hx.at(-1)];
      base.yaxis.title="Policy rate (%)";
      base.showlegend=false;
    }else if(id==="chart-policy-gap"){
      const g5=history.map(r=>r.dgs5-r.policy),g10=history.map(r=>r.dgs10-r.policy);
      traces=[
        line("5Y yield less DFF (observed)",hx,g5,COLOR.five," pp"),
        line("10Y yield less DFF (observed)",hx,g10,COLOR.ten," pp")
      ];
      sourceNote.textContent="Latest: 5Y − DFF "+(g5.at(-1)>=0?"+":"")+
        g5.at(-1).toFixed(2)+" pp · 10Y − DFF "+(g10.at(-1)>=0?"+":"")+
        g10.at(-1).toFixed(2)+" pp. Not an estimated term premium.";
      base.xaxis.range=[historicalStart,hx.at(-1)];
      base.yaxis.title="Yield − DFF (pp)";
      base.shapes=[{type:"line",xref:"x",yref:"y",x0:historicalStart,
        x1:hx.at(-1),y0:0,y1:0,
        line:{color:"#a1b2b5",width:1,dash:"dot"}}];
    }else if(id==="chart-accuracy"){
      const labels=["5Y","10Y","10Y − 5Y"];
      const keys=["5y","10y","spread"];
      const rows=keys.map(key=>data.backtest.metrics.find(
        r=>r.metric===key&&r.horizon_months===st.horizon));
      if(rows.some(r=>!r))return;
      traces=[
        {type:"bar",name:"Fitted model",x:labels,
          y:rows.map(r=>r.rmse_model_bp),marker:{color:COLOR.ten},
          hovertemplate:"%{x}<br>Model: %{y:.1f} bp RMSE<extra></extra>"},
        {type:"bar",name:"Unchanged-yield baseline",x:labels,
          y:rows.map(r=>r.rmse_no_change_bp),marker:{color:COLOR.five},
          hovertemplate:"%{x}<br>No change: %{y:.1f} bp RMSE<extra></extra>"}
      ];
      sourceNote.textContent=st.horizon+"-month expanding-window backtest · "+
        "Lower RMSE means smaller historical forecast errors.";
      base.xaxis={type:"category",title:"Forecast target",showgrid:false};
      base.yaxis={title:"RMSE (basis points)",rangemode:"tozero",
        gridcolor:"#edf1f2"};
      base.barmode="group";
      base.meta={chartKind:id,backtestHorizon:st.horizon};
    }else if(id==="chart-shock"){
      const basePath=data.forecast.slice(0,st.horizon+1);
      const five=path.map((r,i)=>(r.y5-basePath[i].y5)*100);
      const ten=path.map((r,i)=>(r.y10-basePath[i].y10)*100);
      traces=[
        line("5Y scenario effect",px,five,COLOR.five," bp"),
        line("10Y scenario effect",px,ten,COLOR.ten," bp")
      ];
      sourceNote.textContent=st.delta===0
        ?"Set a nonzero Fed-rate deviation to compare conditional model effects."
        :"Conditional "+(st.delta>0?"+":"")+st.delta+
          " bp Fed-rate deviation · Modeled change vs. the unchanged scenario.";
      const envelope=[-100,100].flatMap(delta=>
        data.forecast.slice(0,25).flatMap(r=>[
          Math.abs(r.effect5_per_1pp*delta),
          Math.abs(r.effect10_per_1pp*delta)
        ]));
      const limit=Math.max(1,...envelope)*1.15;
      base.xaxis.range=[px[0],end];
      base.yaxis={title:"Scenario effect (bp)",
        range:[-limit,limit],gridcolor:"#edf1f2"};
      base.shapes=[{type:"line",xref:"x",yref:"y",x0:px[0],x1:end,
        y0:0,y1:0,line:{color:"#9aafb0",width:1,dash:"dot"}}];
      base.meta={chartKind:id,conditionalShockBp:st.delta};
    }else if(id==="chart-five"||id==="chart-ten"){
      const five=id==="chart-five",key=five?"dgs5":"dgs10";
      const val=five?"y5":"y10";
      const low=five?"low5":"low10",high=five?"high5":"high10";
      const color=five?COLOR.five:COLOR.ten,label=five?"5Y":"10Y";
      traces=[line(label+" observed",hx,history.map(r=>r[key]),color)];
      if(st.bands){
        traces.push(
          {type:"scatter",mode:"lines",x:px,y:path.map(r=>r[low]),
            name:"Historical-error 10th percentile",showlegend:false,
            line:{color:COLOR.bound,width:1,dash:"dot"},
            hovertemplate:"%{x|%b %Y}: %{y:.2f}%<extra>10th percentile</extra>"},
          {type:"scatter",mode:"lines",x:px,y:path.map(r=>r[high]),
            name:"Historical-error 90th percentile",showlegend:true,
            line:{color:COLOR.bound,width:1,dash:"dot"},
            fill:"tonexty",fillcolor:"rgba(11,127,115,0.11)",
            hovertemplate:"%{x|%b %Y}: %{y:.2f}%<extra>90th percentile</extra>"}
        );
      }
      traces.push(line(label+" modeled (dashed)",px,path.map(r=>r[val]),color,"%","dash"));
      sourceNote.textContent="Latest observed "+label+" "+pct(observed[key])+
        " · "+st.horizon+"-month modeled "+pct(terminal[val])+
        (st.bands?" · Historical-error range shown":"");
      base.yaxis.title="Yield (%)";
      const domain=focused?history.slice(-25):history;
      const all=[...domain.map(r=>r[key]),...[-100,0,100].flatMap(delta=>
        Model.forecast(data,delta,24).flatMap(r=>[r[val],r[low],r[high]]))];
      const min=Math.min(...all),max=Math.max(...all),pad=Math.max(.14,(max-min)*.11);
      base.yaxis.range=[min-pad,max+pad];
      base.shapes=[
        {type:"rect",xref:"x",yref:"paper",x0:px[0],x1:end,
          y0:0,y1:1,fillcolor:"rgba(11,127,115,.04)",line:{width:0},layer:"below"},
        {type:"line",xref:"x",yref:"paper",x0:px[0],x1:px[0],
          y0:0,y1:1,line:{color:"#93a9a8",width:1.3,dash:"dash"}}
      ];
      base.meta={chartKind:id,observedEnd:hx.at(-1),scenarioEnd:end,
        conditionalShockBp:st.delta,empiricalBands:st.bands};
    }else return;
    putPlot(id,traces,base);
  }
  function summary(path){
    const s=state(),first=path[0],last=path.at(-1);
    el("delta-value").textContent=(s.delta<0?"−":s.delta>0?"+":"")+Math.abs(s.delta)+" bps";
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
    const label=s.delta===0
      ?"Fitted model baseline; historical-error ranges describe past out-of-sample errors."
      :"Conditional "+(s.delta<0?"negative":"positive")+" "+Math.abs(s.delta)+
        "-bp next-month DFF deviation; observational association only.";
    el("scenario-status").textContent=label+" "+msg;
    el("chart-yields-context").textContent="Latest observed: 5Y "+pct(first.y5)+
      " · 10Y "+pct(first.y10)+" · "+s.horizon+"-month modeled: 5Y "+
      pct(last.y5)+" · 10Y "+pct(last.y10);
    el("chart-spread-context").textContent="Observed "+bps(first.spread)+
      " · "+s.horizon+"-month modeled "+bps(last.spread)+
      (first.spread<0?" · Currently inverted":last.spread<0?
        " · Modeled inversion":" · Zero = inversion threshold");
  }
  function render(){
    if(!data)return;
    const s=state();
    const history=Model.history(data,el("chart-context").value);
    const path=Model.forecast(data,s.delta,s.horizon);
    summary(path);
    plot("chart-yields",history,path);
    plot("chart-spread",history,path);
    for(const id of IDS.slice(2))plotAdditional(id,history,path);
    const label=el("chart-context").selectedOptions[0].textContent.trim();
    const date=new Date(path[0].date+"T00:00:00Z")
      .toLocaleDateString("en-US",{month:"short",year:"numeric",timeZone:"UTC"});
    el("axis-explanation").textContent=focused?
      "Focused: latest "+Math.max(1,Math.min(history.length-1,Math.max(12,s.horizon)))+
      " months observed, then "+s.horizon+" modeled months. Continuous dates.":
      label+" of actual yields ending "+date+" → "+s.horizon+
      " months "+(s.delta===0?"model forecast":"conditional policy scenario")+
      ". Time-series charts preserve calendar distances; the curve shows observed tenors and the accuracy view uses backtest horizons.";
  }
  function renderQueued(){
    if(!data)return;
    el("delta-value").textContent=(Number(el("delta").value)>0?"+":Number(el("delta").value)<0?"−":"")+
      Math.abs(Number(el("delta").value))+" bps";
    if(frame!==null)return;
    frame=window.requestAnimationFrame(()=>{frame=null;render();});
  }
  function renderYieldCards(){
    // Latest observed constant-maturity yields, never inferred spot prices
    // or fitted model values. Older snapshots only contain 5Y and 10Y.
    const latest=data.observations.at(-1);
    const observed=data.latest_treasury_yields||{};
    const cards=[
      ["DGS1","yield-one",null],
      ["DGS2","yield-two",null],
      ["DGS5","yield-five",latest.dgs5],
      ["DGS10","yield-ten",latest.dgs10]
    ];
    for(const [series,id,legacy] of cards){
      const value=observed[series]??legacy;
      el(id).textContent=Number.isFinite(value)?pct(value):"—";
      el(id).closest(".treasury-quote").setAttribute("aria-label",
        series.slice(3)+"-year Treasury yield: "+
        (Number.isFinite(value)?pct(value):"awaiting verified data"));
    }
    el("yield-quote-status").textContent="Federal Reserve / FRED · "+
      data.latest_synchronized_daily_observation+
      (cards.some(([series,,legacy])=>!Number.isFinite(observed[series]??legacy))?
        " · 1Y/2Y pending verified refresh":" · Synchronized observed yields");
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
    showKeys=false;
    selectedCharts=[...DEFAULT];
    for(const input of el("chart-picker").querySelectorAll('input[type="checkbox"]')){
      input.checked=selectedCharts.includes(input.value);
    }
    el("chart-selection-status").textContent="Four related views selected.";
    showCharts();
    el("focus-projection").setAttribute("aria-pressed","false");
    el("focus-projection").textContent="Focus projection";
    updateKeyButton();
    render();
  }
  async function initialize(){
    showCharts();
    el("chart-picker").addEventListener("change",toggleChart);
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
    el("toggle-keys").addEventListener("click",()=>{
      showKeys=!showKeys;
      updateKeyButton();
      render();
    });
    updateKeyButton();
    let resizing;
    window.addEventListener("resize",()=>{
      clearTimeout(resizing);resizing=setTimeout(showCharts,150);
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
      renderYieldCards();
      render();
    }catch(e){
      el("data-date").textContent="Unavailable";
      el("data-error").hidden=false;
      el("data-error").textContent=String(e.message||e)+
        " The dashboard will not substitute illustrative projections for missing fitted model data.";
      el("model-status").textContent="Awaiting verified fitted-model snapshot.";
      el("yield-quote-status").textContent="Verified Treasury yields unavailable.";
    }
  }
  initialize();
})();
