// ZIP STORE, UTF-8 names, CRC32; retains Blob parts rather than copying the entire archive.
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export async function crc32(blob){let crc=0xffffffff;const reader=blob.stream().getReader();try{while(true){const {done,value}=await reader.read();if(done)break;for(const b of value)crc=crcTable[(crc^b)&255]^(crc>>>8);}}finally{reader.releaseLock();}return (crc^0xffffffff)>>>0;}
function header(size){const buffer=new ArrayBuffer(size);return {bytes:new Uint8Array(buffer),view:new DataView(buffer)};}
export async function makeZip(entries,onProgress=()=>{}){
 if(entries.length>65535)throw Error('ZIP 파일 개수 한도를 초과했습니다.');
 const parts=[],central=[];let offset=0;const seen=new Set();
 for(let i=0;i<entries.length;i++){
 const {name,blob}=entries[i];if(seen.has(name))throw Error('중복된 파일명입니다: '+name);seen.add(name);const filename=encoder.encode(name);if(filename.length>65535||blob.size>0xffffffff)throw Error('ZIP 크기 한도를 초과했습니다.');const crc=await crc32(blob),local=header(30);const v=local.view;
 v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,blob.size,true);v.setUint32(22,blob.size,true);v.setUint16(26,filename.length,true);
 const c=header(46),d=c.view;d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,33,true);d.setUint32(16,crc,true);d.setUint32(20,blob.size,true);d.setUint32(24,blob.size,true);d.setUint16(28,filename.length,true);d.setUint32(42,offset,true);
 parts.push(local.bytes,filename,blob);central.push(c.bytes,filename);offset+=30+filename.length+blob.size;if(offset>0xffffffff)throw Error('ZIP은 4GB 미만으로 저장하세요.');onProgress((i+1)/entries.length);
 }
 const dirSize=central.reduce((n,b)=>n+b.byteLength,0),end=header(22),v=end.view;v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,dirSize,true);v.setUint32(16,offset,true);
 return new Blob([...parts,...central,end.bytes],{type:'application/zip'});
}
export async function readZip(blob){
 if(blob.size>550*1024*1024)throw Error('프로젝트 파일은 550MB 이하만 불러올 수 있습니다.');
 const tail=new DataView(await blob.slice(Math.max(0,blob.size-65557)).arrayBuffer());let end=-1;
 for(let i=tail.byteLength-22;i>=0;i--)if(tail.getUint32(i,true)===0x06054b50&&i+22+tail.getUint16(i+20,true)===tail.byteLength){end=i;break;}
 if(end<0)throw Error('올바른 모아 프로젝트 파일이 아닙니다.');
 const count=tail.getUint16(end+10,true),offset=tail.getUint32(end+16,true),dirSize=tail.getUint32(end+12,true);
 if(tail.getUint16(end+4,true)||tail.getUint16(end+6,true)||count>101||offset+dirSize>blob.size)throw Error('프로젝트 구조가 올바르지 않습니다.');
 const dir=new DataView(await blob.slice(offset,offset+dirSize).arrayBuffer()),out=new Map();let cursor=0,total=0;
 for(let i=0;i<count;i++){
 if(cursor+46>dir.byteLength||dir.getUint32(cursor,true)!==0x02014b50)throw Error('프로젝트 목록이 손상되었습니다.');
 const flags=dir.getUint16(cursor+8,true),method=dir.getUint16(cursor+10,true),crc=dir.getUint32(cursor+16,true),size=dir.getUint32(cursor+24,true),packed=dir.getUint32(cursor+20,true),len=dir.getUint16(cursor+28,true),extra=dir.getUint16(cursor+30,true),comment=dir.getUint16(cursor+32,true),at=dir.getUint32(cursor+42,true);
 if(method!==0||flags&1||packed!==size||cursor+46+len+extra+comment>dir.byteLength)throw Error('모아에서 저장한 프로젝트 파일을 선택하세요.');
 const name=decoder.decode(new Uint8Array(dir.buffer,cursor+46,len));if(out.has(name)||name.includes('..')||name.startsWith('/'))throw Error('프로젝트 경로가 올바르지 않습니다.');
 const local=new DataView(await blob.slice(at,at+30).arrayBuffer());if(local.byteLength!==30||local.getUint32(0,true)!==0x04034b50)throw Error('프로젝트 파일이 손상되었습니다.');const start=at+30+local.getUint16(26,true)+local.getUint16(28,true);if(start+size>offset)throw Error('프로젝트 파일 범위를 확인할 수 없습니다.');
 const data=blob.slice(start,start+size);total+=size;if(total>510*1024*1024)throw Error('프로젝트 크기 한도를 초과했습니다.');if(await crc32(data)!==crc)throw Error('파일이 손상되었습니다: '+name);out.set(name,data);cursor+=46+len+extra+comment;
 }return out;
}
