// 이어서 안내하는 힌트, 바로 클리어 기록, 힌트 지급
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore, sanitize } from '../src/storage/storage.js';
import { confirmCompletion } from '../src/game/progress.js';
import { parseContent } from '../src/data/parse.js';
import { createSession } from '../src/game/session.js';
import { moveFromCode } from '../src/core/rules.js';
import { planHint, guideCount } from '../src/game/hint.js';
import { grantDailyHint, clearRewardHints, regularStars } from '../src/game/hintWallet.js';

const raw = JSON.parse(readFileSync(new URL('../src/data/stages.json', import.meta.url), 'utf8'));
const hints = JSON.parse(readFileSync(new URL('../src/data/hints.json', import.meta.url), 'utf8')).hints;
const content = parseContent(raw);
const CFG = { dailyFree: 1, freeCap: 3, starsPer: 10 };

function memStore() {
  const map = new Map();
  return createStore({ key: 'k', backend: { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) } });
}
const done = (stars) => ({ canComplete: true, requiredDone: true, hasBonus: false, bonusDone: false, stars });
function scramble(stage, count, seedStart) {
  let seed = seedStart;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const session = createSession(stage);
  const lines = [];
  for (let i = 0; i < stage.size; i++) for (const axis of ['row', 'col']) for (const dir of [1, -1]) lines.push({ axis, index: i, dir });
  let made = 0;
  while (made < count) { if (session.move(lines[Math.floor(rnd() * lines.length)]).ok) made++; }
  return session;
}
function play(session, codes) {
  for (const c of codes) assert.equal(session.move(moveFromCode(c)).ok, true, c);
}

test('힌트 길: 처음 배치에서는 길을 찾고, 절반(올림, 최소 2수)을 안내한다', () => {
  for (const id of ['B07', 'M02', 'M08', 'A01', 'A09', 'A12']) {
    const stage = content.byId.get(id);
    const session = createSession(stage);
    const plan = planHint(stage, session.cells, [], hints[id]);
    assert.equal(plan.type, 'path', id);
    assert.ok(plan.moves.length <= hints[id].length, `${id}: 보관 해답보다 길지 않다`);
    play(session, plan.moves);
    assert.equal(session.result.canComplete, true, id);
  }
  // 최단이 증명된 판은 최단 길을 준다
  for (const id of ['B07', 'M02', 'M08', 'A01']) {
    const stage = content.byId.get(id);
    const plan = planHint(stage, createSession(stage).cells, [], hints[id]);
    assert.equal(plan.moves.length, stage.shortest, `${id}: 최단 수`);
    assert.equal(guideCount(plan), Math.max(2, Math.floor(stage.shortest / 2)), id);
  }
  assert.equal(guideCount({ moves: ['r0+'] }), 1, '남은 수보다 많이 안내하지 않는다');
  assert.equal(guideCount({ moves: Array(12).fill('r0+') }), 6);
  assert.equal(guideCount({ moves: Array(3).fill('r0+') }), 2);
});

test('힌트 길: 조금 벗어난 배치에서는 되돌리지 않고 지금 배치에서 풀리는 길을 준다', () => {
  for (const id of ['B12', 'M05', 'M10', 'A04']) {
    const stage = content.byId.get(id);
    const session = scramble(stage, 2, 4242);
    if (session.result.canComplete) continue;
    const plan = planHint(stage, session.cells, session.historyCodes(), hints[id]);
    assert.equal(plan.type, 'path', id);
    play(session, plan.moves);
    assert.equal(session.result.canComplete, true, `${id} (${plan.moves.length}수)`);
  }
});

test('힌트 길: 너무 멀면 되돌릴 수를 알려 주고, 그만큼 되돌리면 길이 나온다', () => {
  let far = 0;
  for (const id of ['M12', 'A08', 'A12']) {
    const stage = content.byId.get(id);
    for (const seed of [5, 99, 4242]) {
      const session = scramble(stage, 14, seed);
      if (session.result.canComplete) continue;
      const plan = planHint(stage, session.cells, session.historyCodes(), hints[id]);
      assert.notEqual(plan.type, 'none', id);
      if (plan.type === 'far') {
        far++;
        assert.ok(plan.undo >= 1 && plan.undo <= session.moves, `${id}: 되돌릴 수 ${plan.undo}`);
        for (let i = 0; i < plan.undo; i++) assert.equal(session.undo().ok, true);
      }
      const again = planHint(stage, session.cells, session.historyCodes(), hints[id]);
      assert.equal(again.type, 'path', `${id}: 되돌린 뒤에는 찾는다`);
      play(session, again.moves);
      assert.equal(session.result.canComplete, true, id);
    }
  }
  assert.ok(far > 0, '멀리 흐트러뜨린 배치 중 일부는 되돌리기 안내가 나와야 한다');
});

test('힌트 길: 해답 자료가 없으면 가까운 풀이만 찾고, 풀린 배치에서는 알려 줄 것이 없다', () => {
  const easy = content.byId.get('B01');
  const p = planHint(easy, createSession(easy).cells, [], null);
  assert.equal(p.type, 'path');
  assert.equal(p.exact, true);
  const hard = content.byId.get('A12');
  assert.deepEqual(planHint(hard, createSession(hard).cells, [], null, { maxStates: 30 }), { type: 'none' });
  const done = createSession(easy);
  play(done, hints.B01);
  assert.deepEqual(planHint(easy, done.cells, done.historyCodes(), hints.B01), { type: 'none' });
});

