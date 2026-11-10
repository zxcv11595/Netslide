// 저장·해금·기록·링크·일일 날짜
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore, sanitize, SAVE_VERSION } from '../src/storage/storage.js';
import {
  confirmCompletion, isUnlocked, isTutorialDone, nextStage, nextTutorial, saveCurrent, getCurrent,
  clearCurrent, getRecord,
} from '../src/game/progress.js';
import { parseContent } from '../src/data/parse.js';
import { kstDateString, dailyStageFor, isValidDateString } from '../src/game/daily.js';
import { buildLink, parseLink, shareText } from '../src/game/links.js';
import { createSession } from '../src/game/session.js';
import { moveFromCode } from '../src/core/rules.js';

const raw = JSON.parse(readFileSync(new URL('../src/data/stages.json', import.meta.url), 'utf8'));
const sols = JSON.parse(readFileSync(new URL('../tools/out/solutions.json', import.meta.url), 'utf8')).solutions;
const content = parseContent(raw);
const KEY = 'test-key';

function memBackend(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    failWrites: false,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem(k, v) { if (this.failWrites) throw new Error('quota'); map.set(k, String(v)); },
    removeItem: (k) => map.delete(k),
  };
}
const res = (stars, bonusDone = false) => ({ canComplete: true, requiredDone: true, hasBonus: bonusDone, bonusDone, stars });
function finishTutorial(store) {
  for (const t of content.groups.tutorial) confirmCompletion(store, content, t, { canComplete: true, stars: 0, bonusDone: false }, 1);
}

test('저장 → 다시 열기 왕복', () => {
  const backend = memBackend();
  const a = createStore({ key: KEY, backend });
  finishTutorial(a);
  confirmCompletion(a, content, content.byId.get('B01'), res(2), 4);
  const b = createStore({ key: KEY, backend });
  assert.equal(b.issue, null);
  assert.deepEqual(getRecord(b, content, 'B01'), { done: true, stars: 2, best: 4, bestBonus: null });
  assert.equal(isTutorialDone(b, content), true);
  assert.equal(JSON.parse(backend.map.get(KEY)).v, SAVE_VERSION);
});

test('손상된 JSON이어도 새로 시작하고 원문은 보관한다', () => {
  for (const bad of ['{oops', '"text"', '[1,2]', 'null']) {
    const backend = memBackend({ [KEY]: bad });
    const s = createStore({ key: KEY, backend });
    assert.equal(s.issue, 'corrupt');
    assert.equal(backend.map.get(`${KEY}.corrupt`), bad);
    assert.equal(isTutorialDone(s, content), false);
    assert.equal(s.save(), true);
  }
});

test('모양이 어긋난 필드는 버리고 나머지는 살린다', () => {
  const data = sanitize({
    v: 1,
    content: {
      1: {
        records: { B01: { done: true, stars: 9, best: -3, bestBonus: 'x' }, B02: 'nope', B03: { done: false, stars: 3 } },
        current: { stageId: 'B02', history: ['r0+', 5] },
        daily: { '2026-11-11': { id: 'D01', stars: 2, moves: 6, bonus: 1 }, bad: 7 },
      },
      2: 'broken',
    },
    ads: { playMs: 'NaN', doneIds: ['B01', 3], lastShownAt: -1 },
  });
  assert.deepEqual(data.content['1'].records, { B01: { done: true, stars: 3, best: null, bestBonus: null } });
  assert.equal(data.content['1'].current, null);
  assert.deepEqual(data.content['1'].daily, { '2026-11-11': { id: 'D01', stars: 2, moves: 6, bonus: true } });
  assert.equal(data.content['2'], undefined);
  assert.deepEqual(data.ads, { playMs: 0, doneIds: ['B01'], lastShownAt: 0, impressions: 0 });
  assert.deepEqual(sanitize(undefined).content, {});
});

test('더 새로운 저장 형식은 덮어쓰지 않도록 따로 보관', () => {
  const text = JSON.stringify({ v: SAVE_VERSION + 5, something: 1 });
  const backend = memBackend({ [KEY]: text });
  const s = createStore({ key: KEY, backend });
  assert.equal(s.issue, 'newer');
  assert.equal(backend.map.get(`${KEY}.v${SAVE_VERSION + 5}`), text);
});

test('저장 불가/저장 실패여도 메모리로 계속 플레이', () => {
  const none = createStore({ key: KEY, backend: null });
  assert.equal(none.persistent, false);
  assert.equal(none.issue, 'unavailable');
  finishTutorial(none);
  assert.equal(isTutorialDone(none, content), true);

  const backend = memBackend();
  const s = createStore({ key: KEY, backend });
  backend.failWrites = true;
  confirmCompletion(s, content, content.byId.get('T1'), { canComplete: true, stars: 0, bonusDone: false }, 1);
  assert.equal(s.persistent, false);
  assert.equal(s.issue, 'write-failed');
  assert.equal(getRecord(s, content, 'T1').done, true);

  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(createStore({ key: KEY, backend: throwing }).persistent, false);
});

