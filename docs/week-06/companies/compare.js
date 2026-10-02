/* Comparative equity charts. Each ticker retains its verified annual source, own
   fiscal calendar and independently calculated forecast. No missing facts inferred. */
(function(root,factory){
  "use strict";
  const api=factory(root?.CompanyForecast||
    (typeof module!=="undefined"?require("./model.js"):null));
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.EquityComparison=api;
})(typeof window!=="undefined"?window:null,function(M){
  "use strict";
  const COLORS=["#087d76","#38577d","#b27029","#89579b"];
  const ABSOLUTE=["company-chart","equity-cashflows","equity-fcf","equity-balance"];
  const FINANCIAL=[["revenue_musd","Revenue","#0b7f73"],
    ["operating_income_musd","Operating income","#365977"],
    ["net_income_musd","Net income","#aa7840"]];
  const TICKER_SYMBOLS=["circle","square","diamond","cross"];
  const metricKeys={revenue:"revenue_musd",operating:"operating_income_musd",
    net:"net_income_musd"};
  const coverage={
    "equity-cashflows":r=>Number.isFinite(r.cfo_musd)&&Number.isFinite(r.capex_musd),
    "equity-fcf":r=>Number.isFinite(r.cfo_musd)&&Number.isFinite(r.capex_musd),
    "equity-coverage":r=>Number.isFinite(r.interest_musd)&&r.interest_musd>0&&
      Number.isFinite(r.operating_income_musd),
    "equity-balance":r=>Number.isFinite(r.cash_musd)&&Number.isFinite(r.total_debt_musd)
  };
  function prepare(companies,settings,windowSize){
    if(!Array.isArray(companies)||companies.length<2||companies.length>4||
      new Set(companies.map(c=>c.ticker)).size!==companies.length)
      throw Error("Choose two to four different companies to compare.");
    return companies.map((item,index)=>{
      const company=M.verify(item);
      return {company,ticker:company.ticker,
        name:company.company||company.ticker,color:COLORS[index],
        history:M.history(company,windowSize),forecast:M.forecast(company,settings)};
    });
  }
  function available(frames){
    return ["company-chart","equity-margins",
      ...Object.keys(coverage).filter(id=>
        frames.every(f=>f.history.filter(coverage[id]).length>=2))];
  }
  function line(frame,name,records,value,{dash="solid",width=2.25,unit="usd",
    mode="nominal",anchor=null,rank=10,color=frame.color,
    showlegend=true,legendgroup=null,symbol="circle"}={}){
    const raw=records.map(value);
    if(mode==="indexed"&&(!Number.isFinite(anchor)||anchor<=0))
      throw Error("Indexed view requires positive starting values; choose Nominal.");
    const y=raw.map(v=>Number.isFinite(v)?
      mode==="indexed"?100*v/anchor:unit==="usd"?v/1000:v:null);
    const suffix=mode==="indexed"?" index":unit==="usd"?"B":
      unit==="percent"?"%":"×";
    const prefix=mode==="nominal"&&unit==="usd"?"$":"";
    return {type:"scatter",mode:"lines+markers",name,legendrank:rank,
      showlegend,legendgroup,
      x:records.map(r=>r.fiscal_end),y,
      line:{color,width,dash},marker:{color,size:4,symbol},
      customdata:raw,
      hovertemplate:"FY ending %{x|%b %Y}<br>"+
        (mode==="indexed"?"Index %{y:,.2f} · underlying $%{customdata:,.0f}M":
          prefix+"%{y:,.2f}"+suffix)+"<extra>"+name+"</extra>"};
  }
  function study(frames,id,metric="net",mode="indexed",settings={}){
    if(!frames?.length||frames.length>4)throw Error("Missing comparison data");
    if(!["nominal","indexed"].includes(mode))throw Error("Unknown scale");
    if(!metricKeys[metric])throw Error("Unknown metric");
    if(!available(frames).includes(id))
      throw Error("Not all companies disclose sufficient data for this chart.");
    const numeric=ABSOLUTE.includes(id),index=numeric&&mode==="indexed";
    const projectionsEnabled=settings.projectionsEnabled!==false;
    const required=id==="equity-cashflows"?coverage["equity-cashflows"]:
      id==="equity-fcf"?coverage["equity-fcf"]:
      id==="equity-balance"?coverage["equity-balance"]:
      id==="company-chart"?
        r=>FINANCIAL.every(([key])=>Number.isFinite(r[key])&&
          (!index||r[key]>0)):
        r=>Number.isFinite(r.revenue_musd);
    // Index everyone at the same fiscal-ending YEAR, not at unrelated
    // companies' first reported dates. Exact fiscal ends remain on X.
    const years=frames.map(f=>new Set(f.history.filter(required)
      .map(r=>r.fiscal_end.slice(0,4))));
    const anchorYear=index?[...years[0]].sort().find(y=>
      years.slice(1).every(other=>other.has(y))):null;
    if(index&&!anchorYear)
      throw Error("Indexed view requires a shared reported fiscal year; choose Nominal.");
    const nativeUnit=id==="equity-margins"?"percent":
      id==="equity-coverage"?"ratio":"usd";
    const traces=[];
    for(const [frameIndex,f] of frames.entries()){
      if(id==="company-chart"){
        for(const [measureIndex,[key,label,color]] of FINANCIAL.entries()){
          // Each measure has its own shared-FY index anchor. The three metric
          // colors remain constant across equities; ticker markers distinguish
          // companies without multiplying the legend by each scenario line.
          const first=index?f.history.find(r=>
            r.fiscal_end.slice(0,4)===anchorYear):null;
          const anchor=index?first?.[key]:null;
          const args={mode:index?"indexed":"nominal",anchor,
            color,symbol:TICKER_SYMBOLS[frameIndex],legendgroup:label};
          traces.push(line(f,f.ticker+" · "+label,f.history,r=>r[key],
            {...args,rank:measureIndex+1,showlegend:frameIndex===0}));
          if(!projectionsEnabled)continue;
          const adjusted=key==="revenue_musd"?settings.growth:
            settings.growth||settings.margin;
          if(adjusted)traces.push(line(f,f.ticker+" · "+label+" · unadjusted",
            f.forecast.baseline,r=>r[key],{...args,dash:"dot",
              width:1.3,rank:30,showlegend:false}));
          traces.push(line(f,f.ticker+" · "+label+" · modeled",
            f.forecast.projected,r=>r[key],{...args,dash:"dash",
              rank:20,showlegend:false}));
        }
      }else if(id==="equity-margins"){
        const pct=(r,key)=>r.revenue_musd>0?100*r[key]/r.revenue_musd:null;
        for(const [key,label,dash] of [["operating_income_musd","operating","solid"],
          ["net_income_musd","net","dot"]]){
          const obs=f.history.map(r=>({fiscal_end:r.fiscal_end,value:pct(r,key)}));
          const fut=f.forecast.projected.map(r=>({
            fiscal_end:r.fiscal_end,value:pct(r,key)
          }));
          traces.push(line(f,f.ticker+" · "+label+" margin",obs,r=>r.value,
            {unit:"percent",dash,rank:10}));
          if(projectionsEnabled)traces.push(line(f,f.ticker+" · projected "+label+" margin",fut,r=>r.value,
            {unit:"percent",dash:label==="operating"?"dash":"dashdot",rank:20}));
        }
      }else if(id==="equity-cashflows"||id==="equity-balance"){
        const entries=id==="equity-cashflows"
          ?[["cfo_musd","operating cash","solid"],["capex_musd","capex","dash"]]
          :[["cash_musd","cash","solid"],["total_debt_musd","total debt","dash"]];
        for(const [key,label,dash] of entries){
          const rows=f.history.filter(r=>Number.isFinite(r[key])).map(r=>({
            fiscal_end:r.fiscal_end,value:key==="capex_musd"?Math.abs(r[key]):r[key]
          }));
          const anchor=index?rows.find(r=>
            r.fiscal_end.slice(0,4)===anchorYear)?.value:null;
          traces.push(line(f,f.ticker+" · "+label,rows,r=>r.value,{
            mode:index?"indexed":"nominal",anchor,dash,rank:10
          }));
        }
      }else if(id==="equity-fcf"){
        const rows=f.history.filter(coverage[id]).map(r=>({
          fiscal_end:r.fiscal_end,value:r.cfo_musd-Math.abs(r.capex_musd)
        }));
        const anchor=index?rows.find(r=>
            r.fiscal_end.slice(0,4)===anchorYear)?.value:null;
        traces.push(line(f,f.ticker+" · free cash flow",rows,r=>r.value,{
          mode:index?"indexed":"nominal",anchor,rank:10
        }));
      }else if(id==="equity-coverage"){
        const rows=f.history.filter(coverage[id]).map(r=>({
          fiscal_end:r.fiscal_end,value:r.operating_income_musd/r.interest_musd
        }));
        traces.push(line(f,f.ticker+" · interest coverage",rows,r=>r.value,{
          unit:"ratio",rank:10
        }));
      }
    }
    const starts=traces.flatMap(t=>t.x).sort();
    const forecasts=["company-chart","equity-margins"].includes(id);
    // Preserve each company's actual fiscal cutoff, just as the commodities
    // comparison preserves each benchmark's last observation. Layer one
    // translucent rectangle per company: early forecast-only territory is
    // light; overlaps become progressively darker. Individual rectangles end
    // at that company's own forecast horizon, never at another firm's date.
    const windows=forecasts&&projectionsEnabled?frames.map(f=>({
      ticker:f.ticker,
      start:f.history.at(-1).fiscal_end,
      end:f.forecast.projected.at(-1).fiscal_end
    })).filter(w=>w.start<w.end):[];
    const cutoffs=[...new Set(windows.map(w=>w.start))].sort();
    const forecastShapes=[
      ...windows.map(w=>({
        type:"rect",xref:"x",yref:"paper",x0:w.start,x1:w.end,y0:0,y1:1,
        fillcolor:"rgba(11,127,115,.045)",line:{width:0},layer:"below"
      })),
      ...cutoffs.map(start=>({
        type:"line",xref:"x",yref:"paper",x0:start,x1:start,y0:0,y1:1,
        line:{color:"#96b0aa",dash:"dash",width:1}
      }))
    ];
    const yLabel=index?"Index (100 = shared FY "+anchorYear+")":
      nativeUnit==="percent"?"Percent (%)":nativeUnit==="ratio"?
        "Interest coverage (×)":"USD billions";
    const context=id==="company-chart"?
      (index?"All three measures indexed to shared FY "+anchorYear:
        "Revenue, operating income & net income in USD billions")+
      " · Color = measure; marker = ticker; hover to identify.":
      index?"Index 100 at shared FY "+anchorYear+" · Hover for reported values.":
      nativeUnit==="usd"?"Nominal reported USD billions · Hover for exact values.":
        nativeUnit==="percent"?(projectionsEnabled?"Reported and modeled margins (%).":"Reported margins only (%)."):
          "Reported operating income / interest expense.";
    return {traces,context,
      layout:{
        autosize:true,
        margin:{l:65,r:14,t:53,b:42,autoexpand:false},
        paper_bgcolor:"#fff",plot_bgcolor:"#fff",
        shapes:forecastShapes,
        font:{family:"Inter,system-ui,sans-serif",size:10,color:"#465865"},
        showlegend:true,hovermode:"closest",
        legend:{orientation:"h",x:.5,xanchor:"center",y:1.16,
          font:{size:9},groupclick:"togglegroup"},
        xaxis:{type:"date",range:[starts[0],starts.at(-1)],
          tickformat:"%Y",dtick:"M12",showgrid:false,
          linecolor:"#dfe3e6",automargin:true},
        yaxis:{title:yLabel,tickprefix:!index&&nativeUnit==="usd"?"$":"",
          ticksuffix:!index&&nativeUnit==="usd"?"B":"",
          gridcolor:"#edf1f2",automargin:true},
        meta:{comparison:true,tickers:frames.map(f=>f.ticker),primary:frames[0].ticker,
          indexed:index,anchorFiscalYear:anchorYear,perCompanyFiscalCalendars:true,
          projectionsEnabled,measures:id==="company-chart"?
            FINANCIAL.map(([,label])=>label):null,
          tickerMarkers:id==="company-chart"?Object.fromEntries(frames.map(
            (frame,i)=>[frame.ticker,TICKER_SYMBOLS[i]])):null,
          sharedProjectionStart:cutoffs.length?cutoffs.at(-1):null,
          projectionWindows:windows}
      }
    };
  }
  return {prepare,available,study,ABSOLUTE,COLORS};
});
