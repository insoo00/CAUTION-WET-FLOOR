import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';

/**
 * Verovio 툴킷 싱글톤.
 * - MusicXML → 고품질 SVG 렌더 + MIDI + timemap (MuseScore급 재생/하이라이트)
 * - 한 번에 한 곡만 로드 (loadData가 내부 상태를 갱신)
 * - WASM은 public/verovio.wasm 에서 서빙 (locateFile로 경로 지정)
 */

let tkPromise: Promise<VerovioToolkit> | null = null;
let loadedTk: VerovioToolkit | null = null;

export function getVerovioToolkit(): Promise<VerovioToolkit> {
  if (!tkPromise) {
    // verovio 6.x는 wasm을 모듈에 임베드 → 별도 서빙/locateFile 불필요
    tkPromise = createVerovioModule().then((mod) => {
      const tk = new VerovioToolkit(mod);
      loadedTk = tk;
      return tk;
    });
  }
  return tkPromise;
}

/** 동기 접근 (이미 init/load 된 경우). 하이라이트 루프에서 사용. */
export function getLoadedToolkit(): VerovioToolkit | null {
  return loadedTk;
}

export function midiBase64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
