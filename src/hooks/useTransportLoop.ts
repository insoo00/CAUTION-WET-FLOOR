import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTransportStore } from '../stores/transportStore';
import { useScoreStore } from '../stores/scoreStore';
import { useMappingStore } from '../stores/mappingStore';
import { useSettingsStore } from '../stores/settingsStore';
import { measureToTime, timeToMeasure } from '../lib/timeMapping';
import { isAccentBeat, playClick } from '../lib/metronome';
import {
  getPositionMs,
  getPositionSec,
  preloadPiano,
  setScoreBpm,
  setScoreLoop,
  startScorePlayback,
  stopScorePlayback,
} from '../lib/scorePlayer';
import { getLoadedToolkit } from '../lib/verovio';
import type { YouTubeHandle } from '../components/YouTubePlayer';
import type { ScoreViewHandle } from '../components/ScoreView';

interface Params {
  ytRef: RefObject<YouTubeHandle | null>;
  scoreRef: RefObject<ScoreViewHandle | null>;
}

/** ms → 0-based measure float (measureStartMs 보간) */
function msToMeasureFloat(ms: number): number {
  const arr = useScoreStore.getState().measureStartMs;
  if (arr.length === 0) return 0;
  let lo = 0,
    hi = arr.length - 1,
    found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! <= ms) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const start = arr[found]!;
  const end = arr[found + 1] ?? start + 1;
  const frac = end > start ? Math.max(0, Math.min(1, (ms - start) / (end - start))) : 0;
  return found + frac;
}

/** 0-based measure float → ms */
function measureFloatToMs(mf: number): number {
  const arr = useScoreStore.getState().measureStartMs;
  if (arr.length === 0) return 0;
  const i = Math.max(0, Math.min(arr.length - 1, Math.floor(mf)));
  const frac = mf - Math.floor(mf);
  const start = arr[i]!;
  const end = arr[i + 1] ?? start;
  return start + frac * (end - start);
}

/** 현재 ms의 박 정보 (beats 그리드) */
function beatAtMs(ms: number): { globalBeat: number; beatInMeasure: number } {
  const beats = useScoreStore.getState().beats;
  const bpm = useTransportStore.getState().beatsPerMeasure;
  if (beats.length === 0) return { globalBeat: -1, beatInMeasure: 0 };
  let lo = 0,
    hi = beats.length - 1,
    found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid]!.timeMs <= ms) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const g = beats[found]!.globalBeat;
  return { globalBeat: g, beatInMeasure: ((g % bpm) + bpm) % bpm };
}

/** A-B 구간 반복의 초 단위 경계 (없으면 null) */
function loopSecBounds(): { start: number | null; end: number | null } {
  const { loopStartMeasure, loopEndMeasure } = useTransportStore.getState();
  const { measureStartMs, durationSec } = useScoreStore.getState();
  if (loopStartMeasure == null || loopEndMeasure == null) {
    return { start: null, end: null };
  }
  const start = (measureStartMs[loopStartMeasure] ?? 0) / 1000;
  const endMs = measureStartMs[loopEndMeasure + 1] ?? durationSec * 1000;
  return { start, end: endMs / 1000 };
}

