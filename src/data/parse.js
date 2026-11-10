// 판 데이터(JSON) → 런타임 구조. 게임과 Node 도구가 함께 쓴다.
import { parseTile } from '../core/rules.js';

export const GROUPS = ['tutorial', 'beginner', 'intermediate', 'advanced'];

// 데이터의 tiles는 행 단위 문자열 배열("p6 p10 g8")이다.
export function parseStage(raw) {
  const tiles = raw.tiles.flatMap((row) => row.trim().split(/\s+/)).map(parseTile);
  return {
    id: raw.id,
    group: raw.group, // tutorial | beginner | intermediate | advanced | daily
    order: raw.order, // 그룹 안 표시 순서 (ID와 별개)
    size: raw.size,
    tiles,
    tutorial: raw.group === 'tutorial',
    star2: raw.star2 ?? null,
    star3: raw.star3 ?? null,
  };
}

export function parseContent(json) {
  const byId = new Map();
  const groups = { tutorial: [], beginner: [], intermediate: [], advanced: [] };
  for (const raw of json.stages) {
    const st = parseStage(raw);
    byId.set(st.id, st);
    groups[st.group].push(st);
  }
  for (const g of GROUPS) groups[g].sort((a, b) => a.order - b.order);
  const daily = (json.daily || []).map(parseStage);
  for (const st of daily) byId.set(st.id, st);
  return {
    version: json.contentVersion,
    dailyEpoch: json.dailyEpoch,
    byId,
    groups,
    daily,
  };
}
