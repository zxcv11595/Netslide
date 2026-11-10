// 홈: 이어하기 → 오늘의 도전 → 기록 한 줄 → 스테이지(난이도 목록). 난이도를 누르면 스테이지 화면으로 들어간다.
import { CONFIG, GROUP_LABEL } from '../config.js';
import {
  getRecord, isTutorialDone, nextTutorial, getCurrent,
} from '../game/progress.js';
import { dailyStageFor, kstDateString, dailyStreak, addDays } from '../game/daily.js';
import { el, hamsterFrame, starIcon } from './art.js';
import { icon, tabbar } from './common.js';
import { stageTitle } from './play.js';
import { toast } from './toast.js';

export const TIERS = ['beginner', 'intermediate', 'advanced'];
const ISSUE_TEXT = {
  unavailable: '이 브라우저에서는 저장할 수 없어요. 창을 닫으면 기록이 사라져요.',
  'write-failed': '저장에 실패했어요. 지금부터의 기록은 창을 닫으면 사라질 수 있어요.',
  corrupt: '저장된 기록을 읽지 못해 새로 시작했어요.',
  newer: '더 새로운 버전의 기록이 있어 이 화면에서는 새로 시작했어요.',
};
const WEEK = ['월', '화', '수', '목', '금', '토', '일'];

export function totals(store, content) {
  const regular = TIERS.flatMap((g) => content.groups[g]);
  const recs = regular.map((s) => getRecord(store, content, s.id));
  return {
    count: regular.length,
    done: recs.filter((r) => r?.done).length,
    stars: recs.reduce((sum, r) => sum + (r?.stars ?? 0), 0),
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

  body.appendChild(el('div', { class: 'top-row' }, [
    el('button', { class: 'btn sq small', type: 'button', 'aria-label': '설정', onclick: () => ctx.go('settings') }, [icon('gear')]),
  ]));
  body.appendChild(el('div', { class: 'hero' }, [
    el('h1', { class: 'logo', 'aria-label': CONFIG.gameName }, CONFIG.logoLines.flatMap((line, i) => (i ? [el('br'), line] : [line]))),
    hamsterFrame({ cls: 'hero-ham breathe' }),
  ]));

  if (store.issue) body.appendChild(el('p', { class: 'notice warn', role: 'status', text: ISSUE_TEXT[store.issue] }));

  // 이어하기: 하던 판 → 입문 → 다음에 풀 판
  const cur = getCurrent(store, content);
  let target = null;
  if (cur) {
    target = { label: '이어하기', sub: stageTitle(cur.stage, cur.date), go: () => ctx.goPlay(cur.stage, { date: cur.date, history: cur.history }) };
  } else if (!tutorialDone) {
    const nt = nextTutorial(store, content);
    target = { label: nt.order === 1 ? '시작하기' : '이어하기', sub: stageTitle(nt), go: () => ctx.goPlay(nt) };
  } else {
    const order = [ctx.state.tab, ...TIERS.filter((g) => g !== ctx.state.tab)].filter((g) => TIERS.includes(g));
    for (const g of order) {
      const s = content.groups[g].find((x) => !rec(x)?.done);
      if (s) { target = { label: sum.done ? '이어하기' : '시작하기', sub: stageTitle(s), go: () => ctx.goPlay(s) }; break; }
    }
  }
  if (target) {
    body.appendChild(el('button', { class: 'go', type: 'button', onclick: target.go }, [target.label, icon('play')]));
    body.appendChild(el('p', { class: 'go-sub', text: target.sub }));
  }

  // 오늘의 도전: 이번 주(월~일) 기록
  if (tutorialDone && dailyStageFor(content, today)) {
    const [, m, d] = today.split('-').map(Number);
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
          el('b', { text: '오늘의 도전' }),
          streak > 0 ? el('span', { class: 'streak', text: `${streak}일 연속` }) : null,
          el('small', { text: `${m}월 ${d}일 · 오늘은 모두 같은 판` }),
        ]),
        el('button', {
          class: 'mini-go', type: 'button', text: todayDone ? '다시' : '도전',
          onclick: () => ctx.goPlay(dailyStageFor(content, today), { date: today }),
        }),
      ]),
      week,
    ]));
  }

  body.appendChild(el('div', { class: 'stat3' }, [
    el('div', {}, [el('b', {}, [starIcon(true, 16), ` ${sum.stars}`]), '모은 별']),
    el('div', {}, [el('b', { text: String(sum.done) }), '끝낸 판']),
    el('div', {}, [el('b', { text: `${streak}일` }), '연속 도전']),
  ]));

  // 스테이지: 난이도 목록
  body.appendChild(el('div', { class: 'head' }, ['스테이지', el('span', { text: `${sum.done} / ${sum.count}` })]));
  if (!tutorialDone) body.appendChild(el('p', { class: 'hint-text', text: '짧은 입문 3판을 마치면 모든 난이도가 열려요.' }));
  for (const g of TIERS) {
    const list = content.groups[g];
    const done = list.filter((s) => rec(s)?.done).length;
    const stars = list.reduce((n, s) => n + (rec(s)?.stars ?? 0), 0);
    const isCur = tutorialDone && ctx.state.tab === g;
    body.appendChild(el('button', {
      class: `btn tier${isCur ? ' cur' : ''}${tutorialDone ? '' : ' lock'}`, type: 'button',
      'aria-label': `${GROUP_LABEL[g]}, ${tutorialDone ? `${done}/${list.length} 완료, 별 ${stars}개` : '잠김'}`,
      onclick: () => {
        if (tutorialDone) ctx.go('stages', { group: g });
        else toast('입문을 먼저 마쳐 주세요');
      },
    }, [
      el('b', { text: GROUP_LABEL[g] }),
      el('span', { class: 'meta' }, tutorialDone ? [`${done} / ${list.length} `, starIcon(true, 14), ` ${stars}`] : [icon('lock')]),
      tutorialDone ? el('span', { class: 'bar' }, [el('i', { style: `width:${(done / list.length) * 100}%` })]) : null,
    ]));
  }

  body.appendChild(el('p', {
    class: 'notice',
    text: '기록은 이 브라우저에만 저장돼요. 브라우저 데이터를 지우거나 기기를 바꾸면 기록이 사라질 수 있어요.',
  }));
  return { el: root, destroy() { root.remove(); } };
}
