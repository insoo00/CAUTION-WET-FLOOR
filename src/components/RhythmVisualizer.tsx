import { useSettingsStore } from '../stores/settingsStore';
import { useTransportStore } from '../stores/transportStore';

export function RhythmVisualizer() {
  const rhythmPattern = useSettingsStore((s) => s.rhythmPattern);
  const setRhythmPattern = useSettingsStore((s) => s.setRhythmPattern);

  const currentMeasure = useTransportStore((s) => s.currentMeasure);
  const currentBeat = useTransportStore((s) => s.currentBeat);
  const beatsPerMeasure = useTransportStore((s) => s.beatsPerMeasure);

  const globalBeat = currentMeasure * beatsPerMeasure + currentBeat;
  const activeIdx =
    rhythmPattern.length > 0
      ? ((globalBeat % rhythmPattern.length) + rhythmPattern.length) %
        rhythmPattern.length
      : -1;

  return (
    <div className="paper-card p-4">
      <h2 className="card-title">
        <span className="card-title-dot">Rhythm Pattern</span>
      </h2>
      <div className="flex gap-1.5 mb-2.5">
        {Array.from(rhythmPattern).map((ch, i) => {
          const accent = ch === ch.toUpperCase() && /[A-Z0-9]/.test(ch);
          const isActive = i === activeIdx;
          const cls = [
            'beat-dot',
            accent && 'beat-dot-accent',
            isActive && (accent ? 'beat-dot-active-accent' : 'beat-dot-active'),
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div key={i} className={cls}>
              {ch.toUpperCase()}
            </div>
          );
        })}
      </div>
      <input
        type="text"
        defaultValue={rhythmPattern}
        maxLength={16}
        onBlur={(e) => setRhythmPattern(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="paper-input w-full text-center tracking-[0.1em] text-xs"
      />
      <div className="hint">대문자=강박, 소문자=약박 / 예) 1234, 123 123 12</div>
    </div>
  );
}
