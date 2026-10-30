import {dimensions} from './core.js';
export async function decode(blob){
 if(typeof createImageBitmap==='function'){try{return await createImageBitmap(blob,{imageOrientation:'from-image'});}catch(e){if(typeof document==='undefined')throw e;}}
 const url=URL.createObjectURL(blob);try{const img=new Image();img.src=url;await img.decode();return {width:img.naturalWidth,height:img.naturalHeight,image:img,close(){}};}finally{URL.revokeObjectURL(url);}
}
export async function renderImage(blob,s){
 const bitmap=await decode(blob);let canvas;
 try{
 const {width,height}=dimensions(bitmap.width,bitmap.height,s);canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(width,height):Object.assign(document.createElement('canvas'),{width,height});
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('이미지 편집을 지원하지 않는 브라우저입니다.');
 if(s.format==='image/jpeg'||s.resizeMode==='contain'){ctx.fillStyle=s.background;ctx.fillRect(0,0,width,height);}
 let dw=width,dh=height,dx=0,dy=0;
 if(s.resizeMode==='contain'||s.resizeMode==='cover'){
 let ratio=s.resizeMode==='cover'?Math.max(width/bitmap.width,height/bitmap.height):Math.min(width/bitmap.width,height/bitmap.height);
 if(!s.allowUpscale)ratio=Math.min(1,ratio);dw=bitmap.width*ratio;dh=bitmap.height*ratio;dx=(width-dw)/2;dy=(height-dh)/2;
 }
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap.image||bitmap,dx,dy,dw,dh);
 if(s.watermarkEnabled&&s.watermarkText.trim()){
 const margin=Math.max(8,Math.round(Math.min(width,height)*.035)),maxWidth=Math.max(1,width-2*margin);let size=Math.max(10,Math.round(Math.min(width,height)*.042));
 ctx.font=`600 ${size}px sans-serif`;const measured=ctx.measureText(s.watermarkText).width;if(measured>maxWidth){size=Math.max(1,size*maxWidth/measured);ctx.font=`600 ${size}px sans-serif`;}
 ctx.fillStyle=s.watermarkColor;ctx.globalAlpha=s.watermarkOpacity/100;ctx.shadowColor='rgba(0,0,0,.35)';ctx.shadowBlur=size*.15;
 ctx.textBaseline=s.watermarkPosition==='center'?'middle':'bottom';ctx.textAlign=s.watermarkPosition==='center'?'center':s.watermarkPosition==='bottom-left'?'left':'right';
 ctx.fillText(s.watermarkText,s.watermarkPosition==='center'?width/2:s.watermarkPosition==='bottom-left'?margin:width-margin,s.watermarkPosition==='center'?height/2:height-margin);ctx.globalAlpha=1;
 }
 const output=canvas.convertToBlob?await canvas.convertToBlob({type:s.format,quality:s.quality/100}):await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('이미지 저장에 실패했습니다.')),s.format,s.quality/100));
 if(output.type!==s.format)throw Error('이 브라우저에서는 선택한 출력 형식을 지원하지 않습니다. PNG 또는 JPG를 선택하세요.');
 return {blob:output,width,height};
 }finally{bitmap.close?.();if(canvas){canvas.width=1;canvas.height=1;}}
}
