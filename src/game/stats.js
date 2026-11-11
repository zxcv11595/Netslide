// 내 정보 화면에 보여 줄 기록과 성취. 저장된 판 기록과 오늘의 도전 기록에서 그때그때 계산한다(따로 저장하는 값 없음).
import { t } from '../i18n.js';
import { getRecord } from './progress.js';
import { addDays } from './daily.js';

export const REGULAR_GROUPS = ['beginner', 'intermediate', 'advanced'];

// 한 난이도(입문 포함)의 기록
export function groupStats(store, content, group) {
  const list = content.groups[group] || [];
  let done = 0; let three = 0; let stars = 0; let missed = 0; let shortest = 0;
  for (const s of list) {
    const r = getRecord(store, content, s.id);
    if (!r?.done) continue;
    done++;
    const st = r.stars ?? 0;
    stars += st;
    missed += 3 - st;
    if (st === 3) three++;
    // 최단 길로 성공: 3별 기준(최단 수) 이하로 끝낸 적이 있는 판
    if (r.best != null && r.best <= s.shortest) shortest++;
  }
  return { total: list.length, done, three, stars, maxStars: list.length * 3, missed, shortest };
}

// 세 난이도(초급·중급·고급)를 합친 기록
export function regularStats(store, content) {
  const sum = { total: 0, done: 0, three: 0, stars: 0, maxStars: 0, missed: 0, shortest: 0 };
  for (const g of REGULAR_GROUPS) {
    const s = groupStats(store, content, g);
    for (const k of Object.keys(sum)) sum[k] += s[k];
  }
  return sum;
}

// 오늘의 도전 기록. dailyMap: { 'YYYY-MM-DD': { stars, ... } }
export function dailyStats(dailyMap, todayStr) {
  const days = Object.keys(dailyMap).sort();
  const month = todayStr.slice(0, 7);
  let best = 0; let run = 0; let prev = null; let three = 0; let thisMonth = 0;
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
    if ((dailyMap[d].stars ?? 0) === 3) three++;
    if (d.startsWith(month)) thisMonth++;
  }
  // 지금 연속: 오늘(없으면 어제)부터 거꾸로 끊기지 않은 날 수
  let day = dailyMap[todayStr] ? todayStr : addDays(todayStr, -1);
  let streak = 0;
  while (dailyMap[day]) { streak++; day = addDays(day, -1); }
  return { total: days.length, thisMonth, streak, bestStreak: best, three };
}

// 이어 준 길 조각 수: 성공한 판(입문·초급·중급·고급)의 길 조각(햄스터 칸·빈 블록 제외)을 모두 더한다.
// 성공 조건이 "모든 길 연결"이므로 성공한 판의 조각은 모두 이은 것이다.
const pieceCount = (stage) => stage.tiles.filter((x) => x.kind !== 'source' && x.ports).length;
export function pathStats(store, content) {
  let done = 0; let total = 0;
  for (const g of ['tutorial', ...REGULAR_GROUPS]) {
    for (const s of content.groups[g] || []) {
      const n = pieceCount(s);
      total += n;
      if (getRecord(store, content, s.id)?.done) done += n;
    }
  }
  return { done, total };
}

// 성취 목록: [{ title, done, items: [{ id, title, now, max, done, icon }] }]
// icon: public/assets/ach/<icon>.webp 파일 이름(없으면 id를 쓴다)
export function achievementSections(store, content, todayStr) {

  const reg = regularStats(store, content);
  const path = pathStats(store, content);
  const dailyMap = store.content(content.version).daily;
  const d = dailyStats(dailyMap, todayStr);
  const item = (id, title, now, max, icon = id) => ({ id, title, now: Math.min(now, max), max, done: now >= max, icon });
  const tier = (g, label, icons) => {
    const s2 = groupStats(store, content, g);
    return [item(`${g}1`, t('{label} 1판 성공', { label }), s2.done, 1, icons[0]), item(`${g}All`, t('{label} 모두 성공', { label }), s2.done, s2.total, icons[1])];
  };

  const sections = [
    { title: t('첫 걸음'), items: [
      item('firstClear', t('첫 도토리 찾기'), reg.done, 1),
      item('firstThree', t('첫 별 3개'), reg.three, 1),
      item('firstDaily', t('첫 오늘의 도전'), d.total, 1),
    ] },
    { title: t('판 성공'), items: [
      ...tier('tutorial', t('입문'), ['tut1', 'tutAll']),
      ...tier('beginner', t('초급'), ['beginner10', 'beginnerAll']),
      ...tier('intermediate', t('중급'), ['intermediate10', 'intermediateAll']),
      ...tier('advanced', t('고급'), ['advanced10', 'advancedAll']),
    ] },
    // 판이 128개(별 384개)로 늘어서 끝 목표를 하나씩 더 둔다. 그림은 있는 것을 다시 쓴다(전용 그림이 생기면 바꾼다).
    { title: t('별 모으기'), items: [[1, 'stars10'], [10, 'stars30'], [30, 'stars60'], [100, 'stars100'], [200, 'stars200'], [reg.maxStars, 'stars200']].map(([n, icon], i) => item(i === 5 ? 'starsAll' : `stars${n}`, i === 5 ? t('별 모두 모으기') : t('별 {n}개', { n }), reg.stars, n, icon)) },
    { title: t('깃발 모으기'), items: [[1, 'firstShortest'], [10, 'shortest10'], [30, 'shortest30'], [100, 'rocket'], [reg.total, 'rocket']].map(([n, icon], i) => item(i === 4 ? 'shortestAll' : `shortest${n}`, i === 4 ? t('깃발 모두 모으기') : t('깃발 {n}개', { n }), reg.shortest, n, icon)) },
    // 길 잇기(2026-11-12): 이어 준 길 조각 수. 그림은 계기판 통나무 그림으로 만들었다(public/assets/ach/logs*.webp).
    { title: t('길 잇기'), items: [[10, 'logs1'], [100, 'logs3'], [500, 'logs3'], [1000, 'logs3'], [path.total, 'logsAll']].map(([n, icon], i) => item(i === 4 ? 'logsAll' : `logs${n}`, i === 4 ? t('모든 길 잇기') : t('길 {n}개 잇기', { n }), path.done, n, icon)) },
    { title: t('오늘의 도전'), items: [
      item('streak3', t('3일 연속 도전'), d.bestStreak, 3),
      item('streak7', t('7일 연속 도전'), d.bestStreak, 7),
      item('streak30', t('30일 연속 도전'), d.bestStreak, 30),
      item('days10', t('도전한 날 10일'), d.total, 10),
      item('days30', t('도전한 날 30일'), d.total, 30),
    ] },
  ];
  return sections.map((sec) => ({ ...sec, done: sec.items.filter((i) => i.done).length }));
}
