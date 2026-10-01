/* Verified multi-source monthly commodity benchmarks; browser scenario models. */
(()=>{
"use strict";
const M=window.CommodityForecast,C=window.CommodityComparison,el=id=>document.getElementById(id);
const state={snapshot:null,commodity:null,context:null,range:null,values:null,
  plotHeight:null,pending:null,painting:false,tick:false,canvas:null,selectedIds:[],modes:{},axisValues:null};
const OPTIONS=["commodity-chart","commodity-yoy","commodity-returns","commodity-vol",
  "commodity-seasonality","commodity-models","commodity-shock","commodity-drawdown"];
const DEFAULT=OPTIONS.slice(0,4);
const plotQueue=new Map(),plotting=new Set();
const safeNumber=(v,n=1)=>(Number.isFinite(v)?v.toFixed(n):"—");
function chartHeight(id){
  const card=el(id).closest(".chart-card"),header=card.querySelector(".chart-heading");
  const style=getComputedStyle(card);
  return Math.max(180,Math.floor(card.clientHeight-header.offsetHeight-
    (parseFloat(style.paddingTop)||0)-(parseFloat(style.paddingBottom)||0)-3));
}
const dollars=v=>Number.isFinite(v)?
  (state.commodity?.unit==="cents/sheet"?"":"$")+
  v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:3})+
  (state.commodity?.unit==="cents/sheet"?"¢":""):"—";
const CATEGORIES=["Energy","Precious metals","Industrial metals","Critical minerals",
  "Forest products","Grains","Oilseeds & oils","Soft commodities",
  "Livestock & food","Fertilizers","Other commodities"];
const categoryOf=c=>c.category||"Energy";
const input=()=>({model:el("model").value,horizon:+el("horizon").value,
  shock:+el("shock").value,halfLife:+el("half-life").value,vol:+el("vol").value});

/* Each panel has its own explicit Indexed / Nominal preference. Single
   benchmarks initially retain their familiar raw spot and model prices and
   percentage-return measures; comparison price charts begin indexed. */
const SINGLE_NOMINAL=new Set(["commodity-chart","commodity-seasonality",
  "commodity-models"]);
function modeFor(id){
  return state.modes[id]||(state.selectedIds.length<=1&&SINGLE_NOMINAL.has(id)?
    "nominal":"indexed");
}
function syncModes(){
  for(const group of document.querySelectorAll(".chart-scale-toggle")){
    for(const button of group.querySelectorAll("button[data-mode]"))
      button.setAttribute("aria-pressed",
        String(modeFor(group.dataset.chartMode)===button.dataset.mode));
  }
}
function needsUnifiedSingle(){
  return OPTIONS.some(id=>Object.hasOwn(state.modes,id)&&
    modeFor(id)!==(SINGLE_NOMINAL.has(id)?"nominal":"indexed"));
}
function updateEmptyVisibility(){
  const blank=!state.selectedIds.length;
  el("commodity-empty").hidden=!blank;
  if(blank){
    el("commodity-empty").querySelector("strong").textContent=
      "Choose your first commodity";
    el("commodity-empty").querySelector("p").textContent=
      "The first selection is primary; up to three more can be compared.";
    el("source-period").textContent="Awaiting selection";
    el("comparison-preview").hidden=true;
    el("comparison-sources").hidden=true;
    el("commodity-source").hidden=true;
    state.canvas.setAvailable([]);
    el("commodity-quote").hidden=true;
  }
}

function height(){
  if(state.plotHeight!==null)return state.plotHeight;
  const card=el("commodity-chart").closest(".chart-card");
  const header=card.querySelector(".chart-heading");
  const css=getComputedStyle(card);
  return state.plotHeight=chartHeight("commodity-chart");
}
function error(ex){el("data-error").hidden=false;
  el("data-error").textContent=String(ex.message||ex);}
async function paint(){
  if(state.painting)return;
  state.painting=true;
  try{
    while(state.pending){
      const data=state.pending;state.pending=null;
      if(!state.canvas.visible("commodity-chart"))continue;
      await Plotly.react("commodity-chart",data.traces,
        {...data.layout,height:height()},{
        responsive:true,scrollZoom:false,displayModeBar:false,displaylogo:false});
    }
  }catch(ex){error(ex);}
  finally{state.painting=false;}
}
/* Half-life only affects a nonzero shock. Keep the selector honest and make
   its endpoint effect visible even when curves share a locked y-axis. */
