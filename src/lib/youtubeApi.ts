/**
 * 사용자가 입력한 문자열에서 YouTube videoId를 추출한다.
 * 11자 ID 자체, watch?v=, youtu.be/, embed/ 형식 모두 지원.
 */
export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const m = trimmed.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  if (m) return m[1]!;

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  return null;
}
