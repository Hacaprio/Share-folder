#!/bin/zsh
cd "${0:A:h}"
if [[ ! -x .venv/bin/python ]]; then
  echo '로컬 엔진 설치가 필요합니다. setup.command를 먼저 실행하세요.'
  exit 1
fi
open http://127.0.0.1:4173
exec .venv/bin/python server.py --port 4173
