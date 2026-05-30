import { useTransportStore } from '../stores/transportStore';
import { useScoreStore } from '../stores/scoreStore';

/**
 * A-B 구간 반복. 현재 위치(또는 악보 클릭으로 잡은 위치)를 A/B로 지정하면
 * B 마디 끝에서 A로 자동 반복. 어려운 구간 무한 연습용.
 */
export function LoopCard() {
  const isLoaded = useScoreStore((s) => s.isLoaded);
  const currentMeasure = useTransportStore((s) => s.currentMeasure);
  const loopStart = useTransportStore((s) => s.loopStartMeasure);
  const loopEnd = useTransportStore((s) => s.loopEndMeasure);
  const setLoopStart = useTransportStore((s) => s.setLoopStart);
  const setLoopEnd = useTransportStore((s) => s.setLoopEnd);
  const clearLoop = useTransportStore((s) => s.clearLoop);

  const active = loopStart != null && loopEnd != null;
  const label = (m: number | null) => (m == null ? '—' : `${m + 1}`);

  return (
    <div className="paper-card p-4">
      <h2 className="card-title">
        <span className="card-title-dot">구간 반복 · A-B Loop</span>
        <span className={active ? 'badge badge-green' : 'badge'}>
          {active ? 'ON' : 'OFF'}
        </span>
      </h2>

      <div className="flex items-baseline gap-3 font-mono text-[13px] mt-1">
        <span>
          A <strong className="text-[18px]">{label(loopStart)}</strong>
        </span>
        <span className="text-ink/40">→</span>
        <span>
          B <strong className="text-[18px]">{label(loopEnd)}</strong>
        </span>
        <span className="text-ink/45 text-[11px] ml-auto">
          현재 {isLoaded ? currentMeasure + 1 : '—'}마디
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 mt-2.5">
        <button
          onClick={() => setLoopStart(currentMeasure)}
          disabled={!isLoaded}
          className="py-1.5 border border-ink/20 rounded-md font-mono text-[11px] hover:bg-ink hover:text-paper transition-colors disabled:opacity-40"
        >
          A 지점
        </button>
        <button
          onClick={() => setLoopEnd(currentMeasure)}
          disabled={!isLoaded}
          className="py-1.5 border border-ink/20 rounded-md font-mono text-[11px] hover:bg-ink hover:text-paper transition-colors disabled:opacity-40"
        >
          B 지점
        </button>
        <button
          onClick={clearLoop}
          disabled={!active}
          className="py-1.5 border border-ink/20 rounded-md font-mono text-[11px] hover:bg-accent hover:text-paper hover:border-accent transition-colors disabled:opacity-40"
        >
          해제
        </button>
      </div>

      <div className="hint">
        악보를 클릭하거나 재생해 위치를 잡고 A·B를 지정하세요. B 끝에서 A로
        자동 반복됩니다.
      </div>
    </div>
  );
}
