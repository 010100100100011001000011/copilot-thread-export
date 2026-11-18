/* MAIN-world Word Online ODT capture, restricted to native request.odt response.
   No URLs/tokens/cookies retained. Not unattended Office automation. */
(() => {
  'use strict';
  if(window.__copilotOfficeOdtHookV020) return;
  window.__copilotOfficeOdtHookV020=true;
  let captureEnabled=false;
  window.addEventListener('message', ev => {
    if(ev.source!==window || ev.origin!==location.origin)return;
    const m=ev.data;
    if(m?.channel==='copilot-office-archive-v020' && m.type==='CAPTURE_STATUS'
       && typeof m.enabled==='boolean') captureEnabled=m.enabled;
  });
  const realOpen=XMLHttpRequest.prototype.open;
  const inFlight=new Set(), LIMIT=6*1024*1024;
  const cleanName=value=>String(value||'Word_Online_Export.odt')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,150);
  const fileName=response=>{
    const d=response.headers.get('content-disposition')||'';
    const star=d.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    if(star)try{return cleanName(decodeURIComponent(star[1].replace(/^"|"$/g,'')));}catch{}
    const name=d.match(/filename\s*=\s*"?([^";]+)"?/i);
    return cleanName(name?.[1]||'Word_Online_Export.odt');
  };
  const base64=bytes=>{
    const fragments=[];
    for(let i=0;i<bytes.length;i+=0x8000)
      fragments.push(String.fromCharCode(...bytes.subarray(i,i+0x8000)));
    return btoa(fragments.join(''));
  };
  XMLHttpRequest.prototype.open=function(method,url,...args){
    try{
      const target=new URL(url,location.href);
      if(String(method).toUpperCase()==='GET' && target.origin===location.origin
        && /\/request\.odt$/i.test(target.pathname)){
        this.addEventListener('load',async()=>{
          if(!captureEnabled || this.status!==200 || inFlight.has(target.href))return;
          inFlight.add(target.href);
          try{
            const response=await fetch(target.href,{credentials:'include',redirect:'follow'});
            if(!response.ok || Number(response.headers.get('content-length')||0)>LIMIT)return;
            if(!String(response.headers.get('content-type')||'').toLowerCase().includes('opendocument.text'))return;
            const bytes=new Uint8Array(await response.arrayBuffer());
            if(bytes.length<80 || bytes.length>LIMIT || bytes[0]!==80 || bytes[1]!==75
              || bytes[2]!==3 || bytes[3]!==4)return;
            const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
            const sha256=[...digest].map(x=>x.toString(16).padStart(2,'0')).join('');
            window.postMessage({channel:'copilot-office-archive-v020',type:'ODT_CAPTURED',
              name:fileName(response),sha256,size:bytes.length,base64:base64(bytes)},location.origin);
          }catch{}finally{inFlight.delete(target.href);}
        },{once:true});
      }
    }catch{}
    return realOpen.call(this,method,url,...args);
  };
})();