import {$,toolShell,status,health,activeJobs,draft} from './tools/common.js';
import {getLastProject} from './storage.js';
export const TOOLS=[
 ['이미지·디자인','image','이미지 작업실','▧','일괄 편집 · 자동 저장 · 프로젝트'],
 ['이미지·디자인','template','템플릿 캔버스','▦','레이어 · 여러 페이지 · 애니메이션'],
 ['이미지·디자인','capture','웹페이지 전체 캡처','▣','전체 페이지 PNG · PDF'],
 ['이미지·디자인','signature','사진·문서 서명','✍','손글씨 · 사진 · PDF · Word'],
 ['이미지·디자인','split','사진 분할','⊞','행과 열로 분할 · ZIP'],
 ['이미지·디자인','background','배경 제거·바꾸기','◒','로컬 AI · 수동 보정 브러시'],
 ['이미지·디자인','watermark-remove','이미지 영역 복원','✦','표시 영역 제안 · 주변 픽셀 복원'],
 ['이미지·디자인','mosaic','사진 모자이크','▩','영역 지정 · 블러 · 얼굴 감지'],
 ['이미지·디자인','qr','QR 코드 생성','▥','PNG · JPG · SVG'],
 ['이미지·디자인','rename','파일명 일괄 변경','↔','모든 파일 · 이름·순번 · ZIP'],
 ['영상·GIF','clips','영상 구간 → GIF','▷','여러 구간을 한 번에'],
 ['영상·GIF','gif','영상 → GIF','▻','크기·프레임 조절 · 일괄 변환'],
 ['영상·GIF','video-watermark-remove','영상 영역 복원','✧','고정 표시 영역 · MP4'],
 ['영상·GIF','record','화면녹화 → GIF','◉','화면·창·탭 · MP4 · GIF'],
 ['문서·인쇄','pdf-tools','PDF 변환·OCR','▤','병합 · 분할 · Word·Excel·PPT'],
 ['문서·인쇄','labelmate','A4 라벨메이트','⊡','25가지 격자 · QR · 인쇄'],
 ['판매자 계산기','smartstore-fees','스마트스토어','₩','사업자 요율 · 쇼핑커넥트'],
 ['판매자 계산기','gmarket-fees','지마켓','₩','카테고리 · 프로모션 · 월 이익'],
 ['판매자 계산기','auction-fees','옥션','₩','카테고리 · 배송 · 월 이익'],
 ['판매자 계산기','11st-fees','11번가','₩','쿠폰 부담 · 정산 · 월 이익'],
 ['판매자 계산기','coupang-fees','쿠팡','₩','카테고리 · 배송 수입·비용'],
 ['판매자 계산기','rocket-growth-margin','로켓그로스 마진','₩','물류비 · 보관비 · 세이버'],
 ['판매자 계산기','rocket-growth-policy','로켓그로스 정책','≡','공식 출처 · 내 확인 기록'],
 ['글쓰기','blog','블로그 본문 정리','¶','줄바꿈 · 해시태그 · TXT']
];
const legacy=$('.shell>main');legacy.id='image-workspace';const view=document.createElement('main');view.id='suite-view';legacy.before(view);const toolStatus=document.createElement('div');toolStatus.className='save-indicator';toolStatus.textContent='이 기기에서 처리';toolStatus.id='tool-save-state';$('.topbar').append(toolStatus);const toast=document.createElement('div');toast.id='suite-toast';toast.hidden=true;toast.role='status';toast.setAttribute('aria-live','polite');document.body.append(toast);
const sidebar=$('.sidebar'),nav=document.createElement('nav');nav.className='suite-nav';nav.setAttribute('aria-label','모든 도구');let category;
const all=document.createElement('button');all.textContent='▦ 모든 도구';all.dataset.tool='home';all.onclick=()=>location.hash='home';nav.append(all);
for(const [group,id,title,icon]of TOOLS){if(group!==category){const heading=document.createElement('div');heading.className='suite-category';heading.textContent=group;nav.append(heading);category=group;}const b=document.createElement('button');b.textContent=icon+' '+title;b.dataset.tool=id;b.onclick=()=>location.hash=id;nav.append(b);}$('.workflow-label').before(nav);
const mobile=document.createElement('select');mobile.className='suite-mobile-nav';mobile.setAttribute('aria-label','도구 선택');mobile.append(new Option('모든 도구','home'),...TOOLS.map(([,id,title])=>new Option(title,id)),new Option('이미지 정밀 편집','editor'));mobile.onchange=()=>location.hash=mobile.value;$('.topbar').after(mobile);
$('.brand').href='#home';$('#workspace-tab').onclick=()=>location.hash='image';$('.local-note p').innerHTML='브라우저 또는 이 컴퓨터의<br>로컬 엔진에서 처리합니다.';$('.local-note strong').textContent='외부 업로드 없이';$('.sidebar-bottom small').textContent='모아 전체 작업실 · v2.0';const footer=$('#image-workspace footer');if(footer)footer.lastElementChild.textContent='브라우저·로컬 엔진 처리 · 원본 보존';
const editorLink=document.createElement('button');editorLink.className='button small white';editorLink.textContent='정밀 편집 ↗';editorLink.onclick=()=>location.hash='editor';$('.asset-actions',legacy).prepend(editorLink);
let cleanup,routeCounter=0,currentRoute='home';
async function home(){toolShell(view,'반복하는 일, 모아에서 끝내세요.','사진부터 문서·영상·판매 계산까지. 파일은 이 기기에 두고, 필요한 도구를 연결하세요.',`<section class="tool-card"><div class="tool-row"><span class="engine-pill" id="engine-state">로컬 엔진 연결 확인 중</span><span class="tool-badge">24개 도구</span><a class="text-button" href="/completion-report.html" target="_blank" rel="noopener">사용 범위·검증 보고 ↗</a><span class="tool-badge">프로젝트·캔버스 자동 복구</span><button id="home-continue" class="button white">이미지 작업 이어하기 →</button></div><p class="tool-muted" id="home-project"></p></section><div id="home-tool-groups"></div>`);$('#home-continue',view).onclick=()=>location.hash='image';let category;const host=$('#home-tool-groups',view);let cards;for(const [group,id,title,icon,desc]of TOOLS){if(group!==category){const h=document.createElement('h2');h.className='suite-section-label';h.textContent=group;cards=document.createElement('div');cards.className='suite-cards';host.append(h,cards);category=group;}const b=document.createElement('button');b.className='suite-tool-card';const symbol=document.createElement('span');symbol.className='tool-icon';symbol.textContent=icon;const name=document.createElement('strong');name.textContent=title;const p=document.createElement('p');p.textContent=desc;b.append(symbol,name,p);b.onclick=()=>location.hash=id;cards.append(b);}
 try{const p=await getLastProject();if(p&&$('#home-project',view))$('#home-project',view).textContent=`최근 이미지 프로젝트: ${p.name} · ${p.assets.length}개 파일`;}catch{}
 try{const h=await health();if($('#engine-state',view))$('#engine-state',view).textContent=`로컬 엔진 연결됨 · AI ${h.backgroundModel?'준비됨':'모델 설치 필요'} · OCR ${h.ocrModels?'준비됨':'설치 필요'}`;}catch(e){if($('#engine-state',view))$('#engine-state',view).textContent=e.message;}
}
async function route(){let id;try{id=decodeURIComponent(location.hash.slice(1))||'home';}catch{id='home';}if(!TOOLS.some(t=>t[1]===id)&&!['home','editor'].includes(id))id='home';if(activeJobs||!$('#cancel').hidden){if(id!==currentRoute){status('진행 중인 작업이 있습니다. 완료하거나 취소한 뒤 이동하세요.');history.replaceState(null,'','#'+currentRoute);}return;}
 const version=++routeCounter;if(cleanup){const dispose=cleanup;cleanup=null;await dispose();}if(version!==routeCounter)return;currentRoute=id;document.body.dataset.tool=id;delete document.body.dataset.toolReady;for(const b of nav.querySelectorAll('[data-tool]'))b.classList.toggle('selected',b.dataset.tool===id);mobile.value=id;$('.breadcrumb strong').textContent=id==='home'?'모든 도구':TOOLS.find(t=>t[1]===id)?.[2]||'이미지 정밀 편집';legacy.hidden=id!=='image';view.hidden=id==='image';$('#save-state').hidden=id!=='image';toolStatus.hidden=id==='image';window.scrollTo({top:0});if(id==='image'){document.body.dataset.toolReady=id;return;}
 view.replaceChildren();const host=document.createElement('div');view.append(host);let result;
 try{if(id==='home'){await home();if(version===routeCounter)document.body.dataset.toolReady=id;return;}if(id==='template')result=await(await import('./tools/canvas.js')).mount(host);
 else if(['background','watermark-remove','mosaic','split','editor'].includes(id))result=await(await import('./tools/images.js')).mount(host,id);
 else if(['qr','rename','signature'].includes(id)){const mod=await import('./tools/images.js');result=await mod[{qr:'mountQR',rename:'mountRename',signature:'mountSignature'}[id]](host);}
 else if(id==='pdf-tools')result=await(await import('./tools/documents.js')).mountPDF(host);
 else if(id==='labelmate')result=await(await import('./tools/documents.js')).mountLabels(host);
 else if(['clips','gif','record','video-watermark-remove'].includes(id))result=await(await import('./tools/video.js')).mount(host,id);
 else if(id==='rocket-growth-policy')result=await(await import('./tools/fees.js')).mountPolicy(host);
 else if(id.endsWith('-fees')||id==='rocket-growth-margin')result=await(await import('./tools/fees.js')).mount(host,id);
 else if(id==='blog')result=await(await import('./tools/writing.js')).mountBlog(host);
 else if(id==='capture')result=await(await import('./tools/writing.js')).mountCapture(host);
 if(version===routeCounter){cleanup=result;document.body.dataset.toolReady=id;}else result?.();
 }catch(error){host.replaceChildren(Object.assign(document.createElement('p'),{className:'tool-note',textContent:'도구를 열지 못했습니다. '+error.message}));document.body.dataset.toolReady='error';status(error.message,true);}}
window.addEventListener('hashchange',route);window.addEventListener('pagehide',()=>cleanup?.());route();
