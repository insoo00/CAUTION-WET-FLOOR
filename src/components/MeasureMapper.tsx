import { useEffect, useRef, useState } from 'react';
import { useMappingStore } from '../stores/mappingStore';
import { useYouTubeStore } from '../stores/youtubeStore';
import { loadMapping, saveMapping } from '../lib/mappingPersist';
import { formatTime } from '../lib/timeMapping';

interface Props {
  /** YouTube 현재 시간(초)을 반환. ytReady 전엔 null. */
  getCurrentTime: () => number | null;
}

export function MeasureMapper({ getCurrentTime }: Props) {
  const ytVideoId = useYouTubeStore((s) => s.ytVideoId);
  const ytReady = useYouTubeStore((s) => s.ytReady);

  const measureMap = useMappingStore((s) => s.measureMap);
  const addPoint = useMappingStore((s) => s.addPoint);
  const removePoint = useMappingStore((s) => s.removePoint);
  const setMap = useMappingStore((s) => s.setMap);

  const [tapMeasure, setTapMeasure] = useState(1);
  const initLoaded = useRef(false);

  useEffect(() => {
    setMap(loadMapping(ytVideoId));
    initLoaded.current = true;
  }, [ytVideoId, setMap]);

  useEffect(() => {
    if (!initLoaded.current) return;
    saveMapping(ytVideoId, measureMap);
  }, [ytVideoId, measureMap]);

  const handleTap = () => {
    if (!ytReady) return;
    const t = getCurrentTime();
    if (t == null) return;
    if (tapMeasure < 1) return;
    addPoint(tapMeasure, t);
    setTapMeasure(tapMeasure + 8);
  };

  return (
    <div className="paper-card p-4">
      <h2 className="card-title">
        <span className="card-title-dot">Measure Sync</span>
        <span className="badge badge-green">{measureMap.length} points</span>
      </h2>

      <p className="font-mono text-[10px] text-ink/60 leading-relaxed mb-2.5">
        YouTube를 재생하면서 각 마디 시작점에 도달할 때마다 <br />
        아래 <strong>"📍 현재 시간 = 이 마디"</strong> 버튼을 누르세요. <br />
        2개 이상 찍으면 정밀 동기화 모드로 자동 전환됩니다.
      </p>

      <div className="max-h-[140px] overflow-y-auto scroll-paper mb-2.5 border border-dashed border-ink/15 rounded-md font-mono text-[11px]">
        {measureMap.length === 0 ? (
          <div className="p-3.5 text-center text-[10px] text-ink/40">
            아직 매핑이 없습니다
          </div>
        ) : (
          measureMap.map((p) => (
            <div
              key={p.measure}
              className="grid grid-cols-[50px_1fr_24px] items-center px-2.5 py-1.5 border-b border-dashed border-ink/10 last:border-b-0"
            >
              <span className="text-accent font-semibold">m.{p.measure}</span>
              <span className="text-ink/70">
                {formatTime(p.time)}{' '}
                <span className="opacity-40">({p.time.toFixed(2)}s)</span>
              </span>
              <button
                onClick={() => removePoint(p.measure)}
                className="text-ink/40 hover:text-accent text-sm"
                aria-label={`m.${p.measure} 삭제`}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-1.5 items-center">
        <input
          type="number"
          min={1}
          value={tapMeasure}
          onChange={(e) => setTapMeasure(parseInt(e.target.value, 10) || 1)}
          className="paper-input w-14 text-center"
        />
        <button
          onClick={handleTap}
          disabled={!ytReady}
          className="accent-btn flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          📍 현재 시간 = 이 마디
        </button>
      </div>

      <div className="hint">
        예) 1마디(인트로), 9마디(절), 17마디(후렴) 등 <br />
        5~6 포인트면 곡 전체가 정확히 따라갑니다.
      </div>
    </div>
  );
}
