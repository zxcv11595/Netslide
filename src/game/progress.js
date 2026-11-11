import { starsAt } from '../core/stars.js';
// 해금·기록·현재 판 저장. 화면과 무관한 진행 로직.
import { GROUPS } from '../data/parse.js';

const REGULAR = ['beginner', 'intermediate', 'advanced'];
export function isRegular(stage) { return REGULAR.includes(stage.group); }

// 예전 입문은 별 0으로 저장됐다. 실제 최소 이동 기록으로만 복원한다.
export function migrateTutorialStars(store, content) {
  let changed = false;
  const records = store.content(content.version).records;
  for (const stage of content.groups.tutorial) {
    const rec = records[stage.id];
    if (rec?.done && rec.stars === 0 && Number.isInteger(rec.best) && rec.best >= 1) {
      rec.stars = starsAt(stage, rec.best);
      changed = true;
    }
  }
  if (changed) store.save();
  return changed;
}

// 별 기준이 느슨해졌을 때(2026-11-11: 별 3개 = 최단 + 여유) 저장된 기록의 별을 최소 횟수로 다시 계산한다.
// 별은 늘기만 하고 줄지 않는다. 여러 번 불러도 결과가 같다.
export function migrateStarThresholds(store, content) {
  let changed = false;
  const c = store.content(content.version);
  for (const [id, rec] of Object.entries(c.records)) {
    const stage = content.byId.get(id);
    if (!stage || !rec?.done || !Number.isInteger(rec.best) || rec.best < 1) continue;
    const now = starsAt(stage, rec.best);
    if (now > (rec.stars ?? 0)) { rec.stars = now; changed = true; }
  }
  for (const d of Object.values(c.daily)) {
    const stage = d?.id ? content.byId.get(d.id) : null;
    if (!stage || !Number.isInteger(d.moves) || d.moves < 1) continue;
    const now = starsAt(stage, d.moves);
    if (now > (d.stars ?? 0)) { d.stars = now; changed = true; }
  }
  if (changed) store.save();
  return changed;
}

// 최단 경로 깃발: 최소 횟수 기록이 최단 경로 이하인 판에 하나씩 꽂힌다(별과 따로 모은다).
export function hasFlag(stage, rec) {
  return !!rec?.done && rec.best != null && rec.best <= stage.shortest;
}
// 화면에 보여 줄 최단 경로. 표시된 최단보다 짧게 푼 기록이 있으면(최단이 증명되지 않은 판) 그 기록을 보여 준다.
export function shownShortest(stage, rec) {
  return rec?.best != null && rec.best < stage.shortest ? rec.best : stage.shortest;
}

export function getRecord(store, content, id) {
  return store.content(content.version).records[id] || null;
}

// 입문 01을 클리어하면 '입문을 마친 것'으로 본다(입문 02·03은 해도 되고 안 해도 된다).
export function isTutorialDone(store, content) {
  return !!getRecord(store, content, content.groups.tutorial[0].id)?.done;
}

export function nextTutorial(store, content) {
  return content.groups.tutorial.find((s) => !getRecord(store, content, s.id)?.done) || null;
}

// 처음에는 입문만 할 수 있다. 입문 01을 끝내면 초급·중급·고급과 오늘의 도전이 한꺼번에 열린다.
// 난이도 안에서는 앞 판을 기본 클리어하면 다음 판이 열린다.
export function isUnlocked(store, content, stage) {
  if (stage.group === 'daily') return isTutorialDone(store, content);
  const list = content.groups[stage.group];
  const i = list.indexOf(stage);
  if (i < 0) return false;
  if (stage.group !== 'tutorial' && !isTutorialDone(store, content)) return false;
  return i === 0 || !!getRecord(store, content, list[i - 1].id)?.done;
}

export function nextStage(content, stage) {
  if (!GROUPS.includes(stage.group)) return null;
  const list = content.groups[stage.group];
  return list[list.indexOf(stage) + 1] || null;
}

// 완료 버튼으로 확정할 때만 호출한다. 여러 번 불려도 결과가 같다(최고 별은 낮아지지 않는다).
// daily: { date } — 그 날짜의 일일 판과 일치할 때만 넘긴다.
// skipped: 바로 클리어. 별 1개로만 기록하고 최소 이동 기록은 건드리지 않는다.
export function confirmCompletion(store, content, stage, result, moves, daily = null, { skipped = false } = {}) {
  if (!result.canComplete) return null;
  if (skipped) {
    result = { ...result, stars: 1, bonusDone: false };
    moves = null;
  }
  const least = (a, b) => (a == null ? b : b == null ? a : Math.min(a, b));
  const c = store.content(content.version);
  const prev = c.records[stage.id] || null;
  const rec = {
    done: true,
    stars: Math.max(prev?.stars ?? 0, result.stars),
    // 기본 최소 이동 기록
    best: least(prev?.best ?? null, moves),
    // 보너스 포함 최소 이동 기록
    bestBonus: result.bonusDone
      ? least(prev?.bestBonus ?? null, moves)
      : (prev?.bestBonus ?? null),
  };
  c.records[stage.id] = rec;
  if (daily?.date) {
    const d = c.daily[daily.date];
    c.daily[daily.date] = {
      id: stage.id,
      stars: Math.max(d?.id === stage.id ? d.stars : 0, result.stars),
      moves: least(d?.id === stage.id ? d.moves : null, moves),
      bonus: (d?.id === stage.id && d.bonus) || result.bonusDone,
    };
  }
  if (c.current?.stageId === stage.id) c.current = null;
  store.save();
  return {
    record: rec,
    firstClear: !prev,
    newBest: !!prev && moves != null && moves < (prev.best ?? Infinity),
    newStars: rec.stars > (prev?.stars ?? 0),
  };
}

export function saveCurrent(store, content, stage, historyCodes, date = null) {
  store.content(content.version).current = { stageId: stage.id, date, history: historyCodes };
  store.save();
}

export function clearCurrent(store, content) {
  const c = store.content(content.version);
  if (c.current) { c.current = null; store.save(); }
}

export function getCurrent(store, content) {
  const cur = store.content(content.version).current;
  if (!cur) return null;
  const stage = content.byId.get(cur.stageId);
  return stage ? { stage, history: cur.history, date: cur.date } : null;
}
