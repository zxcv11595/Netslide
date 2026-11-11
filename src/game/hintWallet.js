// 힌트를 얻는 길(결제·광고 제외): 날마다 접속, 판 첫 성공, 최단 경로 성공. 오늘의 도전 보상은 완료 처리에서 준다.
// 별을 모아 받는 힌트는 2026-11-11에 없앴다(저장값 starHints는 예전 기록 호환용으로만 남아 있다).
import { CONFIG } from '../config.js';

const REGULAR = ['beginner', 'intermediate', 'advanced'];

// 날마다 처음 들어올 때 1개. 보유 수가 freeCap 이상이면 주지 않는다(쌓아 두기 방지).
// 반환: 받은 개수
export function grantDailyHint(store, today, cfg = CONFIG.hints) {
  if (store.data.hintDay === today) return 0;
  const first = store.data.hintDay == null; // 처음 시작한 날은 시작 힌트로 충분하다
  store.data.hintDay = today;
  let got = 0;
  if (!first && store.data.hints < cfg.freeCap) {
    got = Math.min(cfg.dailyFree, cfg.freeCap - store.data.hints);
    store.data.hints += got;
  }
  store.save();
  return got;
}

// 판을 끝냈을 때 받는 힌트(정규 판만). 직접 풀어 처음 성공하면 clearReward,
// 그 판의 깃발(최단 경로)을 처음 받으면 flagReward를 더한다. 판마다 한 번씩만 받는다.
// 즉시 성공으로 넘긴 판은 받지 않고, 나중에 직접 풀면 그때 받는다(prev.best가 비어 있다).
export function clearRewardHints({ regular, skipped, prev, hadFlag, flagNow }, cfg = CONFIG.hints) {
  if (!regular || skipped) return 0;
  const firstReal = prev?.best == null;
  return (firstReal ? cfg.clearReward : 0) + (!hadFlag && flagNow ? cfg.flagReward : 0);
}

export function regularStars(store, content) {
  const recs = store.content(content.version).records;
  let sum = 0;
  for (const g of REGULAR) for (const s of content.groups[g]) sum += recs[s.id]?.stars ?? 0;
  return sum;
}
