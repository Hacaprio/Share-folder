"""Bounded local jobs; uploads never leave this computer."""
from pathlib import Path
import atexit, concurrent.futures, json, os, re, shutil, subprocess, tempfile, threading, time, uuid
ROOT=Path(tempfile.mkdtemp(prefix='moa-local-jobs-'))
POOL=concurrent.futures.ThreadPoolExecutor(max_workers=2)
JOBS={}
atexit.register(lambda:shutil.rmtree(ROOT,ignore_errors=True))
LOCK=threading.RLock()
class Cancelled(Exception): pass
class Job:
    def __init__(self, action, options, files):
        self.id=uuid.uuid4().hex; self.action=action; self.options=options
        self.path=ROOT/self.id; self.path.mkdir(); self.files=[]; self.original_names=[]
        self.state='queued'; self.progress=0; self.message='대기 중'; self.error=None; self.artifacts=[]; self.result={}; self.cancelled=False; self.created=time.time(); self.proc=None
        for i,f in enumerate(files):
            name=f['name']; ext=Path(name).suffix.lower(); ext=ext if re.fullmatch(r'\.[a-z0-9]{1,8}',ext) else '.bin'
            p=self.path/f'input-{i}{ext}';p.write_bytes(f['data']);self.files.append(p);self.original_names.append(name)
    def check(self):
        if self.cancelled: raise Cancelled('작업을 취소했습니다.')
    def update(self,progress,message):
        self.check();self.progress=min(99,max(0,round(progress)));self.message=message
    def artifact(self,path,name=None):
        path=Path(path)
        if not path.is_file() or path.parent!=self.path:raise ValueError('결과 파일 경로가 올바르지 않습니다.')
        self.artifacts.append({'file':path.name,'name':name or path.name,'bytes':path.stat().st_size,'url':f'/api/files/{self.id}/{path.name}'})
    def run(self,args,timeout=180,input=None):
        self.check();self.proc=subprocess.Popen([str(x) for x in args],stdin=subprocess.PIPE if input is not None else subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        started=time.monotonic()
        if input is not None:
            try:stdout,stderr=self.proc.communicate(input,timeout=timeout)
            except subprocess.TimeoutExpired:
                self.proc.kill();self.proc.communicate();self.proc=None;raise ValueError('처리 시간이 길어 중단했습니다. 파일 크기나 구간을 줄여주세요.')
        else:
            while True:
                try:stdout,stderr=self.proc.communicate(timeout=.25);break
                except subprocess.TimeoutExpired:
                    if self.cancelled or time.monotonic()-started>timeout:
                        self.proc.kill();self.proc.communicate();self.check();raise ValueError('처리 시간이 길어 중단했습니다. 파일 크기나 구간을 줄여주세요.')
        code=self.proc.returncode;self.proc=None;self.check()
        if code:
            (self.path/'diagnostic.txt').write_text(stderr.decode(errors='replace')[-5000:]);raise ValueError('파일 처리에 실패했습니다. 파일 형식·암호·선택 구간을 확인하거나 더 짧은 구간으로 다시 시도하세요.')
        return stdout
    def public(self):
        return {'id':self.id,'action':self.action,'state':self.state,'progress':self.progress,'message':self.message,'error':self.error,'artifacts':self.artifacts,'result':self.result}
    def cancel(self):
        self.cancelled=True
        if self.proc and self.proc.poll() is None:self.proc.kill()
def submit(action,options,files):
    from .engine import ACTIONS
    if action not in ACTIONS:raise ValueError('지원하지 않는 작업입니다.')
    with LOCK:
        # Bound queued bytes and count instead of accepting unlimited local uploads.
        active=[j for j in JOBS.values() if j.state in ('queued','running')]
        if len(active)>=4:raise ValueError('진행 중인 작업이 많습니다. 완료 후 다시 시도하세요.')
        job=Job(action,options,files);JOBS[job.id]=job
    def work():
        try:
            job.check();job.state='running';ACTIONS[action](job);job.check();job.state='completed';job.progress=100;job.message='완료! 결과 파일을 확인하세요.'
        except Cancelled:job.state='cancelled';job.message='작업이 취소되었습니다.';job.artifacts=[]
        except Exception as error:
            job.state='cancelled' if job.cancelled else 'failed';job.error='작업을 취소했습니다.' if job.cancelled else str(error);job.message=job.error;job.artifacts=[]
    POOL.submit(work);return job

def cleanup():
    with LOCK:
        for key,j in list(JOBS.items()):
            if j.state not in ('queued','running') and time.time()-j.created>7200:
                shutil.rmtree(j.path,ignore_errors=True);JOBS.pop(key,None)


def _reap_loop():
    while True:
        time.sleep(30)
        cleanup()
threading.Thread(target=_reap_loop,daemon=True,name="moa-temp-cleanup").start()
