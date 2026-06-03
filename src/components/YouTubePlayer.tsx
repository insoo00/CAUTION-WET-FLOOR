import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import { useYouTubeStore } from '../stores/youtubeStore';
import { useTransportStore } from '../stores/transportStore';
import { extractVideoId } from '../lib/youtubeApi';

export interface YouTubeHandle {
  getCurrentTime: () => number | null;
  getDuration: () => number;
  seekTo: (sec: number) => void;
  /**
   * iOS 잠금 해제: 사용자 제스처 안에서 음소거로 잠깐 재생 후 즉시 정지.
   * 이렇게 한 번 "사용자가 시작한 재생"으로 인정받으면, 이후 카운트인 뒤
   * 프로그램이 호출하는 playVideo()도 소리가 정상적으로 난다.
   * 첫 호출에만 동작하며, 잠금 해제가 끝나면 resolve.
   */
  prime: () => Promise<void>;
}

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
  const primedRef = useRef(false); // iOS 잠금 해제 완료 여부
  const primingRef = useRef(false); // 잠금 해제 중 (상태변경 이벤트 무시용)
  const [inputUrl, setInputUrl] = useState(ytVideoId);

  useImperativeHandle(
    ref,
    () => ({
      getCurrentTime: () => playerRef.current?.getCurrentTime() ?? null,
      getDuration: () => playerRef.current?.getDuration() ?? 0,
      seekTo: (sec: number) => playerRef.current?.seekTo(sec, true),
      prime: () =>
        new Promise<void>((resolve) => {
          const p = playerRef.current;
          if (!p || !useYouTubeStore.getState().ytReady || primedRef.current) {
            resolve();
            return;
          }
          primedRef.current = true;
          primingRef.current = true; // 이 동안의 PLAYING/PAUSED 이벤트는 무시
          try {
            p.mute();
            p.playVideo();
          } catch {
            /* ignore */
          }
          window.setTimeout(() => {
            try {
              p.pauseVideo();
              p.unMute();
            } catch {
              /* ignore */
            }
            // pauseVideo의 PAUSED 이벤트가 도착해 흡수될 시간을 두고 해제
            window.setTimeout(() => {
              primingRef.current = false;
              resolve();
            }, 150);
          }, 60);
        }),
    }),
    []
  );

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
            onReady: () => setYtReady(true),
            onStateChange: (e) => {
              // iOS 잠금 해제(prime) 중의 재생/정지 이벤트는 무시.
              if (primingRef.current) return;
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
