const radians=n=>n*Math.PI/180;
export function validCoordinate(lat,lon){return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;}
export function gpsFix(position){
 const c=position?.coords;
 if(!c||!validCoordinate(c.latitude,c.longitude)||!Number.isFinite(c.accuracy)||c.accuracy<0||!Number.isFinite(position.timestamp))throw Error('The device returned an invalid GPS fix.');
 return {latitude:c.latitude,longitude:c.longitude,accuracy:c.accuracy,timestamp:position.timestamp,altitude:Number.isFinite(c.altitude)?c.altitude:null,speed:Number.isFinite(c.speed)&&c.speed>=0?c.speed:null,heading:Number.isFinite(c.heading)&&c.heading>=0&&c.heading<360?c.heading:null};
}
export function navigationTo(from,to){
 if(!validCoordinate(from.latitude,from.longitude)||!validCoordinate(to.latitude,to.longitude))throw Error('Invalid destination coordinates.');
 const lat1=radians(from.latitude),lat2=radians(to.latitude),delta=radians(to.longitude-from.longitude),dlat=lat2-lat1;
 const a=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(delta/2)**2;
 const distance=6371008.8*2*Math.atan2(Math.sqrt(Math.min(1,a)),Math.sqrt(Math.max(0,1-a)));
 const bearing=(Math.atan2(Math.sin(delta)*Math.cos(lat2),Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(delta))*180/Math.PI+360)%360;
 return {distance,bearing:distance<0.01?null:bearing};
}
export function startGps(geolocation,onFix,onError){
 if(!geolocation)throw Error('GPS is unavailable. Open MapIntel over HTTPS on a phone with location services enabled.');
 let stopped=false;
 const id=geolocation.watchPosition(position=>{if(stopped)return;try{onFix(gpsFix(position));}catch(e){onError(e.message);}},error=>{if(stopped)return;onError(error.code===1?'Location permission is blocked. Enable it in this site’s browser settings.':error.code===2?'GPS position is unavailable. Move to an open area and check location services.':'Waiting for a GPS fix. Keep the app open.');},{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
 return ()=>{stopped=true;geolocation.clearWatch(id);};
}
