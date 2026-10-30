import {renderImage} from './render.js';
self.onmessage=async({data})=>{try{self.postMessage({id:data.id,result:await renderImage(data.blob,data.settings)});}catch(error){self.postMessage({id:data.id,error:error.message||'이미지 처리에 실패했습니다.'});}};
