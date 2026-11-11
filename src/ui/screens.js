// 탭과 목록 화면들: 스테이지 목록, 오늘의 도전(달력), 상점, 내 정보(기록·성취), 설정
import { t, getLang, saveLang, LANGS } from '../i18n.js';
import { CONFIG, GROUP_LABEL } from '../config.js';
import { getRecord, isUnlocked, isTutorialDone, hasFlag } from '../game/progress.js';
import { dailyStageFor, kstDateString, dailyStreak } from '../game/daily.js';
import { el, starIcon, starsRow, flagIcon } from './art.js';
import { groupStats, dailyStats, achievementSections } from '../game/stats.js';
import { icon, tabbar, headRow, pad2 } from './common.js';
import { TIERS } from './home.js';
import { toast } from './toast.js';
import { soundSwitches } from './settingRows.js';

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
  const flags = list.filter((s) => hasFlag(s, rec(s))).length;
  const grid = el('div', { class: 'grid4' });
  for (const s of list) {
    const r = rec(s);
    const open = isUnlocked(store, content, s);
    const state = r?.done ? 'done' : open ? 'cur' : 'lock';
    grid.appendChild(el('button', {
      class: `lv ${state}`, type: 'button',
      'aria-label': `${GROUP_LABEL[g]} ${s.order}${r?.done ? `${t(', 별 {n}개', { n: r.stars })}${hasFlag(s, r) ? t(', 최단 경로 깃발') : ''}` : open ? '' : t(', 잠김')}`,
      disabled: !open, // 잠긴 판은 누를 수 없다(알림 없음)
      onclick: () => { if (open) ctx.goPlay(s); },
    }, [
      pad2(s.order), r?.done ? starsRow(r.stars, 3, 12) : open ? null : icon('lock', 'lk'),
      hasFlag(s, r) ? el('span', { class: 'lv-flag' }, [flagIcon(22)]) : null, // 최단 경로로 성공한 판: 왼쪽 위 모서리에 깃발
    ]));
  }
  return shell(ctx, 'home', GROUP_LABEL[g], () => ctx.go('home'), [
    el('div', { class: 'head' }, [t('스테이지'), el('span', { class: 'tier-progress' }, [
      el('span', { class: 'tier-marks' }, [
        el('span', { class: 'tier-stars tier-flags' }, [flagIcon(14), String(flags)]),
        el('span', { class: 'tier-stars' }, [starIcon(true, 14), String(stars)]),
      ]),
      el('span', { text: `${done} / ${list.length}` }),
    ])]),
    grid,
  ]);
}

