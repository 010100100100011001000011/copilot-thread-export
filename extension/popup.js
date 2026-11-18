(() => {
  'use strict';
  const button = document.getElementById('export');
  const status = document.getElementById('status');
  const allowed = /^https:\/\/(?:copilot\.microsoft\.com|(?:www\.)?copilot\.com)(?::443)?(?:\/|$)/i;
  function render(job){
    if(!job){status.textContent='Ready. Open a Copilot conversation.';return;}
    const summary = job.state === 'complete'
      ? `Export finished. ${job.captured_positions ?? '?'} of ${job.expected_positions ?? '?'} indexed messages saved. ${job.missing_positions ?? '?'} missing. Beginning verified: ${job.start_verified?'yes':'NO'}.`
      : job.state === 'running' ? 'Exporting. Keep the Copilot conversation tab open until the downloads finish.'
      : job.state === 'failed' ? 'Export failed: '+(job.error||'unknown error')
      : (job.state||'Ready');
    status.textContent = summary + (job.state === 'complete' && (job.missing_positions || !job.start_verified || job.budget_exceeded) ? '\nWARNING: Partial export; keep the original conversation.' : '');
    button.disabled = job.state === 'running';
  }
  chrome.storage.local.get('archiveJobV020').then(x => render(x.archiveJobV020));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.archiveJobV020) render(changes.archiveJobV020.newValue);
  });
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = 'Starting export...';
    try{
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      if(!tab?.id || !allowed.test(tab.url||''))throw new Error('Open the conversation at copilot.com or copilot.microsoft.com first.');
      const result = await chrome.runtime.sendMessage({type:'COPILOT_ARCHIVE_V020_START',tabId:tab.id});
      if(!result?.ok) throw new Error(result?.error || 'Export not started');
      status.textContent='Export started in this Copilot tab. You may close this popup; keep the conversation tab open.';
    } catch(e){status.textContent='Error: '+e.message;button.disabled=false;}
  });
})();