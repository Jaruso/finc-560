/* Shared, accessible 1–4 chart canvas for the Equities and Commodities workspaces.
   Bonds retains its already-tested native implementation of this same layout. */
(function(root){
  "use strict";
  function create({pickerId="chart-picker",stageId="chart-stage",defaults,ids,onChange}){
    const picker=document.getElementById(pickerId);
    const stage=document.getElementById(stageId);
    if(!picker||!stage||!Array.isArray(ids)||!Array.isArray(defaults))
      throw Error("Invalid chart canvas");
    const controls=[...picker.querySelectorAll('input[type="checkbox"]')];
    const allowed=new Set(ids);
    if(ids.length!==controls.length||
      controls.some(input=>!allowed.has(input.value))||
      ids.length<4||new Set(ids).size!==ids.length)
      throw Error("Chart picker options do not match rendered chart cards");
    let available=new Set(ids);
    let selected=defaults.slice(0,4);
    function visible(id){return selected.includes(id);}
    function redraw(){
      const chosen=new Set(selected);
      // DOM order determines which chart is featured in three-chart layout.
      for(const id of [...selected,...ids.filter(id=>!chosen.has(id))]){
        const card=stage.querySelector('[data-chart="'+id+'"]');
        if(!card)throw Error("Missing chart card "+id);
        const active=chosen.has(id);
        card.classList.toggle("is-view-hidden",!active);
        card.classList.toggle("is-featured",id===selected[0]);
        card.setAttribute("aria-hidden",String(!active));
        stage.append(card);
      }
      stage.hidden=selected.length===0;
      stage.dataset.count=String(selected.length);
      const count=picker.querySelector("#chart-count");
      if(count)count.textContent=selected.length+" of 4";
      for(const input of controls){
        input.checked=chosen.has(input.value);
        input.disabled=!available.has(input.value);
      }
      // Plotly reacts to window resize but not to CSS grid slot changes.
      requestAnimationFrame(()=>{
        for(const id of selected){
          const chart=document.getElementById(id);
          if(chart?.data&&root.Plotly?.Plots?.resize){
            Promise.resolve(root.Plotly.Plots.resize(chart)).catch(()=>{});
          }
        }
        if(typeof onChange==="function")onChange(selected.slice());
      });
    }
    picker.addEventListener("change",event=>{
      const input=event.target;
      if(!controls.includes(input))return;
      const id=input.value;
      const status=picker.querySelector("#chart-selection-status");
      if(!available.has(id)){
        input.checked=false;return;
      }
      if(input.checked){
        if(selected.length>=4){
          input.checked=false;
          if(status)status.textContent="Four charts maximum. Deselect a chart to add another.";
          return;
        }
        if(!selected.includes(id))selected.push(id);
      }else{
        if(selected.length<=1){
          input.checked=true;
          if(status)status.textContent="Keep at least one chart on the canvas.";
          return;
        }
        selected=selected.filter(value=>value!==id);
      }
      if(status)status.textContent=selected.length+
        (selected.length===1?" chart":" charts")+" selected.";
      redraw();
    });
    function setAvailable(next){
      available=new Set(next.filter(id=>allowed.has(id)));
      const previous=selected.slice();
      selected=selected.filter(id=>available.has(id));
      // Always show the user's existing choices first; fill with accessible
      // default charts if a new asset/ticker lacks an optional financial series.
      for(const id of defaults){
        if(selected.length>=Math.min(4,available.size))break;
        if(available.has(id)&&!selected.includes(id))selected.push(id);
      }
      if(!selected.length&&available.size)selected=[...available][0]?[...available].slice(0,1):[];
      const status=picker.querySelector("#chart-selection-status");
      if(status)status.textContent=available.size
        ?selected.length+" of 4 selected · "+
          (available.size===ids.length?"All chart types available.":
            "Other charts require additional reported data.")
        :"Awaiting verified source data.";
      // Do not trigger an infinite render loop when availability is checked
      // again during a routine scenario-slider update.
      const changed=JSON.stringify(previous)!==JSON.stringify(selected);
      if(changed)redraw();
      else{
        for(const input of controls){
          input.disabled=!available.has(input.value);
          input.checked=selected.includes(input.value);
        }
        stage.hidden=selected.length===0;
      }
    }
    function reset(){
      selected=defaults.filter(id=>available.has(id)).slice(0,4);
      if(!selected.length&&available.size)selected=[...available].slice(0,1);
      const status=picker.querySelector("#chart-selection-status");
      if(status)status.textContent=selected.length+" related views selected.";
      redraw();
    }
    // Initial layout is static and synchronous; first render is owned by app.
    redraw();
    return {selected:()=>selected.slice(),visible,setAvailable,reset,redraw};
  }
  root.ChartCanvas={create};
})(typeof window!=="undefined"?window:null);
