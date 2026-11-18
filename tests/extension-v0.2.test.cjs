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
 assert.equal(manifest.unresolved_sources[0].alternative_format_in_zip,archivePath);
 assert.equal(manifest.captured_entries[0].original_file_verified,false);
 assert.equal(manifest.captured_entries[0].sha256,sha256);
 console.log('PASS: one ZIP with HTML+JSONL, ODT bytes, source title match and truthful PARTIAL manifest');
})().catch(e=>{console.error(e);process.exitCode=1});
