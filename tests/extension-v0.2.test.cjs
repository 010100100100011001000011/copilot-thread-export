/* Offline fake-file regression; no private documents, no network. Run with Node 22. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webcrypto,createHash}=require('node:crypto');
(async()=>{
 const dir=path.join(__dirname,'..','extension');
 const m=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
 assert.equal(m.manifest_version,3);
 assert(m.permissions.includes('activeTab')&&!m.permissions.includes('<all_urls>'));
 for(const f of ['popup.js','background.js','office-hook.js','office-relay.js','copilot-exporter-extension.v0.2.js']){
   new (require('node:vm').Script)(fs.readFileSync(path.join(dir,f),'utf8'),{filename:f});
 }
 const s=fs.readFileSync(path.join(dir,'copilot-exporter-extension.v0.2.js'),'utf8');
 // Regression from real Avast tests: a Copilot quota/error banner at the
 // physical end must stop the crawl, not trigger scrollIntoView oscillation.
 const stopStart=s.indexOf('function forwardStopDecision(');
 const stopEnd=s.indexOf('const terminalMessagePattern=',stopStart);
 assert(stopStart>0&&stopEnd>stopStart);
 const shouldStop=new Function(s.slice(stopStart,stopEnd)+';return forwardStopDecision;')();
 assert.equal(shouldStop({seenExpected:true,terminalNotice:false,atBottom:false,noIndexProgress:4}),
   'last_accessibility_index_stable');
 assert.equal(shouldStop({seenExpected:false,terminalNotice:true,atBottom:true,noIndexProgress:4}),
   'terminal_service_notice_at_boundary');
 assert.equal(shouldStop({seenExpected:false,terminalNotice:true,atBottom:false,noIndexProgress:4}),null,
   'Mid-thread service notices must not end traversal.');
 assert.equal(shouldStop({seenExpected:false,terminalNotice:false,atBottom:true,noIndexProgress:25}),null);
 assert.equal(shouldStop({seenExpected:false,terminalNotice:false,atBottom:true,noIndexProgress:26}),
   'indexed_frontier_stalled');
 const patternStart=s.indexOf('const terminalMessagePattern='), patternEnd=s.indexOf('function terminalNoticeVisible()',patternStart);
 const terminalPattern=new Function(s.slice(patternStart,patternEnd)+';return terminalMessagePattern;')();
 assert(terminalPattern.test('Non è stato possibile generare una risposta. Invia un nuovo prompt'));
 assert(terminalPattern.test('Vous avez atteint la limite quotidienne. Obtenez plus de capacité'));
 assert(!terminalPattern.test('La funzione VBA è stata aggiornata con successo.'));
 const moveStart=s.indexOf('function move('),moveEnd=s.indexOf('// Sources/Origini',moveStart);
 assert(moveStart>0&&moveEnd>moveStart);
 let pulledBack=0;
 const host={scrollTop:800,scrollHeight:1000,clientHeight:200,
   scrollBy(){/* browser refuses scrolling past the end */}};
 const edge=()=>({scrollIntoView(){pulledBack++;}});
 const move=new Function('scrollHost','cfg','edge','list',
   s.slice(moveStart,moveEnd)+';return move;')(
   ()=>host,{step:135},edge,{scrollTop:0,scrollIntoView(){pulledBack++;}});
 move(1);
 assert.equal(pulledBack,0,'Do not scrollIntoView last indexed message at bottom');
 // This same fallback was also incorrect when at physical top.
 host.scrollTop=0;
 move(-1);
 assert.equal(pulledBack,0,'Do not scrollIntoView first indexed message at top');
 const start=s.indexOf('async function zipFromRecoveredMedia(');
 const end=s.indexOf('function downloadBlob(',start);
 assert(start>0&&end>start);
 const body=s.slice(start,end);
 const fixture=Buffer.from('UEsDBBQAAAAAAKKtcl1exjIMJwAAACcAAAAIAAAAbWltZXR5cGVhcHBsaWNhdGlvbi92bmQub2FzaXMub3BlbmRvY3VtZW50LnRleHRQSwMEFAAAAAAAoq1yXTFGq2oaAAAAGgAAAAsAAABjb250ZW50LnhtbDxvZmZpY2U6ZG9jdW1lbnQtY29udGVudC8+UEsBAhQDFAAAAAAAoq1yXV7GMgwnAAAAJwAAAAgAAAAAAAAAAAAAAIABAAAAAG1pbWV0eXBlUEsBAhQDFAAAAAAAoq1yXTFGq2oaAAAAGgAAAAsAAAAAAAAAAAAAAIABTQAAAGNvbnRlbnQueG1sUEsFBgAAAAACAAIAbwAAAJAAAAAAAA==','base64');
 const sha256=createHash('sha256').update(fixture).digest('hex');
 const filename='Test Book_ Local It Poland_BN_v02.odt';
 const item={id:'odt_'+sha256,name:filename,size:fixture.length,sha256,capturedAt:'2026-11-18T18:00:00Z'};
 const refs=new Map([['ref',{title:'Test Book_ Local It Poland_BN_v02',positions:[429],bytes_recovered:false,recovery_status:'reference_only'}]]);
 const chrome={storage:{local:{async get(key){if(key==='capturedIndex')return {capturedIndex:[item]};if(key===item.id)return {[key]:fixture.toString('base64')};throw Error('Unexpected get');}}}};
 const make=new Function('originalMedia','recoveredDocuments','sourceDocuments','sourceObservations','codeFiles','extensionMode','chrome','crypto','TextEncoder','TextDecoder','Blob','atob',body+'\nreturn zipFromRecoveredMedia;');
 const zip=make(new Map(),new Map(),new Map(),refs,[],true,chrome,webcrypto,TextEncoder,TextDecoder,Blob,atob);
 const result=await zip([],{html:'<!doctype html><title>Test</title>',jsonl:'{"type":"metadata"}\n',status:'PARTIAL',missing_positions:3,start_verified:false,budget_exceeded:true});
 const bytes=new Uint8Array(await result.blob.arrayBuffer()),view=new DataView(bytes.buffer),entries=new Map();let i=0;
 while(i+30<=bytes.length&&view.getUint32(i,true)===0x04034b50){
  assert.equal(view.getUint16(i+8,true),0,'ZIP STORE');
  const n=view.getUint16(i+26,true),e=view.getUint16(i+28,true),length=view.getUint32(i+18,true);
  const name=new TextDecoder().decode(bytes.slice(i+30,i+30+n));
  entries.set(name,Buffer.from(bytes.slice(i+30+n+e,i+30+n+e+length)));
  i+=30+n+e+length;
 }
 assert(entries.has('conversation.html')&&entries.has('conversation.jsonl'));
 const archivePath='project_context/word_online/'+filename;
 assert.deepEqual(entries.get(archivePath),fixture);
 const manifest=JSON.parse(entries.get('manifest.json').toString());
 assert.equal(manifest.recovered_office_odt_alternatives,1);
 assert.equal(manifest.conversation_files_in_zip,true);
 assert.equal(manifest.conversation_capture_status,'PARTIAL');
 assert.equal(manifest.conversation_missing_position_count,3);
 assert.equal(manifest.export_time_budget_exceeded,true);
 assert.equal(manifest.terminal_service_end_observed,false);
 assert.equal(manifest.unresolved_sources[0].alternative_format_in_zip,archivePath);
 assert.equal(manifest.captured_entries[0].original_file_verified,false);
 assert.equal(manifest.captured_entries[0].sha256,sha256);
 console.log('PASS: ZIP/ODT validation + terminal service boundary / no-bounce traversal regression');
})().catch(e=>{console.error(e);process.exitCode=1});
