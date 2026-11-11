// 이동 수로 받을 별과 남은 게이지. 입문/정규/일일 판에 같은 기준을 쓴다.
// 별 기준(2026-11-11 넉넉하게): 별 3개 = 최단 경로의 2배, 별 2개 = 최단 경로의 3배.
// 최단 경로 그대로 푸는 실력은 깃발이 따로 맡는다.
// 입문은 여유 없이 별 3개 = 최단 그대로, 별 2개 = 별 3개 + 3이다.
export const TUTORIAL_STAR2_EXTRA = 3;
export function star3For(shortest) {
  return shortest * 2;
}
export function star2For(shortest) {
  return shortest * 3;
}
export function starsAt(stage, moves) {
  return moves <= stage.star3 ? 3 : moves <= stage.star2 ? 2 : 1;
}

export function starGauge(stage, moves) {
  return Math.max(0, Math.min(1, 1 - moves / (stage.star2 + 1)));
}
