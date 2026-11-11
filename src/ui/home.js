// 홈: 이어하기 → 오늘의 도전 → 기록 한 줄 → 스테이지(난이도 목록). 난이도를 누르면 스테이지 화면으로 들어간다.
import { t } from '../i18n.js';
import { CONFIG, GROUP_LABEL } from '../config.js';
import {
  getRecord, isTutorialDone, nextTutorial, getCurrent, hasFlag,
} from '../game/progress.js';
import { dailyStageFor, kstDateString, dailyStreak, addDays } from '../game/daily.js';
import { el, hamsterFrame, starIcon, flagIcon } from './art.js';
import { icon, tabbar } from './common.js';
import { stageTitle } from './play.js';
import { toast } from './toast.js';

export const TIERS = ['beginner', 'intermediate', 'advanced'];
const ISSUE_TEXT = {
  unavailable: t('이 브라우저에서는 저장할 수 없어요. 창을 닫으면 기록이 사라져요.'),
  'write-failed': t('저장에 실패했어요. 지금부터의 기록은 창을 닫으면 사라질 수 있어요.'),
  corrupt: t('저장된 기록을 읽지 못해 새로 시작했어요.'),
  newer: t('더 새로운 버전의 기록이 있어 이 화면에서는 새로 시작했어요.'),
};
const WEEK = [t('월'), t('화'), t('수'), t('목'), t('금'), t('토'), t('일')];

export function totals(store, content) {
  const regular = TIERS.flatMap((g) => content.groups[g]);
  const recs = regular.map((s) => getRecord(store, content, s.id));
  return {
    count: regular.length,
    done: recs.filter((r) => r?.done).length,
    stars: recs.reduce((sum, r) => sum + (r?.stars ?? 0), 0),
    flags: regular.filter((s, i) => hasFlag(s, recs[i])).length, // 최단 경로로 성공한 판
  };
}

