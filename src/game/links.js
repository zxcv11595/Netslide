// 같은 판 공유 링크: ?v=<콘텐츠 버전>&s=<판 ID>[&d=<YYYY-MM-DD>]
// 링크는 판 ID로 배치를 재현한다. 날짜는 일일 기록을 남길지 판단하는 데만 쓴다.
import { dailyStageFor, isValidDateString } from './daily.js';

export function buildLink(baseUrl, { version, stageId, date = null }) {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set('v', String(version));
  url.searchParams.set('s', stageId);
  if (date) url.searchParams.set('d', date);
  return url.toString();
}

// contents: { [버전]: content } — 과거 버전 데이터를 남겨 두면 예전 링크도 같은 판으로 열린다.
// 반환:
//   { type: 'none' }
//   { type: 'stage', content, stage, date }  date는 그 날짜의 일일 판과 일치할 때만 채워진다
//   { type: 'error', reason: 'version' | 'id' | 'date' | 'future' }
export function parseLink(search, contents, todayStr) {
  const p = new URLSearchParams(search);
  if (!p.has('v') && !p.has('s') && !p.has('d')) return { type: 'none' };
  const v = p.get('v') || '';
  const s = p.get('s') || '';
  if (!/^\d{1,6}$/.test(v) || !Object.hasOwn(contents, v)) return { type: 'error', reason: 'version' };
  const content = contents[v];
  if (!/^[A-Z]\d{1,4}$/.test(s) || !content.byId.has(s)) return { type: 'error', reason: 'id' };
  const stage = content.byId.get(s);
  let date = null;
  if (p.has('d')) {
    const d = p.get('d');
    if (!isValidDateString(d) || stage.group !== 'daily') return { type: 'error', reason: 'date' };
    if (d > todayStr) return { type: 'error', reason: 'future' };
    if (dailyStageFor(content, d) === stage) date = d;
  }
  return { type: 'stage', content, stage, date };
}

export function shareText({ gameName, title, stars, moves, hasBonus, bonusDone, tutorial }) {
  const starLine = tutorial ? '완료' : `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
  const bonus = hasBonus ? ` · 보너스 ${bonusDone ? '달성' : '미달성'}` : '';
  return `${gameName} · ${title}\n${starLine} · ${moves}수${bonus}`;
}
