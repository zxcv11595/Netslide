// 탭과 목록 화면들: 스테이지 목록, 오늘의 도전(달력), 상점, 기록, 설정
import { CONFIG, GROUP_LABEL } from '../config.js';
import { getRecord, isUnlocked, isTutorialDone } from '../game/progress.js';
import { dailyStageFor, kstDateString, dailyStreak } from '../game/daily.js';
import { el, starIcon, starsRow } from './art.js';
import { icon, tabbar, headRow, pad2 } from './common.js';
import { TIERS, totals } from './home.js';
import { toast } from './toast.js';

function shell(ctx, active, title, onBack, children) {
  const body = el('div', { class: 'pad' }, [headRow(title, onBack), el('div', { class: 'hr' }), ...children]);
  const root = el('section', { class: 'screen' }, [body, tabbar(ctx, active)]);
  return { el: root, destroy() { root.remove(); } };
}

// ----- 스테이지 목록: 난이도 하나의 판 번호 격자 -----
export function createStagesScreen(ctx, { group }) {
  const { store, content } = ctx;
  const g = group === 'tutorial' || TIERS.includes(group) ? group : 'beginner';
  if (g !== 'tutorial') ctx.state.tab = g;
  const list = content.groups[g];
  const rec = (s) => getRecord(store, content, s.id);
  const done = list.filter((s) => rec(s)?.done).length;
  const stars = list.reduce((n, s) => n + (rec(s)?.stars ?? 0), 0);
  const grid = el('div', { class: 'grid4' });
  for (const s of list) {
    const r = rec(s);
    const open = isUnlocked(store, content, s);
    const state = r?.done ? 'done' : open ? 'cur' : 'lock';
    grid.appendChild(el('button', {
      class: `lv ${state}`, type: 'button',
      'aria-label': `${GROUP_LABEL[g]} ${s.order}${r?.done ? `, 별 ${r.stars}개` : open ? '' : ', 잠김'}`,
      'aria-disabled': open ? null : 'true',
      onclick: () => {
        if (open) ctx.goPlay(s);
        else toast('앞 판을 끝내면 열려요');
      },
    }, [pad2(s.order), r?.done ? (s.tutorial ? el('small', { class: 'lv-done', text: '완료' }) : starsRow(r.stars, 3, 12)) : open ? null : icon('lock', 'lk')]));
  }
  return shell(ctx, 'home', GROUP_LABEL[g], () => ctx.go('home'), [
    el('div', { class: 'head' }, ['스테이지', el('span', {}, g === 'tutorial' ? [`${done} / ${list.length}`] : [`${done} / ${list.length} · `, starIcon(true, 14), ` ${stars}`])]),
    grid,
  ]);
}

