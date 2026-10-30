from pathlib import Path
import base64, io, json, math, os, re, shutil, subprocess, threading, zipfile
from PIL import Image, ImageOps, ImageDraw, ImageFilter
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
Image.MAX_IMAGE_PIXELS=100_000_000
MODEL_LOCK=threading.Lock();SESSION=None
ACTIONS={}
def action(*names):
    def wrap(fn):
        for n in names:ACTIONS[n]=fn
        return fn
    return wrap
def number(o,key,default,low,high):
    try:value=float(o.get(key,default))
    except (ValueError,TypeError):raise ValueError(f'{key} 숫자를 확인하세요.')
    if not math.isfinite(value) or not low<=value<=high:raise ValueError(f'{key}: {low}~{high} 범위로 입력하세요.')
    return value

def image(path):
    im=Image.open(path);im.load();out=ImageOps.exif_transpose(im).convert('RGBA');out.info.clear();return out
def require(j,n=1):
    if len(j.files)<n:raise ValueError('필요한 파일을 추가하세요.')
def output_image(j,im,name='result.png'):
    p=j.path/name;im.save(p);j.artifact(p);return p
def bundle(j,name='results.zip'):
    if len(j.artifacts)<2:return
    artifacts=list(j.artifacts);p=j.path/name
    with zipfile.ZipFile(p,'w',zipfile.ZIP_DEFLATED) as z:
        for a in artifacts:z.write(j.path/a['file'],a['name'])
    j.artifact(p)
def pages(spec,count):
    if not str(spec or '').strip():return list(range(count))
    out=[]
    for part in str(spec).replace(' ','').split(','):
        m=re.fullmatch(r'(\d+)(?:-(\d+))?',part)
        if not m:raise ValueError('페이지를 1,3-5 형식으로 입력하세요.')
        a=int(m[1]);b=int(m[2] or a)
        if a<1 or b<a or b>count:raise ValueError(f'페이지 범위는 1~{count}입니다.')
        out.extend(range(a-1,b))
    return list(dict.fromkeys(out))
def font():
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    if 'MoaKorean' not in pdfmetrics.getRegisteredFontNames():pdfmetrics.registerFont(TTFont('MoaKorean',str(ROOT/'models/NanumGothic-Regular.ttf')))
    return 'MoaKorean'
def node_binary():
    custom=os.environ.get('MOA_NODE')
    bundled=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
    return custom or shutil.which('node') or str(bundled)
def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()
def poppler():
    custom=os.environ.get('MOA_PDFTOPPM')
    bundled=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm'
    return custom or shutil.which('pdftoppm') or str(bundled)
def raster(j,path,indices=None,dpi=130,prefix='page'):
    from pypdf import PdfReader
    reader=PdfReader(path)
    if reader.is_encrypted and not reader.decrypt(str(j.options.get('password',''))):raise ValueError('암호가 필요한 PDF입니다.')
    selected=indices if indices is not None else pages(j.options.get('pages'),len(reader.pages))
    if len(selected)>60:raise ValueError('한 번에 최대 60페이지를 변환할 수 있습니다.')
    paths=[]
    for k,idx in enumerate(selected):
        j.update(5+45*k/max(1,len(selected)),f'{idx+1}페이지를 읽는 중')
        page=reader.pages[idx];area=float(page.mediabox.width)*float(page.mediabox.height)*(dpi/72)**2
        if area>40_000_000:raise ValueError('페이지가 너무 큽니다. 해상도를 줄여주세요.')
        dest=j.path/f'{prefix}-{idx+1}'
        args=[poppler(),'-f',str(idx+1),'-l',str(idx+1),'-r',str(dpi),'-scale-to',str(min(6000,math.ceil(max(float(page.mediabox.width),float(page.mediabox.height))*dpi/72))),'-singlefile','-png']
        if j.options.get('password'):args+=['-upw',str(j.options['password'])]
        if Path(poppler()).is_file():j.run(args+[path,dest],timeout=90)
        else:
            import pypdfium2
            pdf=pypdfium2.PdfDocument(str(path),password=str(j.options.get('password','')) or None)
            rendered=pdf[idx].render(scale=min(dpi/72,6000/max(float(page.mediabox.width),float(page.mediabox.height))));rendered.to_pil().save(dest.with_suffix('.png'));rendered.close();pdf.close()
        paths.append(dest.with_suffix('.png'))
    return paths

