import { useEffect, useRef, useState } from 'react';
import { AppHeader } from './components/AppHeader';
import { ScoreView, type ScoreViewHandle } from './components/ScoreView';
import { YouTubePlayer, type YouTubeHandle } from './components/YouTubePlayer';
import { MeasureMapper } from './components/MeasureMapper';
import { PlaybackSourceCard } from './components/PlaybackSourceCard';
import { LoopCard } from './components/LoopCard';
import { TempoCard } from './components/TempoCard';
import { RhythmVisualizer } from './components/RhythmVisualizer';
import { PositionCard } from './components/PositionCard';
import { TransportControls } from './components/TransportControls';
import { useTransportStore } from './stores/transportStore';
import { useSettingsStore } from './stores/settingsStore';
import { useMappingStore } from './stores/mappingStore';
import { useTransportLoop } from './hooks/useTransportLoop';
import {
  ensureAudio,
  playClick,
  resumeAudio,
  unlockAudioOnFirstGesture,
} from './lib/metronome';
import { preloadPiano } from './lib/scorePlayer';

const SECTIONS = [
  { id: 'sec-youtube', icon: '▶', label: 'YouTube' },
  { id: 'sec-playback', icon: '🎹', label: '재생 소스' },
  { id: 'sec-loop', icon: '🔁', label: '구간 반복' },
  { id: 'sec-mapping', icon: '📍', label: '마디 매핑' },
  { id: 'sec-tempo', icon: '♩', label: '템포' },
  { id: 'sec-rhythm', icon: '〰', label: '리듬' },
  { id: 'sec-position', icon: '◎', label: '위치' },
];

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function App() {
  const ytRef = useRef<YouTubeHandle>(null);
  const scoreRef = useRef<ScoreViewHandle>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [overlay, setOverlay] = useState<string | null>(null);
  const playToken = useRef(0);

  const { elapsedSec, totalSec, resetScorePosition, seekToTime } =
    useTransportLoop({ ytRef, scoreRef });

  /** 악기 로딩 + 카운트인(타이머) 후 재생 시작. 위치는 호출 전에 세팅돼 있어야 함. */
  const startWithCountIn = async () => {
    const t = useTransportStore.getState();
    const myToken = ++playToken.current;
    const cancelled = () => playToken.current !== myToken;
    ensureAudio(); // Web Audio(메트로놈/피아노) 잠금 해제 — 반드시 제스처 안에서
    if (t.playbackSource === 'score') {
      setOverlay('악기 불러오는 중…');
      await preloadPiano();
      if (cancelled()) return;
      // 샘플 로딩 후에도 컨텍스트가 'running'인지 확실히 보장(iOS 첫 재생 무음 방지).
      await resumeAudio();
      if (cancelled()) return;
    }
    const beats = useSettingsStore.getState().countInBeats;
    if (beats > 0) {
      const bpm = useTransportStore.getState().bpm;
      const interval = 60000 / Math.max(40, bpm);
      for (let i = beats; i >= 1; i--) {
        if (cancelled()) return;
        setOverlay(String(i));
        playClick(i === beats);
        await delay(interval);
      }
    }
    if (cancelled()) return;
    setOverlay(null);
    useTransportStore.getState().setIsPlaying(true);
  };

  const requestPlay = async () => {
    const t = useTransportStore.getState();
    if (t.isPlaying) {
      t.setIsPlaying(false);
      return;
    }
    await startWithCountIn();
  };

  /** 악보 음표 클릭 → 그 위치로 이동. 정지 상태면 카운트인 후 재생. */
  const handleScoreSeek = async (sec: number) => {
    if (useTransportStore.getState().isPlaying) {
      // 이미 재생 중이면 그 위치로 즉시 점프
      seekToTime(sec, true);
      return;
    }
    // 정지 상태: 위치만 잡고(재생 X) → 카운트인 후 시작
    seekToTime(sec, false);
    await startWithCountIn();
  };

  const handleRewind = () => {
    playToken.current++; // 진행 중인 카운트인 취소
    setOverlay(null);
    useTransportStore.setState({
      isPlaying: false,
      currentMeasure: 0,
      currentBeat: 0,
    });
    resetScorePosition();
    ytRef.current?.seekTo(0);
    scoreRef.current?.clearHighlight();
    scoreRef.current?.scrollToTop();
  };

  const openSection = (id: string) => {
    setPanelOpen(true);
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const getCurrentTime = () => ytRef.current?.getCurrentTime() ?? null;

  // iOS: 페이지 첫 터치/클릭에서 오디오를 미리 잠금 해제.
  useEffect(() => {
    unlockAudioOnFirstGesture();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        void requestPlay();
      } else if (e.key === 'r' || e.key === 'R') {
        handleRewind();
      } else if (e.key === 'm' || e.key === 'M') {
        useSettingsStore.getState().toggleMetronome();
      } else if (e.key === 't' || e.key === 'T') {
        const t = ytRef.current?.getCurrentTime();
        if (typeof t === 'number') {
          const measureIdx = useTransportStore.getState().currentMeasure;
          useMappingStore.getState().addPoint(measureIdx + 1, t);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-dvh grid grid-rows-[auto_1fr_auto] grid-cols-1 overflow-hidden">
      <AppHeader />

      <main className="relative flex px-1 md:px-3 py-3 overflow-hidden">
        {/* 왼쪽 아이콘 레일 (항상 표시) */}
        <nav className="shrink-0 w-10 md:w-14 flex flex-col items-center gap-1.5 py-1 z-30">
          <button
            onClick={() => setPanelOpen((v) => !v)}
            title={panelOpen ? '메뉴 닫기' : '메뉴 열기'}
            className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center text-[18px] transition-colors"
            style={{
              background: panelOpen ? 'var(--color-ink)' : 'transparent',
              color: panelOpen ? 'var(--color-paper)' : 'var(--color-ink)',
            }}
          >
            ☰
          </button>
          <div className="w-7 h-px bg-ink/15 my-0.5" />
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => openSection(s.id)}
              title={s.label}
              className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center text-[17px] hover:bg-ink/8 transition-colors"
            >
              {s.icon}
            </button>
          ))}
        </nav>

        {/* 악보 (항상 전체 폭) */}
        <div className="relative flex-1 min-w-0 pl-1 md:pl-3">
          <ScoreView ref={scoreRef} onSeekTime={handleScoreSeek} onLoaded={handleRewind} />
          {overlay && (
            <div className="pointer-events-none absolute inset-0 z-[8] flex items-center justify-center">
              <div
                className="flex items-center justify-center rounded-3xl bg-ink/85 text-paper font-display italic font-extrabold shadow-2xl"
                style={{
                  minWidth: overlay.length > 2 ? 280 : 140,
                  height: overlay.length > 2 ? 90 : 140,
                  fontSize: overlay.length > 2 ? 22 : 72,
                }}
              >
                {overlay}
              </div>
            </div>
          )}
        </div>

        {/* 클릭 시 닫히는 반투명 배경 */}
        {panelOpen && (
          <div
            className="absolute inset-0 z-20 bg-ink/10"
            onClick={() => setPanelOpen(false)}
          />
        )}

        {/* 슬라이드 패널 — 악보 위에 오버레이. 닫혀도 언마운트 안 함(유튜브 유지). */}
        <aside
          ref={drawerRef}
          aria-hidden={!panelOpen}
          className="absolute left-[60px] top-3 bottom-3 w-[330px] z-20 flex flex-col gap-3 overflow-y-auto scroll-paper p-2 rounded-2xl bg-paper/95 backdrop-blur shadow-[0_8px_30px_rgba(26,22,18,0.25)] transition-transform duration-200 max-md:w-[300px]"
          style={{
            transform: panelOpen ? 'translateX(0)' : 'translateX(-115%)',
            pointerEvents: panelOpen ? 'auto' : 'none',
          }}
        >
          <div id="sec-youtube">
            <YouTubePlayer ref={ytRef} />
          </div>
          <div id="sec-playback">
            <PlaybackSourceCard />
          </div>
          <div id="sec-loop">
            <LoopCard />
          </div>
          <div id="sec-mapping">
            <MeasureMapper getCurrentTime={getCurrentTime} />
          </div>
          <div id="sec-tempo">
            <TempoCard />
          </div>
          <div id="sec-rhythm">
            <RhythmVisualizer />
          </div>
          <div id="sec-position">
            <PositionCard />
          </div>
        </aside>
      </main>

      <TransportControls
        onPlayToggle={requestPlay}
        onRewind={handleRewind}
        elapsedSec={elapsedSec}
        totalSec={totalSec}
      />
    </div>
  );
}
