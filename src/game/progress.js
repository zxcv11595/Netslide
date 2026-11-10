// 해금·기록·현재 판 저장. 화면과 무관한 진행 로직.
import { GROUPS } from '../data/parse.js';

const REGULAR = ['beginner', 'intermediate', 'advanced'];
export function isRegular(stage) { return REGULAR.includes(stage.group); }

export function getRecord(store, content, id) {
  return store.content(content.version).records[id] || null;
}

export function isTutorialDone(store, content) {
  return content.groups.tutorial.every((s) => getRecord(store, content, s.id)?.done);
}

export function nextTutorial(store, content) {
  return content.groups.tutorial.find((s) => !getRecord(store, content, s.id)?.done) || null;
}

// 입문은 순서대로, 입문 뒤에는 초급/중급/고급을 모두 고를 수 있고
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
export function confirmCompletion(store, content, stage, result, moves, daily = null) {
  if (!result.canComplete) return null;
  const c = store.content(content.version);
  const prev = c.records[stage.id] || null;
  const rec = {
    done: true,
    stars: Math.max(prev?.stars ?? 0, result.stars),
    // 기본 최소 이동 기록
    best: prev?.best == null ? moves : Math.min(prev.best, moves),
    // 보너스 포함 최소 이동 기록
    bestBonus: result.bonusDone
      ? (prev?.bestBonus == null ? moves : Math.min(prev.bestBonus, moves))
      : (prev?.bestBonus ?? null),
  };
  c.records[stage.id] = rec;
  if (daily?.date) {
    const d = c.daily[daily.date];
    c.daily[daily.date] = {
      id: stage.id,
      stars: Math.max(d?.id === stage.id ? d.stars : 0, result.stars),
      moves: d?.id === stage.id && d.moves != null ? Math.min(d.moves, moves) : moves,
      bonus: (d?.id === stage.id && d.bonus) || result.bonusDone,
    };
  }
  if (c.current?.stageId === stage.id) c.current = null;
  store.save();
  return {
    record: rec,
    firstClear: !prev,
    newBest: !!prev && moves < (prev.best ?? Infinity),
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
