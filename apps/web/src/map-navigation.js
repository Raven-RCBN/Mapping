// Explicit map focus also refits an already-selected analysis after a user pans.
export function focusEstateMap({analysis=false}={}){
 const host=document.getElementById('estateMap');if(!host)return false;
 const target=host.closest('.map-stage')||host;
 target.scrollIntoView({behavior:'smooth',block:'start'});
 // Let block-selection state commit before the map chooses its fit extent.
 requestAnimationFrame(()=>requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('mapping-focus-map',{detail:{analysis}}))));
 return true;
}
