import {createWorker} from 'tesseract.js';
import fs from 'node:fs/promises';
import path from 'node:path';
const [root,language,output,...images]=process.argv.slice(2);
if(!['eng','kor+eng'].includes(language))throw Error('Unsupported language');
const worker=await createWorker(language,1,{langPath:path.join(root,'models'),cacheMethod:'none',gzip:true});
try{const pages=[];for(const file of images){const {data}=await worker.recognize(file,{}, {text:true,blocks:true});pages.push({text:data.text,confidence:data.confidence,blocks:data.blocks});}await fs.writeFile(output,JSON.stringify(pages));}finally{await worker.terminate();}
