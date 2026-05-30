import { create } from 'zustand';

/** 재생용 음표 (Verovio MIDI에서 파싱, 초 단위 절대시각) */
export interface PlayNote {
  timeSec: number;
  durSec: number;
  midi: number;
  velocity: number; // 0~1
  track: number; // 파트 인덱스 (음소거용)
}

/** 박 그리드 (Verovio timemap의 정수 qstamp에서) */
export interface ScoreBeat {
  timeMs: number;
  globalBeat: number; // 곡 시작부터 누적 4분음 박 수
  isDownbeat: boolean;
}

export interface ScorePart {
  index: number;
  name: string;
}

interface ScoreState {
  isLoaded: boolean;
  songTitle: string;
  totalMeasures: number;
  timeSignature: string;
  baseBpm: number;
  durationSec: number;

  notes: PlayNote[];
  beats: ScoreBeat[];
  /** 각 마디(첫 등장)의 시작 시각 ms — 마디 표시/구간반복/탐색용 */
  measureStartMs: number[];
  parts: ScorePart[];
  mutedParts: Set<number>;

  setScoreData: (data: {
    songTitle: string;
    totalMeasures: number;
    timeSignature: string;
    baseBpm: number;
    durationSec: number;
    notes: PlayNote[];
    beats: ScoreBeat[];
    measureStartMs: number[];
    parts: ScorePart[];
  }) => void;
  toggleMutePart: (index: number) => void;
  reset: () => void;
}

const EMPTY = {
  isLoaded: false,
  songTitle: '',
  totalMeasures: 0,
  timeSignature: '4/4',
  baseBpm: 120,
  durationSec: 0,
  notes: [] as PlayNote[],
  beats: [] as ScoreBeat[],
  measureStartMs: [] as number[],
  parts: [] as ScorePart[],
  mutedParts: new Set<number>(),
};

export const useScoreStore = create<ScoreState>((set) => ({
  ...EMPTY,

  setScoreData: (data) =>
    set({ ...data, isLoaded: true, mutedParts: new Set<number>() }),
  toggleMutePart: (index) =>
    set((s) => {
      const next = new Set(s.mutedParts);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return { mutedParts: next };
    }),
  reset: () => set({ ...EMPTY, mutedParts: new Set<number>() }),
}));
