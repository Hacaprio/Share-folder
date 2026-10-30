import {$,health} from './tools/common.js';
import {getLastProject} from './storage.js';
import {icon,toolIcons} from './icons.js';

const keywords={background:'누끼 피사체 배경 지우기', 'watermark-remove':'워터마크 로고 지우기',mosaic:'얼굴 가리기 블러',template:'상세페이지 디자인 편집 레이어 포스터',capture:'스크린샷 스크롤 저장',signature:'사인 서명 도장',split:'사진 자르기 분할',qr:'큐알 QR 코드',rename:'파일 이름 바꾸기',clips:'움짤 gif 구간 자르기',gif:'움짤 영상 변환',record:'화면 녹화 녹음','pdf-tools':'피디에프 OCR 한글 문자 추출 엑셀 워드 ppt 병합','labelmate':'라벨지 인쇄 스티커',blog:'블로그 줄바꿈 해시태그 본문 정리'};
const normalize=value=>String(value).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s/g,'');

export async function mountHome(root,tools){
 root.className='home-root';
 root.innerHTML=`
  <section class="studio-hero" aria-labelledby="home-title">
   <div class="studio-hero-copy">
    <span class="studio-eyebrow"><span></span> A LITTLE LESS BUSY. A LITTLE MORE CREATIVE.</span>
    <h1 id="home-title">만드는 일에,<br><em>더 집중하세요.</em></h1>
    <p>이미지, 문서, 영상부터 판매 계산까지.<br>매일의 작은 작업을 가볍게 완성하는 나만의 스튜디오.</p>
    <div class="studio-hero-actions"><a href="#image" class="button primary">이미지 작업 시작 ${icon('arrow-right')}</a><a href="#template" class="studio-secondary">캔버스 열기 ${icon('arrow-up-right')}</a></div>
    <div class="studio-hero-trust">${icon('shield-check')} 내 파일은 내 기기에. 외부 업로드 없이 안전하게.</div>
   </div>
   <div class="studio-art" aria-label="내장 예제 컵 일러스트로 구성한 작업 예시">
    <span class="studio-art-caption">YOUR NEXT GOOD IDEA, STARTS HERE.</span>
    <div class="art-poster"><span class="art-poster-brand">moa<span>●</span></span><img src="/assets/studio-cup.jpg" alt="모아의 내장 예제, 세라믹 컵 일러스트" width="1400" height="1100"><span class="art-poster-footer">EVERYDAY OBJECTS <span>2026</span></span></div>
    <div class="art-export">${icon('images')}<div><strong>좋은 사진, 더 간편하게</strong><span>크기 조절 · 워터마크 · 일괄 저장</span></div><span class="art-export-check">${icon('check')}</span></div>
    <span class="art-small-label">LESS REPETITION. MORE CREATION.</span>
   </div>
  </section>
  <section class="home-resume" id="home-resume" hidden><span class="resume-icon">${icon('folder-open')}</span><div><small>이어서 만들어볼까요?</small><strong id="home-project"></strong></div><button id="home-continue">작업 이어가기 ${icon('arrow-right')}</button></section>
  <section class="featured-section" aria-labelledby="featured-title">
   <div class="studio-section-top"><div><span class="studio-eyebrow">START SOMETHING GOOD</span><h2 id="featured-title">오늘의 작업, 여기서 시작하세요</h2></div><span class="section-aside">자주 쓰는 도구부터 빠르게</span></div>
   <div class="studio-featured-grid">
    <a class="studio-feature" href="#image"><div class="feature-art feature-art-images" aria-hidden="true"><span class="sample-file sample-file-back">PNG ${icon('image')}</span><span class="sample-file sample-file-front">JPG ${icon('image')}</span><span class="sample-format">여러 장도 한 번에</span></div><div class="feature-copy"><span class="feature-kicker">IMAGE STUDIO</span><h3>이미지 작업실</h3><p>크기부터 파일명까지, 하나의 규칙으로.</p><span class="feature-open">작업실 열기 ${icon('arrow-up-right')}</span></div></a>
    <a class="studio-feature" href="#template"><div class="feature-art feature-art-canvas" aria-hidden="true"><span class="sample-layout"><span>made<br>with <i>moa.</i></span><span class="sample-layout-rule"></span><small>YOUR EVERYDAY CREATIVE STUDIO</small></span><span class="sample-layer">${icon('layers')} 레이어 편집</span></div><div class="feature-copy"><span class="feature-kicker">DESIGN CANVAS</span><h3>템플릿 캔버스</h3><p>사진과 문구를 쌓아 나만의 디자인으로.</p><span class="feature-open">디자인 시작 ${icon('arrow-up-right')}</span></div></a>
    <a class="studio-feature" href="#pdf-tools"><div class="feature-art feature-art-docs" aria-hidden="true"><span class="sample-document"><strong>PDF</strong><i></i><i></i><i></i></span><span class="sample-convert">${icon('arrow-right')}<span>Word</span></span><span class="sample-doc-label">정리하고, 바꾸고, 추출하고.</span></div><div class="feature-copy"><span class="feature-kicker">DOCUMENT TOOLS</span><h3>PDF 변환·OCR</h3><p>필요한 페이지와 문자를 원하는 형태로.</p><span class="feature-open">문서 도구 열기 ${icon('arrow-up-right')}</span></div></a>
   </div>
  </section>
  <section class="tool-library" aria-labelledby="library-title">
   <div class="studio-section-top library-heading"><div><span class="studio-eyebrow">A PLACE FOR EVERY TASK</span><h2 id="library-title">필요한 도구를 찾아보세요 <span>${tools.length}</span></h2></div><label class="studio-search">${icon('search')}<span class="sr-only">도구 검색</span><input id="tool-search" type="search" autocomplete="off" placeholder="어떤 작업을 하고 싶으세요?"><kbd id="search-shortcut"></kbd></label></div>
   <div class="studio-filters" id="tool-filters" aria-label="도구 분류"></div>
   <p id="tool-search-result" class="sr-only" aria-live="polite"></p>
   <div id="home-tool-groups"></div>
   <div id="tool-search-empty" class="search-empty" hidden>${icon('search')}<h3>아직 찾는 도구가 보이지 않네요.</h3><p>다른 검색어를 입력하거나 전체 도구를 살펴보세요.</p><button id="tool-search-reset" class="button white">전체 도구 보기</button></div>
  </section>
  <footer class="studio-footer"><span class="footer-wordmark">moa.</span><p>작업을 모으다. 시간을 아끼다.</p><div><span class="engine-pill" id="engine-state">작업 환경 확인 중</span><a href="/completion-report.html" target="_blank" rel="noopener">사용 범위·검증 안내 ${icon('arrow-up-right')}</a></div></footer>`;
 const groups=[...new Set(tools.map(t=>t[0]))];
 const filters=$('#tool-filters',root),host=$('#home-tool-groups',root),input=$('#tool-search',root);
 let category='all',query='',disposed=false;
 const groupNodes=[];
 for(const [value,label]of [['all','전체 도구'],...groups.map(g=>[g,g])]){
  const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.category=value;b.setAttribute('aria-pressed',String(value==='all'));b.onclick=()=>{category=value;renderFilter();};filters.append(b);
 }
 for(const group of groups){
  const section=document.createElement('section');section.className='studio-tool-group';
  const heading=document.createElement('h3');heading.textContent=group;section.append(heading);
  const cards=document.createElement('div');cards.className='suite-cards';section.append(cards);
  const entries=[];
  for(const [,id,title,,description]of tools.filter(t=>t[0]===group)){
   const link=document.createElement('a');link.className='suite-tool-card';link.href='#'+id;link.dataset.toolCard=id;
   link.innerHTML=`<span class="tool-icon">${icon(toolIcons[id])}</span><span class="tool-card-copy"><strong></strong><span></span></span>${icon('arrow-up-right','tool-card-arrow')}`;
   $('strong',link).textContent=title;$('.tool-card-copy>span',link).textContent=description;
   cards.append(link);entries.push({link,search:normalize(group+' '+title+' '+description+' '+(keywords[id]||''))});
  }
  groupNodes.push({group,section,entries});host.append(section);
 }
 function renderFilter(){
  let total=0;
  for(const b of filters.children)b.setAttribute('aria-pressed',String(b.dataset.category===category));
  for(const {group,section,entries}of groupNodes){let count=0;for(const entry of entries){const visible=(category==='all'||category===group)&&entry.search.includes(query);entry.link.hidden=!visible;if(visible)count++;}section.hidden=count===0;total+=count;}
  $('#tool-search-empty',root).hidden=total!==0;
  $('#tool-search-result',root).textContent=`${total}개 도구가 있습니다.`;
 }
 input.oninput=()=>{query=normalize(input.value);renderFilter();};
 $('#tool-search-reset',root).onclick=()=>{input.value='';query='';category='all';renderFilter();input.focus();};
 input.onkeydown=e=>{if(e.key==='Escape'){input.value='';query='';renderFilter();}};
 $('#search-shortcut',root).textContent=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘ K':'Ctrl K';
 const keydown=e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();input.focus();input.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}};
 window.addEventListener('keydown',keydown);
 $('#home-continue',root).onclick=()=>location.hash='image';
 await Promise.allSettled([
  getLastProject().then(project=>{if(!disposed&&project?.assets.length){$('#home-resume',root).hidden=false;$('#home-project',root).textContent=project.name+' · 사진 '+project.assets.length+'개';}}),
  health().then(h=>{if(disposed)return;const el=$('#engine-state',root);const ready=h.backgroundModel&&h.ocrModels&&h.ffmpeg&&h.pdfRenderer;el.textContent=ready?'모든 작업 준비 완료':'일부 도구 설치 확인 필요';el.dataset.state=ready?'ready':'warning';}).catch(()=>{if(!disposed){const el=$('#engine-state',root);el.textContent='로컬 엔진 연결 확인 필요';el.dataset.state='warning';}})
 ]);
 return()=>{disposed=true;window.removeEventListener('keydown',keydown);};
}
