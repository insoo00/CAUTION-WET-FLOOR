import type { MeasurePoint } from '../stores/mappingStore';

const STORAGE_PREFIX = 'bandstand_map_';

const keyFor = (videoId: string) => `${STORAGE_PREFIX}${videoId}`;

export function loadMapping(videoId: string): MeasurePoint[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(keyFor(videoId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is MeasurePoint =>
        typeof p === 'object' &&
        p !== null &&
        typeof p.measure === 'number' &&
        typeof p.time === 'number'
    );
  } catch {
    return [];
  }
}

export function saveMapping(videoId: string, map: MeasurePoint[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(keyFor(videoId), JSON.stringify(map));
  } catch (e) {
    console.warn('failed to persist mapping', e);
  }
}

export interface MappingExport {
  videoId: string;
  bpm: number;
  timeSignature: string;
  rhythm: string;
  mapping: MeasurePoint[];
}

export function downloadMappingAsJson(data: MappingExport): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bandstand-${data.videoId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
