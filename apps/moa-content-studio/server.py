#!/usr/bin/env python3
"""Loopback-only workspace and local media/document processing API."""
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from email.parser import BytesParser
from email.policy import default
from urllib.parse import urlsplit,unquote,quote,parse_qs
import argparse,json,mimetypes,os,re,secrets,threading,time
ROOT=Path(__file__).parent.resolve();TOKEN=secrets.token_urlsafe(24)
class Handler(SimpleHTTPRequestHandler):
    extensions_map={**SimpleHTTPRequestHandler.extensions_map,'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def list_directory(self,path):self.send_error(404)
    def end_headers(self):
        self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
        super().end_headers()
    def valid_host(self):
        return self.headers.get('Host','').split(':')[0] in ('127.0.0.1','localhost')
    def respond(self,data,status=200):
        b=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
    def do_GET(self):
        if not self.valid_host():return self.send_error(403)
        path=urlsplit(self.path).path
        if path=='/api/health':
            try:
                from backend.engine import ACTIONS,ffmpeg,poppler
                self.respond({'ready':True,'token':TOKEN,'actions':list(ACTIONS),'backgroundModel':(ROOT/'models/u2netp.onnx').exists(),'ocrModels':all((ROOT/f'models/{x}.traineddata.gz').exists() for x in ['kor','eng']),'ffmpeg':Path(ffmpeg()).exists(),'pdfRenderer':Path(poppler()).exists() or __import__('importlib.util',fromlist=['find_spec']).find_spec('pypdfium2') is not None})
            except ImportError as e:self.respond({'ready':False,'error':'로컬 엔진 설치가 필요합니다. setup.command를 실행하세요.','detail':str(e)},503)
            return
        match=re.fullmatch(r'/api/jobs/([a-f0-9]{32})',path)
        if match:
            from backend.jobs import JOBS,cleanup
            cleanup();j=JOBS.get(match[1]);return self.respond(j.public() if j else {'error':'결과가 만료되었습니다.'},200 if j else 404)
        match=re.fullmatch(r'/api/files/([a-f0-9]{32})/([^/]+)',path)
        if match:
            from backend.jobs import JOBS,cleanup
            cleanup();j=JOBS.get(match[1]);filename=unquote(match[2]);a=next((a for a in j.artifacts if a['file']==filename),None) if j else None
            if not a:return self.send_error(404)
            file=j.path/filename
            if not file.is_file():return self.send_error(404)
            self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(a['name'])[0] or 'application/octet-stream');self.send_header('Content-Length',str(file.stat().st_size));self.send_header('Content-Disposition',('attachment' if parse_qs(urlsplit(self.path).query).get('download') else 'inline')+"; filename*=UTF-8''"+quote(a['name']));self.end_headers()
            try:
                with file.open('rb') as source:
                    import shutil;shutil.copyfileobj(source,self.wfile)
            except BrokenPipeError:pass
            return
        if path.startswith('/api/'):return self.respond({'error':'지원하지 않는 주소입니다.'},404)
        decoded=unquote(path)
        if any(part.startswith('.') for part in Path(decoded).parts if part not in ('/','.')) or decoded.startswith(('/backend/','/node_modules/','/references/','/tests/','/vendor/','/server.py','/setup.py')):return self.send_error(404)
        if decoded.startswith('/models/') and not decoded.endswith('.ttf'):return self.send_error(404)
        super().do_GET()
    def do_POST(self):
        if not self.valid_host() or self.headers.get('X-Moa-Token')!=TOKEN:return self.respond({'error':'작업실을 새로고침한 뒤 다시 시도하세요.'},403)
        origin=self.headers.get('Origin')
        if origin and origin not in (f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'):return self.respond({'error':'외부 페이지에서는 로컬 작업을 실행할 수 없습니다.'},403)
        from backend.jobs import JOBS,submit
        path=urlsplit(self.path).path;cancel=re.fullmatch(r'/api/jobs/([a-f0-9]{32})/cancel',path)
        if cancel:
            j=JOBS.get(cancel[1])
            if j:j.cancel()
            return self.respond({'cancelled':bool(j)})
        if path!='/api/jobs':return self.respond({'error':'지원하지 않는 작업입니다.'},404)
        try:
            length=int(self.headers.get('Content-Length',0))
            if not 0<length<=200*1024*1024:raise ValueError('한 작업의 파일 합계는 200MB 이하입니다.')
            body=self.rfile.read(length);ctype=self.headers.get('Content-Type','')
            if ctype.startswith('multipart/form-data'):
                message=BytesParser(policy=default).parsebytes(('Content-Type: '+ctype+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+body);fields={};files=[]
                for part in message.iter_parts():
                    name=part.get_param('name',header='content-disposition');filename=part.get_filename();data=part.get_payload(decode=True)
                    if filename:
                        if len(files)>=100:raise ValueError('파일은 최대 100개입니다.')
                        files.append({'name':Path(filename).name,'data':data})
                    elif name:fields[name]=data.decode('utf-8')
                action=fields.get('action','');options=json.loads(fields.get('options','{}'))
            elif ctype.startswith('application/json'):
                data=json.loads(body);action=data.get('action');options=data.get('options',{});files=[]
            else:raise ValueError('요청 형식이 올바르지 않습니다.')
            if not isinstance(options,dict):raise ValueError('설정 형식이 올바르지 않습니다.')
            job=submit(action,options,files);self.respond(job.public(),202)
        except (ValueError,KeyError,TypeError) as e:self.respond({'error':str(e)},400)
    def log_message(self,format,*args):
        # No uploaded names or file contents in request logs.
        if not self.path.startswith('/api/jobs/'):super().log_message(format,*args)
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=4173);args=parser.parse_args()
    print(f'모아 전체 작업실: http://127.0.0.1:{args.port}',flush=True)
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:
        import sys
        jobs=sys.modules.get('backend.jobs')
        if jobs:
            for job in jobs.JOBS.values():
                if job.state in ('queued','running'):job.cancel()
            jobs.POOL.shutdown(wait=True,cancel_futures=True)
        server.server_close()
