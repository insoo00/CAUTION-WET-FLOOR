import { useTransportStore } from '../stores/transportStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useScoreStore } from '../stores/scoreStore';
import { useMappingStore } from '../stores/mappingStore';
import { useYouTubeStore } from '../stores/youtubeStore';
import { downloadMappingAsJson } from '../lib/mappingPersist';
import { formatTime } from '../lib/timeMapping';

interface Props {
  onRewind: () => void;
  onPlayToggle: () => void;
  /** 현재 재생 시간 / 총 길이 (메인 루프에서 갱신되어 prop으로 전달) */
  elapsedSec: number;
  totalSec: number;
}

export function TransportControls({
  onRewind,
  onPlayToggle,
  elapsedSec,
  totalSec,
}: Props) {
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const bpm = useTransportStore((s) => s.bpm);
  const beatsPerMeasure = useTransportStore((s) => s.beatsPerMeasure);

  const metronomeOn = useSettingsStore((s) => s.metronomeOn);
  const toggleMetronome = useSettingsStore((s) => s.toggleMetronome);
  const autoScroll = useSettingsStore((s) => s.autoScroll);
  const toggleAutoScroll = useSettingsStore((s) => s.toggleAutoScroll);
  const rhythmPattern = useSettingsStore((s) => s.rhythmPattern);
  const countInBeats = useSettingsStore((s) => s.countInBeats);
  const cycleCountIn = useSettingsStore((s) => s.cycleCountIn);

  const songTitle = useScoreStore((s) => s.songTitle);
  const isLoaded = useScoreStore((s) => s.isLoaded);
  const timeSignature = useScoreStore((s) => s.timeSignature);
  const measureMap = useMappingStore((s) => s.measureMap);
  const ytVideoId = useYouTubeStore((s) => s.ytVideoId);

  const handleExport = () => {
    if (measureMap.length === 0) return;
    downloadMappingAsJson({
      videoId: ytVideoId,
      bpm,
      timeSignature,
      rhythm: rhythmPattern,
      mapping: measureMap,
    });
  };

  const timeText =
    formatTime(elapsedSec) + (totalSec ? ` / ${formatTime(totalSec)}` : '');

  return (
    <footer className="flex items-center gap-2.5 md:gap-4 px-3 md:px-5 py-3 border-t border-ink/12 backdrop-blur-md bg-gradient-to-b from-paper/70 to-paper/95">
      <button
        onClick={onPlayToggle}
        aria-label={isPlaying ? '일시정지' : '재생'}
        className="w-[52px] h-[52px] rounded-full flex items-center justify-center transition-transform hover:scale-105 shadow-[0_4px_14px_rgba(26,22,18,0.3)]"
        style={{
          background: isPlaying ? 'var(--color-accent)' : 'var(--color-ink)',
          color: 'var(--color-paper)',
        }}
      >
        {isPlaying ? (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="text-[17px] italic font-semibold truncate">
          {isLoaded ? songTitle || '제목 없음' : '악보를 불러오세요'}
        </div>
        <div className="font-mono text-[11px] tracking-[0.05em] text-ink/55">
          {timeText} · {beatsPerMeasure}/4 · {bpm} BPM
        </div>
      </div>

      <div className="flex gap-1 md:gap-1.5 shrink-0">
        <button onClick={onRewind} className="icon-btn" title="처음으로">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>
        <button
          onClick={cycleCountIn}
          className={countInBeats > 0 ? 'icon-btn icon-btn-active' : 'icon-btn'}
          title="카운트인 (재생 전 똑딱 박)"
        >
          <span className="font-mono text-[11px] font-semibold">
            {countInBeats > 0 ? `⏱${countInBeats}` : '⏱'}
          </span>
        </button>
        <button
          onClick={toggleMetronome}
          className={metronomeOn ? 'icon-btn icon-btn-active' : 'icon-btn'}
          title="메트로놈"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3l5 18H7zM10 12l4-2" />
          </svg>
        </button>
        <button
          onClick={toggleAutoScroll}
          className={autoScroll ? 'icon-btn icon-btn-active' : 'icon-btn'}
          title="자동 스크롤"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14m-5-5l5 5 5-5M7 10l5-5 5 5" />
          </svg>
        </button>
        <button
          onClick={handleExport}
          className="icon-btn hidden md:flex"
          title="매핑 내보내기"
          disabled={measureMap.length === 0}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
        </button>
      </div>
    </footer>
  );
}
