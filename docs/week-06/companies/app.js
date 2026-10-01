/* SEC-powered, browser-computed annual performance and conditional forecast. */
(() => {
  "use strict";
  const M=window.CompanyForecast;
  const el=id=>document.getElementById(id);
  const colors={revenue:"#0b7f73",operating:"#365977",net:"#aa7840",baseline:"#8c9ba4"};
  const labels={revenue:"Revenue",operating:"Operating income",net:"Net income"};
  const cache=new Map();
  let manifest=null,company=null,sequence=0,scheduled=null;
  const USD=n=>!Number.isFinite(n)?"—":"$"+(Math.abs(n)>=1000?
    (n/1000).toLocaleString("en-US",{maximumFractionDigits:1})+"B":
    n.toLocaleString("en-US",{maximumFractionDigits:0})+"M");
  const signed=n=>(n>0?"+":"")+n+" pp";
  const metricKey=()=>M.METRICS[el("metric").value];
  const settings=()=>({
    method:el("method").value,horizon:Number(el("horizon").value),
    growth:Number(el("growth").value),margin:Number(el("margin").value)
  });
  const fullChartHeight=id=>el(id).clientHeight||340;

  async function plot(id,traces,layout){
    // plotly.react is called sequentially per chart, one update per animation
    // frame. Browser session computes all forecasts; no prediction API call.
    await window.Plotly.react(id,traces,layout,{
      responsive:true,displayModeBar:false,displaylogo:false,scrollZoom:false
    });
  }
  function financialCharts(history,result){
    const key=metricKey(),metric=el("metric").value;
    const color=colors[metric],unit="USD billions";
    const actual=history.map(r=>r[key]/1000);
    const projected=result.projected.map(r=>r[key]/1000);
    const baseline=result.baseline.map(r=>r[key]/1000);
    const all=actual.concat(projected,baseline);
    const min=Math.min(...all),max=Math.max(...all);
    const padding=Math.max((max-min)*.14,Math.abs(max)*.035,0.5);
    const yRange=[min-padding,max+padding];
    const xs=history.map(r=>r.fiscal_end);
    const xf=result.projected.map(r=>r.fiscal_end);
    const common={
      autosize:true,paper_bgcolor:"#fff",plot_bgcolor:"#fff",
      font:{family:"Inter,system-ui,sans-serif",size:11,color:"#465865"},
      margin:{l:66,r:14,t:33,b:44},
      hovermode:"closest",
      xaxis:{type:"date",tickformat:"%Y",dtick:"M12",showgrid:false,
        linecolor:"#dfe3e6",automargin:true,range:[xs[0],xs.at(-1)]},
      yaxis:{title:{text:unit,font:{size:11}},tickprefix:"$",ticksuffix:"B",
        tickfont:{size:10},gridcolor:"#edf1f2",range:yRange,zeroline:true,
        automargin:true},
      showlegend:false
    };
    const actualTrace={
      x:xs,y:actual,type:"scatter",mode:"lines+markers",
      name:labels[metric]+" as reported",line:{color,width:2.6},marker:{size:5,color},
      hovertemplate:"FY ending %{x|%b %Y}<br>$%{y:,.2f}B<extra>SEC reported</extra>"
    };
    const scenario={
      x:xf,y:projected,type:"scatter",mode:"lines+markers",
      name:labels[metric]+" adjusted",line:{color,width:2.7},marker:{size:6,color},
      hovertemplate:"FY ending %{x|%b %Y}<br>$%{y:,.2f}B<extra>Conditional model</extra>"
    };
    const baselineTrace={
      x:xf,y:baseline,type:"scatter",mode:"lines",name:"Unadjusted baseline",
      line:{color:colors.baseline,width:1.7,dash:"dot"},
      hovertemplate:"FY ending %{x|%b %Y}<br>$%{y:,.2f}B<extra>Unadjusted baseline</extra>"
    };
    const showBaseline=settings().growth!==0||settings().margin!==0;
    // Match the layout's relative widths to actual elapsed annual
    // intervals, instead of giving three years the same width as eight.
    const pastIntervals=Math.max(1,history.length-1);
    el("company-charts").style.gridTemplateColumns=
      "minmax(0,"+pastIntervals+"fr) minmax(0,"+result.horizon+"fr)";
    const projectionLayout={
      ...common,
      height:fullChartHeight("projection-chart"),
      margin:{l:9,r:22,t:33,b:44},
      xaxis:{...common.xaxis,range:[xf[0],xf.at(-1)]},
      yaxis:{...common.yaxis,title:undefined,showticklabels:false},
      legend:{orientation:"h",x:1,xanchor:"right",y:1.17,font:{size:10}},
      showlegend:showBaseline,
      shapes:[{type:"rect",xref:"paper",yref:"paper",x0:0,x1:1,y0:0,y1:1,
        line:{width:0},fillcolor:"rgba(11,127,115,.035)",layer:"below"}],
      annotations:[{xref:"paper",yref:"paper",x:.01,y:1.12,showarrow:false,
        text:showBaseline?"<b>Adjusted vs baseline</b>":"<b>Model baseline</b>",
        xanchor:"left",font:{size:10,color:"#0b7f73"}}]
    };
    const historicLayout={...common,height:fullChartHeight("history-chart")};
    el("chart-footnote").textContent=labels[metric]+" · "+unit+
      " · Linked y-axis • Annual SEC observations on left; "+result.horizon+
      "-year model projection on right. Same fiscal-year units.";
    return Promise.all([
      plot("history-chart",[actualTrace],historicLayout),
      plot("projection-chart",showBaseline?[baselineTrace,scenario]:[scenario],projectionLayout)
    ]);
  }
  function render(){
    if(!company)return;
    try{
      const assumptions=settings();
      const result=M.forecast(company,assumptions);
      const history=M.history(company,el("history").value);
      const last=company.annual.at(-1);
      const finish=result.projected.at(-1);
      el("growth-value").textContent=signed(assumptions.growth);
      el("margin-value").textContent=signed(assumptions.margin);
      el("kpi-revenue").textContent=USD(last.revenue_musd);
      el("kpi-profit").textContent=USD(last.net_income_musd);
      el("kpi-forecast-revenue").textContent=USD(finish.revenue_musd);
      el("kpi-forecast-profit").textContent=USD(finish.net_income_musd);
      el("preview-revenue").textContent=USD(finish.revenue_musd);
      el("preview-profit").textContent=USD(finish.net_income_musd);
      el("model-note").textContent=assumptions.growth===0&&assumptions.margin===0?
        "Historical "+(assumptions.method==="cagr"?"CAGR":"OLS trend")+
        " revenue with recent weighted profit margins.":
        (assumptions.method==="cagr"?"CAGR":"OLS trend")+" · conditional "+(assumptions.growth>=0?"+":"")+assumptions.growth+
        " pp growth and "+(assumptions.margin>=0?"+":"")+assumptions.margin+
        " pp margin versus baseline; assumptions, not probabilities.";
      const back=M.backtestRevenue(company,assumptions.method);
      el("backtest").textContent="Model $"+(back.model_rmse_musd/1000).toFixed(1)+
        "B / no-change $"+(back.naive_rmse_musd/1000).toFixed(1)+
        "B ("+back.n+" historical one-year origins).";
      void financialCharts(history,result).catch(error=>showError(error));
    }catch(error){showError(error);}
  }
  function queueRender(){
    if(scheduled!==null)return;
    scheduled=window.requestAnimationFrame(()=>{
      scheduled=null;
      render();
    });
  }
  function showError(error){
    el("data-error").hidden=false;
    el("data-error").textContent=String(error.message||error);
  }
  async function loadCompany(ticker){
    if(!manifest)return;
    const generation=++sequence;
    el("company-name").textContent="Loading "+ticker+"…";
    el("data-error").hidden=true;
    try{
      let payload=cache.get(ticker);
      if(!payload){
        // Do not construct URLs from untrusted user input. Ticker must be
        // an exact member of our verified published SEC manifest.
        const item=manifest.companies.find(row=>row.ticker===ticker);
        if(!item||!/^data\/[A-Z.]{1,10}\.json$/.test(item.file)){
          throw Error("That ticker is not in the refreshed featured dataset.");
        }
        const response=await fetch("./"+item.file,{cache:"no-cache"});
        if(!response.ok)throw Error("Financial statements unavailable for "+ticker);
        payload=M.verify(await response.json());
        if(payload.ticker!==ticker)throw Error("Ticker does not match SEC snapshot");
        cache.set(ticker,payload);
      }
      if(generation!==sequence)return;
      company=payload;
      el("company-name").textContent=payload.company;
      el("source-period").textContent="FY ending "+payload.annual.at(-1).fiscal_end;
      el("data-refresh").textContent=payload.refresh_mode==="curated"
        ? "Verified annual snapshot · "+payload.retrieved_utc.slice(0,10)
        : "SEC refreshed "+payload.retrieved_utc.slice(0,10);
      // The URL is validated against the SEC API origin before link use.
      const source=payload.data_source;
      if(source&&/^https:\/\/(?:data\.sec\.gov\/api\/xbrl\/companyfacts\/CIK\d{10}\.json|www\.sec\.gov\/Archives\/edgar\/data\/|(?:www\.)?microsoft\.com\/)/.test(source)){
        el("sec-link").href=source;
      }
      render();
    }catch(error){
      if(generation!==sequence)return;
      company=null;
      el("company-name").textContent="Financial data unavailable";
      showError(error);
    }
  }
  async function initialize(){
    try{
      if(!window.Plotly||!M)throw Error("Browser forecasting engine unavailable.");
      for(const id of ["method","horizon","metric","history"]){
        el(id).addEventListener("change",queueRender);
      }
      for(const id of ["growth","margin"]){
        el(id).addEventListener("input",queueRender);
        el(id).addEventListener("change",queueRender);
      }
      el("ticker").addEventListener("change",()=>void loadCompany(el("ticker").value));
      el("reset").addEventListener("click",()=>{
        el("method").value="cagr";el("horizon").value="3";
        el("growth").value="0";el("margin").value="0";
        el("metric").value="revenue";el("history").value="5";
        queueRender();
      });
      let timer;
      window.addEventListener("resize",()=>{
        clearTimeout(timer);timer=setTimeout(render,130);
      });
      const res=await fetch("./data/manifest.json",{cache:"no-cache"});
      if(!res.ok)throw Error("Featured SEC financial snapshots are not published yet.");
      const m=await res.json();
      if(m.status!=="ready"||!Array.isArray(m.companies)||m.companies.length<2){
        throw Error("Verified featured SEC data is not available yet.");
      }
      manifest=m;
      el("ticker").replaceChildren();
      for(const row of m.companies){
        const option=document.createElement("option");
        option.value=row.ticker;
        option.textContent=row.ticker;
        el("ticker").append(option);
      }
      el("ticker").disabled=false;
      await loadCompany(m.companies[0].ticker);
    }catch(error){
      el("source-period").textContent="Unavailable";
      showError(error);
    }
  }
  initialize();
})();
