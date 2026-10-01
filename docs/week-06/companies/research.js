/* Finnhub as-reported normalization and transparent, non-predictive research models.
   Amounts are USD millions unless explicitly identified as percentages or USD/share. */
(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.EquityResearch=api;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  const FIELDS=Object.freeze({
    revenue:["RevenueFromContractWithCustomerExcludingAssessedTax","Revenues",
      "SalesRevenueNet","SalesRevenueGoodsNet","RevenueFromContractWithCustomerIncludingAssessedTax"],
    operating:["OperatingIncomeLoss"],
    net:["NetIncomeLoss","ProfitLoss"],
    cfo:["NetCashProvidedByUsedInOperatingActivities","NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
    capex:["PaymentsToAcquirePropertyPlantAndEquipment","PaymentsToAcquireProductiveAssets"],
    da:["DepreciationDepletionAndAmortization","DepreciationDepletionAndAmortizationPropertyPlantAndEquipment",
      "DepreciationAmortizationAndAccretionNet"],
    interest:["InterestExpenseNonOperating","InterestExpense","InterestAndDebtExpense"],
    cash:["CashAndCashEquivalentsAtCarryingValue","CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
    debtTotal:["LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities",
      "LongTermDebtAndFinanceLeaseObligationsIncludingCurrentMaturities"],
    debtLong:["LongTermDebtNoncurrent","LongTermDebt","LongTermDebtAndCapitalLeaseObligations"],
    debtCurrent:["LongTermDebtCurrent","LongTermDebtAndCapitalLeaseObligationsCurrent",
      "CurrentPortionOfLongTermDebt"],
    shortBorrow:["ShortTermBorrowings","ShortTermDebtCurrent"],
    tax:["IncomeTaxExpenseBenefit"]
  });
  function numeric(v){return typeof v==="number"&&Number.isFinite(v)?v:null;}
  function round(v,n=2){return v===null||!Number.isFinite(v)?null:Number(v.toFixed(n));}
  function canonical(raw){return String(raw||"").split(/[:_]/).at(-1).replace(/[^a-z0-9]/gi,"").toLowerCase();}
  function statementEntries(block){
    // The financials-reported API returns arrays of concept/label/unit/value records.
    return Array.isArray(block)?block.filter(x=>x&&typeof x==="object"&&
      (x.unit==="USD"||x.unit==="usd")&&numeric(x.value)!==null):[];
  }
  function findConcept(block,names){
    const entries=statementEntries(block);
    // Exact US-GAAP concepts only; never use broad partial-label heuristics.
    for(const name of names){
      const exact=canonical(name);
      const row=entries.find(x=>canonical(x.concept)===exact);
      if(row)return row.value/1e6;
    }
    return null;
  }
  function sumIfKnown(...amounts){
    if(amounts.some(x=>x===null))return null;
    return amounts.reduce((sum,x)=>sum+x,0);
  }
  // Finnhub uses 'YYYY-MM-DD 00:00:00' on real 10-K records, whereas
  // our curated SEC fixtures use 'YYYY-MM-DD'. Normalize the date portion
  // strictly: never truncate arbitrary strings or permit invalid calendar days.
  function filingDate(value){
    if(typeof value!=="string")return null;
    const matched=/^(\d{4}-\d{2}-\d{2})(?:[ T](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?Z?)?$/.exec(value);
    if(!matched)return null;
    const iso=matched[1],date=new Date(iso+"T00:00:00.000Z");
    return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===iso?iso:null;
  }
  function annualRow(r,cik){
    if(!r||!/^10-K(?:\/A)?$/.test(r.form||"")||
      !filingDate(r.endDate)||
      !/^\d{10}-\d{2}-\d{6}$/.test(r.accessNumber||"")||
      !/^\d{1,10}$/.test(String(cik||"")))return null;
    const ic=r.report?.ic,bs=r.report?.bs,cf=r.report?.cf;
    if(!Array.isArray(ic)||!Array.isArray(bs)||!Array.isArray(cf))return null;
    const revenue=findConcept(ic,FIELDS.revenue);
    const operating=findConcept(ic,FIELDS.operating);
    const net=findConcept(ic,FIELDS.net);
    if(revenue===null||revenue<=0||operating===null||net===null)return null;
    const cfo=findConcept(cf,FIELDS.cfo);
    const rawCapex=findConcept(cf,FIELDS.capex);
    // Payments are reported as positive or negative depending on source: cost is absolute.
    const capex=rawCapex===null?null:Math.abs(rawCapex);
    const rawInterest=findConcept(ic,FIELDS.interest);
    const interest=rawInterest===null?null:Math.abs(rawInterest);
    const cash=findConcept(bs,FIELDS.cash);
    const allDebt=findConcept(bs,FIELDS.debtTotal);
    const longDebt=findConcept(bs,FIELDS.debtLong);
    const currentDebt=findConcept(bs,FIELDS.debtCurrent);
    const shortBorrow=findConcept(bs,FIELDS.shortBorrow);
    // Never silently assume an undisclosed debt component equals zero.
    let totalDebt=null;
    if(allDebt!==null && allDebt>=0){
      totalDebt=allDebt+(shortBorrow===null?0:Math.max(shortBorrow,0));
    }else if(longDebt!==null&&currentDebt!==null){
      totalDebt=longDebt+currentDebt+(shortBorrow===null?0:Math.max(shortBorrow,0));
    }
    const da=findConcept(cf,FIELDS.da);
    const tax=findConcept(ic,FIELDS.tax);
    const url="https://www.sec.gov/Archives/edgar/data/"+
      String(Number(cik))+"/"+r.accessNumber.replace(/-/g,"")+"/";
    return {
      fiscal_end:filingDate(r.endDate),
      revenue_musd:revenue,operating_income_musd:operating,net_income_musd:net,
      cfo_musd:cfo,capex_musd:capex,fcf_musd:sumIfKnown(cfo,capex===null?null:-capex),
      interest_musd:interest, cash_musd:cash,total_debt_musd:totalDebt,
      da_musd:da, tax_musd:tax, filed_date:filingDate(r.filedDate),
      form:r.form,accession:r.accessNumber,source_url:url,
      filings:{revenue:{source_url:url},operating:{source_url:url},net:{source_url:url}}
    };
  }
  function normalize(reported,profile,ticker){
    if(!/^[A-Z][A-Z0-9.^_-]{0,14}$/.test(ticker))throw Error("Invalid ticker");
    if(profile?.currency&&profile.currency!=="USD")
      return {ticker,annual:[],warning:"This prototype requires USD annual reporting; this issuer reports in "+profile.currency+"."};
    if(reported?.symbol && reported.symbol.toUpperCase()!==ticker)
      throw Error("Statement ticker mismatch");
    if(profile?.ticker&&profile.ticker.toUpperCase()!==ticker)
      throw Error("Profile ticker mismatch");
    const cik=String(reported?.cik??"");
    if(!Array.isArray(reported?.data)||!cik.match(/^\d{1,10}$/))
      return {ticker,annual:[],warning:"No verifiable US annual as-reported filings were returned."};
    const dedup=new Map();
    const validation={received:reported.data.length,unsupportedForm:0,invalidMetadata:0,
      incompleteStatements:0,missingCoreConcepts:0,accepted:0};
    for(const filing of reported.data){
      if(!/^10-K(?:\/A)?$/.test(filing?.form||"")){
        validation.unsupportedForm++;continue;
      }
      if(!filingDate(filing?.endDate)||!/^\d{10}-\d{2}-\d{6}$/.test(filing?.accessNumber||"")){
        validation.invalidMetadata++;continue;
      }
      if(!["ic","bs","cf"].every(k=>Array.isArray(filing?.report?.[k]))){
        validation.incompleteStatements++;continue;
      }
      const row=annualRow(filing,cik);
      if(!row){validation.missingCoreConcepts++;continue;}
      validation.accepted++;
      const previous=dedup.get(row.fiscal_end);
      if(!previous||(row.filed_date||"")>(previous.filed_date||"")||
        ((row.filed_date||"")===(previous.filed_date||"")&&row.form==="10-K/A")){
        dedup.set(row.fiscal_end,row);
      }
    }
    const annual=[...dedup.values()].sort((a,b)=>a.fiscal_end.localeCompare(b.fiscal_end));
    const warning=annual.length<5
      ?(reported.data.length?"Received "+validation.received+" filings; "+
        validation.accepted+" passed required annual US-GAAP checks ("+
        validation.unsupportedForm+" non-10-K, "+validation.invalidMetadata+
        " invalid metadata, "+validation.incompleteStatements+
        " missing statement sections, "+validation.missingCoreConcepts+
        " missing revenue/operating/net-income concepts).":
        "No financial filings returned by Finnhub.")+
        " "+annual.length+" distinct usable fiscal years; five required for historical forecasts."
      :null;
    const name=typeof profile?.name==="string"&&profile.name.trim()?profile.name:ticker;
    const shares=numeric(profile?.shareOutstanding);
    const marketCap=numeric(profile?.marketCapitalization);
    return {ticker,cik,company:name,annual,currency:"USD",unit:"USD millions",
      shares_million:shares!==null&&shares>0?shares:null,
      market_cap_musd:marketCap!==null&&marketCap>0?marketCap:null,
      retrieved_utc:new Date().toISOString(),
      data_source:annual.at(-1)?.source_url||null,
      refresh_mode:"finnhub-as-reported",schema_version:1,status:"ready",
      validation,warning};
  }
  function health(annual){
    const rows=annual.map(r=>{
      const d=numeric(r.total_debt_musd),cash=numeric(r.cash_musd);
      const da=numeric(r.da_musd),ebit=numeric(r.operating_income_musd);
      const interest=numeric(r.interest_musd),revenue=numeric(r.revenue_musd);
      const cfo=numeric(r.cfo_musd),capex=numeric(r.capex_musd);
      const fcf=sumIfKnown(cfo,capex===null?null:-Math.abs(capex));
      const ebitda=sumIfKnown(ebit,da);
      return {year:r.fiscal_end,
        revenue,operating:ebit,
        fcf,interest,
        operatingMargin:revenue>0&&ebit!==null?ebit/revenue*100:null,
        coverage:ebit!==null&&interest>0?ebit/interest:null,
        netDebt:sumIfKnown(d,cash===null?null:-cash),
        leverage:ebitda>0&&d!==null&&cash!==null?(d-cash)/ebitda:null,
        ebitda};
    });
    const latest=rows.at(-1)||null;
    const previous=rows.at(-2)||null;
    return {rows,latest,revenueGrowth:latest&&previous&&previous.revenue>0?
      (latest.revenue/previous.revenue-1)*100:null};
  }
  function macroSnapshot(raw){
    if(!raw||raw.status!=="ready"||!Array.isArray(raw.forecast))return null;
    const baseline=raw.forecast.find(p=>p.month===0);
    const ahead=raw.forecast.find(p=>p.month===12);
    if(!baseline||!ahead||numeric(baseline.y10)===null||numeric(ahead.y10)===null)return null;
    return {asOf:baseline.date,source:raw.source,observed10y:baseline.y10,
      projected10y:ahead.y10,forecastDate:ahead.date,retrieved:raw.retrieved_utc};
  }
  function stress(annual,macro,{shockBps=0,spreadBps=200,exposedPercent=40}={}){
    const last=health(annual).latest;
    if(!macro||!last||
      numeric(annual.at(-1)?.total_debt_musd)===null||
      last.operating===null||!(last.interest>0))return null;
    if(!Number.isFinite(shockBps)||Math.abs(shockBps)>300||
      !Number.isFinite(spreadBps)||spreadBps<0||spreadBps>800||
      !Number.isFinite(exposedPercent)||exposedPercent<0||exposedPercent>100)
      throw Error("Invalid rate scenario");
    const debt=annual.at(-1).total_debt_musd;
    // 200 bp spread and 40% rate exposure are explicit user-adjustable assumptions,
    // not extracted from issuer maturity schedules.
    const deltaRatePp=(macro.projected10y-macro.observed10y)+shockBps/100+(spreadBps-200)/100;
    const extraInterest=debt*exposedPercent/100*deltaRatePp/100;
    const stressedInterest=last.interest+extraInterest;
    return {debt,baseInterest:last.interest,extraInterest,stressedInterest,
      rate:macro.projected10y+shockBps/100,baseRate:macro.observed10y,
      coverage:stressedInterest>0?last.operating/stressedInterest:null,
      baseCoverage:last.coverage,exposedDebt:debt*exposedPercent/100};
  }
  function valuation(annual,sharesMillion,{growth=5,discount=10,terminal=2,tax=21}={}){
    if(!Number.isFinite(growth)||growth < -20||growth>25||
      !Number.isFinite(discount)||discount<5||discount>25||
      !Number.isFinite(terminal)||terminal<0||terminal>4||
      !Number.isFinite(tax)||tax<0||tax>45||
      discount<=terminal)throw Error("Invalid valuation assumptions");
    const last=annual.at(-1);
    if(!last)return null;
    const cfo=numeric(last.cfo_musd),capex=numeric(last.capex_musd);
    const interest=numeric(last.interest_musd),debt=numeric(last.total_debt_musd),cash=numeric(last.cash_musd);
    if(cfo===null||capex===null||interest===null||debt===null||cash===null||
      numeric(sharesMillion)===null||sharesMillion<=0)return null;
    // Provisional unlevered FCF proxy: CFO after interest, less capex, plus after-tax interest.
    // Without complete debt schedules or working-capital forecasts this is a sensitivity, not a target.
    const fcf=cfo-Math.abs(capex)+interest*(1-tax/100);
    if(fcf<=0)return null;
    const w=discount/100,g=growth/100,t=terminal/100;
    const flows=[1,2,3,4,5].map(year=>({
      year,fcff:fcf*(1+g)**year,
      pv:fcf*(1+g)**year/(1+w)**year
    }));
    const terminalValue=flows.at(-1).fcff*(1+t)/(w-t);
    const enterpriseValue=flows.reduce((s,p)=>s+p.pv,0)+terminalValue/(1+w)**5;
    const netDebt=debt-cash;
    const equityValue=enterpriseValue-netDebt;
    return {fcff:fcf,enterpriseValue,equityValue,netDebt,
      perShare:equityValue/sharesMillion,flows,terminalShare:
        (terminalValue/(1+w)**5)/enterpriseValue*100};
  }
  function metricsSummary(metrics){
    const m=metrics?.metric||{};
    const asNum=k=>numeric(m[k]);
    return {beta:asNum("beta"),pe:asNum("peBasicExclExtraTTM"),
      currentRatio:asNum("currentRatioAnnual"),
      roe:asNum("roeTTM"),netMargin:asNum("netProfitMarginTTM")};
  }
  return {FIELDS,annualRow,normalize,health,macroSnapshot,stress,valuation,metricsSummary,round};
});
