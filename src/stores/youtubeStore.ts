import { create } from 'zustand';

const DEFAULT_VIDEO_ID = 'Ik9hLZsHU7g';

interface YouTubeState {
  ytReady: boolean;
  ytVideoId: string;
  /** setYtVideoId 호출마다 증가. 같은 ID로 다시 호출돼도 재로드를 강제하기 위함. */
  loadTrigger: number;

  setYtReady: (v: boolean) => void;
  setYtVideoId: (id: string) => void;
}

export const useYouTubeStore = create<YouTubeState>((set) => ({
  ytReady: false,
  ytVideoId: DEFAULT_VIDEO_ID,
  loadTrigger: 0,

  setYtReady: (v) => set({ ytReady: v }),
  setYtVideoId: (id) =>
    set((s) => ({ ytVideoId: id, loadTrigger: s.loadTrigger + 1 })),
}));
