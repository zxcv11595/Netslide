// 최단 경로 증명 뒤 판 순서 다시 맞추기 (2026-11-12)
// 증명으로 최단 경로가 짧아진 판이 생기면 "난이도 안에서 뒤로 갈수록 최단 경로가 늘어난다"가 깨진다.
// 초급·중급·고급 각각을 (최단 경로 → 도토리 수 → 지금 순서)로 다시 줄 세우고 판 번호(B01, M01, A01 …)를 새로 매긴다.
// 판 자료·해답 자료·힌트 자료·보고서의 번호를 함께 바꾼다. 오늘의 도전은 날짜 순서라 그대로 둔다.
// 공개한 판의 번호를 바꾸면 기록이 엉키므로, 공개 전(또는 콘텐츠 버전을 올릴 때)에만 쓴다.
// 쓰기: node tools/reorder.js [--dry]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const P = (f) => resolve(ROOT, f);
const files = { stages: 'src/data/stages.json', sols: 'tools/out/solutions.json', hints: 'src/data/hints.json' };
const text = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, readFileSync(P(f), 'utf8')]));
const data = Object.fromEntries(Object.entries(text).map(([k, t]) => [k, JSON.parse(t)]));
const fmt = (obj, t) => {
  for (const ind of [2, 1, 0]) {
    if (JSON.stringify(JSON.parse(t), null, ind || undefined) + (t.endsWith('\n') ? '\n' : '') === t) return JSON.stringify(obj, null, ind || undefined) + (t.endsWith('\n') ? '\n' : '');
  }
  throw new Error('파일 모양을 알 수 없음');
};
const acorns = (s) => s.tiles.join(' ').split(' ').filter((x) => x[0] === 'g').length;
const PREFIX = { beginner: 'B', intermediate: 'M', advanced: 'A' };

const rename = new Map(); // 옛 번호 → 새 번호
for (const [group, pre] of Object.entries(PREFIX)) {
  const list = data.stages.stages.filter((s) => s.group === group);
  const sorted = list.slice().sort((a, b) => a.shortest - b.shortest || acorns(a) - acorns(b) || a.order - b.order);
  sorted.forEach((s, i) => {
    const id = `${pre}${String(i + 1).padStart(2, '0')}`;
    if (id !== s.id) rename.set(s.id, id);
    s.order = i + 1;
  });
  // 판 자료 안의 순서도 새 순서로
  const others = data.stages.stages.filter((s) => s.group !== group);
  const firstIdx = data.stages.stages.findIndex((s) => s.group === group);
  const before = others.slice(0, firstIdx);
  const after = others.slice(firstIdx);
  data.stages.stages = [...before, ...sorted, ...after];
}
for (const s of data.stages.stages) if (rename.has(s.id)) s.id = rename.get(s.id);
const remap = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [rename.get(k) || k, v]));
data.sols.solutions = remap(data.sols.solutions);
data.hints.hints = remap(data.hints.hints);
// 해답·힌트 자료의 키 순서도 판 순서대로
const order = [...data.stages.stages, ...data.stages.daily].map((s) => s.id);
const sortKeys = (obj) => Object.fromEntries(order.filter((id) => id in obj).map((id) => [id, obj[id]]));
data.sols.solutions = sortKeys(data.sols.solutions);
data.hints.hints = sortKeys(data.hints.hints);

// 보고서: 표 줄의 번호·순서를 바꾸고 판 순서대로 다시 놓는다
let report = readFileSync(P('docs/STAGE_REPORT.md'), 'utf8');
const lines = report.split('\n');
const rowOf = new Map();
const rowIdx = [];
lines.forEach((l, i) => { const m = /^\| ([TBMAD]\d+) \|/.exec(l); if (m) { rowOf.set(m[1], l); rowIdx.push(i); } });
const newRows = order.map((id) => {
  const old = [...rename.entries()].find(([, v]) => v === id)?.[0] || id;
  const c = rowOf.get(old).split('|');
  c[1] = ` ${id} `;
  const st = [...data.stages.stages, ...data.stages.daily].find((s) => s.id === id);
  c[3] = ` ${st.order} `;
  return c.join('|');
});
rowIdx.forEach((li, k) => { lines[li] = newRows[k]; });
report = lines.join('\n');

const moved = [...rename.entries()].map(([a, b]) => `${a}→${b}`);
console.log(`번호가 바뀐 판 ${moved.length}개${moved.length ? `: ${moved.join(' ')}` : ''}`);
for (const g of Object.keys(PREFIX)) console.log(g, data.stages.stages.filter((s) => s.group === g).map((s) => s.shortest).join(','));
if (!DRY) {
  for (const k of Object.keys(files)) writeFileSync(P(files[k]), fmt(data[k], text[k]));
  writeFileSync(P('docs/STAGE_REPORT.md'), report);
}
