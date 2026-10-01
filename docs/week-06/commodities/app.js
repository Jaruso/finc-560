/* Verified EIA/FRED monthly spot prices; scenarios calculate in this browser. */
(()=>{
"use strict";
const M=window.CommodityForecast,el=id=>document.getElementById(id);
const state={snapshot:null,commodity:null,context:null,range:null,values:null,
  plotHeight:null,pending:null,painting:false,tick:false};
const dollars=v=>Number.isFinite(v)?"$"+v.toLocaleString("en-US",
  {minimumFractionDigits:2,maximumFractionDigits:3}):"—";
const input=()=>({model:el("model").value,horizon:+el("horizon").value,
  shock:+el("shock").value,halfLife:+el("half-life").value,vol:+el("vol").value});
function height(){
  if(state.plotHeight!==null)return state.plotHeight;
  const card=el("commodity-chart").closest(".chart-card");
  const header=card.querySelector(".chart-heading");
  const css=getComputedStyle(card);
  return state.plotHeight=Math.max(245,Math.floor(card.clientHeight-header.offsetHeight-
    (parseFloat(css.paddingTop)||0)-(parseFloat(css.paddingBottom)||0)-3));
}
function error(ex){el("data-error").hidden=false;
  el("data-error").textContent=String(ex.message||ex);}
async function paint(){
  if(state.painting)return;
  state.painting=true;
  try{
    while(state.pending){
      const data=state.pending;state.pending=null;
      await Plotly.react("commodity-chart",data.traces,data.layout,{
        responsive:true,scrollZoom:false,displayModeBar:false,displaylogo:false});
    }
  }catch(ex){error(ex);}
  finally{state.painting=false;}
}
function draw(){
  const c=state.commodity;if(!c)return;
  try{
    const opt=input(),f=M.forecast(c,opt),history=M.history(c,el("history").value);
    const first=history[0].date,last=history.at(-1),end=f.scenario.at(-1).date;
    const key=[c.id,c.last_observation,el("history").value].join("|");
    if(state.context!==key){state.context=key;state.range=null;}
    // FIXED SCALE: only reported prices and unadjusted, maximum-horizon
    // baseline models determine the default axis. Never include dial values.
    const observed=history.map(p=>p.value);
    const reference=observed.concat(M.MODELS.flatMap(model=>
      M.forecast(c,{model,horizon:12,shock:0,halfLife:6,vol:0})
        .baseline.map(p=>p.price)));
    const minimum=Math.min(...reference),maximum=Math.max(...reference);
    const pad=Math.max((maximum-minimum)*.14,maximum*.04,.05);
    const defaultRange=[Math.max(0,minimum-pad),maximum+pad];
    const range=state.range||defaultRange;
    const showBase=opt.shock!==0;
    state.values=observed.concat(f.scenario.map(p=>p.price),
      showBase?f.baseline.map(p=>p.price):[],
      opt.vol?f.low.map(p=>p.price).concat(f.high.map(p=>p.price)):[]);
    const clipped=state.values.some(v=>v<range[0]||v>range[1]);
    const fit=el("fit-projection");
    fit.textContent=clipped?"Fit projection":state.range?"Restore scale":"Scale locked";
    fit.disabled=!clipped&&!state.range;
    const actual=last.value,base=f.baseline.at(-1).price,forecast=f.scenario.at(-1).price;
    const oneYearBack=c.observations.find(p=>p.date===M.shiftMonth(last.date,-12));
    el("shock-value").textContent=(opt.shock>0?"+":"")+opt.shock+"%";
    el("kpi-latest").textContent=dollars(actual);
    el("kpi-change").textContent=oneYearBack?
      ((actual/oneYearBack.value-1)>=0?"+":"")+
       ((actual/oneYearBack.value-1)*100).toFixed(1)+"%":"—";
    el("kpi-baseline").textContent=dollars(base);
    el("kpi-scenario").textContent=dollars(forecast);
    el("kpi-unit").textContent=c.unit;
    el("preview-baseline").textContent=dollars(base);
    el("preview-scenario").textContent=dollars(forecast);
    el("preview-difference").textContent=(forecast-base>=0?"+":"")+
      (forecast-base).toFixed(3);
    el("scenario-status").textContent=(opt.shock===0?"Fitted baseline":
      "Conditional "+(opt.shock>0?"+":"")+opt.shock+"% shock")+
      " · "+opt.horizon+"-month horizon · "+
      (opt.vol?opt.vol+"× historical volatility":"bounds off");
    el("source-period").textContent="Through "+last.date.slice(0,7);
    el("data-refresh").textContent="FRED snapshot · "+state.snapshot.retrieved_utc.slice(0,10);
    el("market-description").textContent=c.label+" · "+c.unit+" · "+c.source;
    el("chart-heading").textContent=c.label;
    el("chart-subtitle").textContent="Reported monthly spot averages · "+c.unit+
      " · Conditional price scenarios";
    el("commodity-source").href=c.source_url;
    el("commodity-source").textContent="FRED: "+c.source_id;
    const series=(rows,name,line,rank,extra={})=>({
      x:rows.map(r=>r.date),y:rows.map(r=>r.price),
      type:"scatter",mode:"lines",name,legendrank:rank,line,
      hovertemplate:"%{x|%b %Y}: $%{y:,.2f}<extra>"+name+"</extra>",...extra
    });
    const traces=[{x:history.map(p=>p.date),y:observed,type:"scatter",
      mode:"lines",name:"Reported (solid)",legendrank:10,
      line:{color:"#314b5c",width:2.6},
      hovertemplate:"%{x|%b %Y}: $%{y:,.2f}<extra>Observed spot average</extra>"}];
    if(showBase)traces.push(series(f.baseline,"Unadjusted baseline (dotted)",
      {color:"#91a2ab",width:1.65,dash:"dot"},20));
    if(opt.vol){
      traces.push(series(f.low,"Volatility guide (dotted)",
        {color:"#9aabb2",width:1.1,dash:"dot"},40));
      traces.push(series(f.high,"Upper volatility guide",
        {color:"#9aabb2",width:1.1,dash:"dot"},41,
        {showlegend:false,fill:"tonexty",fillcolor:"rgba(11,127,115,.08)"}));
    }
    traces.push(series(f.scenario,showBase?"Conditional scenario (dashed)":
      "Model forecast (dashed)",{color:"#0b7f73",width:2.65,dash:"dash"},30));
    const layout={
      autosize:true,height:height(),
      margin:{l:70,r:18,t:66,b:50,autoexpand:false},
      paper_bgcolor:"#fff",plot_bgcolor:"#fff",
      font:{family:"Inter,system-ui,sans-serif",size:11,color:"#465865"},
      showlegend:true,hovermode:"closest",
      legend:{orientation:"h",x:.5,xanchor:"center",y:1.14,
        font:{size:10},autoexpand:false},
      xaxis:{type:"date",range:[first,end],dtick:history.length>36?"M12":"M3",
        tickformat:"%b %Y",showgrid:false,linecolor:"#dfe3e6",automargin:true},
      yaxis:{title:{text:c.unit,font:{size:11}},tickprefix:"$",
        gridcolor:"#edf1f2",range:range.slice(),zeroline:false,automargin:true},
      shapes:[
        {type:"rect",xref:"x",yref:"paper",x0:last.date,x1:end,
          y0:0,y1:1,fillcolor:"rgba(11,127,115,.045)",line:{width:0},layer:"below"},
        {type:"line",xref:"x",yref:"paper",x0:last.date,x1:last.date,
          y0:0,y1:1,line:{color:"#92aba7",width:1.25,dash:"dash"}}
      ],annotations:[],
      meta:{commodity:c.id,unit:c.unit,source:c.source_url,scale:"continuous-monthly",
        yScale:state.range?"manual-locked":"baseline-locked",
        observedEnd:last.date,projectedStart:f.scenario[0].date,
        projectedEnd:end,clipped,defaultRange:defaultRange.slice()}
    };
    el("chart-footnote").textContent=clipped?
      "Scenario extends beyond the fixed scale. Click Fit projection to inspect it.":
      "Solid: observed · Dashed: forecast · Dotted: baseline/volatility guides.";
    state.pending={traces,layout};void paint();
  }catch(ex){error(ex);}
}
function schedule(){
  if(state.tick)return;
  state.tick=true;
  requestAnimationFrame(()=>{state.tick=false;draw();});
}
function reset(){
  el("model").value="mean";el("horizon").value="6";
  el("shock").value="0";el("half-life").value="6";
  el("vol").value="1";el("history").value="60";
  state.context=null;state.range=null;schedule();
}
function choose(){
  state.commodity=state.snapshot.commodities.find(c=>c.id===el("commodity").value);
  state.context=null;state.range=null;draw();
}
async function init(){
  try{
    if(!window.Plotly||!M)throw Error("Commodity chart model unavailable.");
    el("commodity").addEventListener("change",choose);
    for(const id of ["model","horizon","half-life","vol","history"])
      el(id).addEventListener("change",schedule);
    el("shock").addEventListener("input",schedule);
    el("shock").addEventListener("change",schedule);
    el("reset").addEventListener("click",reset);
    el("fit-projection").addEventListener("click",()=>{
      if(!state.values)return;
      if(el("fit-projection").textContent==="Restore scale")state.range=null;
      else{
        const lo=Math.min(...state.values),hi=Math.max(...state.values);
        const pad=Math.max((hi-lo)*.14,hi*.04,.05);
        state.range=[Math.max(0,lo-pad),hi+pad];
      }
      schedule();
    });
    let timer;
    window.addEventListener("resize",()=>{
      clearTimeout(timer);
      timer=setTimeout(()=>{state.plotHeight=null;schedule();},120);
    });
    const response=await fetch("./data.json",{cache:"no-cache"});
    if(!response.ok)throw Error("FRED commodity snapshot unavailable.");
    const data=await response.json();
    if(data.status==="pending"){
      el("source-period").textContent="Refresh pending";
      el("data-refresh").textContent="Awaiting verified FRED series";
      el("commodity-empty").hidden=false;
      return;
    }
    M.verify(data);state.snapshot=data;
    el("commodity").replaceChildren();
    for(const c of data.commodities){
      const op=document.createElement("option");
      op.value=c.id;op.textContent=c.label;el("commodity").append(op);
    }
    el("commodity").disabled=false;el("commodity-empty").hidden=true;
    const requested=new URLSearchParams(location.search).get("asset");
    el("commodity").value=data.commodities.some(c=>c.id===requested)?requested:"wti";
    choose();
  }catch(ex){
    el("source-period").textContent="Unavailable";
    el("commodity-empty").hidden=false;error(ex);
  }
}
init();
})();
