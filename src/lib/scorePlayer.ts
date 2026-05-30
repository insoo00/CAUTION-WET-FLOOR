import { SplendidGrandPiano } from 'smplr';
import { ensureAudio, getAudioContext, playClickAt } from './metronome';
import type { PlayNote, ScoreBeat } from '../stores/scoreStore';

/**
 * Verovio MIDI에서 파싱한 음표를 smplr 피아노로 정밀 재생.
 * - 시간은 "악보 기준 초(scoreSec)"로 관리. 실제 재생은 rate(=bpm/baseBpm)로 환산.
 * - 룩어헤드 스케줄러로 음/메트로놈을 AudioContext 시각에 예약 → 부드러움.
 * - A-B 구간 반복, 파트 음소거, 탐색(seek) 지원.
 */

let piano: SplendidGrandPiano | null = null;
let pianoLoad: Promise<void> | null = null;

export function preloadPiano(): Promise<void> {
  const ctx = ensureAudio();
  if (!ctx) return Promise.resolve();
  if (!piano) piano = new SplendidGrandPiano(ctx, { volume: 110 });
  if (!pianoLoad) {
    const p = piano as unknown as { load?: Promise<unknown> };
    pianoLoad = Promise.resolve(p.load)
      .then(() => undefined)
      .catch((e) => console.warn('[scorePlayer] piano load failed', e));
  }
  return pianoLoad;
}

const LOOKAHEAD_SEC = 0.2;
const TICK_MS = 25;

interface Options {
  shouldPlayPart: (track: number) => boolean;
  metronomeOn: () => boolean;
  onEnd: () => void;
}

let notes: PlayNote[] = [];
let beats: ScoreBeat[] = [];
let durationSec = 0;
let baseBpm = 120;
let rate = 1;
let running = false;
let anchorCtxTime = 0;
let anchorSec = 0;
let noteIdx = 0;
let beatIdx = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let opts: Options | null = null;
let loopStartSec: number | null = null;
let loopEndSec: number | null = null;

function positionSec(): number {
  const ctx = getAudioContext();
  if (!ctx || !running) return anchorSec;
  return anchorSec + (ctx.currentTime - anchorCtxTime) * rate;
}

export function getPositionSec(): number {
  return positionSec();
}
export function getPositionMs(): number {
  return positionSec() * 1000;
}
export function isScorePlaying(): boolean {
  return running;
}

function lbSec(arr: PlayNote[], targetSec: number): number {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]!.timeSec < targetSec) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function lbMs(arr: ScoreBeat[], targetMs: number): number {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]!.timeMs < targetMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** 구간 반복 설정 (악보 기준 초). null이면 해제. */
export function setScoreLoop(startSec: number | null, endSec: number | null): void {
  if (startSec == null || endSec == null || endSec <= startSec) {
    loopStartSec = null;
    loopEndSec = null;
    return;
  }
  loopStartSec = startSec;
  loopEndSec = endSec;
}

function reanchor(toSec: number): void {
  const ctx = getAudioContext();
  anchorSec = toSec;
  anchorCtxTime = ctx?.currentTime ?? 0;
  noteIdx = lbSec(notes, toSec);
  beatIdx = lbMs(beats, toSec * 1000);
}

function scheduleTick(): void {
  const ctx = getAudioContext();
  if (!ctx || !running || !opts) return;

  let nowSec = positionSec();

  if (loopStartSec != null && loopEndSec != null && nowSec >= loopEndSec) {
    try {
      piano?.stop();
    } catch {
      /* ignore */
    }
    reanchor(loopStartSec);
    nowSec = loopStartSec;
  }

  const horizon = nowSec + LOOKAHEAD_SEC * rate;

  while (noteIdx < notes.length && notes[noteIdx]!.timeSec < horizon) {
    const n = notes[noteIdx]!;
    noteIdx++;
    if (!opts.shouldPlayPart(n.track)) continue;
    const when = anchorCtxTime + (n.timeSec - anchorSec) / rate;
    if (when < ctx.currentTime - 0.05) continue;
    try {
      piano?.start({
        note: n.midi,
        time: Math.max(ctx.currentTime, when),
        duration: Math.max(0.05, n.durSec / rate),
        velocity: Math.round(Math.max(1, Math.min(127, n.velocity * 127))),
      });
    } catch {
      /* ignore */
    }
  }

  const metro = opts.metronomeOn();
  while (beatIdx < beats.length && beats[beatIdx]!.timeMs / 1000 < horizon) {
    const b = beats[beatIdx]!;
    beatIdx++;
    if (!metro) continue;
    const when = anchorCtxTime + (b.timeMs / 1000 - anchorSec) / rate;
    if (when < ctx.currentTime - 0.05) continue;
    playClickAt(Math.max(ctx.currentTime, when), b.isDownbeat);
  }

  if (loopEndSec == null && durationSec > 0 && nowSec >= durationSec) {
    stopScorePlayback();
    opts.onEnd();
  }
}

export function startScorePlayback(
  data: {
    notes: PlayNote[];
    beats: ScoreBeat[];
    durationSec: number;
    baseBpm: number;
  },
  fromSec: number,
  bpm: number,
  options: Options
): void {
  const ctx = ensureAudio();
  if (!ctx) return;
  notes = data.notes;
  beats = data.beats;
  durationSec = data.durationSec;
  baseBpm = data.baseBpm || 120;
  rate = Math.max(0.1, bpm / baseBpm);
  opts = options;
  running = true;
  reanchor(Math.max(0, fromSec));
  if (timer != null) clearInterval(timer);
  timer = setInterval(scheduleTick, TICK_MS);
  scheduleTick();
}

export function stopScorePlayback(): void {
  running = false;
  if (timer != null) {
    clearInterval(timer);
    timer = null;
  }
  try {
    piano?.stop();
  } catch {
    /* ignore */
  }
}

/** 재생 중 BPM 변경 — 위치 유지, 속도만 변경 */
export function setScoreBpm(bpm: number): void {
  const newRate = Math.max(0.1, bpm / (baseBpm || 120));
  if (!running) {
    rate = newRate;
    return;
  }
  reanchor(positionSec());
  rate = newRate;
}
