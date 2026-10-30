"""End-to-end engine tests. Run with .venv/bin/python tests/full_backend_test.py."""
from pathlib import Path
import sys,time,json,io,zipfile,shutil,subprocess
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.engine import ACTIONS,ffmpeg,font,poppler
from backend.jobs import Job
from PIL import Image,ImageDraw,ImageFont
from pypdf import PdfReader
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import numpy as np,cv2
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tests/full/artifacts';OUT.mkdir(parents=True,exist_ok=True);results=[]
def check(action,files=None,options=None,verify=None):
    started=time.monotonic();uploads=[{'name':Path(p).name,'data':Path(p).read_bytes()} for p in (files or [])];job=Job(action,options or {},uploads)
    try:
        ACTIONS[action](job)
        if verify:verify(job)
        folder=OUT/action;folder.mkdir(exist_ok=True)
        for a in job.artifacts:shutil.copy2(job.path/a['file'],folder/a['name'])
        results.append({'action':action,'passed':True,'seconds':round(time.monotonic()-started,2),'artifacts':[a['name'] for a in job.artifacts]});print('PASS',action,flush=True)
    except Exception as e:
        results.append({'action':action,'passed':False,'error':str(e)});print('FAIL',action,str(e),flush=True)
    return job

def truth(condition,message='assertion failed'):
    if not condition:raise AssertionError(message)
# Original photographic-style sample from the image workspace.
photo=ROOT/'tests/fixtures/product.jpg'
a=np.zeros((299,401,3),dtype=np.uint8);yy,xx=np.indices(a.shape[:2]);a[:,:,0]=(xx*3)%255;a[:,:,1]=(yy*5)%255;a[:,:,2]=(xx+yy)%255
image=OUT/'pattern.png';Image.fromarray(a).save(image)
solid=OUT/'mark.png';im=Image.new('RGB',(400,300),'#538c77');d=ImageDraw.Draw(im);d.rectangle((300,220,335,255),fill='white');im.save(solid)
ocr=OUT/'ocr.png';im=Image.new('RGB',(1600,500),'white');d=ImageDraw.Draw(im);f=ImageFont.truetype(str(ROOT/'models/NanumGothic-Regular.ttf'),70);d.text((80,80),'MOA STUDIO 2026',font=f,fill='black');d.text((80,200),'모아 스튜디오 문자 인식',font=f,fill='black');im.save(ocr)
stamp=OUT/'signature.png';sig=Image.new('RGBA',(400,120));sd=ImageDraw.Draw(sig);sd.line([(10,100),(90,20),(130,90),(210,30),(380,80)],fill='#153c51',width=8);sig.save(stamp)
pdf=OUT/'sample.pdf';c=canvas.Canvas(str(pdf),pagesize=(595,842));c.setFont(font(),22);c.drawString(50,770,'MOA STUDIO 2026 / 모아 스튜디오');c.setFont(font(),12)
for r in range(4):
    for col in range(3):c.rect(50+col*150,620-r*35,150,35);c.drawString(58+col*150,633-r*35,['PRODUCT','COUNT','PRICE'][col] if r==0 else [f'Item {r}',str(r*2),str(r*1000)][col])
c.showPage();c.setFont(font(),30);c.drawString(60,720,'Second page');c.save()
scan=OUT/'scan.pdf';c=canvas.Canvas(str(scan),pagesize=(800,250));c.drawImage(ImageReader(im),0,0,800,250);c.save()
from docx import Document
source_docx=OUT/'source.docx';doc=Document();doc.add_paragraph('MOA contract');doc.save(source_docx)
# Images
check('background',[photo],{},lambda j:truth(Image.open(j.path/'background-1.png').getchannel('A').getextrema()[0]<240,'background not transparent'))
check('inpaint',[solid],{'rects':[{'x':.74,'y':.72,'w':.12,'h':.16}]},lambda j:truth(np.array(Image.open(j.path/'result.png'))[235,315,:3].mean()<200,'mark not restored'))
check('mosaic',[image],{'rects':[{'x':.1,'y':.1,'w':.5,'h':.5}],'block':20},lambda j:truth(not np.array_equal(np.array(Image.open(j.path/'result.png'))[40:100,40:100,:3],a[40:100,40:100])))
check('face_detect',[photo],{},lambda j:truth(isinstance(j.result['boxes'],list)))
check('mark_detect',[solid],{},lambda j:truth(isinstance(j.result['boxes'],list)))
def verify_split(j):
    restored=Image.new('RGBA',(401,299))
    for r in range(2):
        for col in range(3):
            piece=Image.open(j.path/f'split-{r+1:02}-{col+1:02}.png');restored.paste(piece,(round(col*401/3),round(r*299/2)))
    truth(np.array_equal(np.array(restored)[:,:,:3],a),'split did not preserve pixels')
check('split',[image],{'cols':3,'rows':2},verify_split)
def verify_qr(j):
    text,_,_=cv2.QRCodeDetector().detectAndDecode(cv2.imread(str(j.path/'qr.png')));truth(text=='https://example.com/moa-test','QR decode failed')
