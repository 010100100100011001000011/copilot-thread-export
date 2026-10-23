/**
 * Copilot Free Thread Exporter v4.8 (experimental)
 * Paste into copilot.com F12 Console. Browser-only, no private APIs.
 * Two full directional scans, gap recovery, attachment-aware user turns.
 * Never upload conversation data. Browser download permissions still apply.
 */
(async () => {
  "use strict";
  const guard = "__copilotFreeExporterV48";
  if (window[guard]) return console.warn("Exporter already running");
  window[guard] = true;
  const cfg = {delay:750,step:135,limit:900,stagnant:26,gapPasses:2,gapSteps:55,replyWait:1800,settleMs:1100};
  const s = {
    list:'[data-testid="MessageListContainer"]',
    turn:'[data-testid="m365-chat-llm-web-ui-chat-message"]',
    user:'[data-testid="chatQuestion"]',
    bot:'[data-testid="markdown-reply"]',
    attachment:'[data-testid="prompt-entity-list"]'
  };
  const list=document.querySelector(s.list);
  if(!list){delete window[guard];return console.error("MessageListContainer not found");}
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const records=new Map(), events=[], systemMessages=new Map();
  let expected=0,step=0, scans=0, mutations=0, scheduled=false, startVerified=false;
  const startMs=Date.now();
  function getChatTitle(){
    const selectors=['[data-testid="conversation-title"]','[data-testid="chat-title"]','[data-testid="thread-title"]','[aria-current="page"]'];
    for(const sel of selectors)for(const n of document.querySelectorAll(sel)){
      const t=(n.getAttribute("title")||n.innerText||"").trim();
      if(t.length>3&&t.length<240&&!/^(Copilot|Chat)$/i.test(t))return {value:t,source:sel};
    }
    for(const a of document.querySelectorAll('a[href]')){
      let u;try{u=new URL(a.getAttribute("href"),location.href)}catch{continue}
      if(u.origin!==location.origin||u.pathname!==location.pathname||u.pathname==="/")continue;
      const label=(a.getAttribute("title")||a.getAttribute("aria-label")||a.innerText||"").trim();
      if(label.length>3&&label.length<180&&!/^(Copilot|Blocchi appunti)$/i.test(label))return {value:label,source:"matching_conversation_link"};
    }
    return {value:null,source:"unavailable"};
  }
  const chatTitle=getChatTitle();
  const start=new Date().toISOString();
  const valid=n=>Number.isInteger(n)&&n>0&&n<100001;
  const number=(e,a)=>{const n=Number(e?.getAttribute(a));return valid(n)?n:null;};
  const htmlEscape=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const position=e=>{
    if(!e)return null;
    const p=e.closest("[aria-posinset]")||e.querySelector("[aria-posinset]");
    return p?number(p,"aria-posinset"):null;
  };
  const storageTime=e=>{
    const raw=e?.getAttribute("data-storage-message-id");
    if(!/^\d{13}$/.test(raw||""))return null;
    const d=new Date(Number(raw));
    return d.getUTCFullYear()>=2020&&d.getUTCFullYear()<=2100?d.toISOString():null;
  };
  function attachmentInfo(user){
    if(!user)return [];
    const found=[],seen=new Set();
    const nodes=[...user.querySelectorAll(s.attachment)];
    for(const node of nodes){
      const parent=node.parentElement||node;
      const near=parent.parentElement||parent;
      const labels=[...near.querySelectorAll("[aria-label],[title]")].map(e=>e.getAttribute("aria-label")||e.getAttribute("title")||"");
      const filename=labels.find(x=>/\.[a-z0-9]{2,8}$/i.test(x.trim()))||null;
      const imgs=[...near.querySelectorAll("img")];
      const candidate=imgs.find(i=>{
        const src=i.getAttribute("src")||"";
        return src.startsWith("data:")&&i.naturalWidth>100&&i.naturalHeight>100;
      });
      const src=candidate?.getAttribute("src")||null;
      // Do not mistake unlabelled reference chips and signature links for attached files.
      if(!filename&&!src)continue;
      const id=[filename||"",src?.slice(0,70)||"",node.textContent?.slice(0,70)||""].join("|");
      if(seen.has(id))continue;seen.add(id);
      found.push({
        filename,kind:src?"image":"file",mime_declared:src?.match(/^data:([^;,]+)/)?.[1]||null,
        image_width:candidate?.naturalWidth||null,image_height:candidate?.naturalHeight||null,
        image_data_uri:src,source:"DOM attachment entity",size_bytes:null,
        note:src?"Rendered image data URI; original fidelity unverified":"Metadata only; source file not downloaded"
      });
    }
    // Sometimes image attachment is rendered outside the prompt entity list.
    if(!nodes.length){
      const labels=[...user.querySelectorAll("[aria-label]")].map(e=>e.getAttribute("aria-label")||"");
      for(const name of labels.filter(x=>/\.[a-z0-9]{2,8}$/i.test(x||""))){
        if(!seen.has(name)){seen.add(name);found.push({filename:name,kind:"file",image_data_uri:null,source:"aria-label",size_bytes:null});}
      }
    }
    return found;
  }
  function cleanHTML(el){
    const clone=el.cloneNode(true);
    clone.querySelectorAll('script,style,button,textarea,input,[role="button"],[role="toolbar"],.fai-BebopTimestamp,[data-tabster-dummy]').forEach(n=>n.remove());
    return clone.outerHTML;
  }
  function readableHTML(r){
    if(r.role==="system_event")return '<p>'+htmlEscape(r.text)+'</p>';
    const stripped=(r.html||"").replace(/<[^>]+>/g," ").replace(/&(?:#\d+|#x[0-9a-f]+|\w+);/gi," ");
    const plain=(r.text||"").trim();
    // Copilot can render rich content whose visible text is not present
    // in a cloned subtree. Preserve the readable text as a fallback.
    if(plain.length>stripped.length+120)
      return '<pre class="captured-text">'+htmlEscape(plain)+'</pre>';
    return r.html;
  }
  function quality(r){
    // Never prefer bulky wrapper HTML over materially longer answer text.
    const t=(r.text||"").length;
    const media=(r.attachments||[]).filter(a=>a.image_data_uri).length;
    const structured=(r.html.match(/<(?:table|pre|code|svg)\b/gi)||[]).length;
    return t*10+media*2000+structured*35;
  }
  function chooseRecord(prior,candidate){
    // Preserve the longest observed text and do not regress after a
    // transient partially rendered DOM snapshot.
    const a=(prior.text||"").length,b=(candidate.text||"").length;
    if(b>a+40)return candidate;
    if(a>b+40)return prior;
    return quality(candidate)>quality(prior)?candidate:prior;
  }
  function put(el,role,pos,source){
    if(!el)return;
    const attachments=role==="user"?attachmentInfo(el):[];
    const visibleText=(el.innerText||"").trim();
    const rawText=(el.textContent||"").trim();
    const body=visibleText.length>rawText.length?visibleText:rawText;
    const meaningful=!!body||attachments.length>0||!!el.querySelector("pre,code,table,img,svg");
    if(!meaningful)return;
    const id=el.getAttribute("data-message-id")||null;
    const key=valid(pos)?"p:"+pos:id?"id:"+role+":"+id:null;
    if(!key)return;
    const record={
      position:valid(pos)?pos:null,position_source:source,role,message_id:id,
      storage_message_id:el.getAttribute("data-storage-message-id")||null,
      message_timestamp:storageTime(el),text:body,
      attachments,html:cleanHTML(el),first_seen_scan:scans,last_seen_scan:scans,
      text_source:visibleText.length>rawText.length?"innerText":"textContent",
      captured_text_chars:body.length,
      content_state:attachments.length&&!body?"attachment_only":attachments.length?"mixed":"text_or_markup"
    };
    const prior=records.get(key);
    if(!prior){records.set(key,record);events.push({step,key,event:"new"});}
    else {
      prior.last_seen_scan=scans;
      const preferred=chooseRecord(prior,record);
      if(preferred===record){
        record.first_seen_scan=prior.first_seen_scan;
        records.set(key,record);
        events.push({step,key,event:"enriched"});
      }
    }
  }
  function scan(tag){
    scans++;
    for(const e of list.querySelectorAll("[aria-setsize]")){
      const n=number(e,"aria-setsize");if(n)expected=Math.max(expected,n);
    }
    for(const turn of list.querySelectorAll(s.turn)){
      const user=turn.querySelector(s.user),bot=turn.querySelector(s.bot);
      const up=position(user),bp=position(bot),tp=position(turn);
      const u=up||(user&&bp?bp-1:null)||(user?tp:null);
      const b=bp||(bot&&u?u+1:null)||(!user&&bot?tp:null);
      put(user,"user",u,up?"aria":"pair_or_turn_inference");
      put(bot,"assistant",b,bp?"aria":"pair_or_turn_inference");
    }
    for(const e of list.querySelectorAll(s.user+","+s.bot)){
      if(e.closest(s.turn))continue;
      put(e,e.matches(s.user)?"user":"assistant",position(e),"aria");
    }
    // Generic system and context messages live in the normal message
    // wrapper but use neither chatQuestion nor markdown-reply.
    const turns=[...list.querySelectorAll(s.turn)];
    const anchor=t=>{
      const u=t.querySelector(s.user),b=t.querySelector(s.bot);
      if(u){
        const p=position(u)||position(t);
        return p&&b?p+1:p;
      }
      if(b){
        const direct=position(b)||position(t);
        if(direct)return direct;
        const idx=turns.indexOf(t);
        const prev=turns.slice(0,idx).reverse().find(x=>x.querySelector(s.user)&&position(x.querySelector(s.user)));
        const next=turns.slice(idx+1).find(x=>x.querySelector(s.user)&&position(x.querySelector(s.user)));
        const before=prev?position(prev.querySelector(s.user)):null;
        const after=next?position(next.querySelector(s.user)):null;
        if(before&&after===before+2)return before+1;
        if(before&&!after)return before+1;
        if(after&&!before)return after-1;
      }
      return null;
    };
    for(let i=0;i<turns.length;i++){
      const t=turns[i];
      if(t.querySelector(s.user)||t.querySelector(s.bot))continue;
      const body=t.querySelector('[data-testid="copilot-message-div"]');
      const content=(body?.innerText||body?.textContent||"").trim();
      if(!content)continue;
      const before=[...turns.slice(0,i)].reverse().find(x=>anchor(x));
      const after=turns.slice(i+1).find(x=>anchor(x));
      const left=before?anchor(before):null,right=after?anchor(after):null;
      let positionGuess=null;
      if(left&&right&&right>left+1){
        const segment=turns.slice(turns.indexOf(before)+1,turns.indexOf(after))
          .filter(x=>!x.querySelector(s.user)&&!x.querySelector(s.bot)&&
            (x.querySelector('[data-testid="copilot-message-div"]')?.textContent||"").trim());
        if(segment.length===right-left-1)positionGuess=left+1+segment.indexOf(t);
      }
      const previous=systemMessages.get(content);
      systemMessages.set(content,{
        position:positionGuess||previous?.position||null,
        position_source:positionGuess?"dom_neighbor_gap":"unpositioned",
        previous_position:left??previous?.previous_position??null,
        following_position:right??previous?.following_position??null,
        role:"system_event",text:content,html:cleanHTML(body),
        attachments:[],message_id:null,storage_message_id:null,
        message_timestamp:null,first_seen_scan:previous?.first_seen_scan||scans,last_seen_scan:scans
      });
    }
  }
  function coverage(){
    const positions=new Set([...records.values(),...systemMessages.values()].map(r=>r.position).filter(valid));
    const missing=Array.from({length:Math.min(expected,10000)},(_,i)=>i+1).filter(p=>!positions.has(p));
    return {expected,positioned:positions.size,records:records.size,missing,
      unpositioned_events:[...systemMessages.values()].filter(x=>!x.position).length};
  }
  function reconcileContextPositions(){
    const occupied=new Set([...records.values(),...systemMessages.values()].map(e=>e.position).filter(valid));
    const groups=new Map();
    for(const event of systemMessages.values()){
      if(event.position||!valid(event.previous_position)||!valid(event.following_position))continue;
      const key=event.previous_position+":"+event.following_position;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(event);
    }
    for(const [key,events] of groups){
      const [lo,hi]=key.split(":").map(Number);
      const free=[];
      for(let pos=lo+1;pos<hi;pos++)if(!occupied.has(pos))free.push(pos);
      if(free.length!==events.length)continue;
      events.sort((a,b)=>(a.first_seen_scan||0)-(b.first_seen_scan||0));
      for(let i=0;i<events.length;i++){
        events[i].position=free[i];
        events[i].position_source="context_between_observed_neighbors";
        occupied.add(free[i]);
      }
    }
  }
  function gapsToRecover(){
    reconcileContextPositions();
    const state=coverage();
    if(state.missing.length&&state.missing.length===state.unpositioned_events){
      // Exactly as many explicit system events as vacant accessibility
      // indices. Do not cycle over these positions as though missing
      // user/assistant messages. Preserve the index uncertainty in metadata.
      return [];
    }
    return state.missing;
  }
  function visible(){
    const p=[...list.querySelectorAll("[aria-posinset]")].map(e=>number(e,"aria-posinset")).filter(valid);
    return {min:p.length?Math.min(...p):null,max:p.length?Math.max(...p):null,top:list.scrollTop};
  }
  function edge(dir){
    const els=[...list.querySelectorAll("[aria-posinset]")].filter(e=>number(e,"aria-posinset"));
    els.sort((a,b)=>number(a,"aria-posinset")-number(b,"aria-posinset"));
    return dir<0?els[0]:els.at(-1);
  }
  function move(dir){
    const anchor=edge(dir)||list;
    try{anchor.scrollIntoView({behavior:"instant",block:dir<0?"start":"end"});}catch{}
    const scrollers=[];
    for(let n=anchor;n;n=n.parentElement){
      if(n.clientHeight>0&&n.scrollHeight>n.clientHeight+2)scrollers.push(n);
    }
    if(document.scrollingElement&&!scrollers.includes(document.scrollingElement))scrollers.push(document.scrollingElement);
    for(const n of scrollers){try{n.scrollBy({top:dir*cfg.step,behavior:"instant"});}catch{}}
    anchor.dispatchEvent(new WheelEvent("wheel",{bubbles:true,cancelable:true,deltaY:dir*cfg.step}));
  }
  async function traverse(dir,label,limit=cfg.limit){
    let still=0;
    for(let i=0;i<limit;i++){
      step++;scan(label);const before=visible(),count=records.size;
      move(dir);await wait(cfg.delay);scan(label);
      const after=visible();
      const changed=before.min!==after.min||before.max!==after.max||before.top!==after.top||count!==records.size;
      still=changed?0:still+1;
      if(i%20===0)console.log("[v4.8]",label,i,coverage());
      if(still>=cfg.stagnant)break;
    }
    await wait(cfg.settleMs);scan(label+":settle");
  }
  async function recover(){
    for(let pass=0;pass<cfg.gapPasses;pass++){
      const gaps=gapsToRecover();
      if(!gaps.length)break;
      console.log("[v4.8] gap pass",pass+1,gaps);
      // Move toward each missing position; additionally scan on either side.
      for(const p of gaps){
        if(records.has("p:"+p))continue;
        let reached=false;
        for(let i=0;i<cfg.gapSteps;i++){
          const v=visible();
          const dir=v.min===null||v.max===null?1:p<v.min?-1:p>v.max?1:(i%2?-1:1);
          step++;move(dir);await wait(cfg.delay);scan("gap:"+p);
          const n=visible();
          if(n.min!==null&&n.min<=p&&n.max>=p){
            reached=true;
            await wait(cfg.replyWait);scan("gap:"+p+":settle");
            if(records.has("p:"+p))break;
          }
        }
        if(!reached)events.push({step,key:"p:"+p,event:"not_reached_in_gap_scan"});
      }
      await traverse(-1,"gap-reverse");
      await traverse(1,"gap-forward");
      if(gapsToRecover().length>=gaps.length)break;
    }
  }
  async function seekRealStart(){
    console.log("[v4.8] Seeking the actual first message automatically");
    let confirmations=0;
    for(let i=0;i<cfg.limit;i++){
      step++;scan("seek-start");
      const v=visible();
      if(v.min===1){
        confirmations++;
        if(confirmations>=4){startVerified=true;break;}
      }else confirmations=0;
      move(-1);
      await wait(cfg.delay);
      scan("seek-start-settle");
      if(i%60===0)console.log("[v4.8] seek-start",i,visible());
    }
    if(!startVerified)console.warn("[v4.8] Could not independently verify position 1.");
  }
  function ask(label,suggestion){
    for(;;){
      const v=prompt(label+" (YYYY-MM-DD, Cancel if unknown)",suggestion||"");
      if(v==null||v.trim()==="")return null;
      const d=new Date(v+"T00:00:00Z");
      if(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(d)&&d.toISOString().slice(0,10)===v)return v;
      alert("Use YYYY-MM-DD");
    }
  }
  function download(content,type,name){
    const url=URL.createObjectURL(new Blob([content],{type}));
    const a=document.createElement("a");a.download=name;a.href=url;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  let observer;
  try{
    observer=new MutationObserver(()=>{
      mutations++;
      if(scheduled)return;scheduled=true;
      queueMicrotask(()=>{scheduled=false;scan("mutation");});
    });
    observer.observe(list,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["aria-posinset","aria-setsize","data-storage-message-id"]});
    scan("initial");
    await seekRealStart();
    await traverse(1,"forward-main");
    // Even with full position coverage, verify content on a second
    // directional pass: virtualization can leave message bodies partial.
    await traverse(-1,"fidelity-reverse");
    await traverse(1,"fidelity-forward");
    if(gapsToRecover().length){
      await traverse(-1,"reverse-verify");
      await traverse(1,"forward-verify");
      if(gapsToRecover().length)await recover();
    }
    scan("final");
    observer.disconnect();
    reconcileContextPositions();
    const systemRows=[...systemMessages.values()].filter(x=>!x.position||!records.has("p:"+x.position));
    const c=coverage();
    const orderKey=r=>r.position??(r.previous_position&&r.following_position?
      (r.previous_position+r.following_position)/2:
      r.previous_position?r.previous_position+0.5:
      r.following_position?r.following_position-0.5:Infinity);
    const sorted=[...records.values(),...systemRows].sort((a,b)=>
      orderKey(a)-orderKey(b)||(a.first_seen_scan||0)-(b.first_seen_scan||0));
    const dates=sorted.map(x=>x.message_timestamp).filter(Boolean).sort();
    // The ONLY user interaction happens at the end.
    const first=ask("Confirm thread START date",dates[0]?.slice(0,10));
    const last=ask("Confirm thread END date",dates.at(-1)?.slice(0,10));
    const unresolved=sorted.flatMap(r=>(r.attachments||[]).filter(a=>!a.image_data_uri)
      .map(a=>({position:r.position,filename:a.filename||null,type:a.kind||"unknown"})));
    const embedded=sorted.reduce((n,r)=>n+(r.attachments||[]).filter(a=>a.image_data_uri).length,0);
    const inventory=sorted.flatMap(r=>(r.attachments||[]).map(a=>({
      filename:a.filename||"Unnamed attachment",position:r.position,
      type:a.kind||"unknown",preview_embedded:!!a.image_data_uri,
      original_file_verified:false
    })));
    const externalLinks=new Map();
    for(const r of sorted){
      for(const m of (r.html||"").matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi)){
        const href=m[1].replace(/&amp;/g,"&");
        if(/^https?:\/\//i.test(href)&&!href.includes("res.cdn.office.net/files/fabric-cdn"))
          externalLinks.set(href,{url:href,position:r.position,downloaded:false});
      }
    }
    const userTitle=chatTitle.value||(prompt("Enter the exact Copilot conversation title:","")||"").trim()||null;
    const duration=Date.now()-startMs;
    const elapsed=Math.floor(duration/60000)+" min "+((duration%60000)/1000).toFixed(1)+" s";
    const contextUnnumbered=c.missing.length>0&&c.missing.length===c.unpositioned_events;
    const meta={
      exporter_version:"4.8-experimental",status:!startVerified?"START_UNVERIFIED":c.expected&&c.missing.length===0?"POSITIONS_COMPLETE_CONTENT_UNVERIFIED":contextUnnumbered?"ALL_ITEMS_ACCOUNTED_CONTEXT_INDEX_UNVERIFIED":"PARTIAL",
      chat_title:userTitle,chat_title_source:chatTitle.value?chatTitle.source:(userTitle?"user_confirmed":"unavailable"),
      expected_positions:c.expected,captured_positions:c.positioned,missing_positions:c.missing,
      historical_elements_exported:sorted.length,
      accessibility_gaps_explained_by_event_count:!!(c.missing.length&&c.missing.length===c.unpositioned_events),
      start_verified:startVerified,system_events_total:systemMessages.size,
      gaps_equivalent_to_unpositioned_context_events:!!(c.missing.length&&c.missing.length===c.unpositioned_events),
      user_confirmed_start_date:first,user_confirmed_end_date:last,
      earliest_timestamp_inferred:dates[0]||null,latest_timestamp_inferred:dates.at(-1)||null,
      timestamp_note:"13-digit storage ID interpreted as epoch-ms; not independently validated",
      attachments:sorted.reduce((n,r)=>n+(r.attachments||[]).length,0),
      named_attachment_inventory:inventory,
      external_links_found:externalLinks.size,
      external_links_not_downloaded:[...externalLinks.values()],
      images_embedded:embedded,
      external_attachment_references:unresolved.length,
      unresolved_attachment_references:unresolved,
      system_events_captured:systemRows.length,
      unpositioned_system_events:systemRows.filter(x=>!x.position).length,
      steps:step,scans,mutations,started_at:start,exported_at:new Date().toISOString(),
      elapsed_ms:duration,elapsed_human:elapsed,
      warning:"Index coverage is not a guarantee of full message bodies. Full-content fidelity checks remain necessary before deleting the source."
    };
    const slim=r=>({...r,html:undefined,attachments:(r.attachments||[]).map(a=>({...a,image_data_uri:undefined,embedded_in_html:!!a.image_data_uri}))});
    const jsonl=JSON.stringify({type:"metadata",...meta})+"\n"+
      sorted.map((r,i)=>JSON.stringify({order:i+1,...slim(r)})).join("\n")+"\n";
    const style='body{font:14px/1.55 system-ui,sans-serif;max-width:1100px;margin:30px auto;padding:0 14px}article{border:1px solid #ccc;padding:16px;margin:20px 0;min-width:0;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}img{max-width:100%;height:auto}figure{border:1px solid #ddd;padding:12px}article table{display:block;max-width:100%;overflow-x:auto;white-space:nowrap}article pre{max-width:100%;overflow-x:auto}article table th,article table td{border:1px solid #ddd;padding:6px 9px}article table{border-collapse:collapse}article pre.captured-text{white-space:pre-wrap;font:inherit}';
    const filesList=inventory.length?
      '<ol>'+inventory.map(a=>'<li><b>'+htmlEscape(a.filename)+'</b> — position '+htmlEscape(a.position)+
        (a.preview_embedded?' — image saved in HTML; verify visually':' — original NOT embedded; save separately')+'</li>').join('')+'</ol>':
      '<p>No identified named files. This is not proof that no external files exist.</p>';
    const notice='<section style="border:2px solid #b80;padding:18px;background:#fff9ec">'+
      '<h2>Archive integrity and attachment warning</h2>'+
      '<p><b>Chat title:</b> '+htmlEscape(userTitle||"Could not detect automatically")+'</p>'+
      '<h3>Identified files — individually check before deletion</h3>'+filesList+
      '<p><b>External links not downloaded:</b> '+externalLinks.size+
      '. These may be ordinary websites, documents, image sources or permission-restricted services.</p>'+
      '<p><b>Total recovery time:</b> '+htmlEscape(elapsed)+'</p>'+
      '<p>Embedded attachment images: '+embedded+'. Linked attachment references NOT embedded: '+unresolved.length+'. '+
      'If you delete the original conversation or lose access to linked services, referenced documents and files may become unavailable. '+
      'Download and save important attachments separately before deleting the original conversation.</p>'+
      '<p>System/context events captured: '+systemRows.length+
      '. Beginning verified: '+(startVerified?'yes':'NO')+
      '. Context events without numeric index: '+c.unpositioned_events+
      '. Unresolved non-context positions: '+(gapsToRecover().join(", ")||"none")+
      '. Index coverage does not prove that every response is fully rendered. Check important replies before deletion.</p></section>';
    const html='<!doctype html><html><head><meta charset="utf-8"><title>'+htmlEscape(userTitle||"Copilot v4.8 export")+'</title><style>'+style+'</style></head><body><h1>'+htmlEscape(userTitle||"Copilot Thread v4.8")+'</h1>'+notice+
      sorted.map((r,i)=>'<article data-position="'+htmlEscape(r.position)+'"><h3>'+htmlEscape(r.role==="user"?"Usuario":r.role==="assistant"?"Copilot":"Evento de contexto")+' <small style="font-weight:normal;color:#777">#'+htmlEscape(r.position||i+1)+'</small></h3><small>'+htmlEscape(r.message_timestamp||"Timestamp unavailable")+'</small>'+
        readableHTML(r)+
        ((r.attachments||[]).length?'<section><h4>Attachments</h4>'+(r.attachments||[]).map(a=>'<figure><figcaption>'+htmlEscape(a.filename||"Unnamed attachment")+'</figcaption>'+(a.image_data_uri?'<img alt="Attached image" src="'+htmlEscape(a.image_data_uri)+'">':'<p>Attachment metadata only; file content unavailable</p>')+'</figure>').join('')+'</section>':'')+
        '</article>').join("\n")+'<footer style="margin:38px 0 15px;border-top:1px solid #bbb;padding-top:12px;color:#555;font-size:12px;text-align:center">A service by &copy; <a href="https://github.com/010100100100011001000011" rel="noopener noreferrer" target="_blank"><strong>Teclive</strong></a> that makes your life easier.</footer></body></html>';
    const stamp=new Date().toISOString().replace(/[:.]/g,"-");
    console.log("[v4.8] EXPORT RESULT",meta);
    download(html,"text/html;charset=utf-8","copilot-v4.8_"+stamp+".html");
    await wait(850);
    download(jsonl,"application/x-ndjson;charset=utf-8","copilot-v4.8_"+stamp+".jsonl");
  }catch(e){console.error("[v4.8] Export failed",e);}
  finally{observer?.disconnect();delete window[guard];}
})();
