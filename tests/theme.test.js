import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, sanitize, createStore } from '../src/storage/storage.js';

test('삭제한 테마 선택 필드는 구버전 저장에서 무시하고 실제 설정은 유지한다', () => {
  assert.deepEqual(emptyData().settings, { vibrate: true, sound: true, music: true, tap: true });
  for (const gameTheme of ['light', 'brown', 'invalid']) {
    assert.deepEqual(sanitize({ v: 1, settings: { gameTheme, vibrate: false } }).settings, { vibrate: false, sound: true, music: true, tap: true });
  }
});

test('구버전 테마 필드 제거 후에도 기록·힌트·진동 설정을 보존한다', () => {
  const raw = emptyData();
  raw.settings = { vibrate: false, gameTheme: 'light' };
  raw.hints = 7;
  raw.content['1'] = { records: { B01: { done: true, stars: 2, best: 4, bestBonus: null } }, current: null, daily: {} };
  const map = new Map([['theme-test', JSON.stringify(raw)]]);
  const backend = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  const store = createStore({ key: 'theme-test', backend });
  store.save();
  const restored = createStore({ key: 'theme-test', backend });
  assert.deepEqual(restored.data.settings, { vibrate: false, sound: true, music: true, tap: true });
  assert.equal(restored.data.hints, 7);
  assert.equal(restored.content(1).records.B01.best, 4);
});
