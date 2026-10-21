import {useEffect} from 'react';
import {transformExtent} from 'ol/proj';
import {mapFocusBounds} from '../../../../packages/shared/map-focus.js';
export default function useMapFocus(mapRef,estates,selected,highlight,selection){
 useEffect(()=>{const focus=e=>{const map=mapRef.current;if(!map)return;const b=mapFocusBounds(estates,selected,{analysis:!!e.detail?.analysis,highlight,selection});if(!b)return;map.updateSize();map.getView().cancelAnimations();map.getView().fit(transformExtent(b,'EPSG:4326','EPSG:3857'),{padding:[50,50,50,50],maxZoom:16,duration:250});map.renderSync();};window.addEventListener('mapping-focus-map',focus);return()=>window.removeEventListener('mapping-focus-map',focus)},[mapRef,estates,selected,highlight,selection]);
}
