let busy=false;
async function capture(format){
 if(!['png','pdf'].includes(format))throw Error('저장 형식을 확인하세요.');if(busy)throw Error('다른 캡처가 진행 중입니다. 잠시 후 다시 시도하세요.');busy=true;let target;
 try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id||!/^https?:\/\//.test(tab.url||''))throw Error('일반 웹페이지 탭에서 실행하세요. 브라우저 설정·스토어 페이지는 캡처할 수 없습니다.');target={tabId:tab.id};await chrome.debugger.attach(target,'1.3');let result;
 if(format==='pdf')result=await chrome.debugger.sendCommand(target,'Page.printToPDF',{printBackground:true,preferCSSPageSize:true,marginTop:.25,marginBottom:.25,marginLeft:.25,marginRight:.25});
 else{const metrics=await chrome.debugger.sendCommand(target,'Page.getLayoutMetrics'),size=metrics.cssContentSize||metrics.contentSize;if(size.width*size.height>80_000_000||size.height>30000)throw Error('페이지가 너무 깁니다. PDF 형식으로 저장하세요.');result=await chrome.debugger.sendCommand(target,'Page.captureScreenshot',{format:'png',captureBeyondViewport:true,fromSurface:true,clip:{x:0,y:0,width:Math.ceil(size.width),height:Math.ceil(size.height),scale:1}});}
 await chrome.debugger.detach(target);target=null;const name=(tab.title||'webpage').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100);await chrome.downloads.download({url:`data:${format==='pdf'?'application/pdf':'image/png'};base64,${result.data}`,filename:name+'.'+format,saveAs:true});return {ok:true};
 }finally{if(target)try{await chrome.debugger.detach(target);}catch{}busy=false;}
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{if(message?.type!=='moa-capture')return false;capture(message.format).then(()=>respond({ok:true})).catch(error=>respond({ok:false,error:error.message||'캡처하지 못했습니다.'}));return true;});
