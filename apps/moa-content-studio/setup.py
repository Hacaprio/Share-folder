#!/usr/bin/env python3
"""Install into this application's own virtual environment; never changes system Python."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys,urllib.request,venv,zipfile
ROOT=Path(__file__).resolve().parent
BUNDLE=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies'
def run(args,env=None):print(' '.join(map(str,args)),flush=True);subprocess.run([str(x) for x in args],cwd=ROOT,check=True,env=env)
def main():
    python=ROOT/'.venv/bin/python'
    if not python.exists():
        candidate=BUNDLE/'python/bin/python3'
        creator=str(candidate) if candidate.exists() else sys.executable
        if not candidate.exists() and sys.version_info<(3,10):raise RuntimeError('Python 3.10 이상을 설치한 뒤 다시 실행하세요.')
        run([creator,'-m','venv',ROOT/'.venv'])
    run([python,'-m','pip','install','-r',ROOT/'requirements.txt'])
    node=os.environ.get('MOA_NODE') or shutil.which('node') or str(BUNDLE/'node/bin/node')
    if not Path(node).is_file():raise RuntimeError('Node.js 18 이상을 설치한 뒤 다시 실행하세요.')
    major=int(subprocess.check_output([node,'--version'],text=True).strip().lstrip('v').split('.')[0])
    if major<18:raise RuntimeError('Node.js 18 이상이 필요합니다.')
    env={**os.environ,'PATH':str(Path(node).parent)+os.pathsep+os.environ.get('PATH','')}
    pnpm=shutil.which('pnpm',path=env['PATH']) or str(BUNDLE/'bin/fallback/pnpm')
    if Path(pnpm).exists():run([pnpm,'install','--frozen-lockfile','--ignore-scripts'],env)
    else:
        npm=shutil.which('npm',path=env['PATH'])
        if not npm:raise RuntimeError('npm 또는 pnpm이 필요합니다. Node.js 설치를 확인하세요.')
        run([npm,'install','--omit=dev','--ignore-scripts'],env)
    manifest=json.loads((ROOT/'models/manifest.json').read_text())
    for m in manifest:
        target=ROOT/'models'/m['name']
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()==m['sha256']:continue
        print('모델 준비:',m['name'],flush=True);data=urllib.request.urlopen(m['source'],timeout=120).read()
        if hashlib.sha256(data).hexdigest()!=m['sha256']:raise RuntimeError('모델 검증 실패: '+m['name'])
        temp=target.with_suffix(target.suffix+'.download');temp.write_bytes(data);temp.replace(target)
    with zipfile.ZipFile(ROOT/'capture-extension.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for name in ['manifest.json','background.js','popup.html','popup.js','README.md']:
            archive.write(ROOT/'capture-extension'/name,name)
    print('설치 완료. start.command를 실행하거나 .venv/bin/python server.py로 시작하세요.')
if __name__=='__main__':
    try:main()
    except Exception as error:print('설치하지 못했습니다:',error,file=sys.stderr);sys.exit(1)