test('힌트 길: 시간 제한을 주면 그 안에 끝난다', () => {
  const stage = content.byId.get('A12');
  const session = scramble(stage, 25, 99);
  const t0 = performance.now();
  const plan = planHint(stage, session.cells, session.historyCodes(), hints.A12, { maxStates: 5000000, budgetMs: 200 });
  const took = performance.now() - t0;
  assert.ok(took < 1500, `걸린 시간 ${took.toFixed(0)}ms`);
  assert.notEqual(plan.type, 'none');
});

test('바로 클리어: 별 1개로 기록하고 최소 이동 기록은 건드리지 않는다', () => {
  const stage = content.byId.get('B01');
  const s = memStore();
  const first = confirmCompletion(s, content, stage, done(3), 2, null, { skipped: true });
  assert.deepEqual([first.record.stars, first.record.best, first.firstClear], [1, null, true]);
  const real = confirmCompletion(s, content, stage, done(2), 5);
  assert.deepEqual([real.record.stars, real.record.best], [2, 5]);
  const again = confirmCompletion(s, content, stage, done(3), 2, null, { skipped: true });
  assert.deepEqual([again.record.stars, again.record.best, again.newBest], [2, 5, false], '직접 푼 기록이 내려가지 않는다');
  // 오늘의 도전도 같은 방식
  const daily = content.daily[0];
  const d = confirmCompletion(s, content, daily, done(3), 6, { date: '2026-11-11' }, { skipped: true });
  assert.equal(d.record.stars, 1);
  assert.deepEqual(s.content(content.version).daily['2026-11-11'], { id: daily.id, stars: 1, moves: null, bonus: false });
});

test('힌트 지급: 날마다 1개(처음 날 제외, 3개 미만일 때만)', () => {
  const s = memStore();
  assert.equal(grantDailyHint(s, '2026-11-11', CFG), 0, '처음 시작한 날은 시작 힌트만');
  assert.equal(s.data.hints, 3);
  s.data.hints = 0;
  assert.equal(grantDailyHint(s, '2026-11-11', CFG), 0, '같은 날은 다시 주지 않는다');
  assert.equal(grantDailyHint(s, '2026-11-12', CFG), 1);
  assert.equal(grantDailyHint(s, '2026-11-12', CFG), 0);
  s.data.hints = 3;
  assert.equal(grantDailyHint(s, '2026-11-13', CFG), 0, '3개 이상이면 주지 않는다');
  assert.equal(s.data.hints, 3);
  const kept = sanitize(JSON.parse(JSON.stringify(s.data)));
  assert.deepEqual([kept.hintDay, kept.starHints], ['2026-11-13', 0]);
  assert.equal(sanitize({ v: 1, hintDay: 'x', starHints: -1 }).hintDay, null);
});

test('판 성공 보상: 직접 푼 첫 성공 1개, 첫 깃발 1개, 판마다 한 번씩', () => {
  const R = { clearReward: 1, flagReward: 1 };
  const base = { regular: true, skipped: false, prev: null, hadFlag: false, flagNow: false };
  assert.equal(clearRewardHints(base, R), 1, '첫 성공');
  assert.equal(clearRewardHints({ ...base, flagNow: true }, R), 2, '첫 성공을 최단 경로로');
  const prev = { done: true, stars: 2, best: 9 };
  assert.equal(clearRewardHints({ ...base, prev }, R), 0, '다시 풀면 없음');
  assert.equal(clearRewardHints({ ...base, prev, flagNow: true }, R), 1, '나중에 깃발을 받으면 1개');
  assert.equal(clearRewardHints({ ...base, prev, hadFlag: true, flagNow: true }, R), 0, '깃발은 한 번만');
  assert.equal(clearRewardHints({ ...base, skipped: true }, R), 0, '즉시 성공은 없음');
  assert.equal(clearRewardHints({ ...base, prev: { done: true, stars: 1, best: null } }, R), 1, '즉시 성공 뒤 직접 풀면 받는다');
  assert.equal(clearRewardHints({ ...base, regular: false, flagNow: true }, R), 0, '입문·오늘의 도전은 없음');
});

test('별을 모아도 힌트는 늘지 않는다(정규 판 별 합계는 오늘의 도전을 빼고 센다)', () => {
  const s = memStore();
  const list = content.groups.beginner;
  const before = s.data.hints;
  for (let i = 0; i < 3; i++) confirmCompletion(s, content, list[i], done(3), 3);
  confirmCompletion(s, content, list[3], done(1), 9);
  confirmCompletion(s, content, content.daily[0], done(3), 6, { date: '2026-11-11' });
  assert.equal(regularStars(s, content), 10);
  assert.equal(s.data.hints, before);
});

test('벽 보기: 정답 배치에서 이어지지 않는 칸 사이에만 벽이 선다', async () => {
  const { solutionWalls } = await import('../src/core/walls.js');
  const { tilePorts } = await import('../src/core/rules.js');
  for (const id of ['B05', 'M20', 'A40']) {
    const stage = content.byId.get(id);
    const walls = solutionWalls(stage, hints[id]);
    const n = stage.size;
    assert.ok(walls.length > 0, id);
    // 이웃한 칸 쌍은 2n(n-1)개. 정답 길(나무)의 이음은 (길이 있는 칸 수 - 1)개이므로 나머지가 벽이다.
    const used = stage.tiles.filter((t) => tilePorts(t) !== 0).length;
    assert.equal(walls.length, 2 * n * (n - 1) - (used - 1), id);
    assert.ok(walls.every((w) => w.r >= 0 && w.c >= 0 && w.r < n && w.c < n && (w.dir === 'v' ? w.c < n - 1 : w.r < n - 1)), id);
  }
  assert.deepEqual(solutionWalls(content.byId.get('B05'), null), []);
});
