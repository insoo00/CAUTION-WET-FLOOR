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

export function ensureAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  setPlaybackAudioSession(); // 무음 스위치 무시하고 소리 나게 (iOS)
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
