import { useTransportStore } from '../stores/transportStore';
import { useScoreStore } from '../stores/scoreStore';
import { useMappingStore } from '../stores/mappingStore';

export function AppHeader() {
  const bpm = useTransportStore((s) => s.bpm);
  const timeSignature = useScoreStore((s) => s.timeSignature);
  const isPreciseSync = useMappingStore((s) => s.measureMap.length >= 2);

  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-ink/12 backdrop-blur-md bg-gradient-to-b from-paper/95 to-paper/70">
      <div className="flex items-center gap-2.5">
        <span
          className="font-mono text-[10px] font-semibold tracking-[0.12em] uppercase px-2 py-1 rounded-md leading-none"
          style={{ background: 'var(--color-accent)', color: 'var(--color-paper)' }}
        >
          ⚠ Caution
        </span>
        <div className="flex items-baseline gap-2.5">
          <h1 className="font-display italic font-extrabold text-2xl tracking-tight">
            Wet Floor
          </h1>
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink/55">
            미끄럼주의 · 밴드 연습
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3.5 font-mono text-[11px] text-ink/65">
        <span className="pill">
          <strong className="text-ink font-semibold">{timeSignature}</strong> · time
        </span>
        <span className="pill">
          <strong className="text-ink font-semibold">{bpm}</strong> · bpm
        </span>
        <span className={isPreciseSync ? 'pill pill-on' : 'pill'}>
          <strong className="font-semibold">
            {isPreciseSync ? 'YouTube' : 'BPM'}
          </strong>{' '}
          · sync mode
        </span>
      </div>
    </header>
  );
}
