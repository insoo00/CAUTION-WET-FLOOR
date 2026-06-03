import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import { useYouTubeStore } from '../stores/youtubeStore';
import { useTransportStore } from '../stores/transportStore';
import { extractVideoId } from '../lib/youtubeApi';
import { ensureAudio } from '../lib/metronome';

export interface YouTubeHandle {
  getCurrentTime: () => number | null;
  getDuration: () => number;
  seekTo: (sec: number) => void;
}

/**
 * iPadOS/iOS 판별. iOS는 소리 있는 자동재생을 막지만 "음소거 재생"은 허용한다.
 * 그래서 iOS에선 영상을 음소거로 시작해 재생은 항상 되게 하고, 사용자가
 * 화면의 스피커 버튼을 직접 눌러(=제스처) 음소거를 해제하면 소리가 난다.
 */
const IS_IOS =
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

interface Props {
  ref?: Ref<YouTubeHandle>;
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
  }
}

/**
 * IFrame API가 이미 로드됐는지 여부와 무관하게 안전하게 콜백 등록.
 * 여러 컴포넌트가 동시에 호출할 수 있도록 기존 콜백을 체이닝한다.
 */
function whenYTReady(cb: () => void): () => void {
  let cancelled = false;
  const run = () => {
    if (!cancelled) cb();
  };
  if (window.YT?.Player) {
    run();
  } else {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      run();
    };
  }
  return () => {
    cancelled = true;
  };
}

