import {useEffect,useState} from 'react';
let installPrompt=null;
if(typeof window!=='undefined'){
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;window.dispatchEvent(new Event('mapping-install-ready'));});
 window.addEventListener('appinstalled',()=>{installPrompt=null;window.dispatchEvent(new Event('mapping-install-ready'));});
}
export default function PwaInstall(){
 const [available,setAvailable]=useState(!!installPrompt),[installed,setInstalled]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{const update=()=>{setAvailable(!!installPrompt);setInstalled(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true);};update();window.addEventListener('mapping-install-ready',update);return()=>window.removeEventListener('mapping-install-ready',update);},[]);
 return <section className="pwa-install"><h3>{installed?'MapIntel app installed':'Install MapIntel for field use'}</h3>{!installed&&<><p>Android: use your browser’s Install app / Add to Home screen option. iPhone or iPad: open in Safari, tap Share, then Add to Home Screen.</p>{available&&<button className="button primary" onClick={async()=>{const prompt=installPrompt;if(!prompt)return;await prompt.prompt();const result=await prompt.userChoice;installPrompt=null;setAvailable(false);setMessage(result.outcome==='accepted'?'Installation requested. Open MapIntel from your home screen.':'You can install later from your browser menu.');}}>Install MapIntel</button>}</>}
 <ol><li>Open the installed app online and sign in.</li><li>Select your estate and download its offline map package below.</li><li>Reopen the saved map, then tap GPS → Locate me and allow location access.</li></ol><p>Download inside the installed app: its storage may be separate from your browser. Saved maps and GPS guidance work without mobile data on a GPS-capable phone. Keep the app open while navigating; background GPS is not guaranteed.</p>{message&&<p role="status">{message}</p>}</section>;
}
