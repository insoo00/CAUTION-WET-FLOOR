import { create } from 'zustand';

export interface MeasurePoint {
  measure: number;
  time: number;
}

interface MappingState {
  measureMap: MeasurePoint[];

  addPoint: (measure: number, time: number) => void;
  removePoint: (measure: number) => void;
  setMap: (map: MeasurePoint[]) => void;
  clear: () => void;
}

const sortByMeasure = (a: MeasurePoint, b: MeasurePoint) => a.measure - b.measure;

export const useMappingStore = create<MappingState>((set) => ({
  measureMap: [],

  addPoint: (measure, time) =>
    set((s) => {
      const filtered = s.measureMap.filter((p) => p.measure !== measure);
      const next = [...filtered, { measure, time: parseFloat(time.toFixed(3)) }];
      next.sort(sortByMeasure);
      return { measureMap: next };
    }),

  removePoint: (measure) =>
    set((s) => ({ measureMap: s.measureMap.filter((p) => p.measure !== measure) })),

  setMap: (map) => set({ measureMap: [...map].sort(sortByMeasure) }),

  clear: () => set({ measureMap: [] }),
}));
