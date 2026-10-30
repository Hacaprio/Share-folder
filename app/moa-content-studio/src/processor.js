import {renderImage} from './render.js';
export class Processor{
 constructor(){this.worker=null;this.pending=new Map();this.next=0;this.failed=false;}
 async render(blob,settings){
 if(!this.failed&&typeof Worker!=='undefined'&&typeof OffscreenCanvas!=='undefined'){
 if(!this.worker){try{this.worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});}catch{this.failed=true;return renderImage(blob,settings);}this.worker.onmessage=({data})=>{const p=this.pending.get(data.id);if(p){this.pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.result);}};this.worker.onerror=()=>{this.failed=true;for(const p of this.pending.values())p.reject(Error('처리 엔진을 다시 시작합니다. 다시 실행해 주세요.'));this.pending.clear();this.worker.terminate();this.worker=null;};}
 return new Promise((resolve,reject)=>{const id=++this.next;this.pending.set(id,{resolve,reject});this.worker.postMessage({id,blob,settings});});
 }
 return renderImage(blob,settings);
 }
 close(){this.worker?.terminate();this.worker=null;for(const p of this.pending.values())p.reject(Error('작업을 종료했습니다.'));this.pending.clear();}
}
