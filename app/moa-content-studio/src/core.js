export const DEFAULTS = Object.freeze({resizeMode:'original',size:1000,format:'image/jpeg',quality:92,background:'#ffffff',allowUpscale:false,watermarkEnabled:false,watermarkText:'',watermarkPosition:'bottom-right',watermarkColor:'#ffffff',watermarkOpacity:65,prefix:'',start:1,digits:3});
export function validateSettings(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('설정 정보가 올바르지 않습니다.');
 const s={...DEFAULTS,...raw};
 if(!['original','width','height','contain','cover'].includes(s.resizeMode))throw Error('지원하지 않는 크기 설정입니다.');
 if(!['image/jpeg','image/png','image/webp'].includes(s.format))throw Error('지원하지 않는 이미지 형식입니다.');
 for(const [key,min,max] of [['size',16,8192],['quality',20,100],['watermarkOpacity',10,100],['start',0,999999],['digits',2,4]]){s[key]=Number(s[key]);if(!Number.isInteger(s[key])||s[key]<min||s[key]>max)throw Error(`${{size:'기준 크기',quality:'품질',watermarkOpacity:'불투명도',start:'시작 번호',digits:'번호 자릿수'}[key]}: ${min}~${max} 범위의 정수를 입력하세요.`);}
 for(const key of ['background','watermarkColor'])if(!/^#[0-9a-f]{6}$/i.test(s[key]))throw Error('색상 형식을 확인하세요.');
 for(const key of ['prefix','watermarkText'])if(typeof s[key]!=='string'||s[key].length>80)throw Error('문구는 80자 이내로 입력하세요.');
 if(!['bottom-right','bottom-left','center'].includes(s.watermarkPosition))throw Error('워터마크 위치를 확인하세요.');
 s.allowUpscale=!!s.allowUpscale;s.watermarkEnabled=!!s.watermarkEnabled;return s;
}
export function dimensions(w,h,s){
 if(!(w>0&&h>0))throw Error('이미지 크기를 읽지 못했습니다.');
 let width=w,height=h;
 if(s.resizeMode==='contain'||s.resizeMode==='cover')width=height=s.size;
 else if(s.resizeMode==='width'){const ratio=s.allowUpscale?s.size/w:Math.min(1,s.size/w);width=Math.round(w*ratio);height=Math.round(h*ratio);}
 else if(s.resizeMode==='height'){const ratio=s.allowUpscale?s.size/h:Math.min(1,s.size/h);width=Math.round(w*ratio);height=Math.round(h*ratio);}
 if(width>16384||height>16384||width*height>40_000_000)throw Error('출력 크기가 너무 큽니다. 한 변 16,384px, 총 4천만 픽셀 이하로 줄여주세요.');
 return {width:Math.max(1,width),height:Math.max(1,height)};
}
export function safeName(value){return String(value).normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').trim().slice(0,100)||'상품사진';}
export function outputNames(assets,s){const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[s.format];return assets.map((a,i)=>`${safeName(s.prefix.trim()||a.name.replace(/\.[^.]+$/,''))}_${String(s.start+i).padStart(s.digits,'0')}.${ext}`);}
export function bytes(n){return n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(0)} KB`:`${(n/1048576).toFixed(1)} MB`;}
export function newProject(){return {schemaVersion:1,id:crypto.randomUUID(),name:'나의 상품 사진',revision:0,updatedAt:new Date().toISOString(),settings:{...DEFAULTS},assets:[]};}
