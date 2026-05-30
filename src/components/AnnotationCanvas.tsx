import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, Ref } from 'react';

export type AnnTool = 'pen' | 'highlighter' | 'eraser';

interface Pt {
  x: number; // 0~1 (가로 비율)
  y: number; // 0~1 (세로 비율)
}
interface Stroke {
  tool: AnnTool;
  color: string;
  width: number; // px (non-scaling-stroke)
  pts: Pt[];
}

export interface AnnotationHandle {
  clear: () => void;
  undo: () => void;
  exportFile: () => void;
  importFile: (file: File) => Promise<void>;
  hasStrokes: () => boolean;
}

interface Props {
  ref?: Ref<AnnotationHandle>;
  enabled: boolean;
  tool: AnnTool;
  color: string;
  scoreId: string;
}

const KEY = (id: string) => `bandstand:annot:${id}`;
const WIDTHS: Record<AnnTool, number> = { pen: 2.5, highlighter: 14, eraser: 0 };
const ERASE_RADIUS = 0.012; // 정규좌표 기준 지우개 반경
const FILE_VERSION = 1;

/**
 * 악보 위 자유 필기 레이어 (SVG 기반).
 * - canvas 대신 SVG라 길이 제한 없음 → 긴 악보에서도 악보를 가리지 않고 함께 스크롤.
 * - Apple Pencil/손가락/마우스로 그리기. 정규좌표(0~1)로 저장 → 리사이즈/재방문 복원.
 */
export function AnnotationCanvas({ ref, enabled, tool, color, scoreId }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const curRef = useRef<Stroke | null>(null);
  const drawingRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const save = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        if (scoreId)
          localStorage.setItem(KEY(scoreId), JSON.stringify(strokesRef.current));
      } catch {
        /* ignore */
      }
    }, 400);
  };

  useEffect(() => {
    try {
      const raw = scoreId ? localStorage.getItem(KEY(scoreId)) : null;
      strokesRef.current = raw ? (JSON.parse(raw) as Stroke[]) : [];
    } catch {
      strokesRef.current = [];
    }
    rerender();
  }, [scoreId]);

  useImperativeHandle(
    ref,
    () => ({
      clear: () => {
        strokesRef.current = [];
        rerender();
        save();
      },
      undo: () => {
        strokesRef.current.pop();
        rerender();
        save();
      },
      hasStrokes: () => strokesRef.current.length > 0,
      exportFile: () => {
        const payload = {
          app: 'bandstand',
          kind: 'annotations',
          version: FILE_VERSION,
          scoreId,
          strokes: strokesRef.current,
        };
        const blob = new Blob([JSON.stringify(payload)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safe = (scoreId || 'score').replace(/[^\w가-힣 -]/g, '').trim();
        a.href = url;
        a.download = `${safe || 'score'}.notes.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      },
      importFile: async (file: File) => {
        const data = JSON.parse(await file.text());
        const strokes = Array.isArray(data) ? data : data?.strokes;
        if (!Array.isArray(strokes)) throw new Error('필기 파일 형식이 아닙니다');
        strokesRef.current = strokes as Stroke[];
        rerender();
        save();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoreId]
  );

  const ptFromEvent = (e: ReactPointerEvent): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / (r.width || 1),
      y: (e.clientY - r.top) / (r.height || 1),
    };
  };

  const dist2 = (a: Pt, b: Pt) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  };

  const eraseAt = (p: Pt) => {
    const r2 = ERASE_RADIUS * ERASE_RADIUS;
    const before = strokesRef.current.length;
    strokesRef.current = strokesRef.current.filter(
      (s) => !s.pts.some((q) => dist2(q, p) < r2)
    );
    if (strokesRef.current.length !== before) rerender();
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!enabled) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    const p = ptFromEvent(e);
    if (tool === 'eraser') {
      eraseAt(p);
      return;
    }
    curRef.current = { tool, color, width: WIDTHS[tool], pts: [p] };
    rerender();
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!enabled || !drawingRef.current) return;
    e.preventDefault();
    const events =
      typeof e.nativeEvent.getCoalescedEvents === 'function'
        ? e.nativeEvent.getCoalescedEvents()
        : [e.nativeEvent];
    const r = svgRef.current!.getBoundingClientRect();
    if (tool === 'eraser') {
      for (const ev of events)
        eraseAt({ x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height });
      return;
    }
    const s = curRef.current;
    if (!s) return;
    for (const ev of events)
      s.pts.push({ x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height });
    rerender();
  };

  const finish = () => {
    if (curRef.current && curRef.current.pts.length > 0) {
      strokesRef.current.push(curRef.current);
      save();
    }
    curRef.current = null;
    drawingRef.current = false;
    rerender();
  };

  const pathD = (pts: Pt[]) => {
    if (pts.length === 0) return '';
    let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i]!.x} ${pts[i]!.y}`;
    if (pts.length === 1) d += ` L ${pts[0]!.x + 0.0001} ${pts[0]!.y + 0.0001}`;
    return d;
  };

  const renderStroke = (s: Stroke, i: number) => (
    <path
      key={i}
      d={pathD(s.pts)}
      fill="none"
      stroke={s.color}
      strokeWidth={s.width}
      strokeOpacity={s.tool === 'highlighter' ? 0.38 : 1}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  );

  return (
    <svg
      ref={svgRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onPointerLeave={finish}
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full"
      style={{
        zIndex: 4,
        pointerEvents: enabled ? 'auto' : 'none',
        touchAction: enabled ? 'none' : 'auto',
        cursor: enabled ? 'crosshair' : 'default',
      }}
    >
      {strokesRef.current.map(renderStroke)}
      {curRef.current && renderStroke(curRef.current, -1)}
    </svg>
  );
}
