/// <reference types="vite/client" />

// iOS/Safari 16.4+ Audio Session API (표준 타입 미포함)
interface AudioSession {
  type:
    | 'auto'
    | 'playback'
    | 'transient'
    | 'transient-solo'
    | 'ambient'
    | 'play-and-record';
}
interface Navigator {
  readonly audioSession?: AudioSession;
}