export function useTransportLoop({ ytRef, scoreRef }: Params) {
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const playbackSource = useTransportStore((s) => s.playbackSource);
  const bpm = useTransportStore((s) => s.bpm);
  const loopStartMeasure = useTransportStore((s) => s.loopStartMeasure);
  const loopEndMeasure = useTransportStore((s) => s.loopEndMeasure);

  const [elapsedSec, setElapsedSec] = useState(0);
  const [totalSec, setTotalSec] = useState(0);

  const prevMeasureRef = useRef(-1);
  const prevBeatRef = useRef(-1);
  const prevGlobalBeatRef = useRef(-1);
  const scoreResumeSecRef = useRef(0);
  // 재생 정지 시 "정지 시점 위치"를 이어듣기용으로 저장할지 여부.
  // 되감기/새 곡 로드(resetScorePosition)는 false로 만들어 0을 덮어쓰지 않게 한다.
  const captureResumeRef = useRef(true);

  const buildScoreOpts = useCallback(
    () => ({
      shouldPlayPart: (i: number) => !useScoreStore.getState().mutedParts.has(i),
      metronomeOn: () => useSettingsStore.getState().metronomeOn,
      onEnd: () => {
        scoreResumeSecRef.current = 0;
        useTransportStore.getState().setIsPlaying(false);
      },
    }),
    []
  );

  // ── 악보 재생 모드 ──────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || playbackSource !== 'score') return;
    const score = useScoreStore.getState();
    if (!score.isLoaded || score.notes.length === 0) {
      useTransportStore.getState().setIsPlaying(false);
      return;
    }

    prevMeasureRef.current = -1;
    prevBeatRef.current = -1;

    let cancelled = false;
    let raf = 0;
    let lastClock = 0;

    // 이번 재생 세션이 정지되면 정지 시점 위치를 저장(이어듣기)한다.
    // (되감기 등으로 미리 false가 됐더라도, 실제 재생이 시작되면 다시 켠다.)
    captureResumeRef.current = true;

    let fromSec = scoreResumeSecRef.current;
    if (fromSec >= score.durationSec - 1e-3) fromSec = 0;

    const startBpm = useTransportStore.getState().bpm;
    const { start, end } = loopSecBounds();
    setScoreLoop(start, end);

    void preloadPiano().then(() => {
      if (cancelled) return;
      startScorePlayback(
        {
          notes: score.notes,
          beats: score.beats,
          durationSec: score.durationSec,
          baseBpm: score.baseBpm,
        },
        fromSec,
        startBpm,
        buildScoreOpts()
      );
    });

    const tick = () => {
      const ms = getPositionMs();
      const tk = getLoadedToolkit();
      let measureIdx = prevMeasureRef.current;
      if (tk) {
        const ids = tk.getElementsAtTime(ms).notes ?? [];
        const mi = scoreRef.current?.highlight(ids) ?? -1;
        if (mi >= 0) measureIdx = mi;
      }
      const { globalBeat, beatInMeasure } = beatAtMs(ms);

      if (measureIdx !== prevMeasureRef.current || beatInMeasure !== prevBeatRef.current) {
        useTransportStore.getState().setPosition(Math.max(0, measureIdx), beatInMeasure);
        prevMeasureRef.current = measureIdx;
        prevBeatRef.current = beatInMeasure;
      }
      void globalBeat;

      const now = performance.now();
      if (now - lastClock > 100) {
        setElapsedSec(getPositionSec());
        setTotalSec(useScoreStore.getState().durationSec);
        lastClock = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      // 일반 일시정지일 때만 위치 저장. 되감기/새 곡 로드면 0을 유지.
      if (captureResumeRef.current) scoreResumeSecRef.current = getPositionSec();
      stopScorePlayback();
    };
  }, [isPlaying, playbackSource, scoreRef, buildScoreOpts]);

  useEffect(() => {
    if (isPlaying && playbackSource === 'score') setScoreBpm(bpm);
  }, [bpm, isPlaying, playbackSource]);

  useEffect(() => {
    if (playbackSource !== 'score') return;
    const { start, end } = loopSecBounds();
    setScoreLoop(start, end);
  }, [loopStartMeasure, loopEndMeasure, playbackSource]);

  // ── YouTube 재생 모드 ──────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || playbackSource !== 'youtube') return;
    prevGlobalBeatRef.current = -1;
    let raf = 0;
    let lastClock = 0;

    const tick = () => {
      const transport = useTransportStore.getState();
      const score = useScoreStore.getState();
      const settings = useSettingsStore.getState();
      const { measureMap } = useMappingStore.getState();

      const ytTime = ytRef.current?.getCurrentTime();
      const ytDur = ytRef.current?.getDuration() ?? 0;
      const elapsed = typeof ytTime === 'number' ? ytTime : 0;

      const measureFloat = timeToMeasure(
        elapsed,
        measureMap,
        transport.bpm,
        transport.beatsPerMeasure
      );

      // A-B 구간 반복
      if (transport.loopStartMeasure != null && transport.loopEndMeasure != null) {
        if (
          measureFloat > transport.loopEndMeasure + 1 ||
          measureFloat < transport.loopStartMeasure - 0.5
        ) {
          const t = measureToTime(
            transport.loopStartMeasure,
            measureMap,
            transport.bpm,
            transport.beatsPerMeasure
          );
          ytRef.current?.seekTo(Math.max(0, t));
          raf = requestAnimationFrame(tick);
          return;
        }
      }

      const ms = measureFloatToMs(measureFloat);
      const tk = getLoadedToolkit();
      let measureIdx = Math.floor(measureFloat);
      if (tk && score.isLoaded) {
        const ids = tk.getElementsAtTime(ms).notes ?? [];
        const mi = scoreRef.current?.highlight(ids) ?? -1;
        if (mi >= 0) measureIdx = mi;
      }

      const beatInMeasure = Math.floor(
        (measureFloat - Math.floor(measureFloat)) * transport.beatsPerMeasure
      );
      const globalBeat = Math.floor(measureFloat * transport.beatsPerMeasure);

      if (measureIdx !== prevMeasureRef.current || beatInMeasure !== prevBeatRef.current) {
        transport.setPosition(Math.max(0, measureIdx), beatInMeasure);
        prevMeasureRef.current = measureIdx;
        prevBeatRef.current = beatInMeasure;
      }
      if (globalBeat !== prevGlobalBeatRef.current && globalBeat >= 0) {
        prevGlobalBeatRef.current = globalBeat;
        if (settings.metronomeOn) {
          playClick(isAccentBeat(globalBeat, settings.rhythmPattern));
        }
      }

      const now = performance.now();
      if (now - lastClock > 100) {
        setElapsedSec(elapsed);
        setTotalSec(ytDur);
        lastClock = now;
      }

      const loopActive =
        transport.loopStartMeasure != null && transport.loopEndMeasure != null;
      if (
        !loopActive &&
        score.isLoaded &&
        score.totalMeasures > 0 &&
        measureFloat >= score.totalMeasures
      ) {
        transport.setIsPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, playbackSource, ytRef, scoreRef]);

  const resetScorePosition = useCallback(() => {
    scoreResumeSecRef.current = 0;
    // 직후 재생 effect cleanup이 현재 위치로 덮어쓰지 못하게 막는다.
    captureResumeRef.current = false;
  }, []);

  /** 악보 클릭 → 그 시각(초)부터 이동/재생 */
  const seekToTime = useCallback(
    (sec: number, autoPlay = true) => {
      const transport = useTransportStore.getState();
      if (transport.playbackSource === 'score') {
        scoreResumeSecRef.current = sec;
        prevMeasureRef.current = -1;
        prevBeatRef.current = -1;
        const tk = getLoadedToolkit();
        if (tk) {
          const ids = tk.getElementsAtTime(sec * 1000).notes ?? [];
          scoreRef.current?.highlight(ids);
        }
        if (autoPlay) {
          if (!transport.isPlaying) {
            transport.setIsPlaying(true);
          } else {
            const score = useScoreStore.getState();
            stopScorePlayback();
            const { start, end } = loopSecBounds();
            setScoreLoop(start, end);
            startScorePlayback(
              {
                notes: score.notes,
                beats: score.beats,
                durationSec: score.durationSec,
                baseBpm: score.baseBpm,
              },
              sec,
              transport.bpm,
              buildScoreOpts()
            );
          }
        }
      } else {
        // YouTube: score-sec → measure float → video time
        const mf = msToMeasureFloat(sec * 1000);
        const { measureMap } = useMappingStore.getState();
        const t = measureToTime(mf, measureMap, transport.bpm, transport.beatsPerMeasure);
        ytRef.current?.seekTo(Math.max(0, t));
        if (autoPlay && !transport.isPlaying) transport.setIsPlaying(true);
      }
    },
    [scoreRef, ytRef, buildScoreOpts]
  );

  return { elapsedSec, totalSec, resetScorePosition, seekToTime };
}
