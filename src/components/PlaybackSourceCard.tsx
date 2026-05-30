import { useTransportStore } from '../stores/transportStore';
import { useScoreStore } from '../stores/scoreStore';
import type { ScorePart } from '../stores/scoreStore';
import { ensureAudio } from '../lib/metronome';
import { preloadPiano } from '../lib/scorePlayer';

/**
 * 재생 소스 선택 (YouTube 원곡 / 악보 자체 피아노 재생) + 파트별 음소거.
 * 악보 재생은 Verovio MIDI를 사용 → 박자·도돌이가 악보 그대로.
 */
export function PlaybackSourceCard() {
  const playbackSource = useTransportStore((s) => s.playbackSource);
  const setPlaybackSource = useTransportStore((s) => s.setPlaybackSource);
  const setIsPlaying = useTransportStore((s) => s.setIsPlaying);

  const isLoaded = useScoreStore((s) => s.isLoaded);
  const parts = useScoreStore((s) => s.parts);
  const mutedParts = useScoreStore((s) => s.mutedParts);
  const toggleMutePart = useScoreStore((s) => s.toggleMutePart);

  const switchTo = (src: 'youtube' | 'score') => {
    if (src === playbackSource) return;
    setIsPlaying(false);
    setPlaybackSource(src);
    if (src === 'score') {
      ensureAudio();
      void preloadPiano();
    }
  };

  const btnClass = (active: boolean) =>
    active ? 'ink-btn' : 'icon-btn !w-auto px-2';
  const btnStyle = (active: boolean) =>
    active ? undefined : { background: 'transparent', color: 'var(--color-ink)' };

  return (
    <div className="paper-card p-4">
      <h2 className="card-title">
        <span className="card-title-dot">재생 소스 · Playback</span>
      </h2>

      <div className="grid grid-cols-2 gap-1.5 mt-1">
        <button
          onClick={() => switchTo('youtube')}
          className={btnClass(playbackSource === 'youtube')}
          style={btnStyle(playbackSource === 'youtube')}
        >
          YouTube 원곡
        </button>
        <button
          onClick={() => switchTo('score')}
          className={btnClass(playbackSource === 'score')}
          style={btnStyle(playbackSource === 'score')}
        >
          악보 재생 🎹
        </button>
      </div>

      {playbackSource === 'score' && (
        <div className="mt-3">
          {!isLoaded ? (
            <div className="hint">악보를 먼저 불러오세요.</div>
          ) : parts.length === 0 ? (
            <div className="hint">재생 가능한 파트를 찾지 못했습니다.</div>
          ) : (
            <>
              <div className="hint mb-1.5">파트 (탭하여 음소거)</div>
              <div className="flex flex-col gap-1">
                {parts.map((p: ScorePart) => {
                  const muted = mutedParts.has(p.index);
                  return (
                    <button
                      key={p.index}
                      onClick={() => toggleMutePart(p.index)}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-md border border-ink/12 text-[13px] transition-colors"
                      style={{
                        background: muted ? 'transparent' : 'rgba(212,69,42,0.08)',
                        opacity: muted ? 0.5 : 1,
                      }}
                    >
                      <span className="truncate text-left">{p.name}</span>
                      <span className="font-mono text-[10px] uppercase tracking-wider ml-2 shrink-0">
                        {muted ? '음소거' : '재생'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <div className="hint mt-2">
            악보의 음을 피아노 샘플로 재생합니다. 첫 재생 시 샘플을 받는 동안
            잠깐 지연될 수 있어요.
          </div>
        </div>
      )}
    </div>
  );
}
