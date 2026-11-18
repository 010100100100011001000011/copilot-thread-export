/* Isolated-world, local-only storage for an authenticated Word Online ODT.
   File bytes are verified again before ZIP inclusion by the exporter. */
(() => {
  'use strict';
  let queue=Promise.resolve();
  const notify=enabled=>window.postMessage({
    channel:'copilot-office-archive-v020',type:'CAPTURE_STATUS',enabled:enabled===true
  },location.origin);
  chrome.storage.local.get('captureEnabled').then(x=>notify(x.captureEnabled));
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&changes.captureEnabled)notify(changes.captureEnabled.newValue);
  });
  window.addEventListener('message',event=>{
    const m=event.data;
    if(event.source!==window || event.origin!==location.origin ||
      m?.channel!=='copilot-office-archive-v020'||m.type!=='ODT_CAPTURED')return;
    if(typeof m.name!=='string'|| !/\.odt$/i.test(m.name)
       || typeof m.base64!=='string'|| typeof m.sha256!=='string'
       || !/^[a-f0-9]{64}$/.test(m.sha256)
       || !Number.isInteger(m.size)||m.size<80||m.size>6*1024*1024
       || m.base64.length>9*1024*1024)return;
    queue=queue.then(async()=>{
      const {captureEnabled=false,capturedIndex=[]}=
        await chrome.storage.local.get(['captureEnabled','capturedIndex']);
      if(!captureEnabled||capturedIndex.length>=100||
         capturedIndex.some(x=>x.sha256===m.sha256))return;
      const id='odt_'+m.sha256;
      const entry={id,name:m.name,size:m.size,sha256:m.sha256,format:'odt',
        source:'word_online_native_download',capturedAt:new Date().toISOString()};
      await chrome.storage.local.set({[id]:m.base64});
      await chrome.storage.local.set({capturedIndex:[...capturedIndex,entry]});
    }).catch(()=>{});
  });
})();