@action('background')
def background(j):
    require(j);import onnxruntime as ort
    global SESSION
    for i,path in enumerate(j.files):
        j.update(i/len(j.files)*90,'AI로 피사체를 찾는 중');im=image(path);original=im.size
        with MODEL_LOCK:
            if SESSION is None:
                settings=ort.SessionOptions();settings.intra_op_num_threads=2;settings.inter_op_num_threads=1
                SESSION=ort.InferenceSession(str(ROOT/'models/u2netp.onnx'),sess_options=settings,providers=['CPUExecutionProvider'])
            a=np.array(im.convert('RGB').resize((320,320),Image.Resampling.LANCZOS)).astype(np.float32);a/=max(float(a.max()),1e-6);a=(a-np.array([.485,.456,.406],dtype=np.float32))/np.array([.229,.224,.225],dtype=np.float32);a=a.transpose(2,0,1)[None]
            pred=SESSION.run(None,{SESSION.get_inputs()[0].name:a})[0][0,0];pred=(pred-pred.min())/max(float(pred.max()-pred.min()),1e-6)
        mask=Image.fromarray((pred*255).astype('uint8')).resize(original,Image.Resampling.LANCZOS)
        im.putalpha(Image.fromarray(np.minimum(np.array(im.getchannel('A')),np.array(mask))))
        if j.options.get('background'):
            color=j.options['background'];back=Image.new('RGBA',original,color);back.alpha_composite(im);im=back
        output_image(j,im,f'background-{i+1}.png')
    bundle(j)

@action('inpaint','mosaic','face_detect')
def retouch(j):
    require(j);import cv2
    im=image(j.files[0]);a=np.array(im);rgb=cv2.cvtColor(a[:,:,:3],cv2.COLOR_RGB2BGR);h,w=rgb.shape[:2]
    if j.action=='face_detect':
        cascade=cv2.CascadeClassifier(cv2.data.haarcascades+'haarcascade_frontalface_default.xml');small=cv2.cvtColor(rgb,cv2.COLOR_BGR2GRAY);boxes=cascade.detectMultiScale(small,1.1,4,minSize=(24,24));j.result={'boxes':[{'x':int(x)/w,'y':int(y)/h,'w':int(bw)/w,'h':int(bh)/h} for x,y,bw,bh in boxes]};return
    mask=np.zeros((h,w),np.uint8)
    if len(j.files)>1:
        m=image(j.files[1]).resize((w,h));mask=np.array(m.getchannel('A')) if np.array(m.getchannel('A')).min()<255 else np.array(m.convert('L'))
    rects=j.options.get('rects',[])
    if len(rects)>500:raise ValueError('영역이 너무 많습니다.')
    for r in rects:
        x=int(number(r,'x',0,0,1)*w);y=int(number(r,'y',0,0,1)*h);rw=int(number(r,'w',0,0,1)*w);rh=int(number(r,'h',0,0,1)*h)
        if j.options.get('shape')=='circle':cv2.ellipse(mask,(x+rw//2,y+rh//2),(max(1,rw//2),max(1,rh//2)),0,0,360,255,-1)
        else:mask[y:min(h,y+rh),x:min(w,x+rw)]=255
    if not mask.any():raise ValueError('처리할 영역을 먼저 지정하세요.')
    if j.action=='inpaint':
        j.update(15,'선택 영역을 주변 픽셀로 복원하는 중');out=cv2.inpaint(rgb,mask,int(number(j.options,'radius',5,1,15)),cv2.INPAINT_TELEA)
    else:
        block=int(number(j.options,'block',16,4,80));style=j.options.get('style','pixel')
        if style=='blur':filtered=cv2.GaussianBlur(rgb,(0,0),block)
        else:filtered=cv2.resize(cv2.resize(rgb,(max(1,w//block),max(1,h//block)),interpolation=cv2.INTER_NEAREST),(w,h),interpolation=cv2.INTER_NEAREST)
        out=np.where(mask[:,:,None]>0,filtered,rgb)
    a[:,:,:3]=cv2.cvtColor(out,cv2.COLOR_BGR2RGB);output_image(j,Image.fromarray(a))

@action('split')
def split(j):
    require(j);im=image(j.files[0]);cols=int(number(j.options,'cols',2,1,16));rows=int(number(j.options,'rows',2,1,16))
    if cols*rows>64:raise ValueError('한 번에 최대 64조각까지 지원합니다.')
    for r in range(rows):
        for c in range(cols):
            j.check();box=(round(c*im.width/cols),round(r*im.height/rows),round((c+1)*im.width/cols),round((r+1)*im.height/rows));output_image(j,im.crop(box),f'split-{r+1:02}-{c+1:02}.png')
    bundle(j)

@action('qr')
def qr(j):
    import qrcode
    text=str(j.options.get('text','')).strip()
    if not text or len(text.encode())>1800:raise ValueError('QR 내용은 1~1800바이트로 입력하세요.')
    qr=qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H,border=4);qr.add_data(text);qr.make(fit=True);matrix=qr.get_matrix();n=len(matrix);size=int(number(j.options,'size',1024,128,4096));color=str(j.options.get('color','#172e3e'));bg=str(j.options.get('background','#ffffff'))
    if not re.fullmatch(r'#[0-9a-fA-F]{6}',color) or not re.fullmatch(r'#[0-9a-fA-F]{6}',bg):raise ValueError('QR 색상을 확인하세요.')
    style=j.options.get('style','square');fmt=j.options.get('format','png');step=size/n;im=Image.new('RGB',(size,size),bg);draw=ImageDraw.Draw(im);shapes=[]
    for y,row in enumerate(matrix):
        for x,on in enumerate(row):
            if not on:continue
            eye=(4<=x<11 and 4<=y<11) or (n-11<=x<n-4 and 4<=y<11) or (4<=x<11 and n-11<=y<n-4)
            box=(round(x*step),round(y*step),round((x+1)*step),round((y+1)*step))
            if style=='dots' and not eye:draw.ellipse(box,fill=color);shapes.append(f'<circle cx="{x+.5}" cy="{y+.5}" r=".48"/>')
            else:draw.rectangle(box,fill=color);shapes.append(f'<rect x="{x}" y="{y}" width="1" height="1"/>')
    if fmt=='svg':
        p=j.path/'qr.svg';p.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {n} {n}"><rect width="{n}" height="{n}" fill="{bg}"/><g fill="{color}">'+''.join(shapes)+'</g></svg>');j.artifact(p)
    else:output_image(j,im,'qr.jpg' if fmt=='jpg' else 'qr.png')

@action('pdf_inspect','pdf_images','pdf_merge','pdf_split','pdf_word','pdf_excel','pdf_ppt','pdf_ocr','images_pdf','signature_pdf','signature_docx','table_excel','labels_pdf')
def document(j):
    if j.action=='labels_pdf':return labels(j)
    if j.action=='table_excel':
        from openpyxl import Workbook
        rows=j.options.get('rows',[])
        if not isinstance(rows,list) or len(rows)>10000:raise ValueError('표는 최대 10,000행까지 저장합니다.')
        wb=Workbook();ws=wb.active
        for row in rows:
            if not isinstance(row,list) or len(row)>200:raise ValueError('표는 최대 200열까지 저장합니다.')
            # append with explicit string type to prevent formula execution from extracted text.
            ws.append([str(x)[:32767] for x in row])
        for row in ws:
            for cell in row:
                if cell.data_type=='f':cell.data_type='s'
        p=j.path/'table.xlsx';wb.save(p);j.artifact(p);return
    require(j)
    from pypdf import PdfReader,PdfWriter
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader
    if j.action=='images_pdf':
        p=j.path/'images.pdf';c=canvas.Canvas(str(p))
        for file in j.files:
            j.check();im=image(file).convert('RGB');size=(595.276,841.89) if j.options.get('a4') else (im.width*.75,im.height*.75);c.setPageSize(size);margin=20 if j.options.get('a4') else 0;ratio=min((size[0]-margin*2)/im.width,(size[1]-margin*2)/im.height);c.drawImage(ImageReader(im),(size[0]-im.width*ratio)/2,(size[1]-im.height*ratio)/2,im.width*ratio,im.height*ratio);c.showPage()
        c.save();j.artifact(p);return
    if j.action=='signature_docx':
        require(j,2);from docx import Document
        from docx.shared import Inches
        d=Document(j.files[0]);d.add_picture(str(j.files[1]),width=Inches(number(j.options,'inches',1.5,.3,5)));p=j.path/'signed.docx';d.save(p);j.artifact(p);return
    readers=[]
    for f in j.files[:1] if j.action=='signature_pdf' else j.files:
        reader=PdfReader(f)
        if reader.is_encrypted and not reader.decrypt(str(j.options.get('password',''))):raise ValueError('PDF 암호를 입력하세요.')
        readers.append(reader)
    reader=readers[0];selection=pages(j.options.get('pages'),len(reader.pages))
    if j.action=='pdf_inspect':
        images=raster(j,j.files[0],selection[:12],80,'preview');j.result={'pages':len(reader.pages),'previewPages':[n+1 for n in selection[:12]],'text':[reader.pages[n].extract_text() or '' for n in selection[:12]]}
        for p in images:j.artifact(p)
        return
    if j.action=='pdf_merge':
        writer=PdfWriter();rotation=int(number(j.options,'rotation',0,0,270))
        if rotation%90:raise ValueError('회전은 90도 단위입니다.')
        order=j.options.get('order')
        if order:
            if not isinstance(order,list) or len(order)>500:raise ValueError('페이지 순서를 확인하세요.')
            selected=[]
            for item in order:
                fi=int(item.get('file',-1));pi=int(item.get('page',0))-1
                if not 0<=fi<len(readers) or not 0<=pi<len(readers[fi].pages):raise ValueError('페이지 번호를 확인하세요.')
                selected.append(readers[fi].pages[pi])
        else:selected=[r.pages[k] for r in readers for k in pages(j.options.get('pages'),len(r.pages))]
        for page in selected:
            j.check();writer.add_page(page)
            if rotation:writer.pages[-1].rotate(rotation)
        p=j.path/'merged.pdf';writer.write(p);j.artifact(p);return
    if j.action=='pdf_split':
        groups=str(j.options.get('groups','')).split(';') if j.options.get('groups') else [str(n+1) for n in selection]
        if len(groups)>100:raise ValueError('최대 100개 파일로 분할할 수 있습니다.')
        for i,group in enumerate(groups):
            j.check();w=PdfWriter()
            for idx in pages(group,len(reader.pages)):w.add_page(reader.pages[idx])
            p=j.path/f'split-{i+1:03}.pdf';w.write(p);j.artifact(p)
        bundle(j);return
    if j.action=='signature_pdf':
        require(j,2);sig=image(j.files[1]);writer=PdfWriter()
        for idx,page in enumerate(reader.pages):
            if idx in selection:
                width=float(page.mediabox.width);height=float(page.mediabox.height);sw=number(j.options,'w',.25,.01,1)*width;sh=sw*sig.height/sig.width;x=number(j.options,'x',.65,0,1)*width;y=height-number(j.options,'y',.75,0,1)*height-sh
                if x+sw>width or y<0:raise ValueError('서명이 페이지 밖으로 나갑니다. 위치나 크기를 조절하세요.')
                data=io.BytesIO();c=canvas.Canvas(data,pagesize=(width,height));c.drawImage(ImageReader(sig),x,y,sw,sh,mask='auto');c.save();data.seek(0);page.merge_page(PdfReader(data).pages[0])
            writer.add_page(page)
        p=j.path/'signed.pdf';writer.write(p);j.artifact(p);return
    if j.action=='pdf_excel':
        import pdfplumber
        from openpyxl import Workbook
        tables=[];wb=Workbook();wb.remove(wb.active)
        with pdfplumber.open(j.files[0],password=j.options.get('password')) as doc:
            for idx in selection:
                j.check()
                for table in doc.pages[idx].extract_tables():
                    rows=[[str(x or '') for x in row] for row in table];tables.append({'page':idx+1,'rows':rows});ws=wb.create_sheet(f'Table{len(tables)}')
                    for row in rows:
                        ws.append(row)
                    for row in ws:
                        for cell in row:
                            if cell.data_type=='f':cell.data_type='s'
        if not tables:raise ValueError('선 구조의 표를 찾지 못했습니다. 스캔 PDF는 OCR로 읽거나 표를 직접 입력하세요.')
        p=j.path/'tables.xlsx';wb.save(p);j.artifact(p);data=j.path/'tables.json';data.write_text(json.dumps(tables,ensure_ascii=False));j.artifact(data);j.result={'tables':tables};return
    images=None
    if j.action in ('pdf_images','pdf_ppt','pdf_ocr') or (j.action=='pdf_word' and j.options.get('mode')=='image'):images=raster(j,j.files[0],selection,int(number(j.options,'dpi',130,72,200)))
    if j.action=='pdf_images':
        for im in images:
            if j.options.get('format')=='jpg':dest=im.with_suffix('.jpg');Image.open(im).convert('RGB').save(dest,quality=92);j.artifact(dest)
            else:j.artifact(im)
        bundle(j);return
    if j.action=='pdf_ppt':
        from pptx import Presentation
        from pptx.util import Inches
        prs=Presentation();prs.slide_width=Inches(10);prs.slide_height=Inches(10*float(reader.pages[selection[0]].mediabox.height)/float(reader.pages[selection[0]].mediabox.width))
        for file in images:
            slide=prs.slides.add_slide(prs.slide_layouts[6]);im=Image.open(file);ratio=min(prs.slide_width/im.width,prs.slide_height/im.height);w=int(im.width*ratio);h=int(im.height*ratio);slide.shapes.add_picture(str(file),(prs.slide_width-w)//2,(prs.slide_height-h)//2,width=w,height=h)
        p=j.path/'slides.pptx';prs.save(p);j.artifact(p);return
    if j.action in ('pdf_word','pdf_ocr'):
        from docx import Document
        from docx.shared import Inches
        doc=Document();texts=[]
        if j.action=='pdf_ocr':
            j.update(55,'한글·영문 문자를 인식하는 중');out=j.path/'ocr.json';j.run([node_binary(),ROOT/'backend/ocr.mjs',ROOT,j.options.get('language','kor+eng'),out,*images],timeout=600);recognized=json.loads(out.read_text());j.result={'pages':[{'text':x['text'],'confidence':x['confidence']} for x in recognized]};j.artifact(out);texts=[x['text'] for x in recognized]
        elif images:
            for idx,file in enumerate(images):
                if idx:doc.add_page_break()
                doc.add_picture(str(file),width=Inches(6.2))
        else:texts=[reader.pages[n].extract_text() or '' for n in selection]
        for idx,text in enumerate(texts):
            if idx:doc.add_page_break()
            for line in text.splitlines():doc.add_paragraph(line)
        if not images and not any(t.strip() for t in texts):raise ValueError('텍스트가 없는 PDF입니다. OCR 또는 이미지 Word를 선택하세요.')
        p=j.path/'document.docx';doc.save(p);j.artifact(p)
        if texts:p=j.path/'text.txt';p.write_text('\n\n'.join(texts));j.artifact(p)
        return

@action('image_ocr')
def image_ocr(j):
    require(j);j.update(10,'문자를 인식하는 중');out=j.path/'ocr.json';j.run([node_binary(),ROOT/'backend/ocr.mjs',ROOT,j.options.get('language','kor+eng'),out,*j.files],timeout=600);data=json.loads(out.read_text());p=j.path/'text.txt';p.write_text('\n\n'.join(x['text'] for x in data));j.result={'pages':[{'text':x['text'],'confidence':x['confidence']} for x in data]};j.artifact(p);j.artifact(out)

@action('video_gif','video_restore','canvas_video')
def video(j):
    require(j)
    if j.action=='canvas_video':
        fps=12;seconds=number(j.options,'seconds',2,.5,10);inputs=[]
        for f in j.files:inputs+=['-loop','1','-t',str(seconds),'-i',str(f)]
        n=len(j.files)
        if n>10:raise ValueError('영상은 최대 10페이지입니다.')
        width=int(number(j.options,'width',960,128,1920));width-=width%2;filters=[];height=int(width*number(j.options,'ratio',.5625,.2,3))//2*2
        for i in range(n):filters.append(f'[{i}:v]scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:white,setsar=1,fps={fps}[v{i}]')
        filters.append(''.join(f'[v{i}]' for i in range(n))+f'concat=n={n}:v=1:a=0[out]');p=j.path/'canvas.mp4';j.run([ffmpeg(),'-y',*inputs,'-filter_complex',';'.join(filters),'-map','[out]','-c:v','libx264','-pix_fmt','yuv420p',p],timeout=180);j.artifact(p);return
    if j.action=='video_gif':
        width=int(number(j.options,'width',640,128,1280));fps=int(number(j.options,'fps',12,3,24));ranges=j.options.get('ranges') or [{'start':j.options.get('start',0),'end':j.options.get('end',5)}]
        if len(ranges)>10:raise ValueError('한 번에 최대 10개 구간을 지원합니다.')
        total=0
        for i,r in enumerate(ranges):
            start=number(r,'start',0,0,600);end=number(r,'end',5,0,600);duration=end-start;total+=duration
            if duration<=0 or duration>60 or total>120:raise ValueError('구간은 0~10분 사이, 한 구간 최대 60초, 합계 120초로 지정하세요.')
            j.update(i/len(ranges)*90,f'{i+1}번 GIF 구간 변환 중');p=j.path/f'clip-{i+1:02}.gif';vf=f'fps={fps},scale={width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer'
            j.run([ffmpeg(),'-y','-ss',str(start),'-t',str(duration),'-i',j.files[0],'-filter_complex',vf,'-loop','0',p],timeout=180)
            if not p.exists() or p.stat().st_size<100:raise ValueError('선택 구간에 영상 프레임이 없습니다.')
            j.artifact(p)
        bundle(j);return
    import cv2
    cap=cv2.VideoCapture(str(j.files[0]));fps=cap.get(cv2.CAP_PROP_FPS);w=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH));h=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT));count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if not cap.isOpened() or not fps or not w or not h:raise ValueError('영상을 읽을 수 없습니다.')
    if w*h>1920*1080 or count/fps>60:cap.release();raise ValueError('영역 복원은 최대 1080p·60초 영상입니다. 먼저 짧은 구간으로 준비하세요.')
    mask=np.zeros((h,w),np.uint8)
    for r in j.options.get('rects',[]):
        x=int(number(r,'x',0,0,1)*w);y=int(number(r,'y',0,0,1)*h);rw=int(number(r,'w',0,0,1)*w);rh=int(number(r,'h',0,0,1)*h);mask[y:y+rh,x:x+rw]=255
    if not mask.any():cap.release();raise ValueError('복원할 영역을 지정하세요.')
    silent=j.path/'silent.mp4';writer=cv2.VideoWriter(str(silent),cv2.VideoWriter_fourcc(*'mp4v'),fps,(w,h))
    if not writer.isOpened():cap.release();raise ValueError('영상 인코더를 사용할 수 없습니다.')
    i=0
    try:
        while True:
            j.check();ok,frame=cap.read()
            if not ok:break
            writer.write(cv2.inpaint(frame,mask,3,cv2.INPAINT_TELEA));i+=1
            if i%5==0:j.update(i/max(1,count)*85,f'{i}/{count}프레임 복원 중')
    finally:writer.release();cap.release()
    p=j.path/'restored.mp4';j.run([ffmpeg(),'-y','-i',silent,'-i',j.files[0],'-map','0:v','-map','1:a?','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',p],timeout=180);j.artifact(p)

def labels(j):
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader
    from reportlab.lib.colors import HexColor
    from reportlab.lib.units import mm
    import qrcode
    o=j.options;cols=int(number(o,'cols',3,1,10));rows=int(number(o,'gridRows',8,1,30));margin=number(o,'margin',10,0,25)*mm;gap=number(o,'gap',2,0,10)*mm;data=o.get('rows',[])
    if not isinstance(data,list) or not data or len(data)>2000:raise ValueError('라벨 내용은 1~2000개로 입력하세요.')
    width=210*mm;height=297*mm;cw=(width-2*margin-gap*(cols-1))/cols;ch=(height-2*margin-gap*(rows-1))/rows
    if cw<10 or ch<10:raise ValueError('여백·간격이 너무 큽니다.')
    p=j.path/'labels.pdf';c=canvas.Canvas(str(p),pagesize=(width,height));start=int(number(o,'start',0,0,cols*rows-1));fsize=number(o,'fontSize',10,5,40);family=font()
    for idx,row in enumerate(data):
        j.check();at=idx+start
        if at and at%(cols*rows)==0:c.showPage()
        cell=at%(cols*rows);x=margin+(cell%cols)*(cw+gap);y=height-margin-(cell//cols+1)*ch-(cell//cols)*gap
        if o.get('guides',True):c.setStrokeColor(HexColor('#cccccc'));c.roundRect(x,y,cw,ch,2)
        text=str(row.get('text','')) if isinstance(row,dict) else str(row);lines=text.split('\n');c.setFont(family,fsize);c.setFillColor(HexColor(o.get('color','#24364a')))
        tx=x+4*mm
        if isinstance(row,dict) and row.get('qr'):
            qr=qrcode.make(str(row['qr']));side=min(ch-4*mm,cw*.4);c.drawImage(ImageReader(qr.get_image()),x+2*mm,y+(ch-side)/2,side,side);tx=x+side+4*mm
        available=x+cw-tx-2*mm
        draw_size=fsize
        while True:
            wrapped=[]
            for source_line in lines:
                line=''
                for char in source_line:
                    if c.stringWidth(line+char,family,draw_size)>available and line:wrapped.append(line);line=''
                    line+=char
                wrapped.append(line)
            if len(wrapped)*draw_size*1.25<=ch-4*mm:break
            draw_size-=.5
            if draw_size<5:raise ValueError(f'{idx+1}번 라벨의 내용이 너무 깁니다. 글을 줄이거나 더 큰 라벨을 선택하세요.')
        c.setFont(family,draw_size)
        for k,line in enumerate(wrapped):c.drawString(tx,y+ch-4*mm-draw_size-k*draw_size*1.25,line)
    c.save();j.artifact(p)

@action('video_mp4')
def video_mp4(j):
    require(j);p=j.path/'video.mp4';j.update(10,'MP4로 저장하는 중');j.run([ffmpeg(),'-y','-i',j.files[0],'-t','60','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',p],timeout=180);j.artifact(p)

@action('mark_detect')
def mark_detect(j):
    require(j);import cv2
    im=image(j.files[0]);rgb=np.array(im.convert('RGB'));h,w=rgb.shape[:2];gray=cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY);mask=(gray>220).astype(np.uint8)*255;mask[:int(h*.6),:]=0;mask[:,:int(w*.6)]=0
    contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE);candidates=[]
    for contour in contours:
        x,y,bw,bh=cv2.boundingRect(contour)
        if 8<=bw<=w*.18 and 8<=bh<=h*.18 and .35<bw/bh<2.5 and cv2.contourArea(contour)/(bw*bh)<.85:candidates.append((x,y,bw,bh))
    candidates=sorted(candidates,key=lambda b:(w-b[0]-b[2])**2+(h-b[1]-b[3])**2)[:1];pad=max(3,int(min(w,h)*.008));j.result={'boxes':[{'x':max(0,x-pad)/w,'y':max(0,y-pad)/h,'w':min(w-x+pad,bw+pad*2)/w,'h':min(h-y+pad,bh+pad*2)/h} for x,y,bw,bh in candidates]}

@action('text_docx')
def text_docx(j):
    from docx import Document
    text=str(j.options.get('text',''))
    if len(text)>2_000_000:raise ValueError('문자가 너무 많습니다.')
    d=Document()
    for line in text.splitlines():d.add_paragraph(line)
    p=j.path/'corrected.docx';d.save(p);j.artifact(p)

@action('canvas_frames')
def canvas_frames(j):
    require(j);fps=int(number(j.options,'fps',12,3,24));folder=j.path/'frames';folder.mkdir();total=0
    with zipfile.ZipFile(j.files[0]) as z:
        infos=z.infolist()
        if not 1<=len(infos)<=1440:raise ValueError('영상 프레임 개수를 확인하세요.')
        expected=[f'frame-{i:05}.jpg' for i in range(len(infos))]
        if z.namelist()!=expected:raise ValueError('프레임 파일 순서가 올바르지 않습니다.')
        if len(infos)/fps>60:raise ValueError('영상 길이는 최대 60초입니다.')
        for info in infos:
            j.check();total+=info.file_size
            if total>300*1024*1024 or info.file_size>10*1024*1024:raise ValueError('프레임 파일이 너무 큽니다.')
            data=z.read(info);im=Image.open(io.BytesIO(data))
            if im.width>1920 or im.height>4000 or im.width*im.height>5_000_000:raise ValueError('프레임 크기가 너무 큽니다.')
            (folder/info.filename).write_bytes(data)
    j.update(30,'애니메이션을 인코딩하는 중');fmt=j.options.get('format','mp4');p=j.path/('animation.gif' if fmt=='gif' else 'animation.mp4')
    args=[ffmpeg(),'-y','-framerate',str(fps),'-i',folder/'frame-%05d.jpg']
    if fmt=='gif':args+=['-filter_complex','split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer','-loop','0']
    else:args+=['-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart']
    j.run(args+[p],timeout=180);j.artifact(p)