// ----- 오늘의 도전: 이번 달 달력 -----
export function createDailyScreen(ctx) {
  const { store, content } = ctx;
  const today = kstDateString();
  const dailyMap = store.content(content.version).daily;
  const streak = dailyStreak(dailyMap, today);
  const [y, m] = today.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ready = isTutorialDone(store, content);

  const grid = el('div', { class: 'cal-grid' });
  for (const w of ['일', '월', '화', '수', '목', '금', '토']) grid.appendChild(el('div', { class: 'dow', text: w }));
  for (let i = 0; i < first.getUTCDay(); i++) grid.appendChild(el('div'));
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${y}-${pad2(m)}-${pad2(d)}`;
    const r = dailyMap[date];
    const future = date > today;
    const cls = date === today ? 'today' : future ? 'future' : r ? 'done' : 'miss';
    grid.appendChild(el('button', {
      class: `cal-day ${cls}`, type: 'button', disabled: future || !ready,
      'aria-label': `${m}월 ${d}일${r ? `, 별 ${r.stars}개` : ''}${date === today ? ', 오늘' : ''}`,
      onclick: () => { const st = dailyStageFor(content, date); if (st) ctx.goPlay(st, { date }); },
    }, [String(d), r ? el('small', { text: '★'.repeat(r.stars) }) : date === today ? el('small', { text: '오늘' }) : null]));
  }
  const todayStage = dailyStageFor(content, today);
  return shell(ctx, 'daily', '오늘의 도전', null, [
    el('div', { class: 'head' }, [`${y}년 ${m}월`, el('span', { text: streak > 0 ? `${streak}일 연속` : '' })]),
    el('div', { class: 'card cal' }, [grid]),
    ready && todayStage
      ? el('button', { class: 'go', type: 'button', onclick: () => ctx.goPlay(todayStage, { date: today }) }, [dailyMap[today] ? '다시 도전' : '도전하기', icon('play')])
      : el('p', { class: 'hint-text', text: '입문을 마치면 오늘의 도전이 열려요.' }),
    el('p', { class: 'notice center', text: '날마다 판이 하나씩 바뀌고, 그날은 모두 같은 판을 풀어요. 지난 날짜를 누르면 다시 풀 수 있어요. 끝낼 때마다 힌트를 1개 받아요.' }),
  ]);
}

// ----- 상점: 지금은 힌트 안내만. 결제 상품은 앱에서 추가한다 -----
export function createShopScreen(ctx) {
  const { store } = ctx;
  return shell(ctx, 'shop', '상점', null, [
    el('div', { class: 'card prod' }, [
      el('div', { class: 'prod-pic' }, [icon('bulb', 'bulb')]),
      el('div', { class: 'prod-txt' }, [
        el('b', { text: `힌트 ${store.data.hints}개` }),
        el('small', { text: '게임 화면 오른쪽 위 전구를 누르면 다음에 밀 줄을 알려 줘요.' }),
      ]),
    ]),
    el('div', { class: 'card prod' }, [
      el('div', { class: 'prod-pic' }, [icon('cal')]),
      el('div', { class: 'prod-txt' }, [
        el('b', { text: '힌트 받는 법' }),
        el('small', { text: '오늘의 도전을 끝내면 날마다 1개를 받아요.' }),
      ]),
      el('button', { class: 'mini-go', type: 'button', text: '도전', onclick: () => ctx.go('daily') }),
    ]),
    el('div', { class: 'head' }, ['준비 중', el('span', { text: '앱 출시 때 열려요' })]),
    ...[['noad', '광고 제거', '판 사이 광고와 아래 배너를 없애요.'], ['bulb', '힌트 5개', '힌트 묶음'], ['bulb', '힌트 20개', '힌트 큰 묶음']].map(([ic, name, desc]) => el('div', { class: 'ghost prod' }, [
      el('div', { class: 'prod-pic' }, [icon(ic)]),
      el('div', { class: 'prod-txt' }, [el('b', { text: name }), el('small', { text: desc })]),
      el('span', { class: 'soon', text: '준비 중' }),
    ])),
  ]);
}

// ----- 기록 -----
export function createRecordsScreen(ctx) {
  const { store, content } = ctx;
  const sum = totals(store, content);
  const dailyMap = store.content(content.version).daily;
  const rows = TIERS.map((g) => {
    const list = content.groups[g];
    const recs = list.map((s) => getRecord(store, content, s.id));
    const done = recs.filter((r) => r?.done).length;
    const stars = recs.reduce((n, r) => n + (r?.stars ?? 0), 0);
    const perfect = recs.filter((r) => r?.stars === 3).length;
    return el('div', { class: 'card rec' }, [
      el('b', { text: GROUP_LABEL[g] }),
      el('span', { class: 'meta' }, [`${done} / ${list.length} `, starIcon(true, 14), ` ${stars}`]),
      el('span', { class: 'bar' }, [el('i', { style: `width:${(done / list.length) * 100}%` })]),
      el('small', { text: `별 셋으로 끝낸 판 ${perfect}개` }),
    ]);
  });
  return shell(ctx, 'records', '기록', null, [
    el('div', { class: 'stat3' }, [
      el('div', {}, [el('b', {}, [starIcon(true, 16), ` ${sum.stars}`]), `모은 별 / ${sum.count * 3}`]),
      el('div', {}, [el('b', { text: String(sum.done) }), `끝낸 판 / ${sum.count}`]),
      el('div', {}, [el('b', { text: `${dailyStreak(dailyMap, kstDateString())}일` }), '연속 도전']),
    ]),
    ...rows,
    el('div', { class: 'card rec' }, [
      el('b', { text: '오늘의 도전' }),
      el('span', { class: 'meta', text: `${Object.keys(dailyMap).length}일 참여` }),
    ]),
  ]);
}

// ----- 설정: 지금 실제로 동작하는 항목만 둔다 -----
export function createSettingsScreen(ctx) {
  const { store } = ctx;
  const toggle = el('button', {
    class: `tg${store.data.settings.vibrate ? '' : ' off'}`, type: 'button', role: 'switch',
    'aria-checked': String(store.data.settings.vibrate), 'aria-label': '진동',
    onclick: () => {
      store.data.settings.vibrate = !store.data.settings.vibrate;
      store.save();
      toggle.classList.toggle('off', !store.data.settings.vibrate);
      toggle.setAttribute('aria-checked', String(store.data.settings.vibrate));
      if (store.data.settings.vibrate) navigator.vibrate?.(20);
    },
  });
  return shell(ctx, 'home', '설정', () => ctx.go('home'), [
    el('div', { class: 'card set' }, [
      el('div', { class: 'r soon' }, ['소리', el('span', { text: '준비 중' })]),
      el('div', { class: 'r' }, ['진동', toggle]),
      el('div', { class: 'r soon' }, ['언어', el('span', { text: '한국어 · 준비 중' })]),
    ]),
    el('div', { class: 'card set' }, [
      el('div', { class: 'r soon' }, ['구매 복원', el('span', { text: '준비 중' })]),
      el('div', { class: 'r soon' }, ['개인정보 처리방침', el('span', { text: '준비 중' })]),
      el('div', { class: 'r soon' }, ['문의하기', el('span', { text: '준비 중' })]),
      el('div', { class: 'r' }, ['버전', el('span', { text: CONFIG.version })]),
    ]),
  ]);
}
