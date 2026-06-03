// Verovio는 타입 선언을 제공하지 않아 우리가 쓰는 API만 최소 선언한다.
declare module 'verovio/wasm' {
  const createVerovioModule: (options?: {
    locateFile?: (path: string) => string;
  }) => Promise<unknown>;
  export default createVerovioModule;
}

declare module 'verovio/esm' {
  export interface ElementsAtTime {
    page: number;
    notes: string[];
    chords: string[];
    rests: string[];
    measures?: string[];
  }
  export class VerovioToolkit {
    constructor(module: unknown);
    loadData(data: string): boolean;
    loadZipDataBase64(data: string): boolean;
    renderToSVG(pageNo: number, options?: Record<string, unknown>): string;
    renderToMIDI(options?: Record<string, unknown>): string;
    renderToTimemap(options?: Record<string, unknown>): string;
    getElementsAtTime(millisec: number): ElementsAtTime;
    getTimeForElement(id: string): number;
    getPageCount(): number;
    setOptions(options: Record<string, unknown>): void;
    redoLayout(options?: Record<string, unknown>): void;
    getElementAttr(id: string): Record<string, unknown>;
  }
}
