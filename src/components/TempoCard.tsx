import { useTransportStore } from '../stores/transportStore';

export function TempoCard() {
  const bpm = useTransportStore((s) => s.bpm);
  const changeTempo = useTransportStore((s) => s.changeTempo);

  return (
    <div className="paper-card p-4">
      <h2 className="card-title">
        <span className="card-title-dot">Tempo (BPM fallback)</span>
      </h2>
      <div className="flex items-baseline gap-2.5">
        <span className="font-display italic font-extrabold text-[42px] leading-none tracking-[-0.04em]">
          {bpm}
        </span>
        <span className="font-mono text-[10px] tracking-[0.1em] text-ink/55">BPM</span>
      </div>
      <div className="flex gap-1.5 mt-2.5">
        {[-5, -1, 1, 5].map((d) => (
          <button
            key={d}
            onClick={() => changeTempo(d)}
            className="flex-1 py-1.5 border border-ink/20 rounded-md font-mono text-[11px] hover:bg-ink hover:text-paper hover:border-ink transition-colors"
          >
            {d > 0 ? `+${d}` : d}
          </button>
        ))}
      </div>
      <div className="hint">YouTube 매핑이 없을 때만 사용</div>
    </div>
  );
}