export function YouTubePlayer({ ref }: Props) {
  const ytVideoId = useYouTubeStore((s) => s.ytVideoId);
  const setYtVideoId = useYouTubeStore((s) => s.setYtVideoId);
  const ytReady = useYouTubeStore((s) => s.ytReady);
  const setYtReady = useYouTubeStore((s) => s.setYtReady);
  const loadTrigger = useYouTubeStore((s) => s.loadTrigger);

  const isPlaying = useTransportStore((s) => s.isPlaying);
  const setIsPlaying = useTransportStore((s) => s.setIsPlaying);
  const playbackSource = useTransportStore((s) => s.playbackSource);

  const playerRef = useRef<YT.Player | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [inputUrl, setInputUrl] = useState(ytVideoId);
  // iOS는 음소거로 시작(재생 보장). 그 외 기기는 처음부터 소리.
  const [muted, setMuted] = useState(IS_IOS);
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useImperativeHandle(
    ref,
    () => ({
      getCurrentTime: () => playerRef.current?.getCurrentTime() ?? null,
      getDuration: () => playerRef.current?.getDuration() ?? 0,
      seekTo: (sec: number) => playerRef.current?.seekTo(sec, true),
    }),
    []
  );

  const toggleMute = () => {
    const p = playerRef.current;
    if (!p) return;
    ensureAudio(); // 이 탭(제스처)으로 Web Audio도 함께 잠금 해제
    try {
      if (mutedRef.current) {
        p.unMute();
        p.setVolume(100);
        setMuted(false);
      } else {
        p.mute();
        setMuted(true);
      }
    } catch {
      /* ignore */
    }
  };

  // 플레이어 생성/파괴 — 의도적으로 마운트당 1회 사이클.
  // videoId 변경은 별도 effect의 loadVideoById로 처리한다.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // YT.Player는 인자로 받은 element를 iframe으로 "replace" 한다.
    // 그래서 React가 관리하는 container 안에 매번 새 target div를 만들어 그쪽을 넘긴다.
    const target = document.createElement('div');
    target.style.width = '100%';
    target.style.height = '100%';
    container.appendChild(target);

    let createdPlayer: YT.Player | null = null;

    const cancelWait = whenYTReady(() => {
      try {
        createdPlayer = new YT.Player(target, {
          width: '100%',
          height: '100%',
          videoId: useYouTubeStore.getState().ytVideoId,
          playerVars: {
            playsinline: 1,
            controls: 1,
            modestbranding: 1,
            rel: 0,
          },
          events: {
            onReady: () => {
              // iOS: 음소거로 시작해야 프로그램 호출 재생이 차단되지 않는다.
              try {
                if (mutedRef.current) createdPlayer?.mute();
              } catch {
                /* ignore */
              }
              setYtReady(true);
            },
            onStateChange: (e) => {
              // 악보 재생 모드에선 YouTube 상태로 transport를 건드리지 않는다.
              if (useTransportStore.getState().playbackSource !== 'youtube') return;
              const s = e.data;
              if (s === YT.PlayerState.PLAYING) setIsPlaying(true);
              else if (
                s === YT.PlayerState.PAUSED ||
                s === YT.PlayerState.ENDED
              ) {
                setIsPlaying(false);
              }
            },
            onError: (e) => {
              console.warn('YT player error', e.data);
            },
          },
        });
        playerRef.current = createdPlayer;
      } catch (err) {
        console.error('YT.Player 생성 실패', err);
      }
    });

    return () => {
      cancelWait();
      try {
        createdPlayer?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      setYtReady(false);
      // iframe 또는 target div 모두 안전하게 정리
      while (container.firstChild) container.removeChild(container.firstChild);
    };
    // 마운트당 1회만 — videoId/setters는 ref-stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 외부에서 ytVideoId 변경 (또는 force reload) → loadVideoById
  useEffect(() => {
    if (!ytReady || !playerRef.current) return;
    playerRef.current.loadVideoById(ytVideoId);
    if (mutedRef.current) playerRef.current.mute();
    playerRef.current.pauseVideo();
    setInputUrl(ytVideoId);
    // loadTrigger를 deps에 포함시켜 같은 ID 재호출도 다시 로드되게 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytVideoId, ytReady, loadTrigger]);

  // transport.isPlaying ↔ YT player 동기화 (YouTube 모드에서만)
  useEffect(() => {
    if (!ytReady || !playerRef.current) return;
    const ytState = playerRef.current.getPlayerState();
    if (playbackSource !== 'youtube') {
      // 악보 모드로 전환되면 영상은 멈춰둔다.
      if (ytState === YT.PlayerState.PLAYING) playerRef.current.pauseVideo();
      return;
    }
    if (isPlaying && ytState !== YT.PlayerState.PLAYING) {
      playerRef.current.playVideo();
    } else if (!isPlaying && ytState === YT.PlayerState.PLAYING) {
      playerRef.current.pauseVideo();
    }
  }, [isPlaying, ytReady, playbackSource]);

  const handleLoad = () => {
    const id = extractVideoId(inputUrl);
    if (!id) {
      console.warn('유효하지 않은 YouTube URL/ID:', inputUrl);
      return;
    }
    setYtVideoId(id);
  };

  return (
    <div className="paper-card p-4">
      <h2 className="card-title">
        <span className="card-title-dot">Audio Source · YouTube</span>
        <span className={ytReady ? 'badge badge-green' : 'badge'}>
          {ytReady ? 'Ready' : '대기'}
        </span>
      </h2>
      <div className="relative aspect-video rounded-lg overflow-hidden bg-black mb-2.5">
        <div ref={containerRef} className="absolute inset-0" />
        {/* 음소거 토글 — 영상 우측 상단 고정. iOS에선 처음 음소거로 시작하므로
            여기를 눌러 소리를 켠다. */}
        {ytReady && (
          <button
            onClick={toggleMute}
            title={muted ? '소리 켜기' : '음소거'}
            className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-full font-mono text-[12px] font-semibold shadow-lg transition-colors"
            style={
              muted
                ? {
                    background: 'var(--color-accent)',
                    color: 'var(--color-paper)',
                    padding: '6px 12px',
                  }
                : {
                    background: 'rgba(26,22,18,0.6)',
                    color: '#fff',
                    padding: '6px 9px',
                    backdropFilter: 'blur(4px)',
                  }
            }
          >
            <span className="text-[14px] leading-none">{muted ? '🔇' : '🔊'}</span>
            {muted && <span>소리 켜기</span>}
          </button>
        )}
      </div>
      <div className="flex gap-1.5">
        <input
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleLoad();
          }}
          placeholder="YouTube URL 또는 비디오 ID"
          className="paper-input flex-1"
        />
        <button onClick={handleLoad} className="ink-btn">
          Load
        </button>
      </div>
      <div className="hint">유튜브 영상을 불러오면 그 재생 시간에 맞춰 악보가 따라갑니다.</div>
    </div>
  );
}
