import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Ref, ChangeEvent, MouseEvent } from 'react';
import { Midi } from '@tonejs/midi';
import { useScoreStore } from '../stores/scoreStore';
import { useTransportStore } from '../stores/transportStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useMappingStore } from '../stores/mappingStore';
import { useYouTubeStore } from '../stores/youtubeStore';
import {
  getVerovioToolkit,
  getLoadedToolkit,
  midiBase64ToBytes,
} from '../lib/verovio';
import type { PlayNote, ScoreBeat } from '../stores/scoreStore';
import {
  AnnotationCanvas,
  type AnnTool,
  type AnnotationHandle,
} from './AnnotationCanvas';
import { SONGS, type SongDef } from '../lib/songLibrary';

export interface ScoreViewHandle {
  /** 현재 울리는 음표 id들을 하이라이트. 첫 음표의 0-indexed 마디 idx 반환(-1=없음) */
  highlight: (ids: string[]) => number;
  clearHighlight: () => void;
  scrollToTop: () => void;
}

interface Props {
  ref?: Ref<ScoreViewHandle>;
  /** 악보 클릭 시 그 위치(초)부터 이동/재생 */
  onSeekTime?: (sec: number) => void;
  /** 새 악보 로드 완료 시 호출 — 재생 위치를 맨 앞으로 초기화하는 용도 */
  onLoaded?: () => void;
}

