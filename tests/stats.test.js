// 내 정보 화면의 기록·성취 계산
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from '../src/storage/storage.js';
import { confirmCompletion } from '../src/game/progress.js';
import { parseContent } from '../src/data/parse.js';
import { groupStats, regularStats, dailyStats, achievementSections } from '../src/game/stats.js';

const content = parseContent(JSON.parse(readFileSync(new URL('../src/data/stages.json', import.meta.url), 'utf8')));
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const newStore = () => createStore({ key: 't', backend: mem() });
const res = (stars) => ({ canComplete: true, requiredDone: true, hasBonus: false, bonusDone: false, stars });
const clear = (store, id, stars, moves) => confirmCompletion(store, content, content.byId.get(id), res(stars), moves);

test('난이도 기록: 클리어·별 3개·모은 별·놓친 별·최단 길 성공', () => {
  const s = newStore();
  const [b1, b2, b3] = content.groups.beginner;
  clear(s, b1.id, 3, b1.shortest); // 최단 수로 별 3개
  clear(s, b2.id, 2, b2.star3 + 1); // 별 2개, 별 3개 기준보다 길게
  clear(s, b3.id, 1, b3.star2 + 5);
  const g = groupStats(s, content, 'beginner');
  assert.equal(g.total, content.groups.beginner.length);
  assert.deepEqual([g.done, g.three, g.stars, g.missed, g.shortest], [3, 1, 6, 3, 1]);
  assert.equal(g.maxStars, g.total * 3);
  assert.equal(regularStats(s, content).done, 3);
  assert.equal(groupStats(s, content, 'intermediate').done, 0);
});

test('오늘의 도전 기록: 이번 달, 지금 연속, 최고 연속, 별 3개 날', () => {
  const daily = {
    '2026-11-01': { stars: 3 }, '2026-11-02': { stars: 2 }, '2026-11-03': { stars: 3 }, // 3일 연속
    '2026-11-09': { stars: 1 }, '2026-11-10': { stars: 3 }, // 2일 연속
    '2026-10-30': { stars: 3 },
  };
  const d = dailyStats(daily, '2026-11-10');
  assert.equal(d.total, 6);
  assert.equal(d.thisMonth, 5);
  assert.equal(d.three, 4);
  assert.equal(d.streak, 2);
  assert.equal(d.bestStreak, 3);
  assert.equal(dailyStats({}, '2026-11-10').bestStreak, 0);
  // 오늘 아직 안 풀어도 어제까지 이어졌다면 연속이 유지된다
  assert.equal(dailyStats({ '2026-11-09': { stars: 3 } }, '2026-11-10').streak, 1);
});

test('성취: 진행도는 최대값을 넘지 않고, 달성 수가 섹션마다 계산된다', () => {
  const s = newStore();
  let secs = achievementSections(s, content, '2026-11-10');
  assert.deepEqual(secs.map((x) => x.title), ['첫 걸음', '판 성공', '별 모으기', '깃발 모으기', '오늘의 도전']);
  assert.ok(secs.every((x) => x.done === 0));
  const t1 = content.groups.tutorial[0];
  confirmCompletion(s, content, t1, res(3), t1.star3);
  const b1 = content.groups.beginner[0];
  clear(s, b1.id, 3, b1.shortest);
  secs = achievementSections(s, content, '2026-11-10');
  const find = (id) => secs.flatMap((x) => x.items).find((i) => i.id === id);
  assert.equal(find('tutorial1').done, true);
  assert.equal(find('tutorialAll').now, 1);
  assert.equal(find('beginner1').done, true);
  assert.equal(find('beginnerAll').done, false);
  assert.equal(find('firstClear').done, true);
  assert.equal(find('firstThree').done, true);
  assert.equal(find('shortest1').done, true);
  assert.equal(find('firstDaily').done, false);
  assert.equal(find('stars1').done, true);
  assert.equal(find('stars10').now, 3);
  for (const sec of secs) for (const i of sec.items) assert.ok(i.now <= i.max, i.id);
});
