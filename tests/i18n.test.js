// 언어: 화면 문구가 모두 번역 함수를 거치고, 영어 사전에 빠진 문구가 없는지 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { t, getLang, translatedKeys } from '../src/i18n.js';

const FILES = ['src/config.js', 'src/main.js', 'src/game/links.js', 'src/game/stats.js',
  ...readdirSync('src/ui').filter((f) => f.endsWith('.js')).map((f) => `src/ui/${f}`)];

// t('…') 호출의 문구를 모두 뽑는다(closest('…') 같은 다른 함수는 제외)
const T_CALL = /(?<![\w.$])t\('((?:[^'\\]|\\.)*)'/g;
// 줄 끝 주석을 뗀다(문자열 안의 // 는 이 프로젝트 문구에 없다)
const noComment = (line) => line.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');

test('Node에서는 한국어가 기본이고, 자리 표시(@)와 {이름}을 처리한다', () => {
  assert.equal(getLang(), 'ko');
  assert.equal(t('번@ring'), '번');
  assert.equal(t('{n}번 남았어요', { n: 3 }), '3번 남았어요');
  assert.equal(t('사전에 없는 문구'), '사전에 없는 문구');
});

test('코드에서 쓰는 문구는 모두 영어 사전에 있다', () => {
  const dict = new Set(translatedKeys());
  const missing = [];
  for (const f of FILES) {
    for (const m of readFileSync(f, 'utf8').matchAll(T_CALL)) {
      const key = m[1].replace(/\\'/g, "'");
      if (!dict.has(key)) missing.push(`${f}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('한글이 들어간 문구는 번역 함수 밖에 남아 있지 않다', () => {
  const loose = [];
  for (const f of FILES) {
    let inBlock = false;
    readFileSync(f, 'utf8').split(/\r?\n/).forEach((raw, i) => {
      let line = raw;
      if (inBlock) { if (line.includes('*/')) { inBlock = false; line = line.slice(line.indexOf('*/') + 2); } else return; }
      if (line.includes('/*') && !line.includes('*/')) { inBlock = true; line = line.slice(0, line.indexOf('/*')); }
      const rest = noComment(line).replace(T_CALL, '');
      if (/[가-힣]/.test(rest)) loose.push(`${f}:${i + 1}: ${rest.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(loose, []);
});
