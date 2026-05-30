import { useTransportStore } from '../stores/transportStore';
import { useScoreStore } from '../stores/scoreStore';

export function PositionCard() {
  const currentMeasure = useTransportStore((s) => s.currentMeasure);
  const currentBeat = useTransportStore((s) => s.currentBeat);
  const totalMeasures = useScoreStore((s) => s.totalMeasures);
  const isLoaded = useScoreStore((s) => s.isLoaded);

  const dash = '—';
  return (
    <div className="paper-card p-4">
      <h2 className="card-title">
        <span className="card-title-dot">Position</span>
      </h2>
      <div className="flex justify-between pt-1.5">
        <Cell label="Measure" value={isLoaded ? String(Math.max(1, currentMeasure + 1)) : dash} />
        <Cell label="Total" value={isLoaded ? String(totalMeasures) : dash} />
        <Cell label="Beat" value={isLoaded ? String(currentBeat + 1) : dash} />
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 text-center">
      <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-ink/50 mb-1">
        {label}
      </div>
      <div className="text-[22px] italic font-semibold">{value}</div>
    </div>
  );
}
