/**
 * Copilot Free Thread Exporter v6.0.0-rc1 (release candidate)
 * Stable scope: HTML/JSONL chronology + offline browser-recovered images,
 * code blocks, accessible chat attachments, and provenance/integrity records.
 * WORD ONLINE FILES: same-origin ODT byte recovery was tested separately,
 * but no cross-origin integration into the Copilot ZIP has been validated.
 * Do not claim externally opened Word/OneDrive files are backed up.
 * Paste into copilot.com F12 Console. Browser-only, no private APIs.
 * Two full directional scans, gap recovery, attachment-aware user turns.
 * Never upload conversation data. Browser download permissions still apply.
 */
(async () => {
  "use strict";
  const guard = "__copilotFreeExporterV600RC1";
  // All exporter UI is in English; preserve original chat languages verbatim.
  const UI=Object.freeze({
    zipConfirm:"Save ZIP with files from this chat (highest-resolution recovered images, recoverable chat documents, code blocks, and integrity manifest)?", 
    contextConfirm:"Copilot also lists documents under Project > Sources > References. They are PROJECT CONTEXT, not uploads to this chat. Would you like to TRY to include those project documents in the ZIP as an optional separate section? Only browser-accessible document bytes can be included; references alone are never counted as recovered.",
    title:"Current FULL conversation title (Copilot sidebar). Automatic detection unavailable:"
  });
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
  const outsideKeys=new WeakMap();let outsideSerial=0;let outsideConsolidated=false;
  const outsideSnapshots=[];
  const startMs=Date.now();
  // A conversation can be moved between Projects. The thread UUID is more
  // stable than its parent navigation pathname.
  const conversationId=(location.href.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)||[])[0]?.toLowerCase()||null;
  const titleCacheKey="copilotArchiveTitle:"+location.origin+(conversationId||location.pathname);
  function getChatTitle(){
    const selectors=['[data-testid="conversation-title"]','[data-testid="chat-title"]','[data-testid="thread-title"]'];
    for(const sel of selectors)for(const n of document.querySelectorAll(sel)){
      const t=(n.getAttribute("title")||n.innerText||"").trim();
      if(t.length>3&&t.length<240&&!/^(Copilot|Chat|Blocchi appunti|Notes|Notebooks)$/i.test(t))return {value:t,source:sel};
    }
    const validTitle=t=>t.length>3&&t.length<180&&
      !/^(Copilot|Chat|Blocchi appunti|Notes|Notebooks|Auto|Microsoft Copilot)$/i.test(t);
    // Conversation links inside Project navigation can have a different URL
    // shape from the currently open chat. Compare stable conversation IDs.
    for(const a of document.querySelectorAll('a[href],[data-conversation-id],[data-thread-id]')){
      const raw=[a.getAttribute("href"),a.getAttribute("data-conversation-id"),
        a.getAttribute("data-thread-id")].filter(Boolean).join(" ");
      if(!raw)continue;
      let same=false;
      if(conversationId)same=raw.toLowerCase().includes(conversationId);
      else if(a.matches('a[href]')){
        try{const u=new URL(a.getAttribute("href"),location.href);
          same=u.origin===location.origin&&u.pathname===location.pathname&&u.pathname!=="/";
        }catch{}
      }
      if(!same)continue;
      const label=(a.getAttribute("title")||a.getAttribute("aria-label")||
        a.innerText||"").trim();
      if(validTitle(label))return {value:label,source:"matching_thread_id_in_navigation"};
    }
    // Selected Project treeitems and browser tab titles may describe the
    // Project (e.g. "Dashboard"), NOT the selected chat. They are not
    // sufficient evidence of the full conversation title; ask instead.
    // Never auto-accept sessionStorage: a chat can be renamed or moved into
    // a Project while an earlier manually entered nickname remains cached.
    // If live UI does not expose a verified title, request the current name.
    return {value:null,source:"unavailable_live_ui"};
  }
  let chatTitle=getChatTitle();
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
  // Extensible message dictionary: unknown messages are NEVER discarded.
  const MESSAGE_TYPES=[
    {id:"context_reference_start",role:"context",
      pattern:/^(?:Le risposte faranno riferimento|Answers will refer to|Las respuestas har[aá]n referencia a|Les r[eé]ponses feront r[eé]f[eé]rence)/i},
    {id:"context_reference_stop",role:"context",
      pattern:/^(?:Le risposte smetteranno di fare riferimento|Answers will (?:stop|no longer) refer(?:ring)? to|Las respuestas dejar[aá]n de hacer referencia a|Les r[eé]ponses (?:cesseront|ne feront plus) r[eé]f[eé]rence)/i},
    {id:"service_daily_limit",role:"service",pattern:/vous avez atteint la limite quotidienne|daily (?:usage )?limit|l[ií]mite diario|limite giornalier/i},
    {id:"service_error",role:"service",pattern:/something went wrong|une erreur s.est produite|se ha producido un error|si [eè] verificato un errore/i},
    {id:"service_quota",role:"service",pattern:/quota exceeded|rate limit|limite d.utilisation|usage limit|obtenez plus de capacit[eé]/i},
    {id:"service_moderation",role:"service",pattern:/content (?:was )?blocked|contenu bloqu[eé]|contenido bloqueado/i},
    {id:"context_date",role:"context",pattern:/^(?:ott|oct|ene|jan|feb|mar|apr|may|jun|jul|aug|sep|nov|dic|dec|gen)[a-z.]*\s+\d{1,2}(?:\s+\d{4})?$/i}
  ];
  function classifyMessage(el,text,role){
    const match=MESSAGE_TYPES.find(t=>t.pattern.test(String(text||"").trim()));
    // Keep speaker identity, even if the user quotes a service error.
    const service=match?.role==="service"&&role!=="user";
    return {type:match?.id||(role==="user"?"user_message":role==="assistant"?"assistant_message":"unknown_context"),
      role:role==="user"?"user":match?.role==="context"&&role!=="assistant"?"context":service?"service":role,
      source:match?"dictionary":"generic"};
  }
  function normalizeEmbeddedImage(url){
    if(/^data:application\/octet-stream;base64,/i.test(url||"")){
      const payload=url.slice(url.indexOf(",")+1);
      const mime=payload.startsWith("/9j/")?"image/jpeg":
        payload.startsWith("iVBORw0KGgo")?"image/png":
        payload.startsWith("R0lGOD")?"image/gif":
        payload.startsWith("UklGR")?"image/webp":null;
      if(mime)return url.replace(/^data:application\/octet-stream/i,"data:"+mime);
    }
    return /^data:image\//i.test(url||"")?url:null;
  }
  const FILE_EXTENSION=/\.(?:docx?|docm|dotx?|xlsx?|xlsm|xlsb|xltx?|pptx?|pptm|potx?|pdf|txt|csv|json|xml|html?|zip|7z|rar|rtf|odt|ods|odp|pages|numbers|key|epub|md|py|js|ts|java|c|cpp|jpg|jpeg|png|webp|gif|avif|bmp|svg)$/i;
  function validAttachmentFilename(value){
    const t=String(value||"").trim();
    return t.length>0&&t.length<255&&!/^(?:https?:|file:|ftp:|www\.)/i.test(t)&&
      !/[\/\\]/.test(t)&&FILE_EXTENSION.test(t);
  }
  function decorativeFileIconURL(url){
    return /(?:item-types\/\d+\/|\/file-type-icons\/|\/fileicons\/)[^?#]*\.(?:svg|png|webp)(?:[?#]|$)/i.test(url||"");
  }
  function decorativeFileIcon(img){
    const src=img.getAttribute("src")||img.getAttribute("data-src")||"";
    return decorativeFileIconURL(src)||
      (/^data:image\/svg\+xml/i.test(src)&&!!img.closest('[data-testid="prompt-entity-list"]'));
  }

  const fileCandidates=(root)=>{
    const urls=[],seen=new Set();
    const add=(raw,origin)=>{
      if(!raw||typeof raw!=="string")return;
      const trimmed=raw.trim();
      if(!trimmed||trimmed.length>(trimmed.startsWith("data:")?75*1024*1024:4096)||
         /^javascript:/i.test(trimmed))return;
      let u;try{u=new URL(trimmed,location.href)}catch{return}
      if(!["https:","blob:","data:"].includes(u.protocol))return;
      if(u.protocol==="https:"&&!(
        u.origin===location.origin||/(^|\.)(?:microsoft\.com|sharepoint\.com|office\.com|office\.net|onedrive\.com|live\.com|windows\.net)$/.test(u.hostname)
      ))return;
      if(/^data:image\//i.test(trimmed)||decorativeFileIconURL(trimmed))return;
      if(!seen.has(u.href)){seen.add(u.href);urls.push({url:u.href,source:origin});}
    };
    // Keep resource URLs from actual file/attachment elements ONLY.
    for(const el of [root,...root.querySelectorAll(
      'a[href],[download],[data-download-url],[data-file-url],[data-attachment-url],[data-content-url],[data-href]')]){
      for(const attr of ["href","data-download-url","data-file-url","data-attachment-url","data-content-url","data-href"])
        add(el.getAttribute?.(attr),attr);
    }
    return urls.slice(0,12);
  };
  function attachmentInfo(user){
    if(!user)return [];
    const found=[],seen=new Set();
    const nodes=[...user.querySelectorAll(s.attachment)];
    for(const node of nodes){
      const parent=node.parentElement||node;
      const near=parent.parentElement||parent;
      const labels=[...near.querySelectorAll("[aria-label],[title]")].map(e=>e.getAttribute("aria-label")||e.getAttribute("title")||"");
      const filename=labels.find(validAttachmentFilename)||
        [...near.querySelectorAll("a[download],a[href]")].map(x=>x.getAttribute("download")||"")
          .find(validAttachmentFilename)||null;
      const binaryCandidates=fileCandidates(node);
      const imgs=[...near.querySelectorAll("img")].filter(img=>!decorativeFileIcon(img));
      const candidate=imgs.find(i=>{
        const src=i.getAttribute("src")||"";
        return src.startsWith("data:")&&i.naturalWidth>100&&i.naturalHeight>100;
      });
      const src=normalizeEmbeddedImage(candidate?.getAttribute("src")||"");
      const imageNode=near.querySelector("img[src],img[data-src]");
      const sourceUrl=imageNode&&!decorativeFileIcon(imageNode)?
        (imageNode.getAttribute("src")||imageNode.getAttribute("data-src")||null):null;
      // Do not mistake unlabelled reference chips and signature links for attached files.
      if(!filename&&!src){
        const label=node.getAttribute("aria-label")||"";
        const count=Number(label.match(/\b(\d+)\s+(?:files?|archivos?|allegati|pièces?)/i)?.[1]||0);
        if(count>0&&count<201)
          found.push({filename:null,kind:"file_group",count,
            file_source_candidates:binaryCandidates,
            image_data_uri:null,image_source_url:null,source:"attachment_list_aria_label",
            note:"Copilot indicates attachments, but names and file bytes are unavailable in the DOM"});
        continue;
      }
      const id=[filename||"",src?.slice(0,70)||"",node.textContent?.slice(0,70)||""].join("|");
      if(seen.has(id))continue;seen.add(id);
      found.push({
        filename,kind:src?"image":"file",mime_declared:src?.match(/^data:([^;,]+)/)?.[1]||null,
        image_width:candidate?.naturalWidth||null,image_height:candidate?.naturalHeight||null,
        image_data_uri:src,image_source_url:sourceUrl,
        file_source_candidates:binaryCandidates,source:"DOM attachment entity",size_bytes:null,
        note:src?"Rendered image data URI; original fidelity unverified":"Metadata only; source file not downloaded"
      });
    }
    // Sometimes image attachment is rendered outside the prompt entity list.
    if(!nodes.length){
      const labels=[...user.querySelectorAll("[aria-label]")].map(e=>e.getAttribute("aria-label")||"");
      for(const name of labels.filter(validAttachmentFilename)){
        if(!seen.has(name)){seen.add(name);found.push({filename:name,kind:"file",image_data_uri:null,
          file_source_candidates:fileCandidates(user),source:"aria-label",size_bytes:null});}
      }
    }
    // User photos can be displayed outside prompt-entity-list.
    for(const image of user.querySelectorAll("img[src]")){
      const uri=normalizeEmbeddedImage(image.getAttribute("src"));
      if(!uri||image.naturalWidth<80||image.naturalHeight<80)continue;
      if(found.some(a=>a.image_data_uri===uri))continue;
      found.push({filename:null,kind:"image",mime_declared:"image/jpeg",
        image_width:image.naturalWidth,image_height:image.naturalHeight,
        image_data_uri:uri,image_source_url:null,source:"user_message_embedded_image",
        size_bytes:null,note:"Embedded browser JPEG data; original fidelity not independently verified"});
    }
    return found;
  }
  async function recoverImage(url){
    if(!url||decorativeFileIconURL(url))return null;
    const normalized=normalizeEmbeddedImage(url);if(normalized)return normalized;
    let target;try{target=new URL(url,location.href)}catch{return null}
    if(!["https:","blob:"].includes(target.protocol))return null;
    // No external servers introduced by exporter; fetch only same-origin
    // or first-party Copilot/Microsoft media URLs already in current DOM.
    if(target.protocol==="https:"&&!(
      target.origin===location.origin||/(^|\.)(microsoft\.com|bing\.com|office\.com|office\.net|live\.com|windows\.net)$/.test(target.hostname)
    ))return null;
    try{
      const response=await fetch(target.href,{credentials:target.origin===location.origin?"same-origin":"omit"});
      if(!response.ok)return null;
      const blob=await response.blob();
      if(!blob.type.startsWith("image/")||blob.size>16000000)return null;
      return await new Promise(resolve=>{
        const rd=new FileReader();rd.onload=()=>resolve(rd.result);rd.onerror=()=>resolve(null);
        rd.readAsDataURL(blob);
      });
    }catch{return null}
  }
  // Media lives in two independent structures: labels and actual pixels.
  // Match by DOM order only when counts agree; never assert that browser
  // preview data is the untouched upload from the user's device.
  function reconcileMedia(record){
    const items=record.attachments||[];
    const pixels=items.filter(a=>!!a.image_data_uri);
    const labels=items.filter(a=>!a.image_data_uri&&/\.(?:jpe?g|png|webp|gif|avif|bmp)$/i.test(a.filename||""));
    if(!pixels.length||!labels.length)return;
    if(pixels.length===labels.length){
      for(let i=0;i<pixels.length;i++){
        pixels[i].filename=labels[i].filename;
        pixels[i].label_binding="probable_dom_order";
      }
      record.attachments=items.filter(a=>!labels.includes(a));
    }else if(labels.length===1&&pixels.length>1){
      // One gallery/album chip can reveal multiple separate pictures.
      const name=labels[0].filename;
      const dot=name.lastIndexOf(".");
      const basename=dot>0?name.slice(0,dot):name;
      const ext=dot>0?name.slice(dot):".jpg";
      pixels.forEach((a,i)=>{a.filename=basename+"__"+(i+1)+ext;
        a.gallery_label=name;
        a.label_binding="group_gallery_association_not_original_filename";});
      record.attachments=items.filter(a=>a!==labels[0]);
    }
  }
  const optimizedMedia=new Map(), originalMedia=new Map();
  const modalMedia=new Map(), modalAttempts=new Set();
  async function harvestDeferredMedia(){
    // Only inspect user turns currently mounted. A gallery may materialize
    // its image bytes only AFTER opening its thumbnail.
    const turns=[...list.querySelectorAll(s.user)];
    for(const turn of turns){
      const pos=position(turn);
      if(!pos||modalAttempts.has(pos))continue;
      const record=records.get("p:"+pos);
      if(!record)continue;
      const unresolved=(record.attachments||[]).filter(a=>!a.image_data_uri&&
        /\.(?:jpe?g|png|webp|gif|avif|bmp)$/i.test(a.filename||""));
      const count=(record.attachments||[]).filter(a=>a.image_data_uri).length;
      if(!unresolved.length||(unresolved.length>1&&count>=unresolved.length))continue;
      const label=unresolved[0].filename;
      const nodes=[...turn.querySelectorAll('[aria-label],[title],img,[role="button"],button')];
      const match=nodes.find(el=>
        (el.getAttribute("aria-label")||el.getAttribute("title")||"").includes(label));
      const imageThumb=[...turn.querySelectorAll("img")].find(img=>img.naturalWidth>=80&&img.naturalHeight>=80);
      const chosen=match||imageThumb;
      if(!chosen)continue;
      let trigger=null;
      for(let n=chosen;n&&n!==turn;n=n.parentElement){
        if(n.tagName==="BUTTON"||n.getAttribute("role")==="button"||
          getComputedStyle(n).cursor==="pointer"){
          trigger=n;break;
        }
      }
      if(!trigger||trigger.closest("a[href]"))continue;
      modalAttempts.add(pos);
      const known=new Set([...document.querySelectorAll("img")]
        .filter(x=>x.getBoundingClientRect().width>0)
        .map(x=>x.currentSrc||x.src));
      const images=[],fingerprints=new Set();
      async function collect(){
        const dialogs=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')]
          .filter(el=>el.getBoundingClientRect().width>150&&el.querySelector("img"));
        const imgs=[...new Set(dialogs.flatMap(el=>[...el.querySelectorAll("img")]))];
        for(const img of imgs){
          if(img.naturalWidth<160||img.naturalHeight<160||
             !img.getBoundingClientRect().width)continue;
          const url=img.currentSrc||img.getAttribute("src")||img.getAttribute("data-src");
          if(!url)continue;
          const uri=await recoverImage(url);
          if(!uri)continue;
          const fingerprint=imageKey(uri);
          if(fingerprints.has(fingerprint))continue;
          fingerprints.add(fingerprint);images.push({
            filename:null,kind:"image",mime_declared:uri.slice(5,uri.indexOf(";")),
            image_width:img.naturalWidth,image_height:img.naturalHeight,
            image_data_uri:uri,image_source_url:url.startsWith("data:")?null:url,
            source:"opened_attachment_viewer",
            note:"Image retrieved from rendered viewer, not verified as device original",
            size_bytes:null
          });
        }
      }
      try{
        trigger.click();
        await wait(450);await collect();
        const dialog=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')]
          .find(e=>e.getBoundingClientRect().width>150)||
          [...document.querySelectorAll('[class*="lightbox"],[class*="viewer"]')]
          .find(e=>e.getBoundingClientRect().width>150)||null;
        // Gallery can contain more than one image behind a single file chip.
        if(dialog){
          for(let k=0;k<12;k++){
            const next=[...dialog.querySelectorAll('button,[role="button"]')].find(el=>
              /next|siguiente|avanti|suivant|weiter|prossim|sucessiv|→|›/i.test(
                (el.getAttribute("aria-label")||el.getAttribute("title")||"").trim()));
            if(!next||next.disabled||next.getAttribute("aria-disabled")==="true")break;
            const n=images.length;next.click();await wait(300);await collect();
            if(images.length===n)break;
          }
          const close=[...dialog.querySelectorAll('button,[role="button"]')].find(el=>
            /^(close|cerrar|chiudi|fermer|schließen|dismiss)$/i.test(
              (el.getAttribute("aria-label")||el.getAttribute("title")||"").trim()));
          if(close)close.click();
          else document.dispatchEvent(new KeyboardEvent("keydown",
            {key:"Escape",code:"Escape",bubbles:true}));
        }else{
          document.dispatchEvent(new KeyboardEvent("keydown",
            {key:"Escape",code:"Escape",bubbles:true}));
        }
        if(images.length)modalMedia.set(pos,images);
        console.log("[v6.0.0-rc1] deferred image viewer",{
          position:pos,images_recovered:images.length,opened:!!dialog});
      }catch(err){console.warn("[v6.0.0-rc1] viewer capture unavailable",pos,String(err));}
      // Do not try further clickable controls while a viewer remains open.
      if(document.querySelector('[aria-modal="true"]'))return;
    }
  }
  const imageKey=s=>{const t=s||"",n=t.length,m=Math.floor(n/2);return n+":"+t.slice(0,80)+":"+t.slice(m,m+120)+":"+t.slice(-120);};
  async function optimizeForHTML(src){
    const uri=normalizeEmbeddedImage(src);
    if(!uri)return src;
    const key=imageKey(uri);
    if(optimizedMedia.has(key))return optimizedMedia.get(key);
    // The ZIP copy is captured BEFORE any resize/re-encode, including PNG.
    originalMedia.set(key,uri);
    const match=uri.match(/^data:image\/(jpeg|webp|png);base64,/i);
    if(!match){optimizedMedia.set(key,uri);return uri;}
    const format=match[1].toLowerCase();
    const result=await new Promise(resolve=>{
      const image=new Image();
      image.onload=()=>{
        const maxSide=1600,scale=Math.min(1,maxSide/Math.max(
          image.naturalWidth,image.naturalHeight));
        const needsResize=scale<1;
        // Small PNG diagrams keep exact pixels; large PNG diagrams are
        // resized as PNG without dropping transparency or sharp edges.
        const recompress=needsResize||
          (format!=="png"&&uri.length>350000);
        if(!recompress){resolve(uri);return;}
        try{
          const canvas=document.createElement("canvas");
          canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
          canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
          const ctx=canvas.getContext("2d");
          ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
          ctx.drawImage(image,0,0,canvas.width,canvas.height);
          const mime=format==="png"?"image/png":
            format==="webp"?"image/webp":"image/jpeg";
          const compressed=canvas.toDataURL(mime,0.85);
          // Pixel ceiling always wins; otherwise keep the smaller encoding.
          resolve(needsResize||compressed.length<uri.length?compressed:uri);
        }catch{resolve(uri);}
      };
      image.onerror=()=>resolve(uri);image.src=uri;
    });
    optimizedMedia.set(key,result);
    return result;
  }
  async function embedImages(){
    for(const record of records.values()){
      const recovered=modalMedia.get(record.position)||[];
      const present=new Set((record.attachments||[]).filter(a=>a.image_data_uri)
        .map(a=>imageKey(a.image_data_uri)));
      for(const a of recovered){
        if(!present.has(imageKey(a.image_data_uri))){
          record.attachments.push(a);
          present.add(imageKey(a.image_data_uri));
        }
      }
      for(const attachment of record.attachments||[]){
        if(!attachment.image_data_uri){
          const uri=await recoverImage(attachment.image_source_url);
          if(uri){attachment.image_data_uri=uri;attachment.kind="image";}
        }
      }
      reconcileMedia(record);
      for(const attachment of record.attachments||[]){
        if(!attachment.image_data_uri)continue;
        const original=attachment.image_data_uri;
        attachment.original_media_key=imageKey(original);
        attachment.original_dimensions=[attachment.image_width||null,attachment.image_height||null];
        attachment.image_data_uri=await optimizeForHTML(original);
        attachment.preview_optimized=attachment.image_data_uri.length<original.length;
        attachment.original_byte_length_estimate=Math.round((original.split(",")[1]||"").length*0.75);
      }
      if(!/<img\b/i.test(record.html||""))continue;
      const template=document.createElement("template");template.innerHTML=record.html;
      for(const img of template.content.querySelectorAll("img")){
        const candidate=img.getAttribute("src")||img.getAttribute("data-src");
        const recovered=await recoverImage(candidate);
        if(recovered)img.setAttribute("src",await optimizeForHTML(recovered));
      }
      record.html=template.innerHTML;
    }
  }

  // A file chip can identify an attachment without granting access to its
  // bytes. Never treat a filename, favicon or Office icon as file content.
  const recoveredDocuments=new Map();
  const sourceDocuments=new Map(),sourceObservations=new Map();
  const codeFiles=[];
  const MAX_DOC_BYTES=50*1024*1024,MAX_ARCHIVE_BYTES=250*1024*1024;
  let recoveredDocumentBytes=0,attachmentFetchAttempts=0;
  const docFetchStarted=Date.now(),documentFetchCache=new Map();
  const fileExtension=name=>(String(name||"").match(/\.([a-z0-9]{1,8})$/i)||[])[1]?.toLowerCase()||null;
  function binaryFormat(bytes,filename,mime){
    const eq=(...a)=>a.every((v,i)=>bytes[i]===v);
    const ext=fileExtension(filename);
    const pdf=eq(0x25,0x50,0x44,0x46,0x2d);
    const zip=eq(0x50,0x4b,0x03,0x04)||eq(0x50,0x4b,0x05,0x06);
    const ole=eq(0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1);
    const png=eq(0x89,0x50,0x4e,0x47),jpg=eq(0xff,0xd8,0xff);
    const gif=eq(0x47,0x49,0x46,0x38);
    const webp=eq(0x52,0x49,0x46,0x46)&&
      String.fromCharCode(...bytes.slice(8,12))==="WEBP";
    const isHtml=/^\s*(?:<!doctype\s+html|<html|<script|<head|<body)/i.test(
      new TextDecoder().decode(bytes.slice(0,256)));
    if(isHtml)return {ok:false,reason:"HTML login/error page, not attachment"};
    if(ext==="pdf")return {ok:pdf,kind:"pdf",reason:"PDF signature mismatch"};
    if(["docx","docm","dotx","xlsx","xlsm","xlsb","xltx","pptx","pptm","potx","odt","ods","odp","pages","numbers","key","zip","epub"].includes(ext))
      return {ok:zip,kind:ext,reason:"ZIP/Office signature mismatch"};
    if(["doc","dot","xls","xlt","ppt","pot"].includes(ext))
      return {ok:ole,kind:ext,reason:"legacy Office signature mismatch"};
    if(["png","jpg","jpeg","gif","webp"].includes(ext)){
      const valid=ext==="png"?png:["jpg","jpeg"].includes(ext)?jpg:ext==="gif"?gif:webp;
      return {ok:valid,kind:ext,reason:"image signature mismatch"};
    }
    if(ext==="7z")return {ok:eq(0x37,0x7a,0xbc,0xaf,0x27,0x1c),kind:ext,reason:"7z signature mismatch"};
    if(ext==="rar")return {ok:eq(0x52,0x61,0x72,0x21),kind:ext,reason:"RAR signature mismatch"};
    if(ext==="rtf")return {ok:new TextDecoder().decode(bytes.slice(0,8)).startsWith("{\\rtf"),kind:ext,
      reason:"RTF signature mismatch"};
    if(["csv","txt","json","xml","md","html","htm","py","js","ts","java","c","cpp"].includes(ext)){
      if(["html","htm"].includes(ext))return {ok:false,reason:"HTML not accepted as document response"};
      const containsNul=bytes.slice(0,4096).some(x=>x===0);
      return {ok:!containsNul,kind:ext,reason:"text extension has binary data"};
    }
    if(pdf)return {ok:true,kind:"pdf",inferred_filename:"document.pdf"};
    const m=String(mime||"").toLowerCase();
    if(zip){
      const guessed=/wordprocessingml|ms-word\.document|word\.document/.test(m)?"docx":
        /spreadsheetml|ms-excel\.sheet|excel\.sheet/.test(m)?"xlsx":
        /presentationml|ms-powerpoint\.presentation|powerpoint\.presentation/.test(m)?"pptx":
        /opendocument\.text/.test(m)?"odt":
        /opendocument\.spreadsheet/.test(m)?"ods":
        /opendocument\.presentation/.test(m)?"odp":
        /epub\+zip/.test(m)?"epub":/application\/zip/.test(m)?"zip":null;
      if(guessed)return {ok:true,kind:guessed,inferred_filename:"document."+guessed};
    }
    if(!bytes.slice(0,4096).some(v=>v===0)){
      const textMime=/^(?:text\/plain)(?:;|$)/.test(m)?"txt":
        /^(?:text\/csv)(?:;|$)/.test(m)?"csv":
        /^(?:application\/json)(?:;|$)/.test(m)?"json":
        /^(?:application|text)\/(?:javascript|x-javascript)(?:;|$)/.test(m)?"js":
        /^(?:application|text)\/xml(?:;|$)/.test(m)?"xml":null;
      if(textMime)return {ok:true,kind:textMime,inferred_filename:"document."+textMime};
    }
    return {ok:false,reason:"No independently validated document file signature"};
  }
  function candidateFileName(raw,disposition){
    if(disposition){
      const star=disposition.match(/filename\*=UTF-8''([^;]+)/i);
      if(star){try{const n=decodeURIComponent(star[1].replace(/["']/g,""));
        if(validAttachmentFilename(n))return n;}catch{}}
      const standard=disposition.match(/filename="?([^";]+)"?/i);
      if(standard&&validAttachmentFilename(standard[1]))return standard[1];
    }
    try{
      const u=new URL(raw,location.href);
      const last=decodeURIComponent(u.pathname.split("/").pop()||"");
      return validAttachmentFilename(last)?last:null;
    }catch{return null}
  }
  async function getDocumentBytes(candidate,fileName){
    const url=candidate?.url||"";
    let uri;try{uri=new URL(url,location.href)}catch{return {error:"Invalid attachment URL"}}
    if(!["https:","blob:","data:"].includes(uri.protocol))return {error:"Unsupported URL scheme"};
    if(uri.protocol==="https:"&&!(
      uri.origin===location.origin||/(^|\.)(?:microsoft\.com|sharepoint\.com|office\.com|office\.net|onedrive\.com|live\.com|windows\.net)$/.test(uri.hostname)
    ))return {error:"Not a Copilot/Microsoft attachment origin"};
    try{
      const controller=new AbortController();
      const abort=setTimeout(()=>controller.abort(),6500);
      let response;
      try{response=await fetch(uri.href,{
        credentials:uri.protocol==="https:"?"include":"omit",
        signal:controller.signal,redirect:"follow"});
      }finally{clearTimeout(abort);}
      if(!response.ok)return {error:"HTTP "+response.status};
      const declared=Number(response.headers.get("content-length"));
      if(declared>MAX_DOC_BYTES)return {error:"File exceeds 50 MB limit"};
      const blob=await response.blob();
      if(!blob.size||blob.size>MAX_DOC_BYTES)return {error:"Empty or oversized file"};
      const bytes=new Uint8Array(await blob.arrayBuffer());
      const name=fileName||candidateFileName(uri.href,response.headers.get("content-disposition"));
      const sniff=binaryFormat(bytes,name,response.headers.get("content-type"));
      if(!sniff.ok)return {error:sniff.reason||"Unverified content"};
      return {bytes,name:name||sniff.inferred_filename||null,kind:sniff.kind,
        content_type:response.headers.get("content-type"),method:"browser_attachment_resource"};
    }catch(err){return {error:"Browser fetch blocked, expired, or requires separate permission"}}
  }
  async function recoverDocumentAttachments(sorted){
    for(const record of sorted){
      for(let i=0;i<(record.attachments||[]).length;i++){
        const attachment=record.attachments[i];
        if(attachment.image_data_uri||attachment.kind==="image")continue;
        attachment.file_recovery_status="not_available_in_dom";
        if(attachment.kind==="file_group"&&!attachment.filename)continue;
        let candidates=attachment.file_source_candidates||[];
        if(!candidates.length)continue;
        for(const candidate of candidates.slice(0,6)){
          if(attachmentFetchAttempts>=12||Date.now()-docFetchStarted>26000){
            attachment.file_recovery_status="automatic_download_time_budget_exceeded";
            break;
          }
          if(recoveredDocumentBytes>=MAX_ARCHIVE_BYTES){
            attachment.file_recovery_status="archive_size_limit";break;
          }
          const cacheKey=candidate.url+"|"+(attachment.filename||"");
          let response=documentFetchCache.get(cacheKey);
          if(!response){
            attachmentFetchAttempts++;
            response=await getDocumentBytes(candidate,attachment.filename);
            documentFetchCache.set(cacheKey,response);
          }
          if(!response.bytes){
            attachment.file_recovery_status=response.error||"unavailable";continue;
          }
          if(recoveredDocumentBytes+response.bytes.length>MAX_ARCHIVE_BYTES){
            attachment.file_recovery_status="archive_size_limit";break;
          }
          const key="document:"+record.position+":"+i;
          recoveredDocuments.set(key,response.bytes);
          recoveredDocumentBytes+=response.bytes.length;
          attachment.file_binary_key=key;
          attachment.filename=attachment.filename||response.name;
          attachment.file_recovery_status="bytes_verified_for_zip";
          attachment.binary_bytes=response.bytes.length;
          attachment.binary_source=response.method;
          attachment.note="Actual browser-retrieved binary verified by file signature";
          break;
        }
      }
    }
  }


  async function recoverSourceReferences(){
    // Sources without downloadable resource URLs stay in the manifest only.
    // Do NOT use undocumented Microsoft APIs or fabricate download routes.
    for(const [key,item] of sourceObservations){
      item.recovery_status="reference_only";
      if(!item.file_source_candidates?.length)continue;
      for(const candidate of item.file_source_candidates.slice(0,4)){
        if(attachmentFetchAttempts>=12||Date.now()-docFetchStarted>26000){
          item.recovery_status="download_time_budget";break;
        }
        attachmentFetchAttempts++;
        const filename=validAttachmentFilename(item.title)?item.title:null;
        const result=await getDocumentBytes(candidate,filename);
        if(!result.bytes){item.recovery_status=result.error||"unavailable";continue;}
        if(recoveredDocumentBytes+result.bytes.length>MAX_ARCHIVE_BYTES){
          item.recovery_status="archive_size_limit";break;
        }
        const base=String(item.title).replace(/[\\/:"*?<>|\x00-\x1f]/g,"_")
          .trim().slice(0,90)||"referenced_document";
        const detectedExt=fileExtension(result.name)||result.kind||"bin";
        const outname=validAttachmentFilename(base)?base:base+"."+detectedExt;
        sourceDocuments.set(key,{bytes:result.bytes,filename:outname,
          title:item.title,positions:item.positions,content_type:result.content_type,
          method:"copilot_sources_panel_resource"});
        item.recovery_status="bytes_verified_for_zip";
        item.bytes=result.bytes.length;item.bytes_recovered=true;
        recoveredDocumentBytes+=result.bytes.length;
        break;
      }
    }
  }
  // Export actual fenced/code-editor blocks as editable files in ZIP.
  // Do not reinterpret ordinary chat prose or inline snippets as code files.
  function collectCodeFiles(sorted){
    const extByLanguage={
      javascript:"js",js:"js",typescript:"ts",ts:"ts",python:"py",py:"py",
      c:"c",cpp:"cpp",cxx:"cpp",csharp:"cs","c#":"cs",java:"java",
      json:"json",jsonl:"jsonl",csv:"csv",xml:"xml",yaml:"yaml",
      yml:"yml",html:"html",css:"css",sql:"sql",bash:"sh",shell:"sh",
      powershell:"ps1",ps1:"ps1",go:"go",rust:"rs",ruby:"rb",php:"php",
      swift:"swift",kotlin:"kt",r:"r",markdown:"md",md:"md",
      text:"txt","plain text":"txt",plaintext:"txt",mermaid:"mmd"
    };
    for(const r of sorted){
      if(!r.html||!["assistant","user"].includes(r.role))continue;
      const template=document.createElement("template");template.innerHTML=r.html;
      let i=0;
      for(const pre of template.content.querySelectorAll("pre")){
        if(pre.classList.contains("captured-text"))continue;
        if(pre.closest('[data-code-partial]')?.getAttribute("data-code-partial")==="true"){
          // Include observed lines but explicitly mark as incomplete.
        }
        const code=pre.querySelector("code")||pre;
        const raw=code.textContent||"";
        if(!raw.trim())continue;
        const wrapper=pre.closest(".archived-code-block");
        const hint=(wrapper?.querySelector(".archived-code-language")?.textContent||
          code.getAttribute("data-language")||
          [...code.classList].find(c=>/^language-/i.test(c))?.slice(9)||"text")
          .trim().toLowerCase();
        const ext=extByLanguage[hint.replace(/^[{}]+|[{}]+$/g,"")]||"txt";
        const partial=wrapper?.getAttribute("data-code-partial")==="true";
        i++;
        const filename="code_"+String(i).padStart(3,"0")+"."+ext;
        codeFiles.push({position:r.position,filename,language:hint,
          partial,bytes:new TextEncoder().encode(raw),
          note:partial?"Code block was partially mounted; not a complete original":"Code extracted verbatim from captured block"});
      }
    }
  }
  function zipFromRecoveredMedia(sorted){
    const encoder=new TextEncoder(),entries=[],catalog=[],usedNames=new Set();
    const uniquePath=(folder,filename)=>{
      let safe=normalizedName(filename),path=folder+"/"+safe,n=1;
      while(usedNames.has(path)){
        const dot=safe.lastIndexOf(".");
        const ext=dot>=0?safe.slice(dot):"";
        const root=dot>=0?safe.slice(0,dot):safe;
        path=folder+"/"+root+"__"+(n++)+ext;
      }
      usedNames.add(path);return path;
    };
    const normalizedName=x=>String(x||"image").replace(/[\\/:"*?<>|\x00-\x1f]/g,"_").slice(0,100);
    for(const record of sorted){
      let k=0;
      for(const a of record.attachments||[]){
        if(!a.original_media_key)continue;
        const uri=originalMedia.get(a.original_media_key);
        if(!uri||!uri.includes(";base64,"))continue;
        const payload=uri.slice(uri.indexOf(",")+1);
        let bytes;
        try{
          const binary=atob(payload);bytes=new Uint8Array(binary.length);
          for(let j=0;j<binary.length;j++)bytes[j]=binary.charCodeAt(j);
        }catch{continue;}
        const suffix=/^data:image\/png/i.test(uri)?".png":
          /^data:image\/webp/i.test(uri)?".webp":".jpg";
        const label=normalizedName(a.filename||("image_"+(++k)+suffix));
        const name=uniquePath("position_"+record.position,label);
        entries.push({name,bytes});
        catalog.push({position:record.position,name,bytes:bytes.length,
          kind:"image",original_file_verified:false,
          note:"Bytes recovered from browser image, may be preview/reencoded"});
      }
    }
    for(const record of sorted){
      for(const a of record.attachments||[]){
        if(!a.file_binary_key)continue;
        const bytes=recoveredDocuments.get(a.file_binary_key);
        if(!bytes?.length)continue;
        const name=uniquePath("position_"+record.position,a.filename||"recovered_document.bin");
        entries.push({name,bytes});
        a.zip_path=name;
        catalog.push({position:record.position,name,bytes:bytes.length,
          kind:"document",recovery:"browser_downloaded_and_signature_validated",
          original_file_verified:false,
          note:"File content downloaded from browser-visible attachment resource"});
      }
    }
    for(const entry of sourceDocuments.values()){
      const name=uniquePath("project_context",entry.filename);
      entries.push({name,bytes:entry.bytes});
      catalog.push({position:null,source_positions:entry.positions,
        name,bytes:entry.bytes.length,kind:"project_context_document",source:"copilot_project_references",
        original_file_verified:false,
        note:"Document obtained from a browser-visible Copilot citation resource"});
    }
    for(const code of codeFiles){
      const name=uniquePath("position_"+code.position+"/code",code.filename);
      entries.push({name,bytes:code.bytes});
      catalog.push({position:code.position,name,bytes:code.bytes.length,
        kind:"code",language:code.language,partial:code.partial,
        note:code.note});
    }
    const manifest=encoder.encode(JSON.stringify({
      description:"Offline archive of conversation files. Optional separately labeled Project-context references included only with explicit user consent.",
      project_context_inclusion_requested:sourceDocuments.size>0||
        [...sourceObservations.values()].some(x=>x.recovery_status!=="project_context_reference_not_included"),
      includes_documents:true,
      includes_code_blocks:true,
      html_images_optimized_for_viewing:true,
      zip_images_unresized_browser_recovered_bytes:true,
      html_image_max_side_px:1600,html_jpeg_quality:0.85,
      original_image_fidelity_guaranteed:false,
      captured_entries:catalog,
      unresolved_sources:[...sourceObservations.values()].filter(x=>!x.bytes_recovered)
        .map(x=>({title:x.title,positions:x.positions,
          reason:x.recovery_status||"No accessible binary resource"})),
      unresolved_attachment_names:sorted.flatMap(r=>(r.attachments||[])
        .filter(a=>!a.image_data_uri&&!a.file_binary_key).map(a=>({
          position:r.position,name:a.filename||null,
          kind:a.kind||"unknown",declared_group_count:a.count||null,
          reason:a.file_recovery_status||"No retrievable binary source"
        })))
    },null,2));
    entries.push({name:"manifest.json",bytes:manifest});
    const crc32=bytes=>{
      let crc=-1;
      for(let i=0;i<bytes.length;i++){
        crc^=bytes[i];for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xEDB88320:0);
      }
      return (crc^(-1))>>>0;
    };
    const chunks=[],central=[];let offset=0,centralSize=0;
    const part=(length)=>{const a=new Uint8Array(length);return {a,v:new DataView(a.buffer)};};
    for(const item of entries){
      const name=encoder.encode(item.name),bytes=item.bytes,crc=crc32(bytes);
      const loc=part(30+name.length);
      loc.v.setUint32(0,0x04034b50,true);
      loc.v.setUint16(4,20,true);loc.v.setUint16(6,0x0800,true);
      loc.v.setUint32(14,crc,true);
      loc.v.setUint32(18,bytes.length,true);loc.v.setUint32(22,bytes.length,true);
      loc.v.setUint16(26,name.length,true);loc.a.set(name,30);
      chunks.push(loc.a,bytes);
      const cd=part(46+name.length);
      cd.v.setUint32(0,0x02014b50,true);
      cd.v.setUint16(4,20,true);cd.v.setUint16(6,20,true);
      cd.v.setUint16(8,0x0800,true);
      cd.v.setUint32(16,crc,true);
      cd.v.setUint32(20,bytes.length,true);cd.v.setUint32(24,bytes.length,true);
      cd.v.setUint16(28,name.length,true);cd.v.setUint32(42,offset,true);
      cd.a.set(name,46);central.push(cd.a);centralSize+=cd.a.length;
      offset+=loc.a.length+bytes.length;
    }
    const end=part(22);
    end.v.setUint32(0,0x06054b50,true);
    end.v.setUint16(8,entries.length,true);end.v.setUint16(10,entries.length,true);
    end.v.setUint32(12,centralSize,true);end.v.setUint32(16,offset,true);
    return {blob:new Blob([...chunks,...central,end.a],{type:"application/zip"}),
      images:catalog.filter(x=>x.kind==="image").length,
      documents:catalog.filter(x=>x.kind==="document").length,
      project_context_documents:catalog.filter(x=>x.kind==="project_context_document").length,
      codes:catalog.filter(x=>x.kind==="code").length,
      missing:sorted.reduce((n,r)=>n+(r.attachments||[]).filter(a=>!a.image_data_uri&&!a.file_binary_key).length,0),
      catalog};
  }
  function downloadBlob(blob,name){
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.download=name;a.href=url;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function preserveVirtualizedCode(clone){
    for(const wrapper of [...clone.querySelectorAll(".scriptor-component-code-block")]){
      const editor=wrapper.querySelector('[role="textbox"][aria-readonly="true"]');
      if(!editor)continue;
      const entries=[...editor.querySelectorAll("[data-line-index]")]
        .map(el=>({index:Number(el.getAttribute("data-line-index")),value:el.textContent||""}))
        .filter(x=>Number.isInteger(x.index)&&x.index>=0)
        .sort((a,b)=>a.index-b.index);
      if(!entries.length)continue;
      const unique=entries.filter((x,i)=>!i||x.index!==entries[i-1].index);
      const complete=unique[0].index===0&&unique.every((x,i)=>!i||x.index===unique[i-1].index+1);
      const language=(wrapper.querySelector('[data-testid="one-copilot-code-identity"]')?.textContent||"Code").trim();
      const box=document.createElement("div");box.className="archived-code-block";
      const label=document.createElement("div");label.className="archived-code-language";label.textContent=language;
      const pre=document.createElement("pre");pre.className="archived-code-text";
      const code=document.createElement("code");code.textContent=unique.map(x=>x.value).join("\n");
      pre.appendChild(code);box.append(label,pre);
      if(!complete){
        box.setAttribute("data-code-partial","true");
        const warning=document.createElement("p");warning.className="archived-code-warning";
        warning.textContent="Warning: some code lines were not mounted; only observed lines preserved.";
        box.appendChild(warning);
      }
      wrapper.replaceWith(box);
    }
  }
  function cleanHTML(el){
    const clone=el.cloneNode(true);
    preserveVirtualizedCode(clone);
    clone.querySelectorAll('script,style,button,textarea,input,[role="button"],[role="toolbar"],.fai-BebopTimestamp,[data-tabster-dummy]').forEach(n=>n.remove());
    for(const im of clone.querySelectorAll("img[src]")){
      if(decorativeFileIcon(im)){im.remove();continue;}
      const normalized=normalizeEmbeddedImage(im.getAttribute("src"));
      if(normalized)im.setAttribute("src",normalized);
    }
    return clone.outerHTML;
  }
  function readableHTML(r){
    if(["system_event","service","context"].includes(r.role))return '<p>'+htmlEscape(r.text)+'</p>';
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
    const category=classifyMessage(el,body,role);
    const record={
      position:valid(pos)?pos:null,position_source:source,role:category.role,message_type:category.type,classification_source:category.source,message_id:id,
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
  // Copilot may render quota-limited turns outside MessageListContainer,
  // without aria-posinset or regular turn wrappers.
  function scanOutsideList(){
    if(outsideConsolidated)return;
    // DOM-wide, including INSIDE MessageListContainer: exceptions can be
    // unindexed children of that list. Recognize observations, not language.
    const nodes=[...document.querySelectorAll('[data-testid="chatOutput"],span')];
    const candidates=nodes.filter(el=>{
      if(el.closest('[aria-posinset],script,style,nav,[role="navigation"],[role="menu"],[contenteditable="true"]'))return false;
      if(el.matches("span")&&el.children.length)return false;
      const txt=(el.innerText||el.textContent||"").trim();
      if(!txt||txt.length>2000)return false;
      return el.matches('[data-testid="chatOutput"]')||
        MESSAGE_TYPES.some(t=>t.role==="service"&&t.pattern.test(txt));
    });
    // Snapshot the actual ordered sequence. Never synthesize a duplicate
    // notice from one occurrence; snapshots preserve identical sibling texts.
    const snapshot=candidates.map(el=>{
      const text=(el.innerText||el.textContent||"").trim();
      const role=el.matches('[data-testid="chatOutput"]')?"user":"system_event";
      const kind=classifyMessage(el,text,role);
      return {text,role:kind.role,message_type:kind.type,html:cleanHTML(el)};
    });
    if(snapshot.length>0&&snapshot.length<=40&&
       snapshot.some(x=>x.role==="service"||x.message_type?.startsWith("service"))){
      const signature=snapshot.map(x=>x.role+":"+x.text).join("|");
      if(!outsideSnapshots.some(x=>x.signature===signature))
        outsideSnapshots.push({signature,items:snapshot,seen_scan:scans});
    }
    // Preserve duplicates through DOM order and unique element identity.
    // Text alone is NOT a unique identifier for repeated service errors.
    for(let i=0;i<candidates.length;i++){
      const el=candidates[i],txt=(el.innerText||el.textContent||"").trim();
      const role=el.matches('[data-testid="chatOutput"]')?"user":"system_event";
      const kind=classifyMessage(el,txt,role);
      let key=outsideKeys.get(el);
      if(!key){key="outside_element:"+ ++outsideSerial;outsideKeys.set(el,key);}
      const previous=systemMessages.get(key);
      systemMessages.set(key,{
        position:previous?.position||null,position_source:previous?.position_source||"unpositioned_unindexed_dom",
        role:kind.role,message_type:kind.type,classification_source:kind.source,
        text:txt,html:cleanHTML(el),attachments:[],message_id:null,storage_message_id:null,
        message_timestamp:null,first_seen_scan:previous?.first_seen_scan||scans,last_seen_scan:scans,
        outside_sequence:previous?.outside_sequence??i
      });
    }
  }
  function assignOutsidePositions(){
    if(outsideConsolidated)return true;
    const used=new Set([...records.values()].map(x=>x.position).filter(valid));
    const missing=Array.from({length:Math.min(expected,10000)},(_,i)=>i+1)
      .filter(p=>!used.has(p));
    if(!missing.length||!missing.every((p,i)=>i===0||p===missing[i-1]+1))return false;
    // Prefer a real DOM snapshot containing exactly the missing count,
    // including repeated identical notices as distinct DOM siblings.
    const possibilities=outsideSnapshots.filter(x=>x.items.length===missing.length);
    const snap=possibilities.sort((a,b)=>b.items.filter(x=>x.role==="service").length-
      a.items.filter(x=>x.role==="service").length||a.seen_scan-b.seen_scan)[0];
    if(!snap)return false;
    // Do not reassign numbered messages just because another region happens
    // to share the same count; require user or system/service content.
    if(!snap.items.some(x=>x.role==="service"))return false;
    for(const [k,r] of systemMessages){
      if(Number.isInteger(r.outside_sequence))systemMessages.delete(k);
    }
    snap.items.forEach((r,i)=>systemMessages.set("canonical_outside:"+i,{
      ...r,position:missing[i],position_source:"inferred_from_observed_dom_sequence",
      classification_source:"observed_unindexed_element",
      attachments:[],message_id:null,storage_message_id:null,
      message_timestamp:null,first_seen_scan:snap.seen_scan,last_seen_scan:scans
    }));
    outsideConsolidated=true;
    return true;
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
    // Recognize any additional indexed message container, irrespective of format.
    for(const holder of list.querySelectorAll("[aria-posinset]")){
      const p=number(holder,"aria-posinset");
      if(!p||records.has("p:"+p))continue;
      const child=holder.querySelector('[data-testid="copilot-message-div"],[data-testid="chatOutput"],[role="alert"],[role="status"]')||holder;
      if(child.closest(s.user+","+s.bot))continue;
      const t=(child.innerText||child.textContent||"").trim();
      if(t&&t.length<150000)put(child,"system_event",p,"generic_accessibility_position");
    }
    scanOutsideList();
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
      const category=classifyMessage(body,content,'system_event');
      systemMessages.set(content,{
        message_type:category.type,classification_source:category.source,
        position:positionGuess||previous?.position||null,
        position_source:positionGuess?"dom_neighbor_gap":"unpositioned",
        previous_position:left??previous?.previous_position??null,
        following_position:right??previous?.following_position??null,
        role:category.role,text:content,html:cleanHTML(body),
        attachments:[],message_id:null,storage_message_id:null,
        message_timestamp:null,first_seen_scan:previous?.first_seen_scan||scans,last_seen_scan:scans
      });
    }
  }
  function coverage(){
    const positions=new Set([...records.values(),...systemMessages.values()].map(r=>r.position).filter(valid));
    const missing=Array.from({length:Math.min(expected,10000)},(_,i)=>i+1).filter(p=>!positions.has(p));
    const stableUnindexed=[...systemMessages.values()].filter(x=>!x.position&&
      !Number.isInteger(x.outside_sequence)&&
      ["system_event","service","context"].includes(x.role));
    const unindexedSnapshots=outsideConsolidated?0:
      Math.max(0,...outsideSnapshots.map(x=>x.items.length));
    return {expected,positioned:positions.size,records:records.size,missing,
      unpositioned_events:stableUnindexed.length+unindexedSnapshots,
      stable_unindexed_context_count:stableUnindexed.length,
      unpositioned_observation_count:[...systemMessages.values()].filter(x=>!x.position).length};
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
  // Unindexed service/context events at the tail may still have a firm DOM
  // anchor. Position them before declaring any accessibility gaps.
  // A position derived from surrounding evidence is marked, never asserted
  // as a Copilot aria-posinset.
  function reconcileTrailingContext(){
    const nums=[...records.values()].map(x=>x.position).filter(valid);
    const last=nums.length?Math.max(...nums):0;
    const trailing=[...systemMessages.values()].filter(x=>
      !valid(x.position)&&valid(x.previous_position)&&
      x.previous_position===last&&!valid(x.following_position)&&
      ["context","service","system_event"].includes(x.role));
    const occupied=new Set([...records.values(),...systemMessages.values()]
      .map(x=>x.position).filter(valid));
    if(!last||!trailing.length||expected!==last+trailing.length)return false;
    const slots=trailing.map((_,i)=>last+i+1);
    if(slots.some(n=>occupied.has(n)))return false;
    trailing.forEach((event,i)=>{
      event.position=slots[i];
      event.position_source="inferred_from_trailing_dom_sequence";
      event.position_is_inferred=true;
      event.aria_position=null;
    });
    return true;
  }
  function gapsToRecover(){
    reconcileContextPositions();
    reconcileTrailingContext();
    const state=coverage();
    if(state.missing.length&&state.missing.length===state.unpositioned_events){
      // Exactly as many explicit system events as vacant accessibility
      // indices. Do not cycle over these positions as though missing
      // user/assistant messages. Preserve the index uncertainty in metadata.
      return [];
    }
    return state.missing;
  }
  function scrollHost(){
    // Do not assume the message list itself scrolls; Copilot may use a
    // separate virtualized feed which is NOT an ancestor of the list.
    const hosts=[...document.querySelectorAll('[role="feed"],[data-testid="MessageListContainer"],[role="log"]')];
    for(let n=list;n;n=n.parentElement)if(!hosts.includes(n))hosts.push(n);
    const candidates=hosts.filter(n=>n.clientHeight>50&&n.scrollHeight>n.clientHeight+100&&
      /^(auto|scroll|overlay)$/.test(getComputedStyle(n).overflowY));
    candidates.sort((a,b)=>{
      const f=n=>n.getAttribute("role")==="feed"?100000:0;
      return (f(b)+b.scrollHeight-b.clientHeight)-(f(a)+a.scrollHeight-a.clientHeight);
    });
    return candidates[0]||null;
  }
  function visible(){
    const p=[...list.querySelectorAll("[aria-posinset]")].map(e=>number(e,"aria-posinset")).filter(valid);
    const h=scrollHost();
    return {min:p.length?Math.min(...p):null,max:p.length?Math.max(...p):null,top:h?h.scrollTop:list.scrollTop};
  }
  function edge(dir){
    const els=[...list.querySelectorAll("[aria-posinset]")].filter(e=>number(e,"aria-posinset"));
    els.sort((a,b)=>number(a,"aria-posinset")-number(b,"aria-posinset"));
    return dir<0?els[0]:els.at(-1);
  }
  function move(dir){
    const host=scrollHost();
    if(host){
      const before=host.scrollTop;
      const jump=Math.max(cfg.step,Math.min(950,Math.round(host.clientHeight*.9)));
      host.scrollBy({top:dir*jump,behavior:"instant"});
      if(host.scrollTop!==before)return;
    }
    // Fallback for other Copilot layouts; don't require a feed.
    const anchor=edge(dir)||list;
    try{anchor.scrollIntoView({behavior:"instant",block:dir<0?"start":"end"});}catch{}
    for(let n=anchor;n;n=n.parentElement){
      if(n.clientHeight>0&&n.scrollHeight>n.clientHeight+2){
        try{n.scrollBy({top:dir*cfg.step,behavior:"instant"});}catch{}
      }
    }
  }
  // Sources/Origini may hold document references that are not present
  // inside the user's attachment chips. Observe only the assistant's own
  // sources controls, never browse invented URLs.
  const inspectedSourceTurns=new Set();
  const sourcePanelLabel=/^(?:sources|origini|citations|references|referencias|riferimenti|fontes|quellen)(?:\s*\d+)?$/i;
  let sourcePanelOpens=0;
  function displayed(el){
    const r=el.getBoundingClientRect();
    return r.width>6&&r.height>6&&getComputedStyle(el).visibility!=="hidden";
  }
  let sourcePanelsVisible=0,sourcePanelDetectionFailures=0;
  // Sources may be rendered as a SIDE DRAWER with no dialog role/test-id.
  function sourceDialog(){
    const titleRe=/^(?:origini|sources|citations|references|referencias|riferimenti|quellen)$/i;
    const sectionRe=/\b(?:citazioni|citations|referencias|references|riferimenti|sources)\b/i;
    const container=document.querySelector(s.list);
    const candidates=[...document.querySelectorAll(
      '[role="dialog"],[aria-modal="true"],[data-testid*="source" i],[data-testid*="citation" i],[data-testid*="grounding" i]')]
      .filter(el=>{
        const r=el.getBoundingClientRect();
        return displayed(el)&&r.width>=180&&r.height>=180&&
          !el.contains(container)&&sectionRe.test((el.innerText||"").slice(0,400));
      });
    // Detect a heading and ascend into its own panel, even when there is
    // no accessibility role and all citation cards are ordinary DIVs.
    for(const node of document.querySelectorAll("h1,h2,h3,h4,span,div,p")){
      if(node.children.length||!titleRe.test((node.textContent||"").trim())||!displayed(node))
        continue;
      let parent=node.parentElement,steps=0;
      while(parent&&parent!==document.body&&steps++<12){
        const r=parent.getBoundingClientRect();
        if(r.width>=180&&r.height>=180&&
           !parent.contains(container)&&sectionRe.test((parent.innerText||"").slice(0,500))){
          candidates.push(parent);break;
        }
        parent=parent.parentElement;
      }
    }
    // Prefer the smallest usable side panel, not a page-level wrapper.
    return candidates.sort((a,b)=>{
      const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();
      return ra.width*ra.height-rb.width*rb.height;
    })[0]||null;
  }
  function collectVisibleSources(dialog,position){
    if(!dialog)return 0;
    const exclude=/^(?:origini|sources|citazioni|citations|references|riferimenti|referencias|personalizzazione|customization|close|chiudi|riferimenti|feedback|documenti|documents|file|files|open|apri|download|scarica|view|visualizza)$/i;
    const subtitle=/^(?:tec live modificato in data|last modified|modified on|modified by|modificato in data|updated on|mise [àa] jour|ultima modifica)/i;
    // A source title may have NO extension and NO clickable semantic role.
    // Read its visible text leaf, then derive any data links from the
    // surrounding card. Do not invent a filename or download endpoint.
    const leaves=[...dialog.querySelectorAll("span,div,p,a,button,h4,h5,h6,[role='listitem']")]
      .filter(el=>{
        if(el.children.length>0||!displayed(el))return false;
        const txt=(el.textContent||"").trim();
        if(!txt||txt.length<3||txt.length>135||exclude.test(txt)||subtitle.test(txt))return false;
        if(/^(?:\d+|https?:\/\/)/i.test(txt))return false;
        return true;
      });
    let added=0;
    const seenInPanel=new Set();
    for(const el of leaves){
      const title=(el.textContent||"").trim().replace(/\s+/g," ");
      const key=title.toLocaleLowerCase().trim();
      if(seenInPanel.has(key))continue;
      seenInPanel.add(key);
      // Only accept text inside the source/citation section; refuse
      // empty generic titles and UI labels.
      const card=el.closest('a,button,[role="button"],[role="listitem"],li')||
        el.parentElement?.parentElement||el.parentElement||el;
      const candidates=fileCandidates(card);
      if(!sourceObservations.has(key)){
        sourceObservations.set(key,{
          title,positions:[],file_source_candidates:[],
          category:"copilot_citation_source",bytes_recovered:false,
          note:"Source title visible in Copilot; downloading its file may be unavailable"});
      }
      const item=sourceObservations.get(key);
      if(!item.positions.includes(position))item.positions.push(position);
      for(const cand of candidates){
        if(!item.file_source_candidates.some(x=>x.url===cand.url))
          item.file_source_candidates.push(cand);
      }
      added++;
    }
    return added;
  }
  async function harvestCitationSources(){
    if(sourcePanelOpens>=24)return;
    for(const bot of list.querySelectorAll(s.bot)){
      const pos=position(bot);
      if(!pos||inspectedSourceTurns.has(pos))continue;
      const parentTurn=bot.closest(s.turn)||bot.parentElement||bot;
      const trigger=[...parentTurn.querySelectorAll('button,[role="button"]')].find(el=>{
        if(!displayed(el))return false;
        const txt=(el.getAttribute("aria-label")||el.getAttribute("title")||
          el.innerText||"").trim();
        return sourcePanelLabel.test(txt);
      });
      if(!trigger)continue;
      inspectedSourceTurns.add(pos);sourcePanelOpens++;
      try{
        trigger.click();
        await wait(320);
        let dialog=sourceDialog();
        // Side panels may mount after their animation or network response.
        for(let waitCount=0;!dialog&&waitCount<4;waitCount++){
          await wait(250);dialog=sourceDialog();
        }
        if(dialog){
          sourcePanelsVisible++;
          // "Origini" may open on another tab. Project documents shown
          // under "Riferimenti / References" must be selected explicitly.
          const referencesTab=[...dialog.querySelectorAll(
            '[role="tab"],button,[role="button"]')].find(el=>{
              const label=(el.getAttribute("aria-label")||
                el.getAttribute("title")||el.innerText||"").trim();
              return /^(?:Riferimenti|References|Referencias|Références|Referenzen)$/i.test(label)
                &&displayed(el);
            });
          if(referencesTab&&referencesTab.getAttribute("aria-selected")!=="true"){
            referencesTab.click();
            await wait(360);
            dialog=sourceDialog()||dialog;
          }
          const added=collectVisibleSources(dialog,pos);
          console.log("[v6.0.0-rc1] Sources panel",{
            position:pos,reference_entries:added});
          const close=[...dialog.querySelectorAll('button,[role="button"]')].find(el=>
            /^(?:close|chiudi|cerrar|fermer|schließen|dismiss)$/i.test(
              (el.getAttribute("aria-label")||el.getAttribute("title")||
               el.innerText||"").trim()));
          if(close)close.click();
          else dialog.dispatchEvent(new KeyboardEvent("keydown",
            {key:"Escape",code:"Escape",bubbles:true}));
        }
        if(!dialog){
          sourcePanelDetectionFailures++;
          console.warn("[v6.0.0-rc1] Sources opened but panel container was not identified",{
            position:pos,observed_references:sourceObservations.size});
        }
      }catch(err){console.warn("[v6.0.0-rc1] Sources panel not accessible",pos,String(err));}
      if(sourceDialog())return; // Stop if unable to close an overlay
    }
  }
  async function traverse(dir,label,limit=cfg.limit){
    let still=0;
    for(let i=0;i<limit;i++){
      step++;scan(label);reconcileContextPositions();reconcileTrailingContext();
      const before=visible(),count=records.size;
      await harvestDeferredMedia();
      await harvestCitationSources();
      move(dir);await wait(cfg.delay);scan(label);
      reconcileContextPositions();reconcileTrailingContext();
      const after=visible();
      const changed=before.min!==after.min||before.max!==after.max||before.top!==after.top||count!==records.size;
      still=changed?0:still+1;
      if(i%20===0)console.log("[v6.0.0-rc1]",label,i,coverage());
      if(still>=cfg.stagnant)break;
    }
    await wait(cfg.settleMs);scan(label+":settle");
  }
  async function recover(){
    if(!startVerified||records.size===0){
      console.warn("[v6.0.0-rc1] Skipping gap recovery: beginning not verified or zero captured messages.");
      return;
    }
    for(let pass=0;pass<Math.min(cfg.gapPasses,1);pass++){
      const gaps=gapsToRecover();
      if(!gaps.length)break;
      console.log("[v6.0.0-rc1] gap pass",pass+1,gaps);
      // Move toward each missing position; additionally scan on either side.
      const batch=gaps.slice(0,Math.min(4,gaps.length));
      let progress=0;
      for(const p of batch){
        if(records.has("p:"+p))continue;
        let reached=false;
        const beforeCount=records.size;
        for(let i=0;i<Math.min(cfg.gapSteps,14);i++){
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
        if(records.size>beforeCount)progress++;
        if(!reached)events.push({step,key:"p:"+p,event:"not_reached_in_gap_scan"});
        if(!progress&&p===batch[1])break;
      }
      if(!progress){console.warn("[v6.0.0-rc1] Gap recovery stopped: no new messages found.");break;}
      await traverse(-1,"gap-reverse");
      await traverse(1,"gap-forward");
      if(gapsToRecover().length>=gaps.length)break;
    }
  }
  async function seekRealStart(){
    console.log("[v6.0.0-rc1] Seeking the actual first message automatically");
    let confirmations=0,unchanged=0,lastSignature="";
    for(let i=0;i<Math.min(cfg.limit,120);i++){
      step++;scan("seek-start");
      const v=visible();
      const signature=[v.min,v.max,v.top,records.size].join(":");
      unchanged=signature===lastSignature?unchanged+1:0;
      lastSignature=signature;
      if(unchanged>=16){
        console.warn("[v6.0.0-rc1] Start navigation stalled; stopping instead of searching indefinitely.");
        break;
      }
      if(v.min===1){
        confirmations++;
        if(confirmations>=4){startVerified=true;break;}
      }else confirmations=0;
      move(-1);
      await wait(cfg.delay);
      scan("seek-start-settle");
      if(i%60===0)console.log("[v6.0.0-rc1] seek-start",i,visible());
    }
    if(!startVerified)console.warn("[v6.0.0-rc1] Could not independently verify position 1.");
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
  let observer,active=true;
  try{
    observer=new MutationObserver(()=>{
      mutations++;
      if(scheduled)return;scheduled=true;
      // Explicit scroll scans provide high-fidelity capture. Debounce
      // incidental Microsoft UI mutations instead of processing each render.
      setTimeout(()=>{
        scheduled=false;
        if(active){scan("mutation");reconcileContextPositions();reconcileTrailingContext();}
      },180);
    });
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["aria-posinset","aria-setsize","data-storage-message-id"]});
    scan("initial");
    // Capture unindexed service messages at load, before moving the feed.
    scanOutsideList();
    await seekRealStart();
    if(!startVerified)console.warn("[v6.0.0-rc1] Export will be marked PARTIAL: initial position not verified.");
    await traverse(1,"forward-main");
    assignOutsidePositions();reconcileContextPositions();reconcileTrailingContext();
    const initial=coverage();
    const codeHeavy=[...records.values()].some(r=>
      /scriptor-codeblock-virtualized|data-line-index/i.test(r.html||""));
    const unresolvedMedia=[...records.values()].some(r=>
      (r.attachments||[]).some(a=>!a.image_data_uri&&
        /\.(?:jpe?g|png|webp|gif|avif|bmp)$/i.test(a.filename||"")));
    const recoverableGaps=gapsToRecover();
    if(recoverableGaps.length||codeHeavy||unresolvedMedia){
      console.log("[v6.0.0-rc1] recovery mode",{
        recoverable_gaps:recoverableGaps.length,codeHeavy,unresolvedMedia});
      await traverse(-1,"fidelity-reverse");
      assignOutsidePositions();reconcileContextPositions();reconcileTrailingContext();
      if(gapsToRecover().length)await traverse(1,"fidelity-forward");
    }else console.log("[v6.0.0-rc1] standard mode: all indexed/context turns accounted for");
    if(startVerified&&gapsToRecover().length&&systemMessages.size===0)await recover();
    scan("final");
    observer.disconnect();active=false;
    reconcileContextPositions();reconcileTrailingContext();
    scanOutsideList();
    assignOutsidePositions();
    await embedImages();
    const systemRows=[...systemMessages.values()].filter(x=>!x.position||!records.has("p:"+x.position));
    const c=coverage();
    const orderKey=r=>r.position??(r.previous_position&&r.following_position?
      (r.previous_position+r.following_position)/2:
      r.previous_position?r.previous_position+0.5:
      r.following_position?r.following_position-0.5:Infinity);
    const sorted=[...records.values(),...systemRows].sort((a,b)=>
      orderKey(a)-orderKey(b)||(a.first_seen_scan||0)-(b.first_seen_scan||0));
    await recoverDocumentAttachments(sorted);
    collectCodeFiles(sorted);
    const dates=sorted.map(x=>x.message_timestamp).filter(Boolean).sort();
    // The ONLY user interaction happens at the end.
    const first=ask("Confirm thread START date",dates[0]?.slice(0,10));
    const last=ask("Confirm thread END date",dates.at(-1)?.slice(0,10));
    // Ask about optional Project-context files only when an actual browser-
    // exposed candidate resource exists. Reference-only buttons with no href
    // (including a Word Online viewer) are NOT auto-downloadable.
    const projectFetchPossible=[...sourceObservations.values()].some(
      item=>item.file_source_candidates?.length>0);
    const includeProjectContext=projectFetchPossible&&confirm(UI.contextConfirm);
    if(includeProjectContext)await recoverSourceReferences();
    else for(const item of sourceObservations.values())
      item.recovery_status="project_context_reference_not_included";
    const sourceInventory=[...sourceObservations.values()].map(x=>({
      title:x.title,positions:x.positions,scope:"project_context_not_chat_attachment",
      included_by_user_choice:includeProjectContext,
      bytes_recovered:!!x.bytes_recovered,
      status:x.recovery_status||"reference_only",bytes:x.bytes||null
    }));
    const unresolved=sorted.flatMap(r=>(r.attachments||[])
      .filter(a=>!a.image_data_uri&&!a.file_binary_key)
      .map(a=>({position:r.position,filename:a.filename||null,
        type:a.kind||"unknown",reason:a.file_recovery_status||"unavailable"})));
    const embedded=sorted.reduce((n,r)=>n+(r.attachments||[]).filter(a=>a.image_data_uri).length,0);
    // A project may attach the same source set to EACH user turn. Repeated
    // 3-file UI counters are observations, not evidence of 30 unique files.
    const inventory=[],groupedRefs=new Map();
    for(const r of sorted){
      for(const a of r.attachments||[]){
        if(a.kind==="file_group"&&!a.filename){
          const count=Number(a.count)||0;
          const key="unidentified-group-count:"+count;
          if(!groupedRefs.has(key)){
            const group={filename:null,position:r.position,type:"file_group",
              declared_files_per_observation:count,observed_message_positions:[],
              preview_embedded:false,binary_saved_for_zip:false,original_file_verified:false,
              uniqueness_unverified:true};
            groupedRefs.set(key,group);inventory.push(group);
          }
          const entry=groupedRefs.get(key);
          if(!entry.observed_message_positions.includes(r.position))
            entry.observed_message_positions.push(r.position);
        }else inventory.push({
          filename:a.filename||null,position:r.position,
          type:a.kind||"unknown",preview_embedded:!!a.image_data_uri,
          binary_saved_for_zip:!!a.file_binary_key,original_file_verified:false
        });
      }
    }
    const externalLinks=new Map();
    for(const r of sorted){
      for(const m of (r.html||"").matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi)){
        const href=m[1].replace(/&amp;/g,"&");
        if(/^https?:\/\//i.test(href)&&!href.includes("res.cdn.office.net/files/fabric-cdn"))
          externalLinks.set(href,{url:href,position:r.position,downloaded:false});
      }
    }
    if(!chatTitle.value)chatTitle=getChatTitle();
    const userTitle=chatTitle.value||(prompt(
      UI.title,
      "")||"").trim()||null;
    // Do not cache user-entered names as automatic titles on later exports.
    const duration=Date.now()-startMs;
    const elapsed=Math.floor(duration/60000)+" min "+((duration%60000)/1000).toFixed(1)+" s";
    const contextUnnumbered=c.missing.length>0&&c.missing.length===c.unpositioned_events;
    const meta={
      exporter_version:"6.0.0-rc1",status:!startVerified?"START_UNVERIFIED":c.expected&&c.missing.length===0?"POSITIONS_COMPLETE_CONTENT_UNVERIFIED":contextUnnumbered?"CONTEXT_EVENTS_OBSERVED_POSITIONS_UNVERIFIED":"PARTIAL",
      chat_title:userTitle,chat_title_source:chatTitle.value?chatTitle.source:(userTitle?"user_confirmed":"unavailable"),
      expected_positions:c.expected,captured_positions:c.positioned,missing_positions:c.missing,
      historical_elements_exported:sorted.length,
      accessibility_gaps_explained_by_event_count:!!(c.missing.length&&c.missing.length===c.unpositioned_events),
      start_verified:startVerified,system_events_total:systemMessages.size,
      gaps_equivalent_to_unpositioned_context_events:!!(c.missing.length&&c.missing.length===c.unpositioned_events),
      user_confirmed_start_date:first,user_confirmed_end_date:last,
      earliest_timestamp_inferred:dates[0]||null,latest_timestamp_inferred:dates.at(-1)||null,
      timestamp_note:"13-digit storage ID interpreted as epoch-ms; not independently validated",
      attachment_observations:sorted.reduce((n,r)=>n+(r.attachments||[]).length,0),
      attachments:inventory.length,
      named_attachment_inventory:inventory,
      project_file_group_observations:[...groupedRefs.values()].map(x=>({
        files_reported_per_turn:x.declared_files_per_observation,
        observed_in_turns:x.observed_message_positions.length,
        unique_original_files_confirmed:false
      })),
      external_links_found:externalLinks.size,
      external_links_not_downloaded:[...externalLinks.values()],
      images_embedded:embedded,
      archive_image_policy:{
        html_max_side_px:1600,html_jpeg_quality:0.85,
        zip: "Unresized image bytes as exposed to the browser; original uploaded file not independently verified"
      },
      archive_file_policy:{
        html:"Complete captured conversation with optimized viewable images and document references",
        jsonl:"Message data, metadata and integrity warnings; binary files excluded",
        optional_zip:"Unresized recovered image bytes, chat documents, extracted code blocks and manifest.json; Project-context files only by explicit opt-in",
        local_files_accepted:false,
        project_context_requires_user_consent:true
      },
      project_context_references:sourceInventory,
      project_context_inclusion_requested:includeProjectContext,
      project_context_files_in_zip:sourceDocuments.size,
      sources_panel_references:sourceInventory,
      sources_panel_open_attempts:sourcePanelOpens,
      sources_panel_container_detected:sourcePanelsVisible,
      sources_panel_container_not_detected:sourcePanelDetectionFailures,
      sources_documents_recovered:sourceDocuments.size,
      exportable_code_blocks:codeFiles.length,
      document_bytes_recovered:recoveredDocumentBytes,
      documents_recovered:recoveredDocuments.size,
      document_files_unavailable:sorted.flatMap(r=>(r.attachments||[])
        .filter(a=>a.kind==="file"&&!a.file_binary_key)
        .map(a=>({position:r.position,filename:a.filename||null,status:a.file_recovery_status||"unavailable"}))),
      external_attachment_references:unresolved.length,
      unresolved_attachment_references:unresolved,
      message_type_dictionary:MESSAGE_TYPES.map(x=>({id:x.id,role:x.role})),
      message_type_counts:sorted.reduce((a,r)=>(a[r.message_type||'unclassified']=(a[r.message_type||'unclassified']||0)+1,a),{}),
      system_events_captured:systemRows.length,
      unpositioned_system_events:systemRows.filter(x=>!x.position).length,
      context_events_observed_without_index:c.stable_unindexed_context_count,
      context_position_association_verified:
        sorted.filter(x=>x.role==="context").every(x=>valid(x.position)&&!x.position_is_inferred),
      context_sequence_accounted_for:sorted.filter(x=>x.role==="context").every(x=>valid(x.position)),
      inferred_context_positions:sorted.filter(x=>
        x.role==="context"&&x.position_is_inferred).map(x=>x.position),
      steps:step,scans,mutations,started_at:start,exported_at:new Date().toISOString(),
      elapsed_ms:duration,elapsed_human:elapsed,
      warning:"Index coverage is not a guarantee of full message bodies. Full-content fidelity checks remain necessary before deleting the source."
    };
    const slim=r=>({...r,html:undefined,attachments:(r.attachments||[]).map(a=>{
      const {image_data_uri,file_source_candidates,image_source_url,...safe}=a;
      return {...safe,embedded_in_html:!!image_data_uri,binary_recovered:!!a.file_binary_key};
    })});
    const jsonl=JSON.stringify({type:"metadata",...meta})+"\n"+
      sorted.map((r,i)=>JSON.stringify({order:i+1,...slim(r)})).join("\n")+"\n";
    const style='body{font:14px/1.55 system-ui,sans-serif;max-width:1100px;margin:30px auto;padding:0 14px}article{border:1px solid #ccc;padding:16px;margin:20px 0;min-width:0;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}img{max-width:100%;height:auto}figure{border:1px solid #ddd;padding:12px}article table{display:block;max-width:100%;overflow-x:auto;white-space:nowrap}article pre{max-width:100%;overflow-x:auto}article table th,article table td{border:1px solid #ddd;padding:6px 9px}article table{border-collapse:collapse}article pre.captured-text{white-space:pre-wrap;font:inherit}.archived-code-block{border:1px solid #ddd;border-radius:6px;overflow:hidden;margin:12px 0}.archived-code-language{background:#f6f6f6;padding:7px 12px;color:#444;font-size:12px}.archived-code-block pre.archived-code-text{white-space:pre!important;overflow-wrap:normal!important;word-break:normal!important;overflow-x:auto;margin:0;padding:12px;font:13px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;tab-size:4}.archived-code-warning{color:#8c3b14;font-size:12px;padding:0 12px}';
    const filesList=inventory.length?
      '<ol>'+inventory.map(a=>{
        if(a.type==="file_group")return '<li><b>'+a.declared_files_per_observation+
          ' files with names unavailable</b> — reported in '+a.observed_message_positions.length+
          ' messages (positions '+htmlEscape(a.observed_message_positions.join(", "))+'). '+
          'These may be recurring project-context references; the number of distinct documents is unknown. '+
          'File content NOT embedded.</li>';
        return '<li><b>'+htmlEscape(a.filename||"Unnamed file")+'</b> — position '+htmlEscape(a.position)+
          (a.preview_embedded?' — image saved in HTML; verify visually':
           a.binary_saved_for_zip?' — verified document bytes available in optional ZIP':
           ' — original NOT recovered automatically; save separately')+'</li>';
      }).join('')+'</ol>':
      '<p>No identified named files. This is not proof that no external files exist.</p>';
    const sourcesHTML=sourceInventory.length?
      '<h3>Project context references (not chat attachments)</h3><p>These files are shown by Copilot as Project context, not necessarily chat uploads. Opening a Word Online viewer and downloading an ODT there does not automatically deliver its bytes to this Copilot tab. '+(includeProjectContext?
        'Optional inclusion in ZIP was requested; only validated browser-accessible file bytes can be saved.':
        'They were listed for reference only and were NOT added to the ZIP.')+'</p><ol>'+
      sourceInventory.map(x=>'<li><b>'+htmlEscape(x.title)+'</b> — '+
        (x.bytes_recovered?'binary recovered for ZIP':
          'reference only; original file unavailable')+
        ' (message positions '+htmlEscape(x.positions.join(", "))+')</li>').join('')+'</ol>':
      '<p>No document references captured from Sources panels. Panels opened: '+
      sourcePanelOpens+'; containers detected: '+sourcePanelsVisible+
      '. This is a detection failure or missing accessible markup, NOT proof there were no files.</p>';
    const notice='<section style="border:2px solid #b80;padding:18px;background:#fff9ec">'+
      '<h2>Archive integrity and attachment warning</h2>'+
      '<p><b>Chat title:</b> '+htmlEscape(userTitle||"Could not detect automatically")+'</p>'+
      '<h3>Identified files — individually check before deletion</h3>'+filesList+
      sourcesHTML+
      '<p><b>External links not downloaded:</b> '+externalLinks.size+
      '. These may be ordinary websites, documents, image sources or permission-restricted services.</p>'+
      '<p><b>Total recovery time:</b> '+htmlEscape(elapsed)+'</p>'+
      '<h3>What is saved in each archive file</h3>'+
      '<p><b>HTML:</b> complete captured conversation, diagrams, code and viewable images. Images larger than 1600 pixels are optimized for viewing (JPEG quality target: 85% when applicable).</p>'+
      '<p><b>JSONL:</b> messages, chronology, classifications and integrity metadata without embedded binary payloads.</p>'+
      '<p><b>Optional ZIP:</b> browser-recovered images at their highest available resolution WITHOUT HTML resizing; downloaded Word/Excel/PDF and other verified chat files; code blocks; and manifest.json. Project-context documents are separate and included only after explicit approval, if their file bytes are accessible. No unrelated local files are requested.</p>'+
      '<p><b>ZIP-eligible items:</b> '+originalMedia.size+' distinct browser image payloads, '+
      (recoveredDocuments.size+sourceDocuments.size)+' downloadable document records, '+
      codeFiles.length+' code blocks. Unresolved attachment references: '+unresolved.length+
      '. Additional Sources-panel references not recovered: '+sourceInventory.filter(x=>!x.bytes_recovered).length+'.</p>'+
      '<p>Embedded attachment images: '+embedded+'. Documents with validated bytes available for ZIP: '+
      (recoveredDocuments.size+sourceDocuments.size)+
      '. Linked attachment references NOT embedded in HTML: '+unresolved.length+'. '+
      'If you delete the original conversation or lose access to linked services, referenced documents and files may become unavailable. '+
      'Files only openable in OneDrive/Word Online require independent backup until a verified same-origin-to-Copilot transfer exists. '+
      'Download and save important attachments separately before deleting the original conversation.</p>'+
      '<p>System/context events captured: '+systemRows.length+
      '. Beginning verified: '+(startVerified?'yes':'NO')+
      '. Context events without numeric index: '+c.stable_unindexed_context_count+
      '. Missing accessibility indices: '+(c.missing.join(", ")||"none")+
      (contextUnnumbered?' (number matches observed context events; chronology not independently verified)':
        '. Unexplained indexed gaps: '+(gapsToRecover().join(", ")||"none"))+
      '. Index coverage does not prove that every response is fully rendered. Check important replies before deletion.</p></section>';
    const html='<!doctype html><html><head><meta charset="utf-8"><title>'+htmlEscape(userTitle||"Copilot v6.0.0-rc1 export")+'</title><style>'+style+'</style></head><body><h1>'+htmlEscape(userTitle||"Copilot Thread v6.0.0-rc1")+'</h1>'+notice+
      sorted.map((r,i)=>'<article data-position="'+htmlEscape(r.position)+'"><h3>'+htmlEscape(r.role==="user"?"User":r.role==="assistant"?"Copilot":r.role==="service"?"Copilot · service notice":"Context event")+' <small style="font-weight:normal;color:#777">#'+htmlEscape(r.position||i+1)+'</small></h3><small>'+htmlEscape(r.message_timestamp||"Timestamp unavailable")+'</small>'+
        readableHTML(r)+
        ((r.attachments||[]).length?'<section><h4>Attachments</h4>'+(r.attachments||[]).map(a=>a.kind==="file_group"?
        '<p><b>'+htmlEscape(a.count||"?")+' file references</b> shown by Copilot; names and binaries unavailable. Repeated across turns may refer to the same project files.</p>':
        '<figure><figcaption>'+htmlEscape(a.filename||"Unnamed attachment")+'</figcaption>'+
        (a.image_data_uri?'<img alt="Attached image" src="'+htmlEscape(a.image_data_uri)+'">':
        a.file_binary_key?'<p>Document bytes verified and available in optional ZIP: '+htmlEscape(a.binary_bytes)+' bytes.</p>':
        '<p>Attachment reference only; file content not accessible to exporter</p>')+'</figure>').join('')+'</section>':'')+
        '</article>').join("\n")+'<footer style="margin:38px 0 15px;border-top:1px solid #bbb;padding-top:12px;color:#555;font-size:12px;text-align:center">A service by &copy; <a href="https://github.com/010100100100011001000011" rel="noopener noreferrer" target="_blank"><strong>Teclive</strong></a> that makes your life easier.</footer></body></html>';
    const stamp=new Date().toISOString().replace(/[:.]/g,"-");
    console.log("[v6.0.0-rc1] EXPORT RESULT",meta);
    download(html,"text/html;charset=utf-8","copilot-v6.0.0-rc1_"+stamp+".html");
    await wait(850);
    download(jsonl,"application/x-ndjson;charset=utf-8","copilot-v6.0.0-rc1_"+stamp+".jsonl");
    if(originalMedia.size||recoveredDocuments.size||sourceDocuments.size||codeFiles.length||
       sorted.some(r=>(r.attachments||[]).length)){
      const save=confirm(includeProjectContext?
        "Save optional ZIP with all recoverable chat files PLUS accessible Project-context files in a separate project_context/ folder?":
        UI.zipConfirm);
      if(save){
        const archived=zipFromRecoveredMedia(sorted);
        downloadBlob(archived.blob,"copilot-v6.0.0-rc1_"+stamp+"_attachments.zip");
        console.log("[v6.0.0-rc1] ZIP",archived.images,"images,",archived.documents,
          "documents,",archived.codes,"code blocks,",archived.missing,"unavailable references");
      }
    }
  }catch(e){console.error("[v6.0.0-rc1] Export failed",e);}
  finally{observer?.disconnect();active=false;delete window[guard];}
})();