// ----- 오늘의 도전: 이번 달 달력 -----
// 실제 달력처럼: 요일 줄, 날짜 숫자, 이전/다음 달. 푼 날은 별, 오늘은 주황 동그라미.
export function createDailyScreen(ctx, { ym = null } = {}) {
  const { store, content } = ctx;
  const today = kstDateString();
  const dailyMap = store.content(content.version).daily;
  const streak = dailyStreak(dailyMap, today);
  const thisYm = today.slice(0, 7);
  const viewYm = /^\d{4}-\d{2}$/.test(ym || '') && ym <= thisYm ? ym : thisYm;
  const [y, m] = viewYm.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ready = isTutorialDone(store, content); // 입문을 끝내야 열린다(잠긴 날짜와 버튼은 누를 수 없게만 한다)
  const shift = (n) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`; };
  // 여섯 달 전까지만 넘겨 볼 수 있다
  const [ty, tm] = thisYm.split('-').map(Number);
  const canPrev = (ty - y) * 12 + (tm - m) < 6;

  const grid = el('div', { class: 'cal-grid' });
  [t('일'), t('월'), t('화'), t('수'), t('목'), t('금'), t('토')].forEach((w, i) => grid.appendChild(el('div', { class: `dow${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`, text: w })));
  for (let i = 0; i < first.getUTCDay(); i++) grid.appendChild(el('div'));
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${y}-${pad2(m)}-${pad2(d)}`;
    const r = dailyMap[date];
    const future = date > today;
    const dow = (first.getUTCDay() + d - 1) % 7;
    const cls = [date === today ? 'today' : future ? 'future' : r ? 'done' : 'miss', dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''].join(' ').trim();
    grid.appendChild(el('button', {
      class: `cal-day ${cls}`, type: 'button', disabled: future || !ready,
      'aria-label': `${t('{m}월 {d}일', { m, d })}${r ? t(', 별 {n}개', { n: r.stars }) : ''}${date === today ? t(', 오늘') : ''}`,
      onclick: () => { const st = dailyStageFor(content, date); if (st) ctx.goPlay(st, { date }); },
    }, [el('b', { text: String(d) }), el('small', { text: r ? '★'.repeat(r.stars) : '' })]));
  }
  const todayStage = dailyStageFor(content, today);
  return shell(ctx, 'daily', t('오늘의 도전'), null, [
    el('div', { class: 'cal-nav' }, [
      el('button', { class: 'btn sq small', type: 'button', 'aria-label': t('이전 달'), disabled: !canPrev, onclick: () => ctx.go('daily', { ym: shift(-1) }) }, [icon('back')]),
      el('b', { text: getLang() === 'en' ? new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : t('{y}년 {m}월', { y, m }) }),
      el('button', { class: 'btn sq small flip', type: 'button', 'aria-label': t('다음 달'), disabled: viewYm >= thisYm, onclick: () => ctx.go('daily', { ym: shift(1) }) }, [icon('back')]),
    ]),
    el('div', { class: 'card cal' }, [grid]),
    el('p', { class: 'cal-streak', text: streak > 0 ? t('{n}일 연속 도전 중', { n: streak }) : '' }),
    todayStage
      ? el('button', { class: 'go', type: 'button', disabled: !ready, onclick: () => { if (ready) ctx.goPlay(todayStage, { date: today }); } }, [dailyMap[today] ? t('다시 도전') : t('도전하기'), icon(ready ? 'play' : 'lock')])
      : null,
    el('div', { class: 'notice-lines' }, [
      el('p', { text: t('매일 새로운 퍼즐을 모두 함께 풀어요.') }),
      el('p', { text: t('지난 날짜를 누르면 그날의 퍼즐을 풀 수 있어요.') }),
      el('p', { text: t('오늘의 퍼즐을 처음 성공하면 힌트 1개를 받아요.') }),
    ]),
  ]);
}

// ----- 상점: 지금은 힌트 안내만. 결제 상품은 앱에서 추가한다 -----
// 상점 화면은 src/ui/shop.js에 있다.

// ----- 내 정보: 프로필 + 스테이지·오늘의 도전·성취 기록 (설정은 오른쪽 위 톱니) -----
function statIcon(name) {
  return el('img', { class: 'mi-pic', src: `assets/stat/${name}.webp`, alt: '', draggable: 'false', decoding: 'async' });
}
const statRow = (iconName, label, value, unit = '') => el('div', { class: 'card mi-row' }, [
  statIcon(iconName), el('span', { class: 'l', text: label }),
  el('span', { class: 'v' }, [String(value), unit ? el('small', { text: unit }) : null]),
]);
// 성취 그림: public/assets/ach/<성취 id>.webp. 없으면 햄스터 그림으로 대신한다.
function achIcon(it) {
  const fallback = it.done ? CONFIG.assets.hamsterSuccess : CONFIG.assets.hamsterIdle;
  const img = el('img', { src: `assets/ach/${it.icon || it.id}.webp`, alt: '', draggable: 'false', loading: 'lazy', decoding: 'async' });
  img.addEventListener('error', () => { img.src = fallback; }, { once: true });
  return img;
}
const PROFILE_GROUPS = [['tutorial', t('입문')], ['beginner', t('초급')], ['intermediate', t('중급')], ['advanced', t('고급')]];