function syncHalfLife(){
  const opt=input(),picker=el("half-life"),hint=el("half-life-impact");
  picker.disabled=opt.shock===0;
  if(!opt.shock){
    hint.textContent="Set a nonzero price shock to enable decay.";
    return;
  }
  const remaining=opt.shock*Math.pow(.5,(opt.horizon-1)/opt.halfLife);
  hint.textContent="At month "+opt.horizon+": "+(remaining>0?"+":"")+
    remaining.toFixed(1)+"% shock remains.";
}
function draw(){
  syncHalfLife();
  const c=state.commodity;if(!c)return;
  syncModes();
  if(state.selectedIds.length>1||needsUnifiedSingle()){
    drawComparison();return;
  }
  el("comparison-preview").hidden=true;
  el("comparison-sources").hidden=true;
  el("commodity-source").hidden=false;
  el("preview-baseline").closest(".commodity-preview").classList.remove("is-comparing");
  try{
    const opt=input(),f=M.forecast(c,opt),history=M.history(c,el("history").value);
    // A zero shock has no sensitivity curve worth displaying. Disable it,
    // without leaving an empty card when a scenario resets to baseline.
    state.canvas.setAvailable(OPTIONS.filter(id=>
      id!=="commodity-shock"||opt.shock!==0));
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
    fit.hidden=!state.canvas.visible("commodity-chart");
    fit.disabled=fit.hidden||(!clipped&&!state.range);
    el("chart-footnote").hidden=fit.hidden;
    const actual=last.value,base=f.baseline.at(-1).price,forecast=f.scenario.at(-1).price;
    showSpot(c,last);
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
      " · "+opt.horizon+"-month horizon"+
      (opt.shock?" · "+opt.halfLife+"-month half-life":"")+" · "+
      (opt.vol?opt.vol+"× historical volatility":"bounds off");
    el("source-period").textContent="Through "+last.date.slice(0,7);
    el("data-refresh").textContent="Verified snapshot · "+state.snapshot.retrieved_utc.slice(0,10);
    el("chart-heading").textContent=c.label;
    el("chart-subtitle").textContent="Observed "+dollars(actual)+" · "+
      (oneYearBack?"12-month "+safeNumber((actual/oneYearBack.value-1)*100)+"% · ":"")+
      opt.horizon+"-month modeled "+dollars(forecast)+" · "+c.unit;
    el("commodity-source").href=c.source_url;
    el("commodity-source").textContent=c.source+" · "+c.source_id;
    const series=(rows,name,line,rank,extra={})=>({
      x:rows.map(r=>r.date),y:rows.map(r=>r.price),
      type:"scatter",mode:"lines",name,legendrank:rank,line,
      hovertemplate:"%{x|%b %Y}: "+(c.unit==="cents/sheet"?"":"$")+
        "%{y:,.2f}"+(c.unit==="cents/sheet"?"¢":"")+
        "<extra>"+name+"</extra>",...extra
    });
    const traces=[{x:history.map(p=>p.date),y:observed,type:"scatter",
      mode:"lines",name:"Reported (solid)",legendrank:10,
      line:{color:"#314b5c",width:2.6},
      hovertemplate:"%{x|%b %Y}: "+(c.unit==="cents/sheet"?"":"$")+
        "%{y:,.2f}"+(c.unit==="cents/sheet"?"¢":"")+
        "<extra>Observed physical benchmark</extra>"}];
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
      yaxis:{title:{text:c.unit,font:{size:11}},
        tickprefix:c.unit==="cents/sheet"?"":"$",
        ticksuffix:c.unit==="cents/sheet"?"¢":"",
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
    if(state.canvas.visible("commodity-chart")){
      state.pending={traces,layout};void paint();
    }
    renderExtras(c,history,f,opt);
  }catch(ex){error(ex);}
}

function plotAdditional(id,traces,layout){
  if(!state.canvas.visible(id))return;
  plotQueue.set(id,{traces,layout});
  if(plotting.has(id))return;
  plotting.add(id);
  void (async()=>{
    try{
      while(plotQueue.has(id)){
        const payload=plotQueue.get(id);plotQueue.delete(id);
        if(!state.canvas.visible(id))continue;
        await Plotly.react(id,payload.traces,
          {...payload.layout,height:chartHeight(id)},{
            responsive:true,scrollZoom:false,displayModeBar:false,displaylogo:false});
      }
    }catch(ex){error(ex);}
    finally{plotting.delete(id);}
  })();
}
function renderExtras(c,history,f,opt){
  const chosen=new Set(state.canvas.selected());
  const observations=c.observations,last=history.at(-1);
  const color={main:"#0b7f73",navy:"#314b5c",secondary:"#aa7840",muted:"#8799a4"};
  const fmt=c.unit,short=fmt;
  const currency=n=>dollars(n);
  function context(id,message){el(id+"-context").textContent=message;}
  function layout(id,{percent=false,category=false,bars=false,zero=false,horizon=false}={}){
    const cfg={
      autosize:true,height:chartHeight(id),
      margin:{l:60,r:12,t:45,b:46,autoexpand:false},
      paper_bgcolor:"#fff",plot_bgcolor:"#fff",
      font:{family:"Inter,system-ui,sans-serif",size:10,color:"#465865"},
      legend:{orientation:"h",x:.5,xanchor:"center",y:1.17,font:{size:10}},
      showlegend:bars,hovermode:"closest",
      xaxis:{type:category?"category":"date",showgrid:false,
        linecolor:"#dfe3e6",automargin:true},
      yaxis:{title:percent?"Change (%)":fmt,
        ticksuffix:percent?"%":fmt==="cents/sheet"?"¢":"",
        tickprefix:percent||fmt==="cents/sheet"?"":"$",
        gridcolor:"#edf1f2",automargin:true},
      shapes:[],annotations:[],meta:{commodity:c.id,metric:id,
        source:c.source_url,modeled:horizon}
    };
    if(zero)cfg.shapes=[{type:"line",xref:"paper",yref:"y",x0:0,x1:1,
      y0:0,y1:0,line:{color:"#9aabb2",dash:"dot",width:1}}];
    if(horizon)cfg.xaxis.range=[f.scenario[0].date,f.scenario.at(-1).date];
    return cfg;
  }
  const series=(name,x,y,col,{unit="%",dashed=false}={})=>({
    type:"scatter",mode:"lines",x,y,name,
    line:{color:col,width:2.2,dash:dashed?"dash":"solid"},
    hovertemplate:"%{x|%b %Y}: %{y:.2f}"+unit+"<extra>"+name+"</extra>"
  });
  const cutoff=history[0].date;
  const monthValue=new Map(observations.map(o=>[o.date,o.value]));
  // Build returns using only adjacent calendar months (never bridge gaps).
  const returns=observations.flatMap((o,i)=>i&&
    M.shiftMonth(observations[i-1].date,1)===o.date
    ?[{date:o.date,change:(o.value/observations[i-1].value-1)*100,
      log:Math.log(o.value/observations[i-1].value)}]:[]);
  const visibleReturns=returns.filter(r=>r.date>=cutoff);
  if(chosen.has("commodity-returns")){
    const r=visibleReturns;
    context("commodity-returns",r.length?
      "Latest reported monthly change "+(r.at(-1).change>=0?"+":"")+
      safeNumber(r.at(-1).change)+"% · Actual spot-price averages.":"No adjacent monthly returns");
    const cfg=layout("commodity-returns",{percent:true,zero:true});
    cfg.yaxis.title="Monthly change (%)";
    plotAdditional("commodity-returns",[
      {type:"bar",x:r.map(p=>p.date),y:r.map(p=>p.change),
        name:"Observed monthly change",
        marker:{color:r.map(p=>p.change<0?color.secondary:color.main)},
        hovertemplate:"%{x|%b %Y}: %{y:.2f}%<extra>Observed change</extra>"}
    ],cfg);
  }
  if(chosen.has("commodity-yoy")){
    const yoy=observations.flatMap(o=>{
      const prior=monthValue.get(M.shiftMonth(o.date,-12));
      return o.date>=cutoff&&Number.isFinite(prior)&&prior>0
        ?[{date:o.date,value:(o.value/prior-1)*100}]:[];
    });
    context("commodity-yoy",yoy.length?
      "Latest verified 12-month change "+(yoy.at(-1).value>=0?"+":"")+
      safeNumber(yoy.at(-1).value)+"%.":"Requires matching prior-year observations");
    const cfg=layout("commodity-yoy",{percent:true,zero:true});
    cfg.yaxis.title="12-month change (%)";
    plotAdditional("commodity-yoy",[
      series("Reported annual change",yoy.map(r=>r.date),
        yoy.map(r=>r.value),color.main)
    ],cfg);
  }
  if(chosen.has("commodity-vol")){
    const annual=[];
    for(let i=12;i<observations.length;i++){
      let consecutive=true;
      const sample=[];
      for(let j=i-11;j<=i;j++){
        if(M.shiftMonth(observations[j-1].date,1)!==observations[j].date){
          consecutive=false;break;
        }
        sample.push(Math.log(observations[j].value/observations[j-1].value));
      }
      if(!consecutive||observations[i].date<cutoff)continue;
      const avg=sample.reduce((a,b)=>a+b,0)/sample.length;
      const std=Math.sqrt(sample.reduce((t,v)=>t+(v-avg)**2,0)/(sample.length-1))*100;
      annual.push({date:observations[i].date,vol:std});
    }
    context("commodity-vol",annual.length?
      "Latest 12-month realized standard deviation "+safeNumber(annual.at(-1).vol)+"%.":
      "Requires 12 consecutive monthly observations");
    const cfg=layout("commodity-vol",{percent:true});
    cfg.yaxis.title="Monthly return std. dev. (%)";
    plotAdditional("commodity-vol",[
      series("12-month rolling volatility",annual.map(x=>x.date),
        annual.map(x=>x.vol),color.navy)
    ],cfg);
  }
  if(chosen.has("commodity-seasonality")){
    const groups=Array.from({length:12},()=>[]);
    for(const r of history)groups[Number(r.date.slice(5,7))-1].push(r.value);
    const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const mean=groups.map(g=>g.length>=2?g.reduce((a,b)=>a+b,0)/g.length:null);
    context("commodity-seasonality","Observed calendar-month averages across "+
      history.length+" monthly prices · Descriptive, not a seasonal price forecast.");
    const cfg=layout("commodity-seasonality",{category:true});
    cfg.xaxis.title="Observation month";
    plotAdditional("commodity-seasonality",[
      {type:"bar",x:months,y:mean,customdata:groups.map(g=>g.length),
        name:"Observed monthly average",marker:{color:color.main},
        hovertemplate:"%{x}: $%{y:,.2f}<br>%{customdata} observations<extra></extra>"}
    ],cfg);
  }
  if(chosen.has("commodity-models")){
    const models=[
      {model:"mean",label:"Mean reversion",col:color.main},
      {model:"trend",label:"Recent trend",col:color.navy},
      {model:"unchanged",label:"Unchanged price",col:color.secondary}
    ];
    const traces=models.map(x=>{
      const rows=M.forecast(c,{...opt,model:x.model,shock:0,vol:0}).baseline;
      return series(x.label,rows.map(r=>r.date),
        rows.map(r=>r.price),x.col,{unit:" "+short,dashed:true});
    });
    context("commodity-models",opt.horizon+"-month model comparison from latest verified "+
      currency(last.value)+" · No price shock applied.");
    const cfg=layout("commodity-models",{horizon:true});
    cfg.showlegend=true;cfg.yaxis.title=fmt;
    plotAdditional("commodity-models",traces,cfg);
  }
  if(chosen.has("commodity-shock")&&opt.shock!==0){
    const effect=f.scenario.map((r,i)=>({date:r.date,
      value:(r.price/f.baseline[i].price-1)*100}));
    context("commodity-shock",(opt.shock>0?"+":"")+opt.shock+
      "% hypothetical spot-price shock · "+opt.halfLife+"-month half-life.");
    const cfg=layout("commodity-shock",{percent:true,zero:true,horizon:true});
    cfg.yaxis.title="Difference vs baseline (%)";
    plotAdditional("commodity-shock",[
      series("Conditional price impact",effect.map(r=>r.date),
        effect.map(r=>r.value),color.main)
    ],cfg);
  }
  if(chosen.has("commodity-drawdown")){
    let peak=0;
    const rows=history.map(o=>{
      peak=Math.max(peak,o.value);
      return {date:o.date,value:(o.value/peak-1)*100};
    });
    context("commodity-drawdown","Decline from the previous peak within the selected "+
      el("history").selectedOptions[0].textContent+" window · Historical only.");
    const cfg=layout("commodity-drawdown",{percent:true,zero:true});
    cfg.yaxis.title="Drawdown from previous peak (%)";
    plotAdditional("commodity-drawdown",[
      {type:"scatter",mode:"lines",x:rows.map(r=>r.date),
        y:rows.map(r=>r.value),fill:"tozeroy",
        fillcolor:"rgba(170,120,64,.10)",line:{color:color.secondary,width:2},
        name:"Observed drawdown",
        hovertemplate:"%{x|%b %Y}: %{y:.2f}%<extra>Peak-relative decline</extra>"}
    ],cfg);
  }
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
  state.context=null;state.range=null;state.axisValues=null;
  state.plotHeight=null;state.modes={};syncModes();state.canvas.reset();schedule();
}


/* One Commodity dropdown replaces the duplicate compare panel. Checked items
   are displayed in the exact order selected; slot 1 is always the primary.
   Category/search only filter *available additions*: never mutate selection. */
function formatNative(value,commodity){
  if(!Number.isFinite(value))return "—";
  const number=value.toLocaleString("en-US",{
    minimumFractionDigits:2,maximumFractionDigits:commodity.unit==="USD/kg"?3:2
  });
  return commodity.unit==="cents/sheet"?number+"¢":
    "$"+number+" "+commodity.unit.replace(/^USD\//,"/");
}
/* The primary price card uses published monthly observations, never model
   scenarios or intraday prices. A comparison does not change its identity. */
function showSpot(commodity,last){
  if(!commodity||!last){el("commodity-quote").hidden=true;return;}
  el("commodity-quote").hidden=false;
  el("commodity-quote-name").textContent=commodity.label;
  const num=Number(last.value);
  const displayed=num.toLocaleString("en-US",{
    minimumFractionDigits:2,maximumFractionDigits:commodity.unit==="USD/kg"?3:2
  });
  el("commodity-quote-price").textContent=
    commodity.unit==="cents/sheet"?displayed+"¢":
      (commodity.unit.startsWith("USD")?"$":"")+displayed;
  const previous=commodity.observations.find(row=>
    row.date===M.shiftMonth(last.date,-12));
  const change=el("commodity-quote-change");
  change.classList.remove("is-up","is-down");
  if(previous&&previous.value>0){
    const percent=(last.value/previous.value-1)*100;
    change.textContent=(percent>0?"+":"")+percent.toFixed(1)+"% / 12 mo";
    if(percent>0)change.classList.add("is-up");
    else if(percent<0)change.classList.add("is-down");
  }else{
    change.textContent="12-mo change unavailable";
  }
  el("market-description").textContent=commodity.unit+" · "+
    commodity.source+" · "+last.date.slice(0,7)+" monthly average";
  const source=el("commodity-quote-source");
  source.href=commodity.source_url;
  source.textContent="View "+commodity.source+" source";
}
function updateSelection(next){
  state.selectedIds=next.slice(0,4);
  state.commodity=state.snapshot.commodities.find(c=>c.id===state.selectedIds[0])||null;
  state.context=null;state.range=null;state.plotHeight=null;state.axisValues=null;
  renderChoices();
  syncModes();
  updateEmptyVisibility();
  if(state.commodity)draw();
}
function renderChoices(message=""){
  if(!state.snapshot)return;
  const category=el("commodity-category").value;
  const term=el("commodity-search").value.trim().toLowerCase();
  const pool=state.snapshot.commodities;
  const selected=state.selectedIds.map(id=>pool.find(c=>c.id===id)).filter(Boolean);
  const chosen=new Set(state.selectedIds);
  const eligible=pool.filter(c=>(category==="all"||categoryOf(c)===category)&&
    (!term||[c.label,categoryOf(c),c.source].join(" ").toLowerCase().includes(term)))
    .sort((a,b)=>CATEGORIES.indexOf(categoryOf(a))-
      CATEGORIES.indexOf(categoryOf(b))||a.label.localeCompare(b.label));
  const root=el("commodity-options");root.replaceChildren();
  const group=(title,items,selectedGroup)=>{
    const container=document.createElement("section");
    container.className="commodity-multi-group";
    const heading=document.createElement("h3");heading.textContent=title;
    container.append(heading);
    items.forEach((commodity)=>{
      const label=document.createElement("label");label.className="commodity-multi-option";
      const checkbox=document.createElement("input");
      checkbox.type="checkbox";checkbox.value=commodity.id;
      const index=state.selectedIds.indexOf(commodity.id);
      checkbox.checked=index>=0;
      checkbox.disabled=index<0&&state.selectedIds.length===4;
      label.append(checkbox);
      const name=document.createElement("span");name.textContent=
        commodity.label+" · "+commodity.unit;
      label.append(name);
      if(index>=0){
        const rank=document.createElement("span");rank.className="selection-rank";
        rank.textContent=index===0?"Primary":"Compare "+index;
        label.append(rank);
      }
      container.append(label);
    });
    root.append(container);
  };
  if(selected.length)group("Selected · in selection order",selected,true);
  let last=null,bucket=[];
  function flush(){
    if(bucket.length)group(last,bucket,false);
    bucket=[];
  }
  for(const commodity of eligible){
    if(chosen.has(commodity.id))continue;
    const category=categoryOf(commodity);
    if(last!==category){flush();last=category;}
    bucket.push(commodity);
  }
  flush();
  if(!selected.length&&!eligible.length){
    const blank=document.createElement("p");blank.className="commodity-multi-empty";
    blank.textContent="No matching verified commodities.";root.append(blank);
  }
  const n=selected.length;
  const primary=selected[0];
  el("commodity-summary").textContent=primary?
    primary.label+(n>1?" + "+(n-1)+" comparison"+(n===2?"":"s"):""):
    "Select a commodity…";
  el("commodity-selection-count").textContent=n+" of 4";
  el("commodity-selection-status").textContent=message||
    (n===4?"Four selected; uncheck one to add another.":
      n===0?"Choose a commodity to begin.":
      "First selected = primary · Select up to "+(4-n)+" more.");
  const distinct=new Set(eligible.map(categoryOf));
  el("commodity-count").textContent=eligible.length+" verified benchmark"+
    (eligible.length===1?"":"s")+
    (category==="all"?" across "+distinct.size+" categor"+
      (distinct.size===1?"y":"ies"):"")+
    (!eligible.length?" · Clear search or change category.":"");
}
function buildCommodityPicker(){
  const root=el("commodity-options");
  root.addEventListener("change",event=>{
    const input=event.target;
    if(!input.matches('input[type="checkbox"]'))return;
    const id=input.value,index=state.selectedIds.indexOf(id);
    if(input.checked){
      if(index>=0){renderChoices();return;}
      if(state.selectedIds.length===4){
        renderChoices("Four commodities maximum; uncheck one first.");
        return;
      }
      updateSelection([...state.selectedIds,id]);
    }else{
      if(index<0)return;
      updateSelection(state.selectedIds.filter(value=>value!==id));
    }
  });
  el("commodity-clear").addEventListener("click",()=>updateSelection([]));
}

function drawComparison(){
  if(!state.snapshot||!state.selectedIds.length)return;
  try{
    const commodities=state.selectedIds.map(id=>
      state.snapshot.commodities.find(c=>c.id===id));
    const opt=input(),frames=C.prepare(commodities,el("history").value,opt);
    const primary=frames[0],observed=primary.history.at(-1);
    showSpot(primary.commodity,observed);
    const priceMode=modeFor("commodity-chart");
    state.canvas.setAvailable(OPTIONS.filter(id=>
      id!=="commodity-shock"||opt.shock!==0));
    const key=state.selectedIds.join("|")+"|"+el("history").value+"|"+
      frames.map(f=>f.commodity.last_observation).join("|")+"|"+priceMode;
    if(state.context!==key){
      state.context=key;state.range=null;state.axisValues=null;
    }
    const nominal=priceMode==="nominal";
    const defaultRange=nominal?
      C.nominalPriceRanges(frames):C.commonRange(frames);
    const rendered=C.prices(frames,opt,priceMode);
    const currentRange=nominal?
      C.nominalPriceRanges(frames,{projected:true,opt}):null;
    const visiblePrices=nominal?[]:frames.flatMap(f=>
      f.history.map(row=>f.toIndex(row.value)).concat(
        f.forecast.scenario.map(row=>f.toIndex(row.price)),
        opt.shock?f.forecast.baseline.map(row=>f.toIndex(row.price)):[],
        opt.vol?f.forecast.low.concat(f.forecast.high)
          .map(row=>f.toIndex(row.price)):[]));
    state.values=visiblePrices;
    state.axisValues=currentRange;
    const axis=state.range||defaultRange;
    const clipped=nominal?
      Object.keys(currentRange).some(unit=>
        currentRange[unit][0]<axis[unit][0]||currentRange[unit][1]>axis[unit][1]):
      visiblePrices.some(value=>value<axis[0]||value>axis[1]);
    const fit=el("fit-projection");
    fit.textContent=clipped?"Fit projection":state.range?"Restore scale":"Scale locked";
    fit.hidden=!state.canvas.visible("commodity-chart");
    fit.disabled=fit.hidden||(!clipped&&!state.range);
    el("chart-footnote").hidden=fit.hidden;
    el("shock-value").textContent=(opt.shock>0?"+":"")+opt.shock+"%";
    const initial=primary.forecast.baseline.at(-1).price;
    const adjusted=primary.forecast.scenario.at(-1).price;
    const previous=primary.commodity.observations.find(row=>
      row.date===M.shiftMonth(observed.date,-12));
    el("kpi-latest").textContent=formatNative(observed.value,primary.commodity);
    el("kpi-change").textContent=previous?
      ((observed.value/previous.value-1)>=0?"+":"")+
      safeNumber((observed.value/previous.value-1)*100)+"%":"—";
    el("kpi-baseline").textContent=formatNative(initial,primary.commodity);
    el("kpi-scenario").textContent=formatNative(adjusted,primary.commodity);
    el("kpi-unit").textContent=primary.unit;
    el("preview-baseline").textContent=formatNative(initial,primary.commodity);
    el("preview-scenario").textContent=formatNative(adjusted,primary.commodity);
    el("preview-difference").textContent=safeNumber((adjusted/initial-1)*100)+"%";
    const comparing=frames.length>1;
    el("preview-baseline").closest(".commodity-preview")
      .classList.toggle("is-comparing",comparing);
    el("scenario-status").textContent=frames.length+
      " verified benchmark"+(frames.length===1?"":"s")+
      " · Shared "+opt.horizon+"-month model and "+
      (opt.shock?"conditional "+(opt.shock>0?"+":"")+opt.shock+
        "% shock · "+opt.halfLife+"-month half-life":"zero shock")+".";
    const preview=el("comparison-preview");preview.hidden=!comparing;preview.replaceChildren();
    if(comparing){
      const previewHeading=document.createElement("p");
      previewHeading.className="comparison-preview-heading";
      previewHeading.textContent="Projected outcomes";
      preview.append(previewHeading);
    }
    for(const frame of comparing?frames:[]){
      const row=document.createElement("div");row.className="comparison-preview-row";
      const name=document.createElement("span");name.className="comparison-preview-name";
      const dot=document.createElement("span");dot.className="comparison-dot";
      dot.style.setProperty("--series-color",frame.color);
      const title=document.createElement("span");title.textContent=frame.commodity.label;
      name.append(dot,title);
      const valueLabel=document.createElement("span");
      valueLabel.className="comparison-preview-label";valueLabel.textContent="Scenario";
      const value=document.createElement("strong");value.className="comparison-preview-value";
      value.textContent=formatNative(frame.forecast.scenario.at(-1).price,frame.commodity);
      const delta=document.createElement("small");
      delta.textContent="Baseline "+
        formatNative(frame.forecast.baseline.at(-1).price,frame.commodity)+
        " · Data through "+frame.last.slice(0,7);
      row.append(name,valueLabel,value,delta);preview.append(row);
    }
    el("source-period").textContent=frames.length>1?
      "Multiple monthly series":"Through "+primary.last.slice(0,7);
    el("data-refresh").textContent="Verified snapshot · "+state.snapshot.retrieved_utc.slice(0,10);
    el("chart-heading").textContent=frames.length>1?
      frames.length+"-commodity price comparison":primary.commodity.label;
    el("chart-subtitle").textContent=frames.length>1?
      (nominal?frames.length+" series · Original units on separate axes · Dashed = forecast.":
        frames.length+" series · Index 100 at first shared month · Hover for original units."):
      rendered.context+" · "+(nominal?"Actual units":"Hover for original units")+
        " · Solid observed, dashed forecasts.";
    el("commodity-source").hidden=frames.length>1;
    el("commodity-source").href=primary.commodity.source_url;
    el("commodity-source").textContent=primary.commodity.source+" · "+primary.commodity.source_id;
    const sources=el("comparison-sources");sources.hidden=frames.length===1;
    sources.replaceChildren();
    if(frames.length>1){
      const sourceLabel=document.createElement("span");
      sourceLabel.className="comparison-sources-label";sourceLabel.textContent="Sources";
      sources.append(sourceLabel);
      for(const frame of frames){
        const anchor=document.createElement("a");
        anchor.href=frame.commodity.source_url;
        anchor.target="_blank";anchor.rel="noopener noreferrer";
        anchor.textContent=frame.commodity.label;
        sources.append(anchor);
      }
    }
    const layout={
      autosize:true,height:height(),
      margin:{l:62,r:16,t:76,b:48,autoexpand:false},
      paper_bgcolor:"#fff",plot_bgcolor:"#fff",
      font:{family:"Inter,system-ui,sans-serif",size:10,color:"#465865"},
      showlegend:true,hovermode:"closest",
      legend:{orientation:"h",x:.5,xanchor:"center",y:1.18,font:{size:10},
        autoexpand:false},
      xaxis:{type:"date",range:rendered.rangeX,showgrid:false,
        tickformat:"%b %Y",dtick:frames[0].history.length>36?"M12":"M3",
        linecolor:"#dfe3e6",automargin:true},
      yaxis:{title:"Price index (first shared month = 100)",
        gridcolor:"#edf1f2",range:nominal?undefined:axis.slice(),
        zeroline:false,automargin:true},
      shapes:rendered.shapes,annotations:[],
      meta:{commodity:primary.commodity.id,
        commodities:state.selectedIds.slice(),comparison:frames.length>1,
        mode:priceMode,unit:nominal?primary.unit:"index (base 100)",
        observedEnd:primary.last,projectedEnd:rendered.rangeX[1],
        defaultRange:nominal?structuredClone(defaultRange):defaultRange.slice(),
        yScale:state.range?"manual-locked":"baseline-locked",
        clipped}
    };
    if(nominal){
      const plan=C.nominalAxes(rendered.traces,frames,{ranges:axis,positiveOnly:true});
      Object.assign(layout,plan.axes);
      if(plan.xDomain)layout.xaxis.domain=plan.xDomain;
      layout.margin.l=plan.units.length>1?70:62;
      layout.margin.r=plan.units.length>1?
        Math.min(165,68+(plan.units.length-2)*45):16;
      layout.meta.axesByUnit=plan.units.slice();
    }
    el("chart-footnote").textContent=clipped?
      "Some projections exceed the fixed scale. Click Fit projection to inspect them.":
      nominal?"Actual, original commodity units; differing units use separate labeled axes.":
      "Prices indexed to 100; hover for the original price and units.";
    if(state.canvas.visible("commodity-chart")){
      state.pending={traces:rendered.traces,layout};
      void paint();
    }
    for(const id of state.canvas.selected()){
      if(id==="commodity-chart")continue;
      const mode=modeFor(id),study=C.study(frames,id,opt,mode);
      const context=el(id+"-context");
      if(context)context.textContent=study.context;
      if(!study.traces.length)continue;
      const extra={
        autosize:true,height:chartHeight(id),
        margin:{l:60,r:14,t:72,b:47,autoexpand:false},
        paper_bgcolor:"#fff",plot_bgcolor:"#fff",
        font:{family:"Inter,system-ui,sans-serif",size:10,color:"#465865"},
        showlegend:true,hovermode:"closest",
        legend:{orientation:"h",x:.5,xanchor:"center",y:1.18,
          font:{size:9},autoexpand:false},
        xaxis:{type:study.category?"category":"date",showgrid:false,
          linecolor:"#dfe3e6",automargin:true},
        yaxis:{title:study.index?"Index points (base = 100)":
          study.price?"Price index (base = 100)":"Change (%)",
          ticksuffix:study.price||study.index?"":"%",
          gridcolor:"#edf1f2",automargin:true},
        shapes:study.zero?[{type:"line",xref:"paper",yref:"y",
          x0:0,x1:1,y0:study.category?100:0,y1:study.category?100:0,
          line:{color:"#95a8a7",dash:"dot",width:1}}]:[],
        annotations:[],
        meta:{commodities:state.selectedIds.slice(),comparison:frames.length>1,
          metric:id,mode}
      };
      if(mode==="nominal"){
        const plan=C.nominalAxes(study.traces,frames,{
          positiveOnly:id==="commodity-seasonality"||
            id==="commodity-models"||id==="commodity-vol"});
        Object.assign(extra,plan.axes);
        if(plan.xDomain)extra.xaxis.domain=plan.xDomain;
        extra.margin.r=plan.units.length>1?
          Math.min(165,68+(plan.units.length-2)*45):14;
        extra.meta.axesByUnit=plan.units.slice();
      }
      if(id==="commodity-models"||id==="commodity-shock"){
        extra.xaxis.range=[rendered.shapes[1].x0,rendered.rangeX[1]];
      }
      plotAdditional(id,study.traces,extra);
    }
  }catch(ex){error(ex);}
}


function buildCatalog(snapshot){
  const picker=el("commodity-category");
  const categories=[...new Set(snapshot.commodities.map(categoryOf))]
    .sort((a,b)=>CATEGORIES.indexOf(a)-CATEGORIES.indexOf(b));
  picker.replaceChildren();
  const all=document.createElement("option");all.value="all";
  all.textContent="All categories ("+snapshot.commodities.length+")";picker.append(all);
  for(const category of categories){
    const op=document.createElement("option");
    op.value=category;op.textContent=category+" ("+
      snapshot.commodities.filter(c=>categoryOf(c)===category).length+")";
    picker.append(op);
  }
  picker.value="all";picker.disabled=false;
  el("commodity-search").disabled=false;
  buildCommodityPicker();
  const gaps=snapshot.unavailable||[];
  el("catalog-gaps").hidden=gaps.length===0;
  el("gap-count").textContent=gaps.length?"("+gaps.length+")":"";
  const list=el("catalog-gap-list");list.replaceChildren();
  for(const item of gaps){
    const li=document.createElement("li");
    li.textContent=item.name+": "+item.reason;
    list.append(li);
  }
}
async function init(){
  try{
    if(!window.Plotly||!M||!C||!window.ChartCanvas)
      throw Error("Commodity charts or selector unavailable.");
    state.canvas=ChartCanvas.create({
      ids:OPTIONS,defaults:DEFAULT,onChange:()=>{
        state.plotHeight=null;schedule();
      }
    });
    state.canvas.setAvailable([]); // No chart before a verified multi-source snapshot loads.
    el("commodity-category").addEventListener("change",()=>renderChoices());
    el("commodity-search").addEventListener("input",()=>renderChoices());
    el("chart-stage").addEventListener("click",event=>{
      const button=event.target.closest(".chart-scale-toggle button[data-mode]");
      if(!button)return;
      const group=button.closest(".chart-scale-toggle");
      if(!group)return;
      state.modes[group.dataset.chartMode]=button.dataset.mode;
      if(group.dataset.chartMode==="commodity-chart"){
        state.context=null;state.range=null;state.axisValues=null;
      }
      syncModes();schedule();
    });
    for(const id of ["model","horizon","half-life","vol","history"])
      el(id).addEventListener("change",schedule);
    el("shock").addEventListener("input",schedule);
    el("shock").addEventListener("change",schedule);
    el("reset").addEventListener("click",reset);
    el("fit-projection").addEventListener("click",()=>{
      if(!state.values)return;
      if(el("fit-projection").textContent==="Restore scale")state.range=null;
      else if(modeFor("commodity-chart")==="nominal"&&
        (state.selectedIds.length>1||needsUnifiedSingle())&&state.axisValues){
        // Each original unit has its own axis and explicit fit envelope.
        state.range=structuredClone(state.axisValues);
      }else{
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
    if(!response.ok)throw Error("Verified commodity catalog is unavailable.");
    const data=await response.json();
    if(data.status==="pending"){
      el("source-period").textContent="Refresh pending";
      el("data-refresh").textContent="Awaiting verified multi-source series";
      el("commodity-empty").hidden=false;
      return;
    }
    M.verify(data);state.snapshot=data;
    el("commodity-empty").hidden=true;
    buildCatalog(data);
    const requested=new URLSearchParams(location.search).get("asset");
    const first=data.commodities.find(c=>c.id===requested)||
      data.commodities.find(c=>c.id==="wti")||data.commodities[0];
    state.selectedIds=[first.id];state.commodity=first;
    renderChoices();syncModes();draw();
  }catch(ex){
    el("source-period").textContent="Unavailable";
    el("commodity-empty").hidden=false;error(ex);
  }
}
init();
})();
