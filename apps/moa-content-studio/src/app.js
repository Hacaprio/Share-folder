import {DEFAULTS,validateSettings,dimensions,outputNames,safeName,bytes,newProject} from './core.js';
import {saveProject,getLastProject,getProject,projectList,savePresets,getPresets} from './storage.js';
import {Processor} from './processor.js';
import {makeZip,readZip} from './zip.js';
import {decode} from './render.js';
const $=s=>document.querySelector(s),state={project:newProject(),selected:null,history:[],results:[],busy:false,ingesting:false,cancel:false,presets:[],original:false,ready:false,job:null,settingsError:''};
const urls=new Map(),downloads=new Map(),processor=new Processor(),previewProcessor=new Processor();
let saveTimer,previewTimer,previewURL,previewVersion=0,toastTimer,saveQueue=Promise.resolve(),persistFailed=false,previewRunning=false,previewRequested=false;
function toast(message,error=false){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.toggle('error',error);$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,error?8000:4300);}
function saveLabel(text,error=false){$('#save-state').textContent=text;$('#save-state').classList.toggle('error',error);}
function snapshot(){return {...state.project,settings:{...state.project.settings},assets:[...state.project.assets]};}
function remember(){state.history.push(snapshot());if(state.history.length>25)state.history.shift();$('#undo').disabled=false;}
function persist(immediate=false){
 clearTimeout(saveTimer);saveLabel('저장 중…');
 const enqueue=()=>{const project=snapshot();saveQueue=saveQueue.catch(()=>{}).then(()=>saveProject(project)).then(()=>{persistFailed=false;if(state.project.id===project.id&&state.project.revision===project.revision)saveLabel('이 기기에 자동 저장됨');refreshRecent();}).catch(error=>{persistFailed=true;saveLabel('자동 저장 실패 · 프로젝트 저장 필요',true);toast('자동 저장을 하지 못했습니다. 프로젝트 저장 버튼으로 백업해 주세요. '+(error.name==='QuotaExceededError'?'저장 공간이 부족합니다.':error.message),true);});return saveQueue;};
 if(immediate)return enqueue();saveTimer=setTimeout(enqueue,300);
}
function changed(){state.project.revision++;state.project.updatedAt=new Date().toISOString();clearResults();persist();requestPreview();updateNames();updateButtons();}
async function refreshRecent(){try{const rows=await projectList();$('#recent-projects').replaceChildren(new Option('최근 작업',''),...rows.map(p=>new Option(p.name,p.id)));}catch{}}
function assetURL(a){if(!urls.has(a.id))urls.set(a.id,URL.createObjectURL(a.thumbnail||a.blob));return urls.get(a.id);}
function revokeAssets(){for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();}
function clearResults(){for(const url of downloads.values())URL.revokeObjectURL(url);downloads.clear();state.results=[];state.job=null;$('#results-section').hidden=true;$('#result-list').replaceChildren();}
function updateButtons(){const locked=state.busy||state.ingesting||!state.ready;for(const id of ['add-files','sort-files','clear-files','new-project','import-project','export-project','recent-projects','undo','demo'])$("#"+id).disabled=locked;$('#undo').disabled=locked||!state.history.length;$('#project-name').disabled=locked;
 for(const el of $('#settings-form').elements)el.disabled=locked;
 $('#run').disabled=locked||!state.project.assets.length||!!state.settingsError;$('#run').innerHTML=state.busy?'이미지를 만드는 중…':`이미지 ${state.project.assets.length?state.project.assets.length+'개 ':''}만들기 <span>→</span>`;
 $('#cancel').disabled=!state.busy;$('#cancel').hidden=!state.busy;$('#cancel').textContent=state.cancel?'현재 파일 처리 후 취소합니다…':'작업 취소';
 $('#drop-zone').classList.toggle('busy',locked);$('#drop-zone').setAttribute('aria-disabled',String(locked));
 for(const el of $('#asset-grid').querySelectorAll('button'))el.disabled=locked;
 $('#download-zip').disabled=state.busy||state.ingesting||!state.results.some(r=>r.status==='completed');$('#download-manifest').disabled=state.busy||state.ingesting||!state.job;
 $('#retry-failed').hidden=state.busy||state.ingesting||!!state.settingsError||!state.results.some(r=>r.status==='failed');
}
function renderSettings(){state.settingsError='';$('#settings-error').hidden=true;for(const key of Object.keys(DEFAULTS)){const el=$(`#settings-form [name="${key}"]`);if(el.type==='checkbox')el.checked=state.project.settings[key];else el.value=state.project.settings[key];}$('#project-name').value=state.project.name;settingHints();}
function settingHints(){const s=state.project.settings;$('#quality-value').textContent=s.quality+'%';$('#opacity-value').textContent=s.watermarkOpacity+'%';$('#background-value').textContent=s.background.toUpperCase();$('#watermark-options').hidden=!s.watermarkEnabled;$('#watermark-hint').hidden=s.watermarkEnabled;$('#quality-field').hidden=s.format==='image/png';$('#target-size').disabled=state.busy||s.resizeMode==='original';}
function updateNames(){let names;try{names=outputNames(state.project.assets,state.project.settings);}catch{return;}$('#filename-example').textContent=names[0]||outputNames([{name:'상품사진.png'}],state.project.settings)[0];for(const el of $('#asset-grid').querySelectorAll('[data-output]'))el.textContent=names[Number(el.dataset.output)];}
function renderAssets(){
 const assets=state.project.assets;$('#asset-count').textContent=assets.length;$('#asset-summary').textContent=assets.length?`${assets.length}개 파일 · ${bytes(assets.reduce((n,a)=>n+a.blob.size,0))} · 원본 보존`:'추가한 파일은 이 브라우저에 자동으로 보관됩니다.';$('#clear-files').hidden=!assets.length;$('#drop-zone').classList.toggle('compact',!!assets.length);
 $('#asset-grid').replaceChildren(...assets.map((a,i)=>{const card=document.createElement('div');card.className='asset-card'+(a.id===state.selected?' selected':'');const button=document.createElement('button');button.className='asset-select';button.setAttribute('aria-label',a.name+' 선택');const img=document.createElement('img');img.src=assetURL(a);img.alt='';img.loading='lazy';const title=document.createElement('strong');title.dataset.output=i;title.title=a.name;const info=document.createElement('small');info.textContent=`${a.width} × ${a.height} · ${bytes(a.blob.size)}`;button.append(img,title,info);button.onclick=()=>{state.selected=a.id;renderAssets();requestPreview();};const remove=document.createElement('button');remove.className='remove';remove.textContent='×';remove.setAttribute('aria-label',a.name+' 삭제');remove.onclick=()=>{if(state.busy||state.ingesting)return;remember();state.project.assets=assets.filter(x=>x.id!==a.id);if(state.selected===a.id)state.selected=state.project.assets[0]?.id||null;changed();renderAssets();};card.append(button,remove);return card;}));updateNames();$('#preview-section').hidden=!assets.length;updateButtons();
}
function renderAll(){renderSettings();renderAssets();updateButtons();settingHints();requestPreview();}
function requestPreview(){previewVersion++;clearTimeout(previewTimer);previewTimer=setTimeout(()=>{previewRequested=true;previewLoop();},220);}
async function previewLoop(){
 if(previewRunning)return;previewRunning=true;
 while(previewRequested){previewRequested=false;const token=previewVersion,a=state.project.assets.find(a=>a.id===state.selected);if(!a){$('#preview-section').hidden=true;continue;}$('#preview-section').hidden=false;$('#preview-loading').hidden=false;
 try{const s=validateSettings(state.project.settings);let result;
 if(state.original)result={blob:a.blob,width:a.width,height:a.height};else result=await previewProcessor.render(a.blob,s);
 if(token!==previewVersion)continue;const url=URL.createObjectURL(result.blob);if(previewURL)URL.revokeObjectURL(previewURL);previewURL=url;$('#preview-image').src=url;$('#preview-image').alt=state.original?'선택한 원본 이미지':'설정을 적용한 이미지';$('#preview-name').textContent=state.original?a.name:outputNames(state.project.assets,s)[state.project.assets.indexOf(a)];$('#preview-info').textContent=`${result.width} × ${result.height}px · ${bytes(result.blob.size)}`;
 }catch(error){if(token===previewVersion){$('#preview-info').textContent=error.message;$('#preview-image').removeAttribute('src');$('#preview-name').textContent=a.name;}}
 finally{if(token===previewVersion)$('#preview-loading').hidden=true;}
 }previewRunning=false;
}
function readSettings(){const raw={};for(const key of Object.keys(DEFAULTS)){const el=$(`#settings-form [name="${key}"]`);if(typeof DEFAULTS[key]==='number'&&el.value==='')throw Error('숫자 설정을 모두 입력하세요.');raw[key]=el.type==='checkbox'?el.checked:typeof DEFAULTS[key]==='number'?Number(el.value):el.value;}return raw;}
async function inspectFile(blob,name){
 if(blob.size>40*1024*1024)throw Error('한 파일은 40MB 이하로 추가해 주세요.');if(!/\.(jpe?g|png|webp)$/i.test(name)&&!['image/jpeg','image/png','image/webp'].includes(blob.type))throw Error('JPG·PNG·WebP 파일만 지원합니다.');
 let bitmap;try{bitmap=await decode(blob);}catch{throw Error('이미지를 읽지 못했습니다. 파일이 손상되었거나 지원하지 않는 형식입니다.');}try{if(bitmap.width*bitmap.height>100_000_000)throw Error('원본은 1억 픽셀 이하만 지원합니다.');const ratio=Math.min(1,320/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));const ctx=canvas.getContext('2d');ctx.fillStyle='#f2f4f4';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap.image||bitmap,0,0,canvas.width,canvas.height);const thumbnail=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.75));return {id:crypto.randomUUID(),name,blob,thumbnail,width:bitmap.width,height:bitmap.height};}finally{bitmap.close?.();}
}
async function addFiles(files){
 if(state.busy||state.ingesting||!state.ready)return;const list=[...files];if(!list.length)return;const currentBytes=state.project.assets.reduce((n,a)=>n+a.blob.size,0);if(list.length+state.project.assets.length>100){toast('한 프로젝트에 최대 100장을 추가할 수 있습니다.',true);return;}if(list.reduce((n,f)=>n+f.size,currentBytes)>500*1024*1024){toast('파일 합계는 500MB 이하여야 합니다.',true);return;}
 state.ingesting=true;remember();updateButtons();const errors=[];let added=0;
 try{for(const file of list){try{const asset=await inspectFile(file,file.name||'붙여넣기.png');state.project.assets.push(asset);state.selected||=asset.id;added++;}catch(error){errors.push(file.name+': '+error.message);}}if(added){changed();renderAssets();await persist(true);}toast(errors.length?`${added}개 추가 · ${errors.length}개 제외. ${errors[0]}`:`${added}개 파일을 추가했습니다.`,!!errors.length);}
 finally{state.ingesting=false;updateButtons();settingHints();$('#file-input').value='';}
}
function manifest(){return {schemaVersion:1,application:'moa-content-studio',projectId:state.project.id,projectName:state.project.name,projectRevision:state.job?.revision,createdAt:state.job?.createdAt,settings:state.job?.settings,status:state.job?.status,outputs:state.results.map(({blob,...r})=>r)};}
function renderResults(){
 $('#results-section').hidden=false;const counts=state.results.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{});$('#job-summary').textContent=`완료 ${counts.completed||0} · 실패 ${counts.failed||0} · 대기 ${counts.queued||0}${state.job?.status==='cancelled'?' · 작업 취소됨':''}`;
 const total=state.results.length,done=state.results.filter(r=>r.status!=='queued'&&r.status!=='running').length;$('#job-progress').value=total?done/total*100:0;
 $('#result-list').replaceChildren(...state.results.map(r=>{const row=document.createElement('div');row.className='result-row '+r.status;const mark=document.createElement('span');mark.textContent={completed:'✓',failed:'!',queued:'·',running:'◌',cancelled:'−'}[r.status];const name=document.createElement('span');name.className='result-name';name.textContent=r.filename;const info=document.createElement('small');info.textContent=r.error||{completed:`${r.width}×${r.height} · ${bytes(r.byteSize||0)}`,queued:'대기',running:'처리 중',cancelled:'취소'}[r.status];row.append(mark,name,info);if(r.blob){let url=downloads.get(r.assetId);if(!url){url=URL.createObjectURL(r.blob);downloads.set(r.assetId,url);}const a=document.createElement('a');a.href=url;a.download=r.filename;a.textContent='저장 ↓';row.append(a);}return row;}));updateButtons();
}
async function runJob(retry=false){
 if(state.busy||state.ingesting||!state.project.assets.length)return;let settings;try{settings=validateSettings(readSettings());}catch(error){toast(error.message,true);return;}
 state.busy=true;state.cancel=false;updateButtons();await persist(true);
 if(!retry){clearResults();const names=outputNames(state.project.assets,settings);state.results=state.project.assets.map((a,i)=>({assetId:a.id,sourceName:a.name,filename:names[i],status:'queued'}));state.job={revision:state.project.revision,settings,createdAt:new Date().toISOString(),status:'running'};}else {for(const r of state.results)if(r.status==='failed'){r.status='queued';delete r.error;}state.job.status='running';}
 updateButtons();renderResults();
 try{for(const r of state.results){if(r.status!=='queued')continue;if(state.cancel)break;r.status='running';renderResults();try{const asset=state.project.assets.find(a=>a.id===r.assetId);const result=await processor.render(asset.blob,settings);Object.assign(r,{...result,status:'completed',byteSize:result.blob.size});}catch(error){r.status='failed';r.error=error.message;}renderResults();await new Promise(resolve=>setTimeout(resolve,0));}
 if(state.cancel){for(const r of state.results)if(r.status==='queued')r.status='cancelled';state.job.status='cancelled';}else state.job.status=state.results.some(r=>r.status==='failed')?'failed':'completed';
 toast(state.cancel?'현재 파일까지 처리하고 작업을 취소했습니다.':state.results.some(r=>r.status==='failed')?'일부 파일을 처리하지 못했습니다. 오류를 확인하고 재시도하세요.':'이미지가 준비됐습니다. 개별 파일 또는 ZIP으로 저장하세요.',state.job.status==='failed');
 }finally{state.busy=false;renderResults();settingHints();}
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function withBusy(action){if(state.busy||state.ingesting)return;state.ingesting=true;updateButtons();try{await action();}catch(error){toast(error.message,true);}finally{state.ingesting=false;updateButtons();settingHints();}}
async function exportProject(){await withBusy(async()=>{const p=snapshot(),data={...p,application:'moa-content-studio',assets:p.assets.map(({blob,thumbnail,...a},i)=>({...a,path:`assets/${i}`,mimeType:blob.type}))};const entries=p.assets.map((a,i)=>({name:`assets/${i}`,blob:a.blob}));entries.unshift({name:'project.json',blob:new Blob([JSON.stringify(data)],{type:'application/json'})});toast('프로젝트 파일을 준비하고 있습니다.');download(await makeZip(entries),safeName(p.name)+'.moa');toast('원본과 편집 설정을 프로젝트 파일로 저장했습니다.');});}
async function importProject(file){if(!file)return;await withBusy(async()=>{
 const archive=await readZip(file),json=archive.get('project.json');if(!json||json.size>2*1024*1024)throw Error('프로젝트 정보가 없거나 너무 큽니다.');let p;try{p=JSON.parse(await json.text());}catch{throw Error('프로젝트 정보를 읽을 수 없습니다.');}
 if(p.application!=='moa-content-studio'||p.schemaVersion!==1)throw Error('지원하지 않는 프로젝트 버전입니다. 버전 1 파일을 선택하세요.');
 if(typeof p.name!=='string'||p.name.length>80||!Array.isArray(p.assets)||p.assets.length>100)throw Error('프로젝트 정보가 올바르지 않습니다.');
 const settings=validateSettings(p.settings),assets=[],paths=new Set();let total=0;
 for(const a of p.assets){if(!a||typeof a.name!=='string'||a.name.length>255||typeof a.path!=='string'||!/^assets\/\d+$/.test(a.path)||paths.has(a.path))throw Error('프로젝트 파일 목록이 올바르지 않습니다.');paths.add(a.path);const b=archive.get(a.path);if(!b)throw Error('원본 파일을 찾을 수 없습니다: '+a.name);total+=b.size;if(total>500*1024*1024)throw Error('원본 파일 합계는 500MB 이하만 지원합니다.');assets.push(await inspectFile(new Blob([b],{type:a.mimeType}),a.name));}
 await persist(true);if(persistFailed)throw Error('현재 작업을 먼저 프로젝트 파일로 백업해 주세요. 자동 저장에 실패했습니다.');state.project={...newProject(),name:p.name,settings,assets};state.history=[];state.selected=assets[0]?.id||null;clearResults();revokeAssets();renderAll();await persist(true);toast('프로젝트를 불러왔습니다. 원본과 설정을 복구했습니다.');
 });$('#project-input').value='';}
async function switchProject(id){if(!id||state.busy||state.ingesting)return;await withBusy(async()=>{await persist(true);if(persistFailed)throw Error('현재 작업 저장에 실패했습니다. 프로젝트 파일로 먼저 백업하세요.');const p=await getProject(id);if(!p||p.schemaVersion!==1)throw Error('이 프로젝트를 불러올 수 없습니다.');p.settings=validateSettings(p.settings);state.project=p;state.selected=p.assets[0]?.id||null;state.history=[];clearResults();revokeAssets();renderAll();await persist(true);toast('이전 작업을 이어서 편집합니다.');});}
async function demoFiles(){
 const designs=[{name:'모아_세라믹컵.jpg',bg:'#e6dfd0',ink:'#b87853',title:'Everyday ceramic',kind:0},{name:'모아_리빙오브제.jpg',bg:'#d7e4de',ink:'#6d8a76',title:'A softer everyday',kind:1},{name:'모아_브랜드카드.jpg',bg:'#eadbcf',ink:'#8e6d5e',title:'Made for slow living',kind:2}];const files=[];
 for(const d of designs){const c=document.createElement('canvas');c.width=1400;c.height=1100;const x=c.getContext('2d');x.fillStyle=d.bg;x.fillRect(0,0,c.width,c.height);x.fillStyle='#ffffff55';x.beginPath();x.ellipse(700,900,350,50,0,0,Math.PI*2);x.fill();x.fillStyle=d.ink;x.shadowColor='#20332c25';x.shadowBlur=40;x.shadowOffsetY=20;
 if(d.kind===0){x.beginPath();x.roundRect(480,330,400,450,[20,20,110,110]);x.fill();x.strokeStyle=d.ink;x.lineWidth=48;x.beginPath();x.ellipse(915,510,100,120,0,0,Math.PI*2);x.stroke();x.shadowBlur=0;x.fillStyle='#d6aa84';x.beginPath();x.ellipse(680,340,190,35,0,0,Math.PI*2);x.fill();}
 else if(d.kind===1){x.beginPath();x.ellipse(700,620,230,270,0,0,Math.PI*2);x.fill();x.fillRect(625,300,150,260);x.shadowBlur=0;x.strokeStyle='#9ba58a';x.lineWidth=14;x.beginPath();x.moveTo(700,400);x.quadraticCurveTo(600,130,810,80);x.stroke();x.fillStyle='#769078';for(let i=0;i<5;i++){x.beginPath();x.ellipse(710+i*16,140+i*45,65,20,-.5,0,Math.PI*2);x.fill();}}
 else{x.translate(700,560);x.rotate(-.1);x.fillStyle='#f9f4eb';x.fillRect(-350,-240,700,480);x.shadowBlur=0;x.fillStyle=d.ink;x.textAlign='center';x.font='italic 100px Georgia';x.fillText('moa.',0,10);x.font='16px sans-serif';x.fillText('SMALL THINGS, WELL MADE.',0,65);x.resetTransform();}
 x.shadowBlur=0;x.shadowOffsetY=0;x.textAlign='left';x.fillStyle='#374b45';x.font='24px sans-serif';x.fillText(d.title,80,100);x.fillStyle='#64746a';x.font='16px sans-serif';x.fillText('MOA OBJECTS  /  2026 COLLECTION',80,1030);const b=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.9));files.push(new File([b],d.name,{type:'image/jpeg'}));}
 await addFiles(files);
}
$('#add-files').onclick=()=>$('#file-input').click();$('#file-input').onchange=e=>addFiles(e.target.files);$('#import-project').onclick=()=>$('#project-input').click();$('#project-input').onchange=e=>importProject(e.target.files[0]);$('#export-project').onclick=exportProject;
$('#drop-zone').onclick=e=>{if(e.target.closest('#demo')||state.busy||state.ingesting||!state.ready)return;$('#file-input').click();};$('#drop-zone').onkeydown=e=>{if(e.target!==$('#drop-zone'))return;if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#drop-zone').click();}};
$('#demo').onclick=e=>{e.stopPropagation();demoFiles().catch(e=>toast(e.message,true));};
for(const event of ['dragenter','dragover'])$('#drop-zone').addEventListener(event,e=>{e.preventDefault();$('#drop-zone').classList.add('dragover');});
for(const event of ['dragleave','drop'])$('#drop-zone').addEventListener(event,e=>{e.preventDefault();$('#drop-zone').classList.remove('dragover');if(event==='drop')addFiles(e.dataTransfer.files);});
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
document.addEventListener('paste',e=>{if(document.querySelector('#image-workspace')?.hidden)return;if(e.target.closest('input,textarea,[contenteditable]'))return;const files=[...e.clipboardData.items].filter(i=>i.kind==='file'&&i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);if(files.length){e.preventDefault();addFiles(files);}});
$('#settings-form').addEventListener('input',e=>{if(!e.target.name)return;try{const next=validateSettings(readSettings());state.settingsError='';$('#settings-error').hidden=true;remember();state.project.settings=next;$('#preset').value='custom';changed();settingHints();}catch(error){state.settingsError=error.message;$('#settings-error').textContent=error.message;$('#settings-error').hidden=false;updateButtons();settingHints();}});
$('#settings-form').addEventListener('change',e=>{if(e.target.name&&e.target.tagName==='SELECT'){/* select fires input in modern browsers */}});
$('#settings-form').onsubmit=e=>{e.preventDefault();runJob();};$('#cancel').onclick=()=>{state.cancel=true;updateButtons();};$('#retry-failed').onclick=()=>runJob(true);
$('#project-name').oninput=()=>{remember();state.project.name=$('#project-name').value;state.project.revision++;state.project.updatedAt=new Date().toISOString();persist();};$('#project-name').onchange=()=>{if(!state.project.name.trim()){state.project.name='나의 상품 사진';$('#project-name').value=state.project.name;persist();}};
$('#sort-files').onclick=()=>{remember();state.project.assets.sort((a,b)=>a.name.localeCompare(b.name,'ko',{numeric:true}));changed();renderAssets();};
$('#clear-files').onclick=()=>{remember();state.project.assets=[];state.selected=null;changed();renderAssets();toast('목록을 비웠습니다. 실행 취소로 되돌릴 수 있어요.');};
$('#undo').onclick=()=>{if(!state.history.length||state.busy||state.ingesting)return;const revision=state.project.revision+1;state.project=state.history.pop();state.project.revision=revision;state.project.updatedAt=new Date().toISOString();state.selected=state.project.assets[0]?.id||null;clearResults();renderAll();persist();};
document.addEventListener('keydown',e=>{if(document.querySelector('#image-workspace')?.hidden)return;if((e.metaKey||e.ctrlKey)&&e.key==='z'&&!e.shiftKey&&!e.target.closest('input,textarea,[contenteditable]')){e.preventDefault();$('#undo').click();}});
$('#new-project').onclick=()=>withBusy(async()=>{await persist(true);if(persistFailed)throw Error('현재 작업 저장에 실패했습니다. 프로젝트 파일로 먼저 백업하세요.');state.project=newProject();state.history=[];state.selected=null;clearResults();revokeAssets();renderAll();await persist(true);toast('새 작업을 만들었습니다. 이전 작업은 최근 작업에서 열 수 있어요.');});
$('#recent-projects').onchange=e=>switchProject(e.target.value);
$('#preset').onchange=e=>{const presets={shop:{resizeMode:'contain',size:1000,format:'image/jpeg'},blog:{resizeMode:'width',size:1200,format:'image/jpeg'},social:{resizeMode:'cover',size:1080,format:'image/jpeg'}};const patch=presets[e.target.value];if(patch){remember();Object.assign(state.project.settings,patch);renderSettings();changed();}};
function renderPresets(){$('#brand-presets').replaceChildren(new Option('저장한 프리셋 선택',''),...state.presets.map(p=>new Option(p.name,p.id)));}
$('#save-preset').onclick=async()=>{const name=$('#brand-preset-name').value.trim();if(!name){toast('프리셋 이름을 입력하세요.',true);return;}try{const settings=validateSettings(state.project.settings);const existing=state.presets.find(p=>p.name===name);if(existing)existing.settings=settings;else state.presets.push({id:crypto.randomUUID(),name,settings});await savePresets(state.presets);renderPresets();toast('현재 설정을 프리셋으로 저장했습니다.');}catch(error){toast(error.message,true);}};
$('#brand-presets').onchange=e=>{const p=state.presets.find(p=>p.id===e.target.value);if(p){remember();state.project.settings=validateSettings(p.settings);renderSettings();changed();toast(p.name+' 설정을 적용했습니다.');}};
for(const [id,original] of [['show-original',true],['show-result',false]])$('#'+id).onclick=()=>{state.original=original;$('#show-original').classList.toggle('selected',original);$('#show-result').classList.toggle('selected',!original);requestPreview();};
$('#download-manifest').onclick=()=>download(new Blob([JSON.stringify(manifest(),null,2)],{type:'application/json'}),safeName(state.project.name)+'_처리기록.json');
$('#download-zip').onclick=()=>withBusy(async()=>{const entries=state.results.filter(r=>r.status==='completed').map(r=>({name:r.filename,blob:r.blob}));entries.push({name:'moa-export-manifest.json',blob:new Blob([JSON.stringify(manifest(),null,2)],{type:'application/json'})});toast('ZIP 파일을 준비하고 있습니다.');download(await makeZip(entries),safeName(state.project.name)+'.zip');});
for(const button of document.querySelectorAll('[data-focus]'))button.onclick=()=>{const el=$('#'+button.dataset.focus);el.scrollIntoView({behavior:'smooth',block:'center'});el.focus({preventScroll:true});};$('#workspace-tab').onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
window.addEventListener('beforeunload',e=>{if(state.busy||state.ingesting||persistFailed||$('#save-state').textContent==='저장 중…'){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide',()=>{processor.close();previewProcessor.close();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&state.ready)persist(true);});
async function init(){updateButtons();try{const p=await getLastProject();if(p){if(p.schemaVersion!==1)throw Error('이전 프로젝트의 버전을 지원하지 않습니다.');p.settings=validateSettings(p.settings);state.project=p;state.selected=p.assets[0]?.id||null;toast('지난 작업의 파일과 설정을 복구했습니다.');}state.presets=await getPresets();renderPresets();saveLabel('이 기기에 자동 저장됨');}catch(error){persistFailed=true;saveLabel('자동 저장 사용 불가 · 프로젝트 파일로 백업하세요',true);toast('브라우저 저장소를 사용할 수 없습니다. 프로젝트 저장 기능으로 작업을 백업하세요. '+error.message,true);}finally{state.ready=true;renderAll();document.body.dataset.ready='true';}}
window.addEventListener('moa:import-assets',e=>addFiles(e.detail));
init();