// ctx: { store, content, go(name, params), goPlay(stage, opts), state }
export function createHomeScreen(ctx) {
  const { store, content } = ctx;
  const tutorialDone = isTutorialDone(store, content);
  const rec = (s) => getRecord(store, content, s.id);
  const dailyMap = store.content(content.version).daily;
  const today = kstDateString();
  const sum = totals(store, content);
  const streak = dailyStreak(dailyMap, today);

  const body = el('div', { class: 'pad' });
  const root = el('section', { class: 'screen home' }, [body, tabbar(ctx, 'home')]);

  body.appendChild(el('div', { class: 'hero' }, [
    el('h1', { class: 'logo', 'aria-label': CONFIG.gameName }, CONFIG.logoLines.flatMap((line, i) => (i ? [el('br'), line] : [line]))),
    el('p', { class: 'logo-sub', text: CONFIG.tagline }),
    hamsterFrame({ cls: 'hero-ham breathe success', withSuccess: true }),
  ]));

  if (store.issue) body.appendChild(el('p', { class: 'notice warn', role: 'status', text: ISSUE_TEXT[store.issue] }));

  // 이어하기: 하던 판 → 입문 → 다음에 풀 판
  const cur = getCurrent(store, content);
  let target = null;
  if (cur) {
    target = { label: t('이어하기'), sub: stageTitle(cur.stage, cur.date), go: () => ctx.goPlay(cur.stage, { date: cur.date, history: cur.history }) };
  } else if (!tutorialDone) {
    const nt = nextTutorial(store, content);
    target = { label: nt.order === 1 ? t('시작하기') : t('이어하기'), sub: stageTitle(nt), go: () => ctx.goPlay(nt) };
  } else {
    const order = [ctx.state.tab, ...TIERS.filter((g) => g !== ctx.state.tab)].filter((g) => TIERS.includes(g));
    for (const g of order) {
      const s = content.groups[g].find((x) => !rec(x)?.done);
      if (s) { target = { label: sum.done ? t('이어하기') : t('시작하기'), sub: stageTitle(s), go: () => ctx.goPlay(s) }; break; }
    }
  }
  if (target) {
    body.appendChild(el('button', { class: 'go go-tagged', type: 'button', onclick: target.go }, [
      el('span', { class: 'go-main' }, [target.label, icon('play')]),
      el('span', { class: 'go-tag', text: target.sub }),
    ]));
  }

  // 오늘의 도전: 이번 주(월~일) 기록
  if (tutorialDone && dailyStageFor(content, today)) {
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 월=0
    const week = el('div', { class: 'week' });
    WEEK.forEach((name, i) => {
      const date = addDays(today, i - dow);
      const r = dailyMap[date];
      const cls = r ? 'done' : i === dow ? 'today' : '';
      week.appendChild(el('div', { class: `day ${cls}`.trim() }, [name, el('i', { text: r ? `★${r.stars}` : String(Number(date.slice(8))) })]));
    });
    const todayDone = !!dailyMap[today];
    body.appendChild(el('section', { class: 'card daily' }, [
      el('div', { class: 'daily-top' }, [
        el('div', {}, [
          el('b', { text: t('오늘의 도전@tab') }),
          streak > 0 ? el('span', { class: 'streak', text: t('{n}일 연속', { n: streak }) }) : null,
        ]),
        el('button', {
          class: 'mini-go', type: 'button', text: todayDone ? t('다시') : t('도전'),
          onclick: () => ctx.goPlay(dailyStageFor(content, today), { date: today }),
        }),
      ]),
      week,
    ]));
  }

  body.appendChild(el('div', { class: 'stat3' }, [
    el('div', {}, [el('b', {}, [starIcon(true, 16), ` ${sum.stars}`]), t('모은 별')]),
    el('div', {}, [el('b', {}, [flagIcon(17), ` ${sum.flags}`]), t('모은 깃발')]),
    el('div', {}, [el('b', { text: t('{n}일', { n: streak }) }), t('연속 도전')]),
  ]));

  // 스테이지: 난이도 목록
  body.appendChild(el('div', { class: 'head' }, [t('스테이지'), el('span', { text: `${sum.done} / ${sum.count}` })]));
  for (const g of ['tutorial', ...TIERS]) {
    const list = content.groups[g];
    const open = g === 'tutorial' || tutorialDone; // 입문을 끝내기 전에는 입문만 누를 수 있다
    const done = list.filter((s) => rec(s)?.done).length;
    const stars = list.reduce((n, s) => n + (rec(s)?.stars ?? 0), 0);
    const flags = list.filter((s) => hasFlag(s, rec(s))).length;
    const isCur = tutorialDone ? ctx.state.tab === g : g === 'tutorial';
    body.appendChild(el('button', {
      class: `btn tier${isCur ? ' cur' : ''}${open ? '' : ' lock'}`, type: 'button',
      'aria-label': `${GROUP_LABEL[g]}, ${open ? t('{done}/{total} 완료, 깃발 {flags}개, 별 {stars}개', { done, total: list.length, flags, stars }) : t('잠김')}`,
      disabled: !open, // 잠긴 난이도는 누를 수 없다(알림 없음)
      onclick: () => { if (open) ctx.go('stages', { group: g }); },
    }, [
      el('b', { text: GROUP_LABEL[g] }),
      open ? el('span', { class: 'meta tier-progress' }, [
        el('span', { class: 'tier-marks' }, [ // 깃발이 왼쪽, 별이 오른쪽. 한 줄에 나란히
          el('span', { class: 'tier-stars tier-flags' }, [flagIcon(14), String(flags)]),
          el('span', { class: 'tier-stars' }, [starIcon(true, 14), String(stars)]),
        ]),
        el('span', { text: `${done} / ${list.length}` }),
      ]) : el('span', { class: 'meta' }, [icon('lock')]),
      open ? el('span', { class: 'bar' }, [el('i', { style: `width:${(done / list.length) * 100}%` })]) : null,
    ]));
  }
  // 나중에 추가할 난이도 자리
  body.appendChild(el('div', { class: 'ghost tier-soon' }, [el('b', { text: t('전문가') }), el('span', { text: t('준비 중') })]));

  return { el: root, destroy() { root.remove(); } };
}
