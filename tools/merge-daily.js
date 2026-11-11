// 나눠 만든 오늘의 도전(tools/out/daily-parts/part-*.json)을 1년 치 날짜에 맞춰 합친다 (2026-11-12)
//   평일(월~금)은 4×4, 토·일은 5×5. 같은 크기 안에서는 최단 경로 묶음(4×4: 5·6·7번, 5×5: 6·7·8번)을 돌아가며 놓아
//   어려운 날이 몰리지 않게 한다. 같은 모양(회전·뒤집기 포함)의 판은 한 번만 쓴다.
//   판 번호는 D001, D002 … (시작일 dailyEpoch부터 하루씩). 판 자료·해답 자료·힌트 자료·보고서의 오늘의 도전 부분을 바꾼다.
// 쓰기: node tools/merge-daily.js [--days 366] [--dry]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const DAYS = Number(args[args.indexOf('--days') + 1]) || 366;
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

// 몫 모으기(같은 모양은 하나만)
const seen = new Set();
const pools = { 4: new Map(), 5: new Map() }; // 크기 → 최단 수 → 판 목록
let dup = 0;
for (const f of readdirSync(P('tools/out/daily-parts')).filter((x) => /^part-\d+\.json$/.test(x)).sort()) {
  for (const it of JSON.parse(readFileSync(P(`tools/out/daily-parts/${f}`), 'utf8'))) {
    if (seen.has(it.form)) { dup++; continue; }
    seen.add(it.form);
    const m = pools[it.size];
    if (!m.has(it.shortest)) m.set(it.shortest, []);
    m.get(it.shortest).push(it);
  }
}
const counts = (size) => [...pools[size].entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}번 ${v.length}`).join(', ');
console.log(`같은 모양이라 뺀 판 ${dup}개 · 4×4: ${counts(4)} · 5×5: ${counts(5)}`);

// 날짜마다 고르기
const epoch = data.stages.dailyEpoch;
const turn = { 4: 0, 5: 0 };
const take = (size) => {
  const keys = [...pools[size].keys()].sort((a, b) => a - b);
  for (let k = 0; k < keys.length; k++) {
    const key = keys[(turn[size] + k) % keys.length];
    const list = pools[size].get(key);
    if (list.length) { turn[size] = (keys.indexOf(key) + 1) % keys.length; return list.shift(); }
  }
  return null;
};
const daily = [];
const sols = {};
const hints = {};
for (let i = 0; i < DAYS; i++) {
  const date = new Date(Date.parse(`${epoch}T00:00:00Z`) + i * 86400000);
  const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
  const it = take(weekend ? 5 : 4) || take(weekend ? 4 : 5);
  if (!it) throw new Error(`판이 모자람: ${i + 1}일째`);
  const id = `D${String(i + 1).padStart(3, '0')}`;
  daily.push({ id, group: 'daily', order: i + 1, size: it.size, tiles: it.tiles, shortest: it.shortest, star2: it.star2, star3: it.star3 });
  sols[id] = it.solution;
  hints[id] = it.solution.basic.moves;
}
const unproven = daily.filter((d) => !sols[d.id].basicProven).map((d) => d.id);
console.log(`오늘의 도전 ${daily.length}판 (4×4 ${daily.filter((d) => d.size === 4).length}, 5×5 ${daily.filter((d) => d.size === 5).length}), 미증명 ${unproven.length}판`);

// 자료 바꾸기: 예전 오늘의 도전(D로 시작) 항목을 빼고 새로 넣는다
data.stages.daily = daily;
const keep = (obj) => Object.fromEntries(Object.entries(obj).filter(([k]) => !/^D\d/.test(k)));
data.sols.solutions = { ...keep(data.sols.solutions), ...sols };
data.hints.hints = { ...keep(data.hints.hints), ...hints };

// 보고서: 오늘의 도전 줄을 새로 쓴다
const groupRow = (d) => {
  const s = sols[d.id];
  const tk = d.tiles.join(' ').split(' ');
  return `| ${d.id} | 오늘의 도전 | ${d.order} | ${d.size}×${d.size} | ${tk.filter((x) => x[0] === 'g').length} | 0 | 0 | ${s.basicProven ? s.basic.length : `${s.lowerBound} 이상 (발견 ${s.basic.length})`} | ${s.basicProven ? '예' : '아니오'} | ${d.star3} | ${d.star2} | ${s.states} |`;
};
const lines0 = readFileSync(P('docs/STAGE_REPORT.md'), 'utf8').split('\n');
const at = lines0.findIndex((l) => /^\| D\d+ \|/.test(l));
let report = lines0.filter((l) => !/^\| D\d+ \|/.test(l));
report.splice(at, 0, ...daily.map(groupRow)); // 예전 오늘의 도전 줄이 있던 자리에
report = report.join('\n').replace(/오늘의 도전 \d+개/, `오늘의 도전 ${daily.length}개(평일 4×4 · 토·일 5×5, ${epoch}부터 하루 한 판)`);

if (!DRY) {
  for (const k of Object.keys(files)) writeFileSync(P(files[k]), fmt(data[k], text[k]));
  writeFileSync(P('docs/STAGE_REPORT.md'), report);
}
if (unproven.length) console.log(`미증명: ${unproven.join(' ')} → node tools/prove.js --ids ... 로 증명한 뒤 node tools/apply-proofs.js`);
