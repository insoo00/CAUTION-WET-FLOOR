# BandStand

밴드 연습용 악보 + 원곡 동기화 웹앱.

## 빠른 시작 (프로토타입만 보고 싶다면)

`prototype/band-practice-v2.html` 파일을 브라우저에서 더블클릭. 외부 의존성은 OSMD CDN 하나뿐이라 인터넷만 있으면 바로 동작.

## Claude Code에서 개발 이어가기

### 1. Node.js 설치 (이미 있으면 건너뛰기)

macOS:
```bash
brew install node
```

Windows: https://nodejs.org/ 에서 LTS 버전 다운로드 후 설치

설치 확인:
```bash
node -v   # v18 이상이어야 함
npm -v
```

### 2. Claude Code 설치

```bash
npm install -g @anthropic-ai/claude-code
```

권한 오류가 나면 `sudo`를 쓰지 말고, 이렇게:
```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=$HOME/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
npm install -g @anthropic-ai/claude-code
```

### 3. 프로젝트 폴더에서 실행

```bash
cd bandstand-handoff
claude
```

첫 실행 시 브라우저가 열리고 Anthropic 계정으로 로그인하면 됩니다.

### 4. 첫 메시지 예시

Claude Code에 다음과 비슷한 첫 메시지를 보내세요:

> CLAUDE.md를 읽고 프로젝트 컨텍스트를 파악해줘. 그리고 Phase 1을 시작하자 — Vite + React + TS로 프로젝트 초기화하고, prototype/band-practice-v2.html의 기능을 컴포넌트로 분해하는 계획을 먼저 보여줘.

Claude Code는 `CLAUDE.md`를 자동으로 읽어서 컨텍스트를 잡고, 단계별로 작업합니다.

## 폴더 구조

```
bandstand-handoff/
├── CLAUDE.md              # Claude Code가 자동으로 읽는 프로젝트 컨텍스트
├── README.md              # 이 파일
├── prototype/
│   └── band-practice-v2.html   # Claude.ai에서 만든 현재 프로토타입
└── docs/
    └── roadmap.md         # 상세 로드맵
```

## 유용한 Claude Code 명령어

- `/help` — 명령어 목록
- `/clear` — 대화 컨텍스트 초기화 (새 작업 시작할 때)
- `/exit` — 종료
- `claude --resume` — 마지막 세션 이어서 시작
