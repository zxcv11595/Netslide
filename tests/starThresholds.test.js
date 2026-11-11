// 별 기준(별 3개 = 최단 + 여유)과 저장된 기록의 별 다시 계산
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseContent } from '../src/data/parse.js';
import { star3For, star2For, TUTORIAL_STAR2_EXTRA, starsAt } from '../src/core/stars.js';
import { createStore } from '../src/storage/storage.js';
import { migrateStarThresholds } from '../src/game/progress.js';

const content = parseContent(JSON.parse(readFileSync(new URL('../src/data/stages.json', import.meta.url), 'utf8')));
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

test('별 기준: 별 3개 = 최단의 2배, 별 2개 = 최단의 3배', () => {
  assert.deepEqual([2, 4, 7, 14].map(star3For), [4, 8, 14, 28]);
  assert.deepEqual([2, 4, 7, 14].map(star2For), [6, 12, 21, 42]);
});

test('판 자료: 정규·오늘의 도전은 최단의 2배·3배, 입문은 최단 그대로와 +3', () => {
  for (const s of content.byId.values()) {
    assert.ok(Number.isInteger(s.shortest) && s.shortest >= 1, s.id);
    assert.equal(s.star3, s.tutorial ? s.shortest : star3For(s.shortest), `${s.id} 별 3개`);
    assert.equal(s.star2, s.tutorial ? s.star3 + TUTORIAL_STAR2_EXTRA : star2For(s.shortest), `${s.id} 별 2개`);
  }
});

test('저장된 기록: 최소 횟수로 별을 다시 계산하며 줄어들지 않는다', () => {
  const store = createStore({ key: 'star-threshold-test', backend: memory() });
  const c = store.content(content.version);
  const [a, b, d] = content.groups.advanced.slice(-3); // 최단이 긴 판
  c.records[a.id] = { done: true, stars: 2, best: a.shortest + 1, bestBonus: null }; // 예전 기준으로 별 2개
  c.records[b.id] = { done: true, stars: 1, best: null, bestBonus: null }; // 즉시 성공: 횟수 기록 없음
  c.records[d.id] = { done: true, stars: 3, best: d.star2 + 9, bestBonus: null }; // 이미 받은 별은 그대로
  const day = content.daily[0];
  c.daily['2026-11-10'] = { id: day.id, stars: 2, moves: day.shortest + 1, bonus: false };
  assert.equal(migrateStarThresholds(store, content), true);
  assert.equal(c.records[a.id].stars, starsAt(a, a.shortest + 1));
  assert.equal(c.records[a.id].stars, 3);
  assert.equal(c.records[b.id].stars, 1);
  assert.equal(c.records[d.id].stars, 3);
  assert.equal(c.daily['2026-11-10'].stars, 3);
  assert.equal(migrateStarThresholds(store, content), false, '두 번째는 바뀌는 것이 없다');
});

test('최단 경로 깃발과 보여 줄 최단 경로', async () => {
  const { hasFlag, shownShortest } = await import('../src/game/progress.js');
  const s = content.groups.advanced.at(-1);
  assert.equal(hasFlag(s, null), false);
  assert.equal(hasFlag(s, { done: true, stars: 1, best: null }), false, '즉시 성공은 깃발이 없다');
  assert.equal(hasFlag(s, { done: true, stars: 3, best: s.shortest + 1 }), false);
  assert.equal(hasFlag(s, { done: true, stars: 3, best: s.shortest }), true);
  assert.equal(shownShortest(s, null), s.shortest);
  assert.equal(shownShortest(s, { done: true, best: s.shortest + 2 }), s.shortest);
  assert.equal(shownShortest(s, { done: true, best: s.shortest - 1 }), s.shortest - 1, '기록을 깨면 내 기록을 보여 준다');
});