export function createProfileScreen(ctx) {
  const { store, content, state } = ctx;
  const today = kstDateString();
  state.profileTab = state.profileTab || 'stage';
  state.profileGroup = state.profileGroup || 'beginner';
  const body = el('div', { class: 'mi-body' });
  const tabsEl = el('div', { class: 'mi-tabs', role: 'tablist' });
  const render = () => {
    tabsEl.replaceChildren(...[['stage', t('스테이지')], ['daily', t('오늘의 도전@tab')], ['ach', t('성취')]].map(([key, label]) => el('button', {
      class: `mi-tab${state.profileTab === key ? ' on' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(state.profileTab === key),
      onclick: () => { state.profileTab = key; render(); },
    }, [label])));
    body.replaceChildren(...(state.profileTab === 'stage' ? stageBody() : state.profileTab === 'daily' ? dailyBody() : achBody()));
  };
  function stageBody() {
    const g = state.profileGroup;
    const s = groupStats(store, content, g);
    const chips = el('div', { class: 'mi-chips' }, [
      ...PROFILE_GROUPS.map(([key, label]) => el('button', {
        class: `mi-chip${g === key ? ' on' : ''}`, type: 'button', onclick: () => { state.profileGroup = key; render(); },
      }, [label])),
      el('span', { class: 'mi-chip off', 'aria-disabled': 'true', text: t('전문가') }),
    ]);
    return [
      chips,
      statRow('stageDone', t('성공한 판'), s.done, ` / ${s.total}`),
      statRow('stageThree', t('별 3개를 받은 판'), s.three),
      statRow('stageMissed', t('놓친 별'), s.missed),
      statRow('stageStars', t('모은 별'), s.stars, ` / ${s.maxStars}`),
      statRow('stageShortest', t('최단 경로로 성공한 판'), s.shortest),
    ];
  }
  function dailyBody() {
    const d = dailyStats(store.content(content.version).daily, today);
    return [
      statRow('dailyMonth', t('이번 달 도전 횟수'), d.thisMonth, t('번@count')),
      statRow('dailyStreak', t('현재 연속 도전 횟수'), d.streak, t('번@count')),
      statRow('dailyBest', t('최고 연속 도전 횟수'), d.bestStreak, t('번@count')),
      statRow('dailyThree', t('별 3개를 받은 날'), d.three, t('일@count')),
      statRow('dailyTotal', t('현재까지 도전한 날'), d.total, t('일@count')),
    ];
  }
  function achBody() {
    const out = [];
    for (const sec of achievementSections(store, content, today)) {
      out.push(el('div', { class: 'mi-sec' }, [sec.title, el('span', { text: `${sec.done} / ${sec.items.length}` })]));
      out.push(el('div', { class: 'mi-list' }, sec.items.map((it) => el('div', { class: `card mi-arow${it.done ? '' : ' lock'}` }, [
        achIcon(it),
        el('div', { class: 't' }, [
          el('div', { class: 'top' }, [el('b', { text: it.title }), el('span', { class: 'v', text: `${it.now} / ${it.max}` })]),
          el('div', { class: 'bar2' }, [el('i', { style: `width:${Math.round((it.now / it.max) * 100)}%` })]),
        ]),
      ]))));
    }
    return out;
  }
  render();
  const gear = el('button', { class: 'mi-gear', type: 'button', 'aria-label': t('설정'), onclick: () => ctx.go('settings') }, [icon('gear')]);
  const pad = el('div', { class: 'pad' }, [
    headRow(t('내 정보'), null, gear), // 다른 탭 화면과 같은 머리줄: 가운데 제목 + 구분선, 오른쪽에 설정
    el('div', { class: 'hr' }),
    el('div', { class: 'mi-profile' }, [
      el('div', { class: 'mi-ava' }, [el('img', { src: CONFIG.assets.hamsterSuccess, alt: '', draggable: 'false' })]),
      el('div', { class: 'mi-name' }, [el('b', { text: t('손님 햄스터') }), el('small', { text: t('이 폰에만 기록이 저장돼요') }), el('span', { class: 'mi-login', text: t('로그인하고 기록 저장하기 · 준비 중') })]),
    ]),
    tabsEl,
    body,
  ]);
  const root = el('section', { class: 'screen' }, [pad, tabbar(ctx, 'profile')]);
  return { el: root, destroy() { root.remove(); } };
}

// 언어를 고르는 창. 고르면 저장하고 화면을 새로 불러온다.
function openLangDialog() {
  const close = () => overlay.remove();
  const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) close(); } }, [
    el('div', { class: 'modal-card lang-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('언어') }, [
      el('h2', { text: t('언어') }),
      ...LANGS.map(([code, name]) => el('button', {
        class: `${getLang() === code ? 'go' : 'btn'} lang-choice`, type: 'button', lang: code, 'aria-pressed': String(getLang() === code), text: name,
        onclick: () => { if (getLang() === code) { close(); return; } saveLang(code); location.reload(); },
      })),
      el('button', { class: 'link-btn', type: 'button', text: t('닫기'), onclick: close }),
    ]),
  ]);
  document.body.appendChild(overlay);
}

// ----- 설정: 지금 실제로 동작하는 항목만 둔다 -----
export function createSettingsScreen(ctx) {
  const { store } = ctx;
  return shell(ctx, 'profile', t('설정'), () => ctx.go('profile'), [
    el('div', { class: 'card set' }, [
      ...soundSwitches(store),
    ]),
    el('div', { class: 'card set' }, [
      // 언어: 바꾸면 저장하고 화면을 새로 불러온다(문구 대부분이 처음 불러올 때 정해진다)
      el('button', { class: 'r link', type: 'button', onclick: openLangDialog }, [t('언어'), el('span', { text: LANGS.find(([code]) => code === getLang())[1] })]),
    ]),
    el('div', { class: 'card set' }, [
      // 문의하기: 주소(CONFIG.contactEmail)를 정하기 전에는 준비 중으로 보여 준다
      CONFIG.contactEmail
        ? el('a', { class: 'r link', href: `mailto:${CONFIG.contactEmail}` }, [t('문의하기'), el('span', { text: CONFIG.contactEmail })])
        : el('div', { class: 'r soon' }, [t('문의하기'), el('span', { text: t('준비 중') })]),
      el('button', { class: 'r link', type: 'button', onclick: () => ctx.go('privacy') }, [t('개인정보 처리방침'), icon('play')]),
      el('div', { class: 'r' }, [t('버전'), el('span', { text: CONFIG.version })]),
    ]),
  ]);
}

// ----- 개인정보 처리방침(게임 안). 스토어에 적는 공개 주소용은 public/privacy.html 이며 내용을 같게 유지한다 -----
export function createPrivacyScreen(ctx) {
  const sec = (title, lines) => el('div', { class: 'policy-sec' }, [el('h2', { text: title }), ...lines.map((t) => el('p', { text: t }))]);
  return shell(ctx, 'profile', t('개인정보 처리방침'), () => ctx.go('settings'), [
    el('p', { class: 'notice', text: t('{name} · 시행일 2026년 11월 11일', { name: CONFIG.fullName }) }),
    el('div', { class: 'card policy' }, [
      sec(t('수집하는 개인정보'), [t('이 게임은 이름, 이메일, 위치, 기기 식별 정보 등 어떤 개인정보도 수집하지 않습니다. 회원 가입이나 로그인도 없습니다.')]),
      sec(t('기기에 저장하는 정보'), [
        t('게임을 이어서 할 수 있도록 끝낸 판과 별, 하던 판의 진행 상태, 오늘의 도전 기록, 남은 힌트 수, 소리·진동 설정을 이 기기에만 저장합니다.'),
        t('이 정보는 기기 밖으로 전송되지 않으며, 브라우저 데이터를 지우거나 앱을 삭제하면 함께 지워집니다.'),
      ]),
      sec(t('외부 전송'), [t('게임 기록을 외부 서버나 제3자에게 보내지 않습니다. 광고, 분석 도구, 결제 기능을 사용하지 않습니다.')]),
      sec(t('방침의 변경'), [t('광고, 결제, 순위표처럼 정보를 다루는 기능이 추가되면 이 방침을 먼저 고치고 시행일과 함께 알립니다.')]),
      sec(t('문의'), [t('앱 스토어 등록 정보에 적힌 개발자 연락처로 보내 주세요.')]),
    ]),
  ]);
}
