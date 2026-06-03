// 곡 라이브러리 — 메인 화면에 노출되는 등록된 곡 목록.
//
// 새 곡 추가법:
//   1. score/<곡폴더>/ 에 MusicXML(.mxl 권장)을 넣는다.
//   2. 아래 SONGS 배열에 항목을 하나 추가한다 (mxlUrl은 ?url import 사용).
//   3. 끝. 메인 화면 곡 목록에 자동으로 나타난다.
//
// youtubeId / mapping 은 선택값. mapping(마디↔시간)이 2점 이상이면
// YouTube 정밀 동기 모드로 동작한다.

// Vite는 ?url import를 빌드 시 정적 자산 URL로 변환한다.
import naneunNabiMxlUrl from '../../score/A_Flying_Butterfly/main.mxl?url';

export interface MappingPoint {
  /** 1-indexed 마디 번호 */
  measure: number;
  /** 원곡(YouTube) 기준 초 단위 시각 */
  time: number;
}

export interface SongDef {
  /** 고유 id (저장소 키 등에 사용) */
  id: string;
  /** 화면에 표시할 곡 제목 */
  title: string;
  /** 원작자/아티스트 (선택) */
  artist?: string;
  /** MusicXML(.mxl/.xml) 자산 URL */
  mxlUrl: string;
  /** 원곡 YouTube 영상 ID (선택) */
  youtubeId?: string;
  /** 마디↔시간 매핑 (선택, 2점 이상이면 정밀 동기) */
  mapping?: MappingPoint[];
}

export const SONGS: SongDef[] = [
  {
    id: 'a-flying-butterfly',
    title: '나는 나비',
    artist: '자우림',
    mxlUrl: naneunNabiMxlUrl,
    youtubeId: 'Ik9hLZsHU7g',
    mapping: [
      { measure: 1, time: 0 },
      { measure: 9, time: 13.58 },
    ],
  },
];
