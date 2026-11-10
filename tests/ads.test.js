// 광고 어댑터와 입력 잠금
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdManager } from '../src/ads/adManager.js';
import { createStore } from '../src/storage/storage.js';
import { createTransitionLock } from '../src/ui/transitionLock.js';
import { CONFIG } from '../src/config.js';

function fakeTimers() {
  let now = 0;
  let seq = 0;
  const pending = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms) { const id = ++seq; pending.set(id, { at: now + ms, fn }); return id; },
    clearTimeout(id) { pending.delete(id); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
    get count() { return pending.size; },
  };
}

const CFG = { enabled: true, minDistinctStages: 3, minPlayMs: 300000, requestTimeoutMs: 3000, retryCooldownMs: 60000 };
const stage = (id, group = 'beginner') => ({ id, group });

function setup({ provider, config = CFG, ready = true } = {}) {
  const t = fakeTimers();
  const store = createStore({ key: 'k', backend: null });
  const log = [];
  const calls = [];
  const prov = provider === null ? null : (provider || {
    isReady: () => ready,
    show(cb) { calls.push(cb); },
  });
  const ads = createAdManager({
    config, provider: prov, store, now: t.now, timers: t,
    onPause: () => log.push('pause'), onResume: () => log.push('resume'),
  });
  const makeEligible = () => {
    for (const id of ['B01', 'B02', 'B03']) ads.noteStageCompleted(stage(id));
    store.data.ads.playMs = config.minPlayMs;
  };
  return { t, store, log, calls, ads, makeEligible };
}
const outcomeOf = async (p) => (await p).outcome;

test('기본 설정은 광고 비활성이고 provider가 없으면 즉시 통과', async () => {
  assert.equal(CONFIG.ads.enabled, false);
  const a = setup({ provider: null });
  a.makeEligible();
  assert.equal(await outcomeOf(a.ads.showBetweenStages()), 'disabled');
  const b = setup({ config: { ...CFG, enabled: false } });
  b.makeEligible();
  assert.equal(await outcomeOf(b.ads.showBetweenStages()), 'disabled');
  assert.equal(b.calls.length, 0);
  assert.deepEqual(b.log, []);
});

test('조건 미충족이면 요청하지 않는다', async () => {
  const s = setup();
  assert.equal(await outcomeOf(s.ads.showBetweenStages()), 'not-eligible');
  // 판 수만 채움
  for (const id of ['B01', 'B02', 'B03']) s.ads.noteStageCompleted(stage(id));
  assert.equal(await outcomeOf(s.ads.showBetweenStages()), 'not-eligible');
  // 시간만 채움
  const s2 = setup();
  s2.store.data.ads.playMs = CFG.minPlayMs;
  s2.ads.noteStageCompleted(stage('B01'));
  s2.ads.noteStageCompleted(stage('B02'));
  assert.equal(await outcomeOf(s2.ads.showBetweenStages()), 'not-eligible');
  assert.equal(s.calls.length + s2.calls.length, 0);
});

test('같은 판 재도전·입문·일일 판은 판 수 조건에 세지 않는다', () => {
  const s = setup();
  for (let i = 0; i < 5; i++) s.ads.noteStageCompleted(stage('B01'));
  s.ads.noteStageCompleted(stage('T1', 'tutorial'));
  s.ads.noteStageCompleted(stage('D01', 'daily'));
  assert.deepEqual(s.store.data.ads.doneIds, ['B01']);
});

test('일반 플레이 시간만 누적한다', () => {
  const s = setup();
  s.ads.startPlayClock(stage('T1', 'tutorial'));
  s.t.advance(100000);
  s.ads.stopPlayClock();
  assert.equal(s.store.data.ads.playMs, 0);
  s.ads.startPlayClock(stage('B01'));
  s.t.advance(120000);
  s.ads.stopPlayClock();
  s.ads.stopPlayClock();
  assert.equal(s.store.data.ads.playMs, 120000);
});

test('준비되지 않은 SDK는 기다리지 않고 통과', async () => {
  const s = setup({ ready: false });
  s.makeEligible();
  assert.equal(await outcomeOf(s.ads.showBetweenStages()), 'not-ready');
  assert.equal(s.calls.length, 0);
  assert.equal(s.ads.state, 'idle');
});

test('표시 → 종료: 표시 중에만 일시 정지하고 노출 뒤 조건을 초기화', async () => {
  const s = setup();
  s.makeEligible();
  const p = s.ads.showBetweenStages();
  assert.equal(s.ads.state, 'requesting');
  assert.deepEqual(s.log, [], '요청만으로는 멈추지 않는다');
  s.calls[0].onStart();
  assert.equal(s.ads.state, 'showing');
  assert.deepEqual(s.log, ['pause']);
  s.t.advance(600000); // 표시 중에는 타임아웃으로 재개하지 않는다
  assert.deepEqual(s.log, ['pause']);
  s.calls[0].onFinish('shown');
  assert.equal(await outcomeOf(p), 'shown');
  assert.deepEqual(s.log, ['pause', 'resume']);
  assert.equal(s.ads.state, 'idle');
  assert.deepEqual([s.store.data.ads.doneIds.length, s.store.data.ads.playMs, s.store.data.ads.impressions], [0, 0, 1]);
  assert.equal(await outcomeOf(s.ads.showBetweenStages()), 'not-eligible', '노출 직후에는 다시 요청하지 않는다');
});

