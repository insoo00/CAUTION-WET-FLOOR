/**
 * 메트로놈/박자 클릭 사운드. Web Audio API의 oscillator를 짧게 울려서 click을 만든다.
 * AudioContext는 사용자 제스처 후에야 깨어나므로 ensureAudio()는 click/play 시점에 호출.
 */

let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  return audioCtx;
}

/**
 * iOS 핵심: Web Audio는 기본적으로 'ambient' 세션이라 무음 스위치에 의해
 * 음소거된다. 'playback'으로 바꾸면 동영상처럼 무음 스위치를 무시하고 소리가 난다.
 * (Safari 16.4+. 미지원 브라우저에선 무시됨.)
 */
export function setPlaybackAudioSession(): void {
  try {
    if (typeof navigator !== 'undefined' && navigator.audioSession) {
      navigator.audioSession.type = 'playback';
    }
  } catch {
    /* ignore */
  }
}

/**
 * iOS 무음 스위치 우회 (구형 iOS 포함, audioSession 미지원 대비).
 * 사용자 제스처에서 무음 HTML5 <audio>를 루프 재생하면 iOS가 페이지를
 * "미디어 재생"으로 간주해 Web Audio(피아노/메트로놈) 소리를 스피커로 보낸다.
 */
let silentEl: HTMLAudioElement | null = null;
function buildSilentWavUri(): string {
  const sampleRate = 8000;
  const numSamples = sampleRate * 0.5; // 0.5초 무음
  const dataSize = numSamples * 2; // 16-bit mono
  const buf = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(buf);
  const ws = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };
  ws(0, 'RIFF');
  dv.setUint32(4, 36 + dataSize, true);
  ws(8, 'WAVE');
  ws(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  ws(36, 'data');
  dv.setUint32(40, dataSize, true);
  // 샘플은 0(무음)으로 이미 채워져 있음
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return 'data:audio/wav;base64,' + btoa(bin);
}
export function playSilentUnlock(): void {
  try {
    if (typeof document === 'undefined') return;
    if (!silentEl) {
      silentEl = document.createElement('audio');
      silentEl.setAttribute('playsinline', '');
      silentEl.loop = true;
      silentEl.preload = 'auto';
      silentEl.src = buildSilentWavUri();
    }
    const p = silentEl.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {
    /* ignore */
  }
}

export function ensureAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  setPlaybackAudioSession(); // 무음 스위치 무시하고 소리 나게 (iOS)
  playSilentUnlock(); // 무음 미디어 재생으로 iOS 무음 스위치 우회
  if (!audioCtx) {
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) return null;
    audioCtx = new AudioCtor();
    // iOS Safari 잠금 해제: 생성 직후(사용자 제스처 안에서) 무음 버퍼를 한 번
    // 재생해 두면 이후 oscillator/피아노 소리가 정상적으로 난다.
    try {
      const buf = audioCtx.createBuffer(1, 1, 22050);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtx.destination);
      src.start(0);
    } catch {
      /* ignore */
    }
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

/** AudioContext가 실제로 'running'이 될 때까지 기다린다(iOS 첫 재생 보강). */
export async function resumeAudio(): Promise<void> {
  const ctx = ensureAudio();
  if (ctx && ctx.state !== 'running') {
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }
}

/**
 * 페이지에서 사용자가 처음 터치/클릭/키 입력하는 순간 오디오를 잠금 해제한다.
 * iOS Safari는 사용자 제스처 안에서만 AudioContext를 깨울 수 있으므로,
 * 재생 버튼을 누르기 전 어떤 상호작용(곡 선택, 메뉴 열기 등)에서든 미리 깨워둔다.
 */
let unlockInstalled = false;
export function unlockAudioOnFirstGesture(): void {
  if (unlockInstalled || typeof document === 'undefined') return;
  unlockInstalled = true;
  setPlaybackAudioSession(); // 제스처 전에도 미리 지정 시도
  const events = ['pointerdown', 'touchend', 'mousedown', 'keydown'] as const;
  const handler = () => {
    ensureAudio();
    events.forEach((ev) => document.removeEventListener(ev, handler, true));
  };
  events.forEach((ev) => document.addEventListener(ev, handler, true));
}

/** 지정한 AudioContext 시각에 클릭을 예약 재생 (정밀 메트로놈용). */
export function playClickAt(when: number, accent: boolean): void {
  const ctx = audioCtx;
  if (!ctx) return;
  const time = Math.max(ctx.currentTime, when);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = accent ? 1500 : 900;
  gain.gain.setValueAtTime(accent ? 0.4 : 0.2, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.06);
}

export function playClick(accent: boolean): void {
  const ctx = audioCtx;
  if (!ctx) return;
  playClickAt(ctx.currentTime, accent);
}

/**
 * 리듬 패턴(예: "1234", "Abc abc Ab")에서 인덱스의 글자가 강박인지 판단.
 * 대문자 + 영숫자 = 강박, 소문자/기호 = 약박.
 */
export function isAccentBeat(globalBeatIdx: number, pattern: string): boolean {
  if (!pattern.length) return false;
  const i = ((globalBeatIdx % pattern.length) + pattern.length) % pattern.length;
  const ch = pattern[i]!;
  return ch === ch.toUpperCase() && /[A-Z0-9]/.test(ch);
}
