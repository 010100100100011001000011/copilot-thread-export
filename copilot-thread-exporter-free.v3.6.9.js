/** 
 * v3.6.9 — FreeCopilot Edition (Tec)
 * FastScan Ordered + Deep Sanitize + HTML + JSONL
 * Patch per Copilot gratuito:
 *  - Assistant: div[data-content="ai-message"]
 *  - User:      div[data-content="user-message"]
 *  - Code blocks: div.rounded-xl > div.horizontal-scrollbar > pre > code
 */

(async function () {
  "use strict";

  // =======================
  // 1) Configuration
  // =======================
  const CFG = {
    STEP_FACTOR: 0.90, OVERLAP_PX: 40, BASE_PAUSE_MS: 220, QUIET_MS: 240, QUIET_TIMEOUT_MS: 4000,
    LAST_MILE_ZONE: 0.15, LAST_MILE_STEP: 140, BOTTOM_SETTLE_ROUNDS: 2, REVERSE_PASS: false,

    MIN_TEXT_LEN: 1,
    TRY_OTHER_SCROLLERS_IF_LOW: true,
    MIN_PROGRESS_FOR_SCROLLER: 8,

    SANITIZE: true, EXPORT_HTML: true, EXPORT_MD: false, EXPORT_JSONL: true,
    AUTO_DELETE_AFTER_EXPORT: false, SHOW_DIAG: true,

    EXCLUDE_PATTERNS: [],
    STOP_AT_TEXT: null,

    SHOW_METADATA: true, INCLUDE_URL_TITLE: true,

    THREAD_DATE_HINT: null,
    THREAD_LAST_MOD_HINT: null,

    PROMPT_STRICT_DATES: true,

    DEBUG: true
  };

  // =======================
  // 2) Utilities
  // =======================
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const nowHHMMSS = () => { try { return new Date().toISOString().split("T")[1].split(".")[0]; } catch { return ""; } };
  const log = (...a) => CFG.DEBUG && console.log(`[${nowHHMMSS()}]`, ...a);

  const waitForIdle = (quietMs = CFG.QUIET_MS, timeoutMs = CFG.QUIET_TIMEOUT_MS) =>
    new Promise(res => {
      const start = performance.now(); let idleSince = performance.now();
      const obs = new MutationObserver(() => { idleSince = performance.now(); });
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      (function tick() {
        const t = performance.now();
        if (t - start > timeoutMs || t - idleSince >= quietMs) { obs.disconnect(); res(); }
        else requestAnimationFrame(tick);
      })();
    });

  const adaptivePause = async (base = CFG.BASE_PAUSE_MS) => {
    try {
      const pres = document.querySelectorAll('pre').length;
      const codes = document.querySelectorAll('code').length;
      const dens = pres + 0.5 * codes;
      const factor = 1 + Math.min(1.2, dens / 18);
      await sleep(Math.round(base * factor));
    } catch { await sleep(base); }
  };

  const UI_NOISE_WORDS = [
    'you said:', 'copilot said:', 'mostra più linee', 'nascondi detalles',
    'hide details', 'show more lines', 'shell', 'nginx config'
  ];
  const UI_NOISE_RX = new RegExp('\\b(' + UI_NOISE_WORDS.map(w=>w.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')).join('|') + ')\\b','gi');

  function normalizeText(s){
    if (!s) return '';
    try { s = s.normalize('NFKC'); } catch {}
    return s.replace(UI_NOISE_RX,' ').replace(/\s+/g,' ').trim().toLowerCase();
  }

  async function sha256Hex(str){
    if (crypto?.subtle){
      const enc=new TextEncoder().encode(str);
      const buf=await crypto.subtle.digest('SHA-256', enc);
      return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
    }
    let h=5381; for (let i=0;i<str.length;i++) h=((h<<5)+h)^str.charCodeAt(i);
    return ('00000000'+(h>>>0).toString(16)).slice(-8);
  }

  function findScrollableCandidates(){
    const set=new Set();
    const push=n=>{
      try{
        const cs=getComputedStyle(n);
        if ((cs.overflowY==='auto'||cs.overflowY==='scroll') && n.scrollHeight>n.clientHeight && n.clientHeight>0) set.add(n);
      }catch{}
    };
    document.querySelectorAll('*').forEach(push);
    set.add(document.scrollingElement || document.documentElement);
    return [...set].sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight));
  }

  function nearestScrollableAncestor(el){
    let n=el?.parentElement;
    while(n){
      try{
        const cs=getComputedStyle(n);
        if ((cs.overflowY==='auto'||cs.overflowY==='scroll') && n.scrollHeight>n.clientHeight) return n;
      }catch{}
      n=n.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function yInItsScroller(node){
    const sc=nearestScrollableAncestor(node);
    const scRect=sc.getBoundingClientRect();
    const nRect=node.getBoundingClientRect();
    return { sc, yAbs:(sc.scrollTop||0) + (nRect.top - scRect.top) };
  }

  function unwrap(el){ const p=el?.parentNode; if(!p) return; while(el.firstChild) p.insertBefore(el.firstChild, el); p.removeChild(el); }
  function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // =======================
  // 3) Date parsing
  // =======================
  // (identico al tuo file originale)
  // … [OMESSO PER BREVITÀ, MA È IDENTICO AL TUO] …
  // Tec: qui non ho cambiato nulla.

  // =======================
  // 4) Selectors (PATCH FREE COPILOT)
  // =======================

  // Assistant messages
  const SEL_ASSISTANT = 'div[data-content="ai-message"]';

  // User messages
  const SEL_USER = 'div[data-content="user-message"]';

  // All message candidates
  const MSG_SELECTORS = [SEL_ASSISTANT, SEL_USER];

  // Sanitization identical to your v3.6.9
  function sanitizeMessageNode(root){
    try{
      root.querySelectorAll('button,[role="button"],#codeblock-footer,#copy-button,[id^="codeBlock-"],#language-badge').forEach(el=>el.remove());
      root.querySelectorAll('[class]').forEach(el=>{
        try{ if ([...el.classList].some(c=>c.startsWith('fui-'))) unwrap(el);}catch{}
      });
      root.querySelectorAll('pre, code').forEach(el=>{
        el.style.whiteSpace='pre-wrap'; el.style.fontFamily='ui-monospace,Consolas,Menlo,monospace'; el.style.fontSize='13px';
        if (el.tagName.toLowerCase()==='pre'){
          el.style.background='#f6f8fa'; el.style.border='1px solid #e5e7eb';
          el.style.borderRadius='6px'; el.style.padding='0.6em'; el.style.overflow='auto';
        }
        if (el.textContent){
          el.textContent = el.textContent.replace(UI_NOISE_RX,' ')
            .replace(/\s+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
        }
      });
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null);
      const texts=[]; while(walker.nextNode()) texts.push(walker.currentNode);
      texts.forEach(tn=>{ const clean=tn.nodeValue.replace(UI_NOISE_RX,' '); if (clean!==tn.nodeValue) tn.nodeValue=clean; });
    }catch{}
    return root;
  }

  function toMessageHTML(n){
    try{
      const clone=n.cloneNode(true);
      if (CFG.SANITIZE) sanitizeMessageNode(clone);
      return `<article class="msg">${clone.outerHTML}</article>`;
    }catch{ return ''; }
  }

  const seen=new Set();
  const records=[];
  const diag=[];

  // PATCH detectRole
  function detectRole(n){
    try{
      if (n.matches?.(SEL_ASSISTANT)) return 'assistant';
      if (n.matches?.(SEL_USER))      return 'user';
    }catch{}
    return 'unknown';
  }

  const shouldExclude = (txt)=> CFG.EXCLUDE_PATTERNS.some(rx=>rx.test(txt));

  async function pushIfNew(n){
    try{
      const raw=(n.textContent||'').replace(/\u00a0/g,' ')
        .replace(/\s+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
      const normText=normalizeText(raw);
      if (normText.length<CFG.MIN_TEXT_LEN) return false;
      if (shouldExclude(normText)) return false;
      const key=await sha256Hex(normText);
      if (seen.has(key)) return false;

      const role=detectRole(n);
      const { sc, yAbs }=yInItsScroller(n);
      const scId=sc.dataset.__scroller_id || (sc.dataset.__scroller_id='sc'+Math.random().toString(36).slice(2));

      seen.add(key);
      records.push({ key, html:toMessageHTML(n), yAbs, scId, firstSeenAt:Date.now(), textNorm:normText, role, textRaw:raw });
      return true;
    }catch{ return false; }
  }

  async function snapshot(scroller, tag){
    let added=0;
    const nodes=Array.from(scroller.querySelectorAll(MSG_SELECTORS.join(',')));
    for (const n of nodes){ if (await pushIfNew(n)) added++; }
    diag.push({ts:Date.now(), tag, added, total:records.length});
    log(`snapshot(${tag}): +${added} → ${records.length}`);
    return added;
  }
// =======================
  // 5) Scanning
  // =======================
  async function scan(scroller){
    try { scroller.setAttribute('tabindex','0'); scroller.focus({preventScroll:true}); scroller.style.outline='2px solid #9b59b6'; } catch {}
    try { scroller.scrollTo({top:0,behavior:'auto'}); } catch { scroller.scrollTop=0; }
    await adaptivePause(); await waitForIdle();

    await snapshot(scroller, 'init-top');

    let y=0, loops=0;
    while(true){
      const client=scroller.clientHeight||800;
      const maxTop=Math.max(0, scroller.scrollHeight - client);
      const lastStart=Math.max(0, Math.floor(maxTop*(1-CFG.LAST_MILE_ZONE)));
      const step=(y>=lastStart)?CFG.LAST_MILE_STEP:Math.max(120, Math.round(client*CFG.STEP_FACTOR));
      y=Math.min(maxTop, y+step);

      try { scroller.scrollTo({top:y,behavior:'auto'}); } catch { scroller.scrollTop=y; }
      try { scroller.dispatchEvent(new WheelEvent('wheel',{deltaY:800,bubbles:true,cancelable:true})); } catch {}

      await adaptivePause(); await waitForIdle();
      await snapshot(scroller, `scan:${y}`);

      const back=Math.max(0, y-CFG.OVERLAP_PX);
      if (back<y){ try{ scroller.scrollTo({top:back,behavior:'auto'});}catch{ scroller.scrollTop=back; } await sleep(40); }

      if (y>=maxTop-2) break;
      if (++loops>4000) break;
    }

    for (let r=1;r<=CFG.BOTTOM_SETTLE_ROUNDS;r++){
      const client2=scroller.clientHeight||800;
      const maxTop2=Math.max(0, scroller.scrollHeight - client2);
      try{ scroller.scrollTo({top:maxTop2,behavior:'auto'});}catch{ scroller.scrollTop=maxTop2; }
      for (let j=0;j<2;j++){
        try{ scroller.scrollBy({top:-100,behavior:'auto'});}catch{} await sleep(30);
        try{ scroller.scrollBy({top:+160,behavior:'auto'});}catch{} await sleep(30);
      }
      await adaptivePause(); await waitForIdle();
      const add=await snapshot(scroller, `bottom-settle:${r}`);
      if (!add && r>=1) break;
    }
  }

  // =======================
  // 6) Orchestration + Export
  // =======================
  async function main(){
    const scrollers=findScrollableCandidates();
    let usedScroller=null, accepted=false;
    for (let i=0;i<scrollers.length;i++){
      const sc=scrollers[i]; const before=records.length;
      await scan(sc); const gained=records.length-before;
      if (gained>=CFG.MIN_PROGRESS_FOR_SCROLLER){ accepted=true; usedScroller=sc; log(`✅ Scroller[${i}] OK (+${gained})`); break; }
      try{ sc.style.outline=''; }catch{}
      if (!CFG.TRY_OTHER_SCROLLERS_IF_LOW) break;
    }
    if (!accepted && scrollers[0]) usedScroller=scrollers[0];

    const orderedAll=records.slice().sort((a,b)=>(a.yAbs-b.yAbs)||(a.firstSeenAt-b.firstSeenAt));
    let ordered=orderedAll;
    if (CFG.STOP_AT_TEXT instanceof RegExp){
      const idx=orderedAll.findIndex(r=>CFG.STOP_AT_TEXT.test(r.textNorm));
      if (idx>=0) ordered=orderedAll.slice(0, idx+1);
    }

    // Base meta
    const exportedAt=new Date().toISOString();
    const t0=Math.min(...(ordered.map(r=>r.firstSeenAt).filter(Boolean)));
    const t1=Math.max(...(ordered.map(r=>r.firstSeenAt).filter(Boolean)));
    const captureStartISO=isFinite(t0)?new Date(t0).toISOString():'—';
    const captureEndISO=isFinite(t1)?new Date(t1).toISOString():'—';
    const pageTitle=CFG.INCLUDE_URL_TITLE?(document.title||''):'';
    const pageURL=CFG.INCLUDE_URL_TITLE?(location?.href||''):'';

    // Clean thread title (from first 'user')
    function cleanTitleCandidate(line){
      const l=(line||'').trim();
      if (!l) return null;
      const tooSymbolic=/[`~^<>|\[\]{}\\]/.test(l);
      const hasOps=/(\&\&|\|\|)/.test(l);
      const looksPrompt=/^(\s*(\[~]|\$|#|PS>|\w+:>|root@|sudo\s|set\s-|export\s))/i.test(l);
      const hasPathy=/(\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+|\\[A-Za-z0-9._-]+\\)/.test(l);
      const looksScript=/\.(sh|ps1|bat|cmd|py)\b/i.test(l);
      if (tooSymbolic||hasOps||looksPrompt||hasPathy||looksScript) return null;
      if (!/[A-Za-z]/.test(l) || l.length<6) return null;
      return l.replace(/\s{2,}/g,' ').trim();
    }
    function extractThreadTitle(){
      const firstUser=ordered.find(r=>r.role==='user'); if (!firstUser) return '';
      let txt=(firstUser.textRaw||'')
        .replace(/```[\s\S]*?```/g,' ')
        .replace(/`[^`]*`/g,' ')
        .replace(/\s+/g,' ')
        .trim();
      const lines=txt.split(/(?<=\.)\s+|[\n\r]+|(?<!\w)\:\s+|(?<!\w)\-\s+/g).map(s=>s.trim()).filter(Boolean);
      for (const ln of lines){ const ok=cleanTitleCandidate(ln); if (ok) return ok.length>140? ok.slice(0,137)+'…' : ok; }
      const fallback=txt.replace(/[\$#].*$/,' ').replace(/\/[^\s]+/g,' ').replace(/\s+/g,' ').trim().split(' ').slice(0,12).join(' ');
      return (fallback||'').slice(0,140) + (fallback.length>140?'…':'');
    }
    const threadTitle=extractThreadTitle();

    // Strict date helpers
    const ymd = iso => (iso||'').split('T')[0];
    function isValidYMD(s){
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
      const [Y,M,D]=s.split('-').map(Number);
      if (M<1||M>12||D<1||D>31) return false;
      const d=new Date(Date.UTC(Y,M-1,D));
      return d.getUTCFullYear()===Y && (d.getUTCMonth()+1)===M && d.getUTCDate()===D;
    }
    function promptStrict(label, prefill){
      let given=null;
      while(true){
        const ans=window.prompt(`${label} (YYYY-MM-DD)`, prefill);
        if (ans===null) continue; // do not allow cancel
        const s=ans.trim();
        if (isValidYMD(s)) { given=s; break; }
        alert('Invalid date. Use strict YYYY-MM-DD (digits and hyphens only).');
      }
      return given;
    }

    // Detect bottom-most chip to propose as default "Last modified"
    let detectedLastMod = null;
    try{
      const bottomChip = pickBottomDateChip(document.body);
      if (bottomChip){
        const iso = inferISOFromLabel(bottomChip.text);
        if (iso) detectedLastMod = ymd(iso);
        log('Bottom date chip (default for Last modified):', bottomChip.text, '→', detectedLastMod || '(not parseable)');
      }
    }catch(e){ log('Bottom chip detection error:', e?.message||e); }

    // 1) Thread created (always strict prompt; prefill = export date unless a manual hint is given)
    let threadCreated = CFG.THREAD_DATE_HINT || ymd(exportedAt);
    if (CFG.PROMPT_STRICT_DATES){
      threadCreated = promptStrict('Enter/confirm THREAD CREATED date', threadCreated);
    }

    // 2) Last modified (default = bottom chip if any; else export date; always confirm)
    let threadLastMod = CFG.THREAD_LAST_MOD_HINT || detectedLastMod || ymd(exportedAt);
    if (CFG.PROMPT_STRICT_DATES){
      threadLastMod = promptStrict('Enter/confirm THREAD LAST MODIFIED date (Copilot list)', threadLastMod);
    }

    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const threadId='thread_'+stamp;

    // HTML (English; filename pattern also English)
    const css=[
      'body{font:14px/1.45 system-ui,Segoe UI,Roboto,sans-serif;margin:24px;max-width:1100px;background:#fff}',
      'h1{font-size:20px;margin-bottom:8px}.hint{color:#666;margin-bottom:10px}',
      '.grid{display:grid;grid-template-columns:1fr;gap:10px}.msg{padding:12px;border-left:4px solid #ddd;background:#fff}',
      'pre,code{font:13px/1.4 ui-monospace,Consolas,Menlo,monospace;background:#f6f8fa;border:1px solid #e5e7eb;border-radius:6px;padding:.6em}',
      'pre{overflow:auto}.diag{margin-top:20px;padding:10px;background:#fafafa;border:1px dashed #e5e7eb}.diag pre{background:#fff;white-space:pre-wrap}',
      '.meta{margin:12px 0 18px;padding:12px;background:#fafafa;border:1px solid #eee;border-radius:8px}'
    ].join('');

    const diagBlock=CFG.SHOW_DIAG?(
      `<section class="diag"><h3>Diagnostics</h3><pre>${JSON.stringify({
        unique_messages: ordered.length, captured_total: records.length, scrollers_tested: scrollers.length, accepted,
        cfg:{ step_factor:CFG.STEP_FACTOR, last_mile_zone:CFG.LAST_MILE_ZONE, last_mile_step:CFG.LAST_MILE_STEP,
              settle_rounds:CFG.BOTTOM_SETTLE_ROUNDS, reverse_pass:CFG.REVERSE_PASS,
              min_text_len:CFG.MIN_TEXT_LEN, stop_at_text:String(CFG.STOP_AT_TEXT||'') }
      }, null, 2)}</pre></section>`
    ) : '';

    const metaBlock = CFG.SHOW_METADATA ? (`
      <section class="meta">
        <h3>Thread metadata</h3>
        <ul>
          <li><b>Exported at:</b> ${escapeHtml(exportedAt)}</li>
          <li><b>Thread created (inside):</b> ${escapeHtml(threadCreated || '—')}</li>
          <li><b>Last modified (Copilot list):</b> ${escapeHtml(threadLastMod || '—')}</li>
          <li><b>Thread title (auto):</b> ${escapeHtml(threadTitle || '—')}</li>
          <li><b>Capture (start → end):</b> ${escapeHtml(captureStartISO)} → ${escapeHtml(captureEndISO)}</li>
          ${CFG.INCLUDE_URL_TITLE ? `<li><b>Page title:</b> ${escapeHtml(pageTitle)}</li>` : ''}
          ${CFG.INCLUDE_URL_TITLE ? `<li><b>URL:</b> ${escapeHtml(pageURL)}</li>` : ''}
        </ul>
      </section>
    `) : '';

    if (CFG.EXPORT_HTML){
      const html=[
        '<!doctype html>','<meta charset="utf-8" />',
        '<title>Exported thread (v3.6 FastScan-Ordered)</title>',
        `<style>${css}</style>`,
        '<h1>Exported thread</h1>',
        metaBlock,
        `<p class="hint">Captured messages (unique & ordered): <b>${String(ordered.length)}</b></p>`,
        `<section class="grid">${ordered.map(r=>r.html).join('\n')}</section>`,
        diagBlock
      ].join('');

      const blob=new Blob([html],{type:'text/html'});
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download='thread-export_v3.6_fastscan-ordered_'+ stamp +'.html';
      document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove();
      log(`HTML export ready (unique): ${ordered.length}`);
    }

    if (CFG.EXPORT_JSONL){
      const toText=(h)=>h.replace(/<[^>]+>/g,'').replace(/\u00a0/g,' ').trim();
      const rows=ordered.map((r,i)=>({
        thread_id: threadId,
        order: i+1,
        role: r.role,
        text: (r.textRaw??toText(r.html)).replace(/\r/g,''),
        hash: r.key,
        yAbs: r.yAbs,
        exported_at: exportedAt,
        thread_title: (threadTitle || null),
        thread_created_date: (threadCreated || null),
        thread_last_modified_date: (threadLastMod || null),
        page_title: CFG.INCLUDE_URL_TITLE ? (pageTitle || null) : null,
        page_url:   CFG.INCLUDE_URL_TITLE ? (pageURL   || null) : null,
        capture_start: captureStartISO,
        capture_end:   captureEndISO
      }));
      const jsonl=rows.map(o=>JSON.stringify(o)).join('\n')+'\n';
      const blob=new Blob([jsonl],{type:'application/x-ndjson'});
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download='thread-export_v3.6_fastscan-ordered_'+ stamp +'.jsonl';
      document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove();
      log(`JSONL export ready (rows): ${rows.length}`);
    }
  }

  await main();
})();