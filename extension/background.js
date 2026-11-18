/* Run the exporter in the isolated extension world. No server calls or tokens. */
(() => {
  'use strict';
  const accepted = /^https:\/\/(?:copilot\.microsoft\.com|(?:www\.)?copilot\.com)(?::443)?(?:\/|$)/i;
  chrome.runtime.onInstalled.addListener(() => chrome.storage.local.set({captureEnabled:false}));
  chrome.runtime.onStartup.addListener(() => chrome.storage.local.set({captureEnabled:false}));
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if(msg?.type === 'COPILOT_ARCHIVE_V020_START'){
      (async () => {
        const id = msg.tabId;
        const tab = Number.isInteger(id) ? await chrome.tabs.get(id) : null;
        if(!tab || !accepted.test(tab.url||''))throw new Error('Active tab is not a supported Copilot conversation.');
        const state = (await chrome.storage.local.get('archiveJobV020')).archiveJobV020;
        if(state?.state === 'running')throw new Error('An archive export is already running.');
        await chrome.storage.local.set({captureEnabled:true,
          archiveJobV020:{state:'running',tabId:id,startedAt:new Date().toISOString()}});
        // Injection starts immediately; the async export continues in the tab
        // even after the popup closes. The tab must remain open.
        chrome.scripting.executeScript({target:{tabId:id},files:['copilot-exporter-extension.v0.2.js'],world:'ISOLATED'})
          .then(async () => {
            const job=(await chrome.storage.local.get('archiveJobV020')).archiveJobV020;
            if(job?.state === 'running')await chrome.storage.local.set({archiveJobV020:{...job,state:'failed',error:'Exporter returned without a completion signal.'},captureEnabled:false});
          }).catch(async error=>{
            const job=(await chrome.storage.local.get('archiveJobV020')).archiveJobV020;
            await chrome.storage.local.set({archiveJobV020:{...job,state:'failed',error:String(error.message||error).slice(0,240)},captureEnabled:false});
          });
        respond({ok:true});
      })().catch(error=>respond({ok:false,error:String(error.message||error)}));
      return true;
    }
    if(msg?.type==='COPILOT_ARCHIVE_V020_STATUS'){
      (async()=>{
        const job=(await chrome.storage.local.get('archiveJobV020')).archiveJobV020;
        if(!sender.tab?.id || sender.tab.id!==job?.tabId || job.state!=='running')return;
        const state=msg.phase==='completed'?'complete':'failed';
        const {message_count,expected_positions,captured_positions,missing_positions,start_verified,
          budget_exceeded,source_references,error} = msg;
        await chrome.storage.local.set({archiveJobV020:{...job,state,finishedAt:new Date().toISOString(),
          message_count,expected_positions,captured_positions,missing_positions,
          start_verified,budget_exceeded,source_references,error},captureEnabled:false});
      })().catch(()=>{});
    }
    return false;
  });
})();