test('해금: 입문은 순서대로, 입문 뒤 세 난이도 첫 판이 모두 열린다', () => {
  const s = createStore({ key: KEY, backend: memBackend() });
  const [t1, t2, t3] = content.groups.tutorial;
  assert.equal(isUnlocked(s, content, t1), true);
  assert.equal(isUnlocked(s, content, t2), false);
  assert.equal(isUnlocked(s, content, content.groups.beginner[0]), false);
  assert.equal(isUnlocked(s, content, content.daily[0]), false);
  assert.equal(nextTutorial(s, content), t1);
  finishTutorial(s);
  assert.equal(nextTutorial(s, content), null);
  assert.equal(isUnlocked(s, content, t3), true);
  for (const g of ['beginner', 'intermediate', 'advanced']) {
    assert.equal(isUnlocked(s, content, content.groups[g][0]), true, g);
    assert.equal(isUnlocked(s, content, content.groups[g][1]), false, g);
  }
  assert.equal(isUnlocked(s, content, content.daily[0]), true);
});

test('별 1개 완료로도 다음 판이 열리고, 완료 전에는 열리지 않는다', () => {
  const s = createStore({ key: KEY, backend: memBackend() });
  finishTutorial(s);
  const [m1, m2] = content.groups.intermediate;
  assert.equal(confirmCompletion(s, content, m1, { canComplete: false, stars: 0 }, 3), null);
  assert.equal(isUnlocked(s, content, m2), false);
  confirmCompletion(s, content, m1, res(1), 30);
  assert.equal(isUnlocked(s, content, m2), true);
  assert.equal(nextStage(content, m1), m2);
  assert.equal(nextStage(content, content.groups.intermediate.at(-1)), null);
  assert.equal(nextStage(content, content.daily[0]), null);
});

test('최고 별은 낮아지지 않고 기본/보너스 최소 이동 기록을 구분한다', () => {
  const s = createStore({ key: KEY, backend: memBackend() });
  const st = content.byId.get('B10');
  assert.equal(confirmCompletion(s, content, st, res(3, true), 5).firstClear, true);
  const again = confirmCompletion(s, content, st, res(1, false), 4);
  assert.deepEqual(again.record, { done: true, stars: 3, best: 4, bestBonus: 5 });
  assert.equal(again.newBest, true);
  const worse = confirmCompletion(s, content, st, res(2, true), 9);
  assert.deepEqual(worse.record, { done: true, stars: 3, best: 4, bestBonus: 5 });
  assert.equal(worse.newBest, false);
  // 같은 결과를 두 번 확정해도 달라지지 않는다(더블 탭)
  const before = JSON.stringify(s.data);
  confirmCompletion(s, content, st, res(2, true), 9);
  assert.equal(JSON.stringify(s.data), before);
});

test('기록은 실험 횟수가 아니라 최종 풀이 길이', () => {
  const stage = content.byId.get('B01');
  const session = createSession(stage);
  const first = moveFromCode(sols.B01.basic.moves[0]);
  session.move({ ...first, dir: -first.dir });
  session.undo();
  session.move({ ...first, dir: -first.dir });
  session.undo();
  for (const code of sols.B01.basic.moves) session.move(moveFromCode(code));
  assert.equal(session.result.canComplete, true);
  assert.equal(session.moves, sols.B01.basic.length);
});

test('하던 판 저장/복원/삭제', () => {
  const backend = memBackend();
  const s = createStore({ key: KEY, backend });
  const st = content.byId.get('M02');
  saveCurrent(s, content, st, ['r0+', 'c3-']);
  const again = createStore({ key: KEY, backend });
  assert.deepEqual(getCurrent(again, content), { stage: st, history: ['r0+', 'c3-'], date: null });
  confirmCompletion(again, content, st, res(1), 2);
  assert.equal(getCurrent(again, content), null, '완료하면 하던 판 저장은 지워진다');
  saveCurrent(again, content, st, ['r0+']);
  clearCurrent(again, content);
  assert.equal(getCurrent(createStore({ key: KEY, backend }), content), null);
  again.content(content.version).current = { stageId: 'ZZ99', date: null, history: [] };
  assert.equal(getCurrent(again, content), null, '없는 판 ID');
});