export function ScoreView({ ref, onSeekTime, onLoaded }: Props) {
  const isLoaded = useScoreStore((s) => s.isLoaded);
  const songTitle = useScoreStore((s) => s.songTitle);
  const setScoreData = useScoreStore((s) => s.setScoreData);
  const setBpm = useTransportStore((s) => s.setBpm);
  const setBeatsPerMeasure = useTransportStore((s) => s.setBeatsPerMeasure);
  const autoScroll = useSettingsStore((s) => s.autoScroll);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const autoScrollRef = useRef(autoScroll);
  const measureElsRef = useRef<Element[]>([]);
  const highlightedRef = useRef<Element[]>([]);
  const lastAutoScrollRef = useRef(0);
  // 리사이즈 시 레이아웃만 다시 그리는 함수(스토어/재생 상태는 건드리지 않음)
  const relayoutRef = useRef<() => void>(() => {});

  useEffect(() => {
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);

  // 화면 폭 변경(PC 창 크기/기기 회전 등) 시 악보를 폭에 맞춰 다시 레이아웃.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let lastW = Math.round(el.getBoundingClientRect().width);
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (Math.abs(w - lastW) < 30) return; // 미세 변화 무시
      lastW = w;
      clearTimeout(debounce);
      debounce = setTimeout(() => relayoutRef.current(), 250);
    });
    ro.observe(el);
    return () => {
      clearTimeout(debounce);
      ro.disconnect();
    };
  }, []);

  const [error, setError] = useState<string | null>(null);

  // 필기(annotation) 상태
  const [annotate, setAnnotate] = useState(false);
  const [tool, setTool] = useState<AnnTool>('pen');
  const [color, setColor] = useState('#d4452a');
  const annotateRef = useRef(annotate);
  useEffect(() => {
    annotateRef.current = annotate;
  }, [annotate]);
  const annRef = useRef<AnnotationHandle>(null);
  const annImportRef = useRef<HTMLInputElement | null>(null);

  const handleAnnotImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await annRef.current?.importFile(file);
    } catch (err) {
      console.error(err);
      setError('필기 파일을 불러오지 못했습니다');
    }
    e.target.value = '';
  };

  useImperativeHandle(
    ref,
    () => ({
      highlight: (ids: string[]) => {
        const root = containerRef.current;
        if (!root) return -1;
        // 이전 하이라이트 제거
        for (const el of highlightedRef.current) el.classList.remove('playing');
        highlightedRef.current = [];
        let firstEl: Element | null = null;
        for (const rawId of ids) {
          // 도돌이표(반복) 두 번째 패스의 음표는 Verovio가 `-rend2` 같은
          // 접미사 ID를 부여한다. 그 ID는 SVG에 없으므로(마디는 한 번만 그려짐)
          // 접미사를 떼어 원본 요소에 매핑한다. → 반복 구간도 정상 하이라이트.
          const id = rawId.replace(/-rend\d+$/, '');
          const el = root.querySelector(`g#${CSS.escape(id)}`);
          if (el) {
            el.classList.add('playing');
            highlightedRef.current.push(el);
            if (!firstEl) firstEl = el;
          }
        }
        if (firstEl && autoScrollRef.current) scrollIntoView(firstEl);
        // 마디 idx 계산
        if (firstEl) {
          const meas = firstEl.closest('.measure');
          if (meas) {
            const idx = measureElsRef.current.indexOf(meas);
            return idx;
          }
        }
        return -1;
      },
      clearHighlight: () => {
        for (const el of highlightedRef.current) el.classList.remove('playing');
        highlightedRef.current = [];
      },
      scrollToTop: () => {
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      },
    }),
    []
  );

  const scrollIntoView = (el: Element) => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const cRect = el.getBoundingClientRect();
    const sRect = scrollEl.getBoundingClientRect();
    // 연주 위치(현재 음표)의 뷰포트 내 세로 위치
    const yInView = cRect.top - sRect.top;
    // 화면 45%보다 아래로 내려갔거나 위로 사라지면, 28% 지점으로 당겨
    // 항상 아래쪽에 다음 마디들이 충분히 보이도록 한다(하단에서 사라짐 방지).
    if (yInView > sRect.height * 0.45 || yInView < sRect.height * 0.08) {
      // 스무스 스크롤 애니메이션 중 재트리거로 인한 떨림 방지 (쿨다운)
      const now = performance.now();
      if (now - lastAutoScrollRef.current < 350) return;
      lastAutoScrollRef.current = now;
      const target = scrollEl.scrollTop + yInView - sRect.height * 0.28;
      scrollEl.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }
  };

  // 레이아웃만: 이미 toolkit에 로드된 데이터를 화면 폭에 맞춰 SVG로 다시 그리고
  // 마디 엘리먼트 캐시를 갱신한다. 스토어/재생 상태는 건드리지 않는다(리사이즈용).
  const layoutToSvg = (tk: Awaited<ReturnType<typeof getVerovioToolkit>>) => {
    const container = containerRef.current;
    if (!container) return;

    const width = Math.round(container.getBoundingClientRect().width) || 800;
    // 화면 폭에 따라 한 줄 마디 수 조절 — 좁은 화면(폰)에서 음표가 잘리거나
    // 과하게 작아지는 것 방지. iPad/PC는 4마디 유지.
    const TARGET_PER_LINE = width < 480 ? 2 : width < 760 ? 3 : 4;
    let scale = 36;
    const setOpts = (s: number, pw: number) =>
      tk.setOptions({
        scale: s,
        pageWidth: pw,
        pageHeight: 60000,
        adjustPageHeight: true,
        svgViewBox: true,
        breaks: 'auto',
        footer: 'none',
        header: 'none', // 제목/크레딧 끔 (소스 파일의 찌꺼기 '그_' 제거)
        spacingStaff: 12,
        spacingSystem: 16,
      });

    setOpts(scale, Math.round((width * 100) / scale));
    container.innerHTML = tk.renderToSVG(1);

    // 첫 줄(시스템)에 TARGET_PER_LINE 마디가 오도록 scale 보정.
    const countFirstSystem = () => {
      const ms = Array.from(
        container.querySelectorAll('.measure')
      ) as SVGGraphicsElement[];
      if (ms.length === 0) return 0;
      const ys = ms.map((m) => m.getBBox().y);
      const y0 = Math.min(...ys);
      return ys.filter((y) => Math.abs(y - y0) < 60).length;
    };
    try {
      for (let iter = 0; iter < 6; iter++) {
        const cnt = countFirstSystem();
        if (cnt === 0 || cnt === TARGET_PER_LINE) break;
        let target = (scale * cnt) / TARGET_PER_LINE;
        target = Math.max(14, Math.min(80, target));
        if (Math.abs(target - scale) < 0.3) break;
        scale = target;
        setOpts(scale, Math.round((width * 100) / scale));
        container.innerHTML = tk.renderToSVG(1);
      }
    } catch (e) {
      console.warn('measure-fit pass failed', e);
    }

    // 내용이 화면 폭을 꽉 채우도록: 현재 내용이 차지하는 가로 비율을 재서
    // pageWidth를 그만큼 줄여 "재렌더" → svgViewBox가 화면 폭으로 확대.
    try {
      const svg = container.querySelector('svg');
      if (svg) {
        const sr = svg.getBoundingClientRect();
        let maxRight = 0;
        container.querySelectorAll('.measure').forEach((m) => {
          maxRight = Math.max(maxRight, m.getBoundingClientRect().right);
        });
        const fillFrac = sr.width > 0 ? (maxRight - sr.left) / sr.width : 1;
        if (fillFrac > 0.3 && fillFrac < 0.93) {
          const newPW = Math.round(((width * 100) / scale) * (fillFrac + 0.02));
          setOpts(scale, newPW);
          container.innerHTML = tk.renderToSVG(1);
        }
      }
    } catch (e) {
      console.warn('width-fill re-render failed', e);
    }

    // 마디 엘리먼트 캐시 (DOM 순서 = 악보 순서)
    measureElsRef.current = Array.from(container.querySelectorAll('.measure'));
  };

  // 리사이즈 시 호출 — 로드된 악보가 있으면 폭에 맞춰 레이아웃만 다시.
  const relayout = () => {
    const tk = getLoadedToolkit();
    if (!tk || !useScoreStore.getState().isLoaded) return;
    try {
      layoutToSvg(tk);
    } catch (e) {
      console.warn('relayout failed', e);
    }
  };
  relayoutRef.current = relayout;

  const renderAndAnalyze = async (
    input: { xml: string } | { mxlBase64: string },
    fallbackTitle: string
  ) => {
    const tk = await getVerovioToolkit();
    const container = containerRef.current;
    if (!container) return;

    const ok =
      'xml' in input
        ? tk.loadData(input.xml)
        : tk.loadZipDataBase64(input.mxlBase64);
    if (!ok) throw new Error('Verovio 악보 로드 실패');

    layoutToSvg(tk);
    const totalMeasures = measureElsRef.current.length;

    // 마디 시작 시각(ms) — 첫 등장 기준
    const measureStartMs = measureElsRef.current.map((m) => {
      const t = m.id ? tk.getTimeForElement(m.id) : 0;
      return typeof t === 'number' && isFinite(t) ? t : 0;
    });

    // MIDI 파싱 → 재생용 음표 + 파트
    const midi = new Midi(
      midiBase64ToBytes(tk.renderToMIDI()).buffer as ArrayBuffer
    );
    const notes: PlayNote[] = [];
    midi.tracks.forEach((tr, ti) => {
      for (const n of tr.notes) {
        notes.push({
          timeSec: n.time,
          durSec: n.duration,
          midi: n.midi,
          velocity: n.velocity,
          track: ti,
        });
      }
    });
    notes.sort((a, b) => a.timeSec - b.timeSec);
    const parts = midi.tracks.map((tr, ti) => ({
      index: ti,
      name: (tr.name && tr.name.trim()) || `파트 ${ti + 1}`,
    }));
    const baseBpm = Math.round(midi.header.tempos?.[0]?.bpm ?? 120);
    const ts = midi.header.timeSignatures?.[0]?.timeSignature;
    const beatsPerMeasure = ts?.[0] ?? 4;
    const timeSignature = ts ? `${ts[0]}/${ts[1]}` : '4/4';
    const durationSec = midi.duration;

    // 박 그리드 — timemap의 정수 qstamp
    const beats: ScoreBeat[] = [];
    try {
      // verovio 6.x는 객체(배열)를 그대로 반환, 구버전은 JSON 문자열
      const tmRaw = tk.renderToTimemap({ includeMeasures: true }) as unknown;
      const tm = (
        typeof tmRaw === 'string' ? JSON.parse(tmRaw) : tmRaw
      ) as Array<{ tstamp: number; qstamp?: number }>;
      const seen = new Set<number>();
      for (const e of tm) {
        const q = e.qstamp;
        if (typeof q !== 'number' || !Number.isInteger(q) || seen.has(q)) continue;
        seen.add(q);
        beats.push({
          timeMs: e.tstamp,
          globalBeat: q,
          isDownbeat: q % beatsPerMeasure === 0,
        });
      }
      beats.sort((a, b) => a.timeMs - b.timeMs);
    } catch (e) {
      console.warn('timemap parse failed', e);
    }

    const songTitle =
      (tk.getElementAttr('title') as { label?: string })?.label || fallbackTitle;

    setBeatsPerMeasure(beatsPerMeasure);
    if (baseBpm) setBpm(baseBpm);
    setScoreData({
      songTitle: fallbackTitle || songTitle,
      totalMeasures,
      timeSignature,
      baseBpm,
      durationSec,
      notes,
      beats,
      measureStartMs,
      parts,
    });

    console.log(
      '[CautionWetFloor] Verovio:',
      totalMeasures,
      'measures,',
      notes.length,
      'notes,',
      parts.length,
      'parts,',
      `${durationSec.toFixed(1)}s @ ${baseBpm}bpm,`,
      beats.length,
      'beats'
    );
  };

  const loadScore = async (
    input: { xml: string } | { mxlBase64: string },
    fallbackTitle: string
  ) => {
    try {
      setError(null);
      useTransportStore.getState().setIsPlaying(false);
      await renderAndAnalyze(input, fallbackTitle);
      // 새 악보를 열면 재생 위치를 맨 앞으로 초기화 → 첫 재생은 항상 1마디부터.
      onLoaded?.();
    } catch (e) {
      console.error(e);
      setError('악보 로드 실패');
    }
  };

  const bufToBase64 = (buf: ArrayBuffer): string => {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.replace(/\.[^.]+$/, '');
    if (file.name.toLowerCase().endsWith('.mxl')) {
      const buf = await file.arrayBuffer();
      await loadScore({ mxlBase64: bufToBase64(buf) }, name);
    } else {
      const txt = await file.text();
      await loadScore({ xml: txt }, name);
    }
  };

  const loadSongFromLibrary = async (song: SongDef) => {
    try {
      setError(null);
      const res = await fetch(song.mxlUrl);
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const buf = await res.arrayBuffer();
      await loadScore({ mxlBase64: bufToBase64(buf) }, song.title);
      if (song.youtubeId) useYouTubeStore.getState().setYtVideoId(song.youtubeId);
      if (song.mapping && song.mapping.length) {
        useMappingStore.getState().setMap(song.mapping);
      }
    } catch (e) {
      console.error(e);
      setError(`${song.title} 로드 실패`);
    }
  };

  const handleScoreClick = (e: MouseEvent<HTMLDivElement>) => {
    if (annotateRef.current) return; // 필기 모드에선 탐색 안 함
    if (!useScoreStore.getState().isLoaded) return;
    const tk = getLoadedToolkit();
    if (!tk) return;
    const target = e.target as Element;
    let note = target.closest('.note');
    if (!note) {
      const meas = target.closest('.measure');
      note = meas?.querySelector('.note') ?? null;
    }
    if (note?.id) {
      const ms = tk.getTimeForElement(note.id);
      if (typeof ms === 'number' && isFinite(ms)) onSeekTime?.(ms / 1000);
    }
  };

  return (
    <div className="relative h-full flex flex-col paper-surface overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 z-[3]"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,253,248,1) 0%, rgba(255,253,248,0) 3%, rgba(255,253,248,0) 98%, rgba(255,253,248,1) 100%)',
        }}
      />

      <div className="flex justify-between items-center gap-2 min-w-0 px-3 md:px-4 py-2.5 border-b border-dashed border-ink/15 font-mono text-[11px] tracking-[0.08em] md:tracking-[0.15em] uppercase text-ink/55">
        <div className="flex gap-2 items-center min-w-0 truncate">
          <span className="w-2 h-2 rounded-full bg-accent shadow-[0_0_0_3px_rgba(212,69,42,0.18)] shrink-0" />
          <CurrentMeasureLabel />
        </div>
        <div className="hidden sm:block shrink-0">
          <AutoScrollLabel />
        </div>
      </div>

      {isLoaded && (
        <AnnotationToolbar
          annotate={annotate}
          tool={tool}
          color={color}
          onToggle={() => setAnnotate((v) => !v)}
          onPickPen={(c) => {
            setAnnotate(true);
            setTool('pen');
            setColor(c);
          }}
          onHighlighter={() => {
            setAnnotate(true);
            setTool('highlighter');
            setColor('#f2c200');
          }}
          onEraser={() => {
            setAnnotate(true);
            setTool('eraser');
          }}
          onUndo={() => annRef.current?.undo()}
          onClear={() => annRef.current?.clear()}
          onExport={() => annRef.current?.exportFile()}
          onImport={() => annImportRef.current?.click()}
        />
      )}
      <input
        ref={annImportRef}
        type="file"
        accept=".json,application/json"
        onChange={handleAnnotImport}
        className="hidden"
      />

      <div
        ref={scrollRef}
        onClick={handleScoreClick}
        className="flex-1 overflow-y-auto overflow-x-hidden scroll-paper px-6 py-5"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="relative w-full">
          <div ref={containerRef} className="w-full verovio-score" />
          {isLoaded && (
            <AnnotationCanvas
              ref={annRef}
              enabled={annotate}
              tool={tool}
              color={color}
              scoreId={songTitle}
            />
          )}
        </div>

        {!isLoaded && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-10 py-10">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              className="w-14 h-14 opacity-40"
            >
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <h3 className="text-xl italic font-semibold">악보를 불러와 시작하세요</h3>
            <p className="text-[13px] text-ink/60 leading-relaxed max-w-sm">
              아래 곡 목록에서 고르거나 MusicXML을 업로드하세요. <br />
              악보 음을 피아노로 재생하고, 마디를 클릭하면 그 지점부터 들을 수
              있어요.
            </p>

            {/* 등록된 곡 목록 — songLibrary.ts 에 항목을 추가하면 자동 확장 */}
            <div className="w-full max-w-sm mt-2 flex flex-col gap-2">
              <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink/45 text-left">
                Song Library · {SONGS.length}
              </div>
              {SONGS.map((song) => (
                <button
                  key={song.id}
                  onClick={() => loadSongFromLibrary(song)}
                  className="group flex items-center justify-between gap-3 w-full px-4 py-3 rounded-xl border border-ink/12 bg-paper-card/70 hover:border-accent/60 hover:bg-paper-card transition-colors text-left"
                >
                  <span className="flex flex-col">
                    <span className="font-display italic font-semibold text-[15px] leading-tight">
                      {song.title}
                    </span>
                    {song.artist && (
                      <span className="font-mono text-[10px] text-ink/50 mt-0.5">
                        {song.artist}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[11px] text-ink/35 group-hover:text-accent transition-colors">
                    {song.youtubeId ? '▶ 재생' : '악보'}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-1 w-full max-w-sm">
              <span className="flex-1 h-px bg-ink/10" />
              <span className="font-mono text-[10px] text-ink/35">또는</span>
              <span className="flex-1 h-px bg-ink/10" />
            </div>
            <button className="ink-btn" onClick={() => fileInputRef.current?.click()}>
              MusicXML 업로드
            </button>
            {error && (
              <p className="font-mono text-[10px] text-accent mt-2">{error}</p>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,.musicxml,.mxl"
          onChange={handleFile}
          className="hidden"
        />
      </div>
    </div>
  );
}

interface ToolbarProps {
  annotate: boolean;
  tool: AnnTool;
  color: string;
  onToggle: () => void;
  onPickPen: (color: string) => void;
  onHighlighter: () => void;
  onEraser: () => void;
  onUndo: () => void;
  onClear: () => void;
  onExport: () => void;
  onImport: () => void;
}

const PENS = ['#1a1612', '#d4452a', '#3b6e8f'];

function AnnotationToolbar({
  annotate,
  tool,
  color,
  onToggle,
  onPickPen,
  onHighlighter,
  onEraser,
  onUndo,
  onClear,
  onExport,
  onImport,
}: ToolbarProps) {
  return (
    <div className="absolute top-12 right-3 z-[6] flex items-center gap-1.5 px-2 py-1.5 rounded-full bg-paper-card/95 backdrop-blur border border-ink/12 shadow-[0_4px_14px_rgba(26,22,18,0.18)]">
      <button
        onClick={onToggle}
        title="필기 모드"
        className="px-2.5 py-1 rounded-full text-[13px] font-mono"
        style={{
          background: annotate ? 'var(--color-accent)' : 'transparent',
          color: annotate ? 'var(--color-paper)' : 'var(--color-ink)',
        }}
      >
        ✏️ 필기
      </button>

      {annotate && (
        <>
          <span className="w-px h-5 bg-ink/15" />
          {PENS.map((c) => {
            const active = tool === 'pen' && color === c;
            return (
              <button
                key={c}
                onClick={() => onPickPen(c)}
                title="펜"
                className="w-6 h-6 rounded-full"
                style={{
                  background: c,
                  outline: active ? '2px solid var(--color-ink)' : 'none',
                  outlineOffset: '1px',
                }}
              />
            );
          })}
          <button
            onClick={onHighlighter}
            title="형광펜"
            className="w-6 h-6 rounded-md"
            style={{
              background: '#f2c200',
              opacity: 0.6,
              outline: tool === 'highlighter' ? '2px solid var(--color-ink)' : 'none',
              outlineOffset: '1px',
            }}
          />
          <button
            onClick={onEraser}
            title="지우개"
            className="w-7 h-6 rounded-md text-[13px] flex items-center justify-center"
            style={{
              background: tool === 'eraser' ? 'var(--color-ink)' : 'transparent',
              color: tool === 'eraser' ? 'var(--color-paper)' : 'var(--color-ink)',
              border: '1px solid var(--color-ink)',
            }}
          >
            ⌫
          </button>
          <span className="w-px h-5 bg-ink/15" />
          <button onClick={onUndo} title="실행 취소" className="icon-btn !w-7 !h-7">
            ↶
          </button>
          <button onClick={onClear} title="전체 지우기" className="icon-btn !w-7 !h-7">
            🗑
          </button>
          <span className="w-px h-5 bg-ink/15" />
          <button onClick={onExport} title="필기 파일로 저장" className="icon-btn !w-7 !h-7">
            📤
          </button>
          <button onClick={onImport} title="필기 파일 불러오기" className="icon-btn !w-7 !h-7">
            📥
          </button>
        </>
      )}
    </div>
  );
}

function CurrentMeasureLabel() {
  const currentMeasure = useTransportStore((s) => s.currentMeasure);
  const isLoaded = useScoreStore((s) => s.isLoaded);
  return (
    <span>
      Now playing — measure{' '}
      <strong className="text-ink font-semibold">
        {isLoaded ? Math.max(1, currentMeasure + 1) : '—'}
      </strong>
    </span>
  );
}

function AutoScrollLabel() {
  const autoScroll = useSettingsStore((s) => s.autoScroll);
  return (
    <div>
      Auto-scroll{' '}
      <strong
        className="font-semibold"
        style={{ color: autoScroll ? 'var(--color-green-deep)' : 'var(--color-accent)' }}
      >
        {autoScroll ? 'ON' : 'OFF'}
      </strong>
    </div>
  );
}
