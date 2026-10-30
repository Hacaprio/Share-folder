export function validateScene(s,knownAssets){
 if(!s||!Number.isInteger(s.width)||!Number.isInteger(s.height)||s.width<100||s.height<100||s.width>8192||s.height>8192||s.width*s.height>40e6||!Array.isArray(s.pages)||s.pages.length<1||s.pages.length>10||!Number.isInteger(s.current)||s.current<0||s.current>=s.pages.length||typeof s.name!=='string'||s.name.length>80)throw Error('캔버스 크기·이름·페이지 정보가 올바르지 않습니다.');
 for(const p of s.pages){const ids=new Set();if(!/^#[0-9a-f]{6}$/i.test(p.background)||!Array.isArray(p.objects)||p.objects.length>300)throw Error('페이지 배경·레이어 정보가 올바르지 않습니다.');for(const o of p.objects){
 if(!o||typeof o.id!=='string'||o.id.length>200||ids.has(o.id)||!['text','rect','circle','line','path','image'].includes(o.type)||!['none','fade','slide','zoom'].includes(o.animation)||!['x','y','w','h','rotation','fontSize','opacity'].every(k=>Number.isFinite(o[k])&&Math.abs(o[k])<1e6)||o.w<=0||o.h<=0||o.opacity<0||o.opacity>100||o.fontSize<=0||!/^#[0-9a-f]{6}$/i.test(o.fill))throw Error('레이어 정보가 올바르지 않습니다.');ids.add(o.id);
 if(o.type==='text'&&(typeof o.text!=='string'||o.text.length>50000))throw Error('텍스트 레이어가 올바르지 않습니다.');
 if(o.type==='path'&&(!Array.isArray(o.points)||o.points.length>50000||!o.points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))))throw Error('손글씨 경로가 올바르지 않습니다.');
 if(o.type==='image'&&(typeof o.asset!=='string'||knownAssets&&!knownAssets.has(o.asset)))throw Error('레이어의 원본 이미지를 찾지 못했습니다.');
 }}return s;
}
export function referencedAssets(scene){return new Set(scene.pages.flatMap(p=>p.objects.filter(o=>o.type==='image').map(o=>o.asset)));}