check('qr',[],{'text':'https://example.com/moa-test','size':512},verify_qr)
# Documents
check('images_pdf',[photo,image],{'a4':True},lambda j:truth(len(PdfReader(j.path/'images.pdf').pages)==2))
check('pdf_inspect',[pdf],{},lambda j:truth(j.result['pages']==2 and len(j.artifacts)==2))
check('pdf_merge',[pdf,pdf],{'order':[{'file':1,'page':2},{'file':0,'page':1}],'rotation':90},lambda j:truth(len(PdfReader(j.path/'merged.pdf').pages)==2 and PdfReader(j.path/'merged.pdf').pages[0].rotation==90))
check('pdf_split',[pdf],{'groups':'2;1-2'},lambda j:truth(len(PdfReader(j.path/'split-002.pdf').pages)==2))
check('pdf_images',[pdf],{'pages':'2','format':'jpg'},lambda j:truth((j.path/'page-2.jpg').exists()))
check('pdf_word',[pdf],{},lambda j:truth('MOA STUDIO' in '\n'.join(p.text for p in Document(j.path/'document.docx').paragraphs)))
check('pdf_word',[pdf],{'mode':'image','pages':'1'},lambda j:truth(len(Document(j.path/'document.docx').inline_shapes)==1))
check('pdf_excel',[pdf],{'pages':'1'},lambda j:truth(len(j.result['tables'])>=1 and j.result['tables'][0]['rows'][0][0]=='PRODUCT'))
check('pdf_ppt',[pdf],{},lambda j:truth(len(__import__('pptx',fromlist=['Presentation']).Presentation(j.path/'slides.pptx').slides)==2))
check('image_ocr',[ocr],{'language':'kor+eng'},lambda j:truth('MOA' in j.result['pages'][0]['text'] and '모아' in j.result['pages'][0]['text']))
check('pdf_ocr',[scan],{'language':'kor+eng','dpi':180},lambda j:truth('MOA' in j.result['pages'][0]['text']))
check('signature_pdf',[pdf,stamp],{'pages':'1','x':.5,'y':.5,'w':.25},lambda j:truth(len(PdfReader(j.path/'signed.pdf').pages)==2))
check('signature_docx',[source_docx,stamp],{},lambda j:truth(len(Document(j.path/'signed.docx').inline_shapes)==1))
check('table_excel',[],{'rows':[['Name','Value'],['=SUM(1,2)','3']]},lambda j:truth(__import__('openpyxl').load_workbook(j.path/'table.xlsx').active['A2'].data_type=='s'))
check('text_docx',[],{'text':'모아\nCorrected OCR'},lambda j:truth(len(Document(j.path/'corrected.docx').paragraphs)==2))
check('labels_pdf',[],{'cols':3,'gridRows':8,'rows':[{'text':'모아 상품 라벨','qr':'MOA-001'} for _ in range(25)],'guides':True},lambda j:truth(len(PdfReader(j.path/'labels.pdf').pages)==2))
# Video fixtures and output decoding.
video=OUT/'source.mp4';subprocess.run([ffmpeg(),'-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc=size=320x240:rate=8','-f','lavfi','-i','sine=frequency=440:sample_rate=22050','-t','3','-vf','drawbox=x=270:y=200:w=30:h=25:color=white:t=fill','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',str(video)],check=True)
check('video_gif',[video],{'ranges':[{'start':0,'end':1},{'start':1,'end':2}],'width':320,'fps':8},lambda j:truth(Image.open(j.path/'clip-01.gif').n_frames>=5))
def verify_video(j,name):
    cap=cv2.VideoCapture(str(j.path/name));truth(cap.isOpened() and cap.get(cv2.CAP_PROP_FRAME_COUNT)>=10,'video not decodable');cap.release()
check('video_restore',[video],{'rects':[{'x':.83,'y':.82,'w':.13,'h':.14}]},lambda j:verify_video(j,'restored.mp4'))
check('video_mp4',[video],{},lambda j:verify_video(j,'video.mp4'))
check('canvas_video',[photo,image],{'seconds':.5,'width':320,'ratio':.75},lambda j:verify_video(j,'canvas.mp4'))
# Deterministic animation frame archive and PDF rendering fallback.
frame_archive=OUT/'frames.zip'
with zipfile.ZipFile(frame_archive,'w',zipfile.ZIP_STORED) as z:
    for i in range(12):
        im=Image.new('RGB',(320,240),(i*20,90,130));stream=io.BytesIO();im.save(stream,format='JPEG');z.writestr(f'frame-{i:05}.jpg',stream.getvalue())
check('canvas_frames',[frame_archive],{'format':'gif','fps':12},lambda j:truth(Image.open(j.path/'animation.gif').n_frames==12))
import os
os.environ['MOA_PDFTOPPM']='/not-installed/pdf-renderer'
check('pdf_images',[pdf],{'pages':'1','dpi':100},lambda j:truth(Image.open(j.path/'page-1.png').height>1000))
os.environ.pop('MOA_PDFTOPPM',None)
(OUT/'backend-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps({'passed':sum(r['passed'] for r in results),'total':len(results)},ensure_ascii=False),flush=True)
sys.exit(0 if all(r['passed'] for r in results) else 1)