test('재고 없음/오류는 정상 진행하고 노출로 세지 않으며 연속 재요청하지 않는다', async () => {
  for (const result of ['no-fill', 'error']) {
    const s = setup();
    s.makeEligible();
    const p = s.ads.showBetweenStages();
    s.calls[0].onFinish(result);
    assert.equal(await outcomeOf(p), result);
    assert.deepEqual(s.log, []);
    assert.equal(s.store.data.ads.impressions, 0);
    assert.equal(s.store.data.ads.doneIds.length, 3, '조건은 유지');
    assert.equal(await outcomeOf(s.ads.showBetweenStages()), 'not-eligible', '같은 전환에서 재요청 금지');
    assert.equal(s.calls.length, 1);
    s.t.advance(CFG.retryCooldownMs);
    s.ads.showBetweenStages();
    assert.equal(s.calls.length, 2, '대기 시간 뒤에는 다시 요청 가능');
  }
});

test('provider가 예외를 던지거나 표시 도중 오류가 나도 복구된다', async () => {
  const thrower = setup({ provider: { isReady: () => true, show() { throw new Error('sdk'); } } });
  thrower.makeEligible();
  assert.equal(await outcomeOf(thrower.ads.showBetweenStages()), 'error');
  assert.equal(thrower.ads.state, 'idle');

  const s = setup();
  s.makeEligible();
  const p = s.ads.showBetweenStages();
  s.calls[0].onStart();
  s.calls[0].onFinish('error');
  assert.equal(await outcomeOf(p), 'error');
  assert.deepEqual(s.log, ['pause', 'resume']);
  assert.equal(s.store.data.ads.impressions, 0);
});

test('다음 판 더블 클릭: 요청은 하나만, 같은 결과를 공유', async () => {
  const s = setup();
  s.makeEligible();
  const p1 = s.ads.showBetweenStages();
  const p2 = s.ads.showBetweenStages();
  assert.equal(p1, p2);
  assert.equal(s.calls.length, 1);
  s.calls[0].onStart();
  s.calls[0].onStart();
  s.calls[0].onFinish('shown');
  s.calls[0].onFinish('shown');
  assert.equal(await outcomeOf(p1), 'shown');
  assert.deepEqual(s.log, ['pause', 'resume']);
  assert.equal(s.store.data.ads.impressions, 1);
});

test('응답 없는 요청은 타임아웃으로 넘기고, 늦은 콜백은 화면을 다시 움직이지 않는다', async () => {
  const s = setup();
  s.makeEligible();
  let resolved = 0;
  const p = s.ads.showBetweenStages();
  p.then(() => { resolved++; });
  s.t.advance(CFG.requestTimeoutMs);
  assert.equal(await outcomeOf(p), 'timeout');
  assert.equal(resolved, 1);
  // 끝나지 않은 요청이 있는 동안에는 새로 요청하지 않는다
  assert.equal(await outcomeOf(s.ads.showBetweenStages()), 'busy');
  assert.equal(s.calls.length, 1);
  // 늦게 광고가 실제로 뜨면 입력은 멈추되 결과(Promise)는 다시 통지되지 않는다
  s.calls[0].onStart();
  assert.deepEqual(s.log, ['pause']);
  s.calls[0].onFinish('shown');
  await Promise.resolve();
  assert.deepEqual(s.log, ['pause', 'resume']);
  assert.equal(resolved, 1);
  assert.equal(s.store.data.ads.impressions, 1);
  assert.equal(s.ads.state, 'idle');
});

test('늦은 실패 콜백도 한 번만 처리된다', async () => {
  const s = setup();
  s.makeEligible();
  const p = s.ads.showBetweenStages();
  s.t.advance(CFG.requestTimeoutMs);
  await p;
  s.calls[0].onFinish('no-fill');
  s.calls[0].onFinish('shown');
  s.calls[0].onStart();
  assert.deepEqual(s.log, []);
  assert.equal(s.store.data.ads.impressions, 0);
  assert.equal(s.ads.stats.failures, 1);
});

// ---------- 이동 연출 잠금 ----------
test('잠금: 종료 신호가 오면 한 번만 풀린다', () => {
  const t = fakeTimers();
  const lock = createTransitionLock(t);
  let done = 0;
  const release = lock.begin(320, () => { done++; });
  assert.equal(lock.locked, true);
  release();
  release();
  t.advance(1000);
  assert.equal(done, 1);
  assert.equal(lock.locked, false);
  assert.equal(t.count, 0);
});

test('잠금: 종료 신호가 누락돼도 fallback으로 풀린다', () => {
  const t = fakeTimers();
  const lock = createTransitionLock(t);
  let done = 0;
  lock.begin(320, () => { done++; });
  t.advance(319);
  assert.equal(lock.locked, true);
  t.advance(1);
  assert.equal(lock.locked, false);
  assert.equal(done, 1);
});

test('잠금: 취소하면 콜백 없이 풀리고 예전 신호는 무시된다', () => {
  const t = fakeTimers();
  const lock = createTransitionLock(t);
  let first = 0;
  let second = 0;
  const oldRelease = lock.begin(320, () => { first++; });
  lock.cancel();
  assert.equal(lock.locked, false);
  const release = lock.begin(320, () => { second++; });
  oldRelease(); // 이전 연출의 늦은 종료 신호
  assert.equal(lock.locked, true);
  release();
  t.advance(1000);
  assert.deepEqual([first, second], [0, 1]);
});
