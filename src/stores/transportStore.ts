import { create } from 'zustand';

/** 무엇에 맞춰 재생할지: YouTube 원곡 / 악보 자체(피아노 합성) */
export type PlaybackSource = 'youtube' | 'score';

interface TransportState {
  isPlaying: boolean;
  currentMeasure: number;
  currentBeat: number;
  bpm: number;
  beatsPerMeasure: number;
  playbackSource: PlaybackSource;
  /** A-B 구간 반복: 시작/끝 마디 (0-indexed source measure idx). null이면 미설정. */
  loopStartMeasure: number | null;
  loopEndMeasure: number | null;

  setIsPlaying: (v: boolean) => void;
  togglePlaying: () => void;
  setPosition: (measure: number, beat: number) => void;
  setBpm: (bpm: number) => void;
  changeTempo: (delta: number) => void;
  setBeatsPerMeasure: (n: number) => void;
  setPlaybackSource: (src: PlaybackSource) => void;
  setLoopStart: (measure: number | null) => void;
  setLoopEnd: (measure: number | null) => void;
  clearLoop: () => void;
  reset: () => void;
}

export const useTransportStore = create<TransportState>((set) => ({
  isPlaying: false,
  currentMeasure: 0,
  currentBeat: 0,
  bpm: 120,
  beatsPerMeasure: 4,
  playbackSource: 'score',
  loopStartMeasure: null,
  loopEndMeasure: null,

  setIsPlaying: (v) => set({ isPlaying: v }),
  togglePlaying: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setPosition: (measure, beat) => set({ currentMeasure: measure, currentBeat: beat }),
  setBpm: (bpm) => set({ bpm: Math.max(40, Math.min(240, Math.round(bpm))) }),
  changeTempo: (delta) =>
    set((s) => ({ bpm: Math.max(40, Math.min(240, s.bpm + delta)) })),
  setBeatsPerMeasure: (n) => set({ beatsPerMeasure: n }),
  setPlaybackSource: (src) => set({ playbackSource: src }),
  setLoopStart: (measure) =>
    set((s) => {
      const end =
        s.loopEndMeasure != null && measure != null && s.loopEndMeasure < measure
          ? null
          : s.loopEndMeasure;
      return { loopStartMeasure: measure, loopEndMeasure: end };
    }),
  setLoopEnd: (measure) =>
    set((s) => {
      const start =
        s.loopStartMeasure != null && measure != null && measure < s.loopStartMeasure
          ? null
          : s.loopStartMeasure;
      return { loopEndMeasure: measure, loopStartMeasure: start };
    }),
  clearLoop: () => set({ loopStartMeasure: null, loopEndMeasure: null }),
  reset: () =>
    set({ isPlaying: false, currentMeasure: 0, currentBeat: 0 }),
}));
