# BandStand 개발 로드맵

CLAUDE.md의 Phase별 작업을 더 구체적으로 풀어놓은 문서.
Claude Code에 "@docs/roadmap.md 보고 Phase X 시작하자"고 말하면 됩니다.

---

## Phase 1: 프로젝트 셋업 + 리팩토링

### 목표
단일 HTML 파일을 유지보수 가능한 React + TypeScript 프로젝트로 변환.

### 세부 작업

**1.1 Vite + React + TS 초기화**
```bash
npm create vite@latest bandstand -- --template react-ts
cd bandstand
npm install
```

**1.2 필수 패키지 설치**
- `opensheetmusicdisplay` — 악보 렌더링
- `zustand` — 상태 관리
- `react-youtube` 또는 직접 IFrame API 래퍼
- `tailwindcss` — 스타일 (현재 디자인 톤 유지)
- 폰트: Fraunces, JetBrains Mono (Google Fonts 또는 fontsource)

**1.3 폴더 구조 제안**
```
src/
├── components/
│   ├── ScoreView.tsx          # OSMD 래퍼
│   ├── YouTubePlayer.tsx      # YT IFrame 래퍼
│   ├── MeasureMapper.tsx      # 마디↔시간 매핑
│   ├── RhythmVisualizer.tsx   # 박자 시각화
│   ├── TempoCard.tsx          # BPM 컨트롤
│   ├── TransportControls.tsx  # 재생/정지 푸터
│   └── ScoreUploader.tsx      # MusicXML 업로드
├── stores/
│   ├── transportStore.ts      # 재생 상태
│   ├── scoreStore.ts          # 악보 / 마디 정보
│   └── mappingStore.ts        # 마디 매핑
├── lib/
│   ├── osmd.ts                # OSMD 헬퍼 (커서 이동 등)
│   ├── youtube.ts             # YT API 헬퍼
│   ├── metronome.ts           # Web Audio 메트로놈
│   └── timeMapping.ts         # timeToMeasure 보간 로직
├── App.tsx
└── main.tsx
```

**1.4 상태 분리 우선순위**
- 가장 먼저 분리: `currentMeasure`, `isPlaying`, `currentBeat` (전체에서 참조됨)
- 그 다음: 매핑 데이터, 곡 메타데이터

**1.5 검증 체크포인트**
- [ ] 데모 곡 로드되고 OSMD 렌더링
- [ ] 재생 버튼 누르면 BPM 기반으로 커서 이동
- [ ] YouTube 영상 로드 및 매핑 탭 가능
- [ ] localStorage에서 기존 매핑 읽기

---

## Phase 2: 곡 라이브러리

### 목표
여러 곡을 영구 보관하고 빠르게 전환.

### 세부 작업

**2.1 데이터 모델**
```typescript
interface Song {
  id: string;              // uuid
  title: string;
  artist?: string;
  musicXmlData: string;    // raw XML
  youtubeVideoId?: string;
  measureMapping: { measure: number; time: number }[];
  rhythmPattern: string;
  defaultBpm: number;
  timeSignature: string;
  createdAt: number;
  lastPracticedAt: number;
}
```

**2.2 IndexedDB 래퍼**
- `idb` 패키지 추천 (Promise 기반 깔끔한 래퍼)
- 함수: `saveSong`, `getSong`, `listSongs`, `deleteSong`

**2.3 UI**
- 곡 목록 화면 (홈 화면)
- "새 곡 추가" 마법사: 제목 → MusicXML 업로드 → YouTube URL → 매핑 시작
- 곡 카드에 마지막 연습 시간, 매핑 완성도 표시

---

## Phase 3: 연습 도구 강화

### 3.1 mp3 업로드

```typescript
// 파일 → ArrayBuffer → AudioBuffer
const arrayBuffer = await file.arrayBuffer();
const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
```

장점: 재생 시간 추적이 ms 단위 정확 (YouTube는 ~200ms 오차)

### 3.2 재생 속도 조절 (피치 보존)

- `<audio>` 태그의 `preservesPitch` 속성 (대부분 브라우저 지원)
- 또는 Web Audio + soundtouch.js (더 정밀하지만 복잡)

### 3.3 A-B 구간 반복

- 두 개 마디 선택 → 그 사이 무한 반복
- UI: 악보 위에 시각적 하이라이트

---

## Phase 4: PWA

### 4.1 manifest.json
```json
{
  "name": "BandStand",
  "short_name": "BandStand",
  "start_url": "/",
  "display": "standalone",
  "orientation": "landscape",
  "background_color": "#f5efe4",
  "theme_color": "#1a1612",
  "icons": [...]
}
```

### 4.2 Service Worker
- Workbox 또는 `vite-plugin-pwa` 사용 권장
- 캐시 전략: 앱 쉘은 cache-first, 곡 데이터는 IndexedDB

### 4.3 iPad 최적화
- viewport-fit=cover, safe-area-inset 사용
- 터치 타겟 최소 44pt
- 가로 모드 강제 옵션

---

## Phase 5: Score Following (멀리)

### 접근 방법 (참고 자료 기반)

**Option A: 간단한 시작 — chroma feature 매칭**
- 마이크 입력 → FFT → 12음 chroma 벡터
- MusicXML에서 마디별 예상 chroma 생성
- Online DTW로 현재 위치 추정

**Option B: 기존 라이브러리 활용**
- `musicxml-player` (https://github.com/infojunkie/musicxml-player) 참고
- Matchmaker (https://arxiv.org/html/2510.10087v1) — 오픈소스 score following

### 단계
1. 마이크 권한 + Web Audio 입력 스트림 받기
2. Worklet에서 실시간 chroma 추출
3. 미리 계산해둔 score chroma와 ODTW로 정합
4. 추정 위치를 transportStore에 반영

이 단계는 진짜 합주 단계 가서 필요해지면 시작.
