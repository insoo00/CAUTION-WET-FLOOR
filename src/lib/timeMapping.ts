import type { MeasurePoint } from '../stores/mappingStore';

/**
 * 주어진 영상 재생 시간 t(초)를 마디 단위 부동소수 위치로 변환한다.
 *
 * - 매핑 포인트가 0~1개면 BPM 기반 폴백.
 * - 첫 포인트 이전 / 마지막 포인트 이후는 인접 구간의 rate로 외삽.
 * - 두 포인트 사이는 선형 보간.
 *
 * 반환값: 0-indexed measure float
 *   0.0 = 1마디 시작, 0.5 = 1마디 중간, 1.0 = 2마디 시작
 */
export function timeToMeasure(
  t: number,
  measureMap: MeasurePoint[],
  bpm: number,
  beatsPerMeasure: number
): number {
  if (measureMap.length < 2) {
    const beats = (t * bpm) / 60;
    return beats / beatsPerMeasure;
  }

  const first = measureMap[0]!;
  if (t <= first.time) {
    const beatsBefore = ((first.time - t) * bpm) / 60;
    return Math.max(0, first.measure - 1 - beatsBefore / beatsPerMeasure);
  }

  const last = measureMap[measureMap.length - 1]!;
  if (t >= last.time) {
    const prev = measureMap[measureMap.length - 2]!;
    const rate = (last.measure - prev.measure) / (last.time - prev.time);
    return last.measure - 1 + (t - last.time) * rate;
  }

  for (let i = 0; i < measureMap.length - 1; i++) {
    const a = measureMap[i]!;
    const b = measureMap[i + 1]!;
    if (t >= a.time && t <= b.time) {
      const ratio = (t - a.time) / (b.time - a.time);
      return a.measure - 1 + ratio * (b.measure - a.measure);
    }
  }
  return 0;
}

/**
 * timeToMeasure의 역변환. 0-indexed measure float → 영상 시간(초).
 * 클릭 탐색/구간 반복에서 "이 마디로 가려면 몇 초로 seek?"에 사용.
 */
export function measureToTime(
  measureFloat: number,
  measureMap: MeasurePoint[],
  bpm: number,
  beatsPerMeasure: number
): number {
  if (measureMap.length < 2) {
    const beats = measureFloat * beatsPerMeasure;
    return (beats * 60) / bpm;
  }

  const targetMeasure = measureFloat + 1; // 매핑은 1-indexed
  const first = measureMap[0]!;
  if (targetMeasure <= first.measure) {
    return (
      first.time -
      ((first.measure - 1 - measureFloat) * beatsPerMeasure * 60) / bpm
    );
  }

  const last = measureMap[measureMap.length - 1]!;
  if (targetMeasure >= last.measure) {
    const prev = measureMap[measureMap.length - 2]!;
    const rate = (last.measure - prev.measure) / (last.time - prev.time);
    if (!isFinite(rate) || rate === 0) return last.time;
    return last.time + (measureFloat - (last.measure - 1)) / rate;
  }

  for (let i = 0; i < measureMap.length - 1; i++) {
    const a = measureMap[i]!;
    const b = measureMap[i + 1]!;
    if (targetMeasure >= a.measure && targetMeasure <= b.measure) {
      const span = b.measure - a.measure;
      const ratio = span === 0 ? 0 : (targetMeasure - a.measure) / span;
      return a.time + ratio * (b.time - a.time);
    }
  }
  return 0;
}

/** measure float → { measureIdx, beatIdx } 0-indexed */
export function decomposeMeasureFloat(
  measureFloat: number,
  beatsPerMeasure: number
): { measureIdx: number; beatIdx: number; globalBeat: number } {
  const measureIdx = Math.floor(measureFloat);
  const beatInMeasure = (measureFloat - measureIdx) * beatsPerMeasure;
  const beatIdx = Math.floor(beatInMeasure);
  const globalBeat = Math.floor(measureFloat * beatsPerMeasure);
  return { measureIdx, beatIdx, globalBeat };
}

export function formatTime(s: number): string {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}
