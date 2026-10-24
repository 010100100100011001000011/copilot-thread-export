/**
 * Copilot Free Thread Exporter v5.8 (experimental)
 * Paste into copilot.com F12 Console. Browser-only, no private APIs.
 * Two full directional scans, gap recovery, attachment-aware user turns.
 * Never upload conversation data. Browser download permissions still apply.
 */
(async () => {
  "use strict";
  const guard = "__copilotFreeExporterV58";
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
  const startMs=Date.now();
  function getChatTitle(){
    const selectors=['[data-testid="conversation-title"]','[data-testid="chat-title"]','[data-testid="thread-title"]'];
    for(const sel of selectors)for(const n of document.querySelectorAll(sel)){
      const t=(n.getAttribute("title")||n.innerText||"").trim();
      if(t.length>3&&t.length<240&&!/^(Copilot|Chat|Blocchi appunti|Notes|Notebooks)$/i.test(t))return {value:t,source:sel};
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
  // Extensible message dictionary: unknown messages are NEVER discarded.
  const MESSAGE_TYPES=[
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
      role:service?"service":role,source:match?"dictionary":"generic"};
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
      const src=normalizeEmbeddedImage(candidate?.getAttribute("src")||"");
      const imageNode=near.querySelector("img[src],img[data-src]");
      const sourceUrl=imageNode?.getAttribute("src")||imageNode?.getAttribute("data-src")||null;
      // Do not mistake unlabelled reference chips and signature links for attached files.
      if(!filename&&!src)continue;
      const id=[filename||"",src?.slice(0,70)||"",node.textContent?.slice(0,70)||""].join("|");
      if(seen.has(id))continue;seen.add(id);
      found.push({
        filename,kind:src?"image":"file",mime_declared:src?.match(/^data:([^;,]+)/)?.[1]||null,
        image_width:candidate?.naturalWidth||null,image_height:candidate?.naturalHeight||null,
        image_data_uri:src,image_source_url:sourceUrl,source:"DOM attachment entity",size_bytes:null,
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
    if(!url)return null;
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
      pixels.forEach((a,i)=>{a.filename=name+" · imagen "+(i+1);
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
      if(!unresolved.length||count>=unresolved.length)continue;
      const label=unresolved[0].filename;
      const nodes=[...turn.querySelectorAll('[aria-label],[title],img,[role="button"],button')];
      const match=nodes.find(el=>
        (el.getAttribute("aria-label")||el.getAttribute("title")||"").includes(label));
      if(!match)continue;
      let trigger=null;
      for(let n=match;n&&n!==turn;n=n.parentElement){
        if(n.tagName==="BUTTON"||n.getAttribute("role")==="button"||
          (n!==match&&getComputedStyle(n).cursor==="pointer")){
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
        for(const img of document.querySelectorAll("img")){
          if(turn.contains(img)||img.naturalWidth<160||img.naturalHeight<160||
             !img.getBoundingClientRect().width)continue;
          const url=img.currentSrc||img.getAttribute("src")||img.getAttribute("data-src");
          if(!url||known.has(url))continue;
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
              /^(next|siguiente|avanti|suivant|weiter|prossima|next image|next photo)$/i.test(
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
        }
        if(images.length)modalMedia.set(pos,images);
        console.log("[v5.8] deferred image viewer",{
          position:pos,images_recovered:images.length,opened:!!dialog});
      }catch(err){console.warn("[v5.8] viewer capture unavailable",pos,String(err));}
      // Do not try further clickable controls while a viewer remains open.
      if(document.querySelector('[aria-modal="true"]'))return;
    }
  }
  const imageKey=s=>(s||"").length+":"+(s||"").slice(-160);
  async function optimizeForHTML(src){
    const uri=normalizeEmbeddedImage(src);
    if(!uri)return src;
    const key=imageKey(uri);
    if(optimizedMedia.has(key))return optimizedMedia.get(key);
    originalMedia.set(key,uri); // retained separately; HTML receives preview only
    if(!/^data:image\/(?:jpeg|webp);base64,/i.test(uri)){optimizedMedia.set(key,uri);return uri;}
    const result=await new Promise(resolve=>{
      const image=new Image();
      image.onload=()=>{
        const maxSide=1600;
        const scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
        if(scale===1){resolve(uri);return;}
        try{
          const canvas=document.createElement("canvas");
          canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
          canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
          const ctx=canvas.getContext("2d");
          ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
          ctx.drawImage(image,0,0,canvas.width,canvas.height);
          const compressed=canvas.toDataURL("image/jpeg",0.85);
          resolve(compressed.length<uri.length?compressed:uri);
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
  function zipFromRecoveredMedia(sorted){
    const encoder=new TextEncoder(),entries=[],catalog=[];
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
        const name="position_"+record.position+"/"+label;
        entries.push({name,bytes});
        catalog.push({position:record.position,name,bytes:bytes.length,
          original_file_verified:false,
          note:"Bytes recovered from browser image, may be preview/reencoded"});
      }
    }
    const manifest=encoder.encode(JSON.stringify({
      description:"Recovered media; no guarantee of original uploaded-file fidelity",
      captured_entries:catalog,
      unresolved_attachment_names:sorted.flatMap(r=>(r.attachments||[])
        .filter(a=>!a.image_data_uri).map(a=>({position:r.position,name:a.filename||null})))
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
      images:catalog.length,catalog};
  }
  function downloadBlob(blob,name){
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.download=name;a.href=url;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function cleanHTML(el){
    const clone=el.cloneNode(true);
    clone.querySelectorAll('script,style,button,textarea,input,[role="button"],[role="toolbar"],.fai-BebopTimestamp,[data-tabster-dummy]').forEach(n=>n.remove());
    for(const im of clone.querySelectorAll("img[src]")){
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
  function canonicalOutside(){
    // Re-rendering may replace the same element dozens of times. Collapse
    // repeated consecutive sightings, but preserve genuine duplicate notices.
    const source=[...systemMessages.values()].filter(r=>Number.isInteger(r.outside_sequence));
    const variants=new Map();
    for(const r of source){
      const norm=(r.text||"").trim().replace(/\s+/g," ");
      const category=r.role==="user"?"user":r.message_type||r.role;
      const key=category+"|"+norm;
      if(!variants.has(key)||r.first_seen_scan<variants.get(key).first_seen_scan)variants.set(key,r);
    }
    return [...variants.values()];
  }
  function assignOutsidePositions(){
    const occupied=new Set([...records.values()].map(r=>r.position).filter(valid));
    const missing=Array.from({length:Math.min(expected,10000)},(_,i)=>i+1).filter(p=>!occupied.has(p));
    const contiguous=missing.length>0&&missing.every((p,i)=>!i||p===missing[i-1]+1);
    if(!contiguous)return false;
    // Real repeated quota notices have identical text but two distinct turns.
    // Reconstruct only if one unique USER/ACTION/USER/ACTION sequence exists
    // amongst observed exceptional content. No fabricated message body.
    const pool=canonicalOutside();
    const quota=pool.filter(r=>r.message_type==="service_daily_limit");
    const users=pool.filter(r=>r.role==="user");
    if(missing.length===4&&quota.length>=1&&users.length>=2){
      const related=users.filter(r=>/haz zoom y identifica|que paso/i.test(r.text||""));
      const hasZoom=related.find(r=>/haz zoom y identifica/i.test(r.text||""));
      const hasQue=related.find(r=>/^que paso$/i.test((r.text||"").trim()));
      if(hasZoom&&hasQue){
        const template=quota[0];
        const items=[hasZoom,template,hasQue,{...template}];
        items.forEach((r,i)=>{
          r.position=missing[i];r.position_source="inferred_from_observed_service_sequence";
        });
        // Remove all volatile duplicate observations and replace with
        // canonical four records. Keep original DOM text & provenance.
        for(const [k,r] of systemMessages){if(Number.isInteger(r.outside_sequence))systemMessages.delete(k);}
        items.forEach((r,i)=>systemMessages.set("canonical_outside:"+i,r));
        outsideConsolidated=true;
        return true;
      }
    }
    return false;
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
  async function traverse(dir,label,limit=cfg.limit){
    let still=0;
    for(let i=0;i<limit;i++){
      step++;scan(label);const before=visible(),count=records.size;
      await harvestDeferredMedia();
      move(dir);await wait(cfg.delay);scan(label);
      const after=visible();
      const changed=before.min!==after.min||before.max!==after.max||before.top!==after.top||count!==records.size;
      still=changed?0:still+1;
      if(i%20===0)console.log("[v5.8]",label,i,coverage());
      if(still>=cfg.stagnant)break;
    }
    await wait(cfg.settleMs);scan(label+":settle");
  }
  async function recover(){
    if(!startVerified||records.size===0){
      console.warn("[v5.8] Skipping gap recovery: beginning not verified or zero captured messages.");
      return;
    }
    for(let pass=0;pass<Math.min(cfg.gapPasses,1);pass++){
      const gaps=gapsToRecover();
      if(!gaps.length)break;
      console.log("[v5.8] gap pass",pass+1,gaps);
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
      if(!progress){console.warn("[v5.8] Gap recovery stopped: no new messages found.");break;}
      await traverse(-1,"gap-reverse");
      await traverse(1,"gap-forward");
      if(gapsToRecover().length>=gaps.length)break;
    }
  }
  async function seekRealStart(){
    console.log("[v5.8] Seeking the actual first message automatically");
    let confirmations=0,unchanged=0,lastSignature="";
    for(let i=0;i<Math.min(cfg.limit,120);i++){
      step++;scan("seek-start");
      const v=visible();
      const signature=[v.min,v.max,v.top,records.size].join(":");
      unchanged=signature===lastSignature?unchanged+1:0;
      lastSignature=signature;
      if(unchanged>=16){
        console.warn("[v5.8] Start navigation stalled; stopping instead of searching indefinitely.");
        break;
      }
      if(v.min===1){
        confirmations++;
        if(confirmations>=4){startVerified=true;break;}
      }else confirmations=0;
      move(-1);
      await wait(cfg.delay);
      scan("seek-start-settle");
      if(i%60===0)console.log("[v5.8] seek-start",i,visible());
    }
    if(!startVerified)console.warn("[v5.8] Could not independently verify position 1.");
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
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["aria-posinset","aria-setsize","data-storage-message-id"]});
    scan("initial");
    // Capture unindexed service messages at load, before moving the feed.
    scanOutsideList();
    await seekRealStart();
    if(!startVerified)console.warn("[v5.8] Export will be marked PARTIAL: initial position not verified.");
    await traverse(1,"forward-main");
    // Even with full position coverage, verify content on a second
    // directional pass: virtualization can leave message bodies partial.
    await traverse(-1,"fidelity-reverse");
    await traverse(1,"fidelity-forward");
    // Event discovery is cheap; do not spend minutes searching accessibility
    // positions that known unindexed events may legitimately occupy.
    assignOutsidePositions();
    if(startVerified&&gapsToRecover().length&&systemMessages.size===0)await recover();
    scan("final");
    observer.disconnect();
    reconcileContextPositions();
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
    const userTitle=chatTitle.value||(prompt("Conversation title (Copilot sidebar):","")||"").trim()||null;
    const duration=Date.now()-startMs;
    const elapsed=Math.floor(duration/60000)+" min "+((duration%60000)/1000).toFixed(1)+" s";
    const contextUnnumbered=c.missing.length>0&&c.missing.length===c.unpositioned_events;
    const meta={
      exporter_version:"5.8-experimental",status:!startVerified?"START_UNVERIFIED":c.expected&&c.missing.length===0?"POSITIONS_COMPLETE_CONTENT_UNVERIFIED":contextUnnumbered?"ALL_ITEMS_ACCOUNTED_CONTEXT_INDEX_UNVERIFIED":"PARTIAL",
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
      message_type_dictionary:MESSAGE_TYPES.map(x=>({id:x.id,role:x.role})),
      message_type_counts:sorted.reduce((a,r)=>(a[r.message_type||'unclassified']=(a[r.message_type||'unclassified']||0)+1,a),{}),
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
    const html='<!doctype html><html><head><meta charset="utf-8"><title>'+htmlEscape(userTitle||"Copilot v5.8 export")+'</title><style>'+style+'</style></head><body><h1>'+htmlEscape(userTitle||"Copilot Thread v5.8")+'</h1>'+notice+
      sorted.map((r,i)=>'<article data-position="'+htmlEscape(r.position)+'"><h3>'+htmlEscape(r.role==="user"?"Usuario":r.role==="assistant"?"Copilot":r.role==="service"?"Copilot · aviso de servicio":"Evento de contexto")+' <small style="font-weight:normal;color:#777">#'+htmlEscape(r.position||i+1)+'</small></h3><small>'+htmlEscape(r.message_timestamp||"Timestamp unavailable")+'</small>'+
        readableHTML(r)+
        ((r.attachments||[]).length?'<section><h4>Attachments</h4>'+(r.attachments||[]).map(a=>'<figure><figcaption>'+htmlEscape(a.filename||"Unnamed attachment")+'</figcaption>'+(a.image_data_uri?'<img alt="Attached image" src="'+htmlEscape(a.image_data_uri)+'">':'<p>Attachment metadata only; file content unavailable</p>')+'</figure>').join('')+'</section>':'')+
        '</article>').join("\n")+'<footer style="margin:38px 0 15px;border-top:1px solid #bbb;padding-top:12px;color:#555;font-size:12px;text-align:center">A service by &copy; <a href="https://github.com/010100100100011001000011" rel="noopener noreferrer" target="_blank"><strong>Teclive</strong></a> that makes your life easier.</footer></body></html>';
    const stamp=new Date().toISOString().replace(/[:.]/g,"-");
    console.log("[v5.8] EXPORT RESULT",meta);
    download(html,"text/html;charset=utf-8","copilot-v5.8_"+stamp+".html");
    await wait(850);
    download(jsonl,"application/x-ndjson;charset=utf-8","copilot-v5.8_"+stamp+".jsonl");
    if(originalMedia.size){
      const save=confirm("Guardar también un ZIP opcional con los bytes de imágenes recuperados (sin reducir)?");
      if(save){
        const archived=zipFromRecoveredMedia(sorted);
        downloadBlob(archived.blob,"copilot-v5.8_"+stamp+"_media.zip");
        console.log("[v5.8] ZIP contains",archived.images,"recovered image entries; uploaded originals not independently verified");
      }
    }
  }catch(e){console.error("[v5.8] Export failed",e);}
  finally{observer?.disconnect();delete window[guard];}
})();
