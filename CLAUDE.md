# BandStand — 밴드 연습 보조 웹앱

## 프로젝트 개요

취미 밴드에서 건반을 맡은 사용자가 피아노 연습 및 합주를 보조받기 위해 만드는 웹앱.
사용자는 피아노 초보이며 박자감이 약해서, 악보·원곡·박자가 시각적으로 연동되는 도구가 필요함.

## 사용자가 정한 요구사항

1. **현재 위치 표시**: 노래 재생 중 악보에 현재 연주할 부분 실시간 표시
2. **리듬감 보조**: 곡마다 다른 리듬 패턴 (예: 1234, 123 123 12)을 시각적으로 디스플레이
3. **자동 페이지 넘김**: 악보 페이지 전환 시 연주 끊김 방지
4. **iPad UI**: 휴대성 위해 iPad에서 보기 좋은 UI
5. **웹 배포**: 앱이 아닌 웹으로 (빠른 출시 및 활용)

## 현재 상태 (Claude.ai 대화에서 만든 프로토타입)

`prototype/band-practice-v2.html` — 단일 HTML 파일로 동작하는 v2 프로토타입.

### 구현 완료된 것
- OpenSheetMusicDisplay (OSMD)로 MusicXML 렌더링
- OSMD 커서 API로 마디 단위 위치 표시
- BPM 기반 가상 타임라인 (메트로놈 동기)
- Web Audio API 메트로놈 (강박/약박 구분)
- 리듬 패턴 비주얼라이저 (입력 텍스트 → 원형 비트 인디케이터)
- 자동 스크롤 (커서가 뷰포트 하단 근처면 부드럽게 이동)
- YouTube IFrame API 연동 (원곡 임베드 + 재생 동기)
- **마디 ↔ 시간 매핑 도구**: 사용자가 재생 중 "지금이 N마디"를 탭하면 그 사이를 선형 보간으로 자동 계산
- 매핑 localStorage 저장 + JSON 내보내기
- iPad 가로 모드 최적화 (2단 레이아웃), 세로/모바일 폴백
- 키보드 단축키: Space(재생/정지), R(되감기), M(메트로놈), T(탭)

### 알려진 한계
- YouTube `getCurrentTime()` 정확도 약 200~250ms 오차
- YouTube 광고가 붙으면 매핑 타이밍이 어긋남
- 매핑은 영상 ID별 localStorage 저장 — 디바이스 간 동기화 안 됨
- 단일 HTML 파일 → 곡 라이브러리, 셋리스트 같은 다중 곡 관리 기능 없음

## 기술 스택 (현재 → 목표)

### 현재 (프로토타입)
- 단일 HTML 파일, 외부 CDN: OSMD + YouTube IFrame API
- 모든 로직 inline `<script>`, 상태는 글로벌 변수
- 저장은 localStorage

### 목표 (Claude Code에서 발전시킬 방향)
- **빌드 시스템**: Vite + TypeScript
- **프레임워크**: React (또는 Svelte — 사용자가 선택)
- **악보**: OpenSheetMusicDisplay (그대로 유지)
- **오디오**:
  - 1순위: 본인 소유 mp3 (Web Audio API, 정밀 분석/속도조절/구간반복)
  - 2순위: YouTube IFrame API (현재 구현)
  - 3순위: 향후 score following (마이크 입력 → ODTW)
- **상태 관리**: Zustand 같은 가벼운 스토어
- **저장소**: IndexedDB (곡 라이브러리, MusicXML 캐시) + localStorage (설정)
- **배포**: Vercel / Cloudflare Pages (정적 호스팅)
- **PWA**: manifest.json + service worker → iPad 홈 화면 추가 가능

## 다음 작업 우선순위 (사용자와 정한 로드맵)

### Phase 1: 프로젝트 셋업 + 리팩토링
- [ ] Vite + React + TS 프로젝트 초기화
- [ ] 현재 HTML 파일의 기능을 컴포넌트 단위로 분해
  - `<ScoreView />` — OSMD 래퍼
  - `<YouTubePlayer />` — YT IFrame 래퍼
  - `<MeasureMapper />` — 마디↔시간 매핑 UI
  - `<RhythmVisualizer />` — 박자 시각화
  - `<TransportControls />` — 재생/정지/되감기
- [ ] 글로벌 상태를 Zustand 스토어로 이동 (`useTransportStore`, `useScoreStore`)

### Phase 2: 곡 라이브러리
- [ ] IndexedDB에 곡 메타데이터 저장 (제목, MusicXML, 매핑, YouTube ID)
- [ ] 곡 목록 화면 / 새 곡 추가 플로우
- [ ] MusicXML 파일을 곡별로 영구 보관 (다시 업로드 불필요)

### Phase 3: 연습 도구 강화
- [ ] mp3 업로드 지원 (Web Audio API)
- [ ] 재생 속도 조절 (0.5x ~ 1.5x) — 피치 보존
- [ ] A-B 구간 반복 (어려운 마디 무한 루프)
- [ ] 곡 어노테이션 (특정 마디에 메모)

### Phase 4: PWA + iPad 최적화
- [ ] manifest.json + service worker
- [ ] iPad 홈화면 아이콘
- [ ] 오프라인 동작 (캐시된 곡 사용 가능)

### Phase 5 (멀리): Score Following
- [ ] 마이크 입력으로 사용자 연주 들어서 위치 자동 추적
- [ ] Online DTW (Dynamic Time Warping) 또는 chroma feature 매칭
- [ ] 합주 시 다른 멤버 박자에 자동 적응

## 디자인 톤

- 종이 같은 따뜻한 베이지 배경 (#f5efe4) + 검정 잉크 (#1a1612) + 빨강 액센트 (#d4452a)
- 글꼴: Fraunces (display, italic) + JetBrains Mono (UI/숫자)
- 분위기: 클래식한 악보집과 모던 미니멀의 결합. AI풀 느낌 회피.
- iPad에서 음악 스탠드 대용으로 쓸 때 시각적으로 차분하고 가독성 높게

## 참고 라이브러리/레퍼런스

- **OpenSheetMusicDisplay**: https://opensheetmusicdisplay.org/ (MusicXML → SVG, 커서 API)
- **musicxml-player**: https://github.com/infojunkie/musicxml-player (Verovio/OSMD 렌더링 + 재생 동기, 참고용)
- **forScore / Perform / Blackbinder**: 상용 iPad 악보 앱들의 UX 레퍼런스
- **Score Following 연구**: ODTW, IRCAM Antescofo, Matchmaker (https://arxiv.org/html/2510.10087v1)

## 작업 시 주의사항

- 사용자는 비개발자이거나 개발 초보일 가능성이 있음 → 친절한 설명, 실행 명령어 명시
- 한국어로 응답
- 큰 변경 전엔 계획을 보여주고 확인받기
- 각 Phase 끝나면 결과물(스크린샷/시연 방법) 보여주기
