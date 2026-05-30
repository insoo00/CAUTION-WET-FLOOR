import { create } from 'zustand';

interface SettingsState {
  metronomeOn: boolean;
  autoScroll: boolean;
  rhythmPattern: string;
  /** 재생 전 카운트인(똑딱) 박 수. 0이면 끔. */
  countInBeats: number;

  toggleMetronome: () => void;
  toggleAutoScroll: () => void;
  setRhythmPattern: (s: string) => void;
  cycleCountIn: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  metronomeOn: false,
  autoScroll: true,
  rhythmPattern: '1234',
  countInBeats: 4,

  toggleMetronome: () => set((s) => ({ metronomeOn: !s.metronomeOn })),
  toggleAutoScroll: () => set((s) => ({ autoScroll: !s.autoScroll })),
  setRhythmPattern: (v) => set({ rhythmPattern: v.replace(/\s/g, '') || '1234' }),
  // 0 → 4 → 8 → 0
  cycleCountIn: () =>
    set((s) => ({ countInBeats: s.countInBeats === 0 ? 4 : s.countInBeats === 4 ? 8 : 0 })),
}));