test('콘텐츠 버전이 다른 기록은 섞이지 않는다', () => {
  const s = createStore({ key: KEY, backend: memBackend() });
  const v2 = { ...content, version: 2 };
  confirmCompletion(s, content, content.byId.get('T1'), { canComplete: true, stars: 0, bonusDone: false }, 1);
  assert.equal(getRecord(s, v2, 'T1'), null);
  assert.equal(getRecord(s, content, 'T1').done, true);
});

// ---------- 일일 ----------
test('한국 시간 날짜 경계', () => {
  assert.equal(kstDateString(Date.parse('2026-11-11T14:59:59Z')), '2026-11-11');
  assert.equal(kstDateString(Date.parse('2026-11-11T15:00:00Z')), '2026-11-12');
  assert.equal(kstDateString(Date.parse('2026-12-31T15:00:00Z')), '2027-01-01');
  assert.equal(isValidDateString('2026-02-30'), false);
  assert.equal(isValidDateString('2026-2-3'), false);
  assert.equal(isValidDateString('2028-02-29'), true);
});

test('같은 날짜는 항상 같은 판, 목록 길이를 주기로 순환', () => {
  const n = content.daily.length;
  assert.equal(dailyStageFor(content, content.dailyEpoch), content.daily[0]);
  assert.equal(dailyStageFor(content, '2026-11-12'), content.daily[1]);
  assert.equal(dailyStageFor(content, '2026-11-10'), content.daily[n - 1]);
  const d = new Date(Date.parse(`${content.dailyEpoch}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  assert.equal(dailyStageFor(content, d), content.daily[0]);
  assert.equal(dailyStageFor(content, 'nope'), null);
});

test('일일 기록은 날짜별로 남고 최고 기록을 유지한다', () => {
  const s = createStore({ key: KEY, backend: memBackend() });
  const st = dailyStageFor(content, '2026-11-11');
  confirmCompletion(s, content, st, res(2, true), 7, { date: '2026-11-11' });
  confirmCompletion(s, content, st, res(1, false), 5, { date: '2026-11-11' });
  assert.deepEqual(s.content(1).daily['2026-11-11'], { id: st.id, stars: 2, moves: 5, bonus: true });
  confirmCompletion(s, content, st, res(3, true), 6);
  assert.equal(Object.keys(s.content(1).daily).length, 1, '날짜 없이 완료하면 일일 기록을 만들지 않는다');
});

// ---------- 링크 ----------
const contents = { 1: content };
const BASE = 'https://example.com/games/hamster/?utm=x#frag';

test('링크는 같은 판을 재현한다', () => {
  const url = buildLink(BASE, { version: 1, stageId: 'M03' });
  assert.equal(url, 'https://example.com/games/hamster/?v=1&s=M03');
  const p = parseLink(new URL(url).search, contents, '2026-11-11');
  assert.equal(p.type, 'stage');
  assert.equal(p.stage, content.byId.get('M03'));
  assert.equal(p.date, null);
  assert.deepEqual(p.stage.tiles, content.byId.get('M03').tiles);
});

test('일일 링크: 날짜와 판이 맞을 때만 일일 기록 대상', () => {
  const today = '2026-11-13';
  const st = dailyStageFor(content, '2026-11-12');
  const ok = parseLink(new URL(buildLink(BASE, { version: 1, stageId: st.id, date: '2026-11-12' })).search, contents, today);
  assert.deepEqual([ok.type, ok.stage, ok.date], ['stage', st, '2026-11-12']);
  const other = content.daily.find((x) => x !== st);
  const mismatch = parseLink(`?v=1&s=${other.id}&d=2026-11-12`, contents, today);
  assert.deepEqual([mismatch.type, mismatch.stage, mismatch.date], ['stage', other, null]);
  assert.deepEqual(parseLink(`?v=1&s=${st.id}&d=2026-11-14`, contents, today), { type: 'error', reason: 'future' });
  assert.deepEqual(parseLink(`?v=1&s=${st.id}&d=2026-13-40`, contents, today), { type: 'error', reason: 'date' });
  assert.deepEqual(parseLink('?v=1&s=B01&d=2026-11-12', contents, today), { type: 'error', reason: 'date' });
});

test('잘못된 버전·ID·파라미터', () => {
  const t = '2026-11-11';
  assert.deepEqual(parseLink('', contents, t), { type: 'none' });
  assert.deepEqual(parseLink('?utm_source=x', contents, t), { type: 'none' });
  assert.deepEqual(parseLink('?v=0&s=B01', contents, t), { type: 'error', reason: 'version' });
  assert.deepEqual(parseLink('?v=99&s=B01', contents, t), { type: 'error', reason: 'version' });
  assert.deepEqual(parseLink('?s=B01', contents, t), { type: 'error', reason: 'version' });
  assert.deepEqual(parseLink('?v=__proto__&s=B01', contents, t), { type: 'error', reason: 'version' });
  assert.deepEqual(parseLink('?v=1&s=Z99', contents, t), { type: 'error', reason: 'id' });
  assert.deepEqual(parseLink('?v=1', contents, t), { type: 'error', reason: 'id' });
  assert.deepEqual(parseLink('?v=1&s=<script>', contents, t), { type: 'error', reason: 'id' });
  assert.deepEqual(parseLink('?v=1&s=constructor', contents, t), { type: 'error', reason: 'id' });
});

test('공유 문구에는 별·이동 수·보너스 여부가 들어가고 완료 배치는 없다', () => {
  const text = shareText({ gameName: 'G', title: '중급 2', stars: 2, moves: 7, hasBonus: true, bonusDone: false });
  assert.equal(text, 'G · 중급 2\n★★☆ · 7수 · 보너스 미달성');
  assert.equal(shareText({ gameName: 'G', title: '초급 1', stars: 3, moves: 2, hasBonus: false }), 'G · 초급 1\n★★★ · 2수');
});

// ---------- 연속 기록 / 힌트 ----------
import { dailyStreak } from '../src/game/daily.js';
import { nextHint } from '../src/game/hint.js';
import { emptyData } from '../src/storage/storage.js';

test('연속 도전 일수: 오늘을 아직 안 풀었어도 어제까지 이어졌으면 유지', () => {
  const done = (...days) => Object.fromEntries(days.map((d) => [d, { id: 'D01', stars: 1, moves: 5, bonus: false }]));
  assert.equal(dailyStreak({}, '2026-11-11'), 0);
  assert.equal(dailyStreak(done('2026-11-11'), '2026-11-11'), 1);
  assert.equal(dailyStreak(done('2026-11-09', '2026-11-10'), '2026-11-11'), 2);
  assert.equal(dailyStreak(done('2026-11-09', '2026-11-10', '2026-11-11'), '2026-11-11'), 3);
  assert.equal(dailyStreak(done('2026-11-08', '2026-11-09'), '2026-11-11'), 0, '하루를 건너뛰면 끊긴다');
  assert.equal(dailyStreak(done('2026-10-31', '2026-11-01'), '2026-11-01'), 2, '달이 바뀌어도 이어진다');
});

test('저장 기본값과 정리: 힌트 개수와 설정', () => {
  assert.deepEqual([emptyData().hints, emptyData().settings.vibrate], [3, true]);
  const d = sanitize({ v: 1, hints: 7, settings: { vibrate: false } });
  assert.deepEqual([d.hints, d.settings.vibrate], [7, false]);
  const bad = sanitize({ v: 1, hints: -2, settings: { vibrate: 'yes' } });
  assert.deepEqual([bad.hints, bad.settings.vibrate], [3, true]);
});

test('힌트: 힌트대로만 따라가면 판이 풀린다', () => {
  for (const id of ['B01', 'B07', 'M02', 'M08']) {
    const stage = content.byId.get(id);
    const session = createSession(stage);
    let steps = 0;
    while (!session.result.canComplete && steps < 30) {
      const hint = nextHint(stage, session.cells, session.historyCodes(), sols[id].basic.moves);
      assert.equal(hint.type, 'move', `${id} ${steps}번째`);
      assert.equal(session.move(hint.move).ok, true);
      steps++;
    }
    assert.equal(session.result.canComplete, true, id);
    assert.equal(steps, sols[id].basic.length, `${id}: 힌트는 최단 풀이를 따른다`);
  }
});

test('힌트: 탐색 범위를 넘으면 해답 경로를 따르고, 벗어났으면 되돌리기를 권한다', () => {
  const stage = content.byId.get('A01');
  const solution = sols.A01.basic.moves;
  const tiny = { maxStates: 50 };
  const session = createSession(stage);
  assert.deepEqual(nextHint(stage, session.cells, [], solution, tiny), { type: 'move', move: moveFromCode(solution[0]) });
  session.move(moveFromCode(solution[0]));
  assert.deepEqual(nextHint(stage, session.cells, session.historyCodes(), solution, tiny), { type: 'move', move: moveFromCode(solution[1]) });
  // 해답과 다른 수를 두면 되돌리기
  const first = moveFromCode(solution[1]);
  session.move({ ...first, dir: -first.dir });
  assert.deepEqual(nextHint(stage, session.cells, session.historyCodes(), solution, tiny), { type: 'undo' });
  // 해답 자료가 없고 한 수도 두지 않았으면 알려 줄 것이 없다
  assert.deepEqual(nextHint(stage, createSession(stage).cells, [], null, tiny), { type: 'none' });
});
