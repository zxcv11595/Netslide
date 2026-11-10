// 홈(땅속 굴 디자인): 이어서 하기 + 난이도별 굴 카드(펼치면 판 목록) + 오늘의 판.
// 판 수가 늘어도 카드 안의 목록만 길어지므로 구조를 바꿀 필요가 없다. 대형 월드맵은 만들지 않는다.
import { CONFIG, GROUP_LABEL } from '../config.js';
import {
  getRecord, isTutorialDone, isUnlocked, nextTutorial, getCurrent,
} from '../game/progress.js';
import { dailyStageFor, kstDateString } from '../game/daily.js';
import { el, svg, hamsterFrame, starsRow, starIcon } from './art.js';
import { stageTitle } from './play.js';
import { toast } from './toast.js';

const GROUPS = ['beginner', 'intermediate', 'advanced'];
const GROUP_DESC = { beginner: '3×3 · 4×4', intermediate: '4×4 · 5×5', advanced: '깊게 섞인 4×4 · 5×5' };
const ISSUE_TEXT = {
  unavailable: '이 브라우저에서는 저장할 수 없어요. 창을 닫으면 기록이 사라져요.',
  'write-failed': '저장에 실패했어요. 지금부터의 기록은 창을 닫으면 사라질 수 있어요.',
  corrupt: '저장된 기록을 읽지 못해 새로 시작했어요.',
  newer: '더 새로운 버전의 기록이 있어 이 화면에서는 새로 시작했어요.',
};

function lockGlyph() {
  return el('span', { class: 'lock-glyph', 'aria-hidden': 'true' }, [svg('svg', { viewBox: '0 0 24 24' }, [
    svg('path', { d: 'M7 11V8a5 5 0 0 1 10 0v3', fill: 'none', stroke: 'currentColor', 'stroke-width': 3, 'stroke-linecap': 'round' }),
    svg('rect', { x: 4, y: 11, width: 16, height: 11, rx: 3, fill: 'currentColor' }),
  ])]);
}

// ctx: { store, content, goPlay(stage, opts), state: { tab } }
export function createHomeScreen(ctx) {
  const { store, content } = ctx;
  const tutorialDone = isTutorialDone(store, content);
  const rec = (s) => getRecord(store, content, s.id);

  const regular = GROUPS.flatMap((g) => content.groups[g]);
  const totalStars = regular.reduce((sum, s) => sum + (rec(s)?.stars ?? 0), 0);

  const sky = el('div', { class: 'sky home-sky' }, [
    hamsterFrame({ cls: 'sky-ham breathe' }),
    el('div', { class: 'home-title' }, [
      el('h1', { text: CONFIG.gameName }),
      el('div', { class: 'total', role: 'img', 'aria-label': `모은 별 ${totalStars}개, 전체 ${regular.length * 3}개` }, [
        starIcon(true, 18), ` ${totalStars} / ${regular.length * 3}`,
      ]),
    ]),
  ]);
  const ground = el('div', { class: 'ground home-ground' });
  const root = el('section', { class: 'screen home' }, [sky, ground]);

  if (store.issue) ground.appendChild(el('p', { class: 'notice warn', role: 'status', text: ISSUE_TEXT[store.issue] }));

  // 맨 위 큰 버튼: 하던 판 → 입문 → 다음에 풀 판
  const cur = getCurrent(store, content);
  let target = null;
  if (cur) {
    target = { label: `이어서 하기 · ${stageTitle(cur.stage, cur.date)}`, go: () => ctx.goPlay(cur.stage, { date: cur.date, history: cur.history }) };
  } else if (!tutorialDone) {
    const nt = nextTutorial(store, content);
    target = { label: nt.order === 1 ? '입문 시작하기' : `입문 이어하기 · ${nt.order}/${content.groups.tutorial.length}`, go: () => ctx.goPlay(nt) };
  } else {
    const order = [ctx.state.tab, ...GROUPS.filter((g) => g !== ctx.state.tab)].filter((g) => GROUPS.includes(g));
    for (const g of order) {
      const s = content.groups[g].find((x) => !rec(x)?.done);
      if (s) { target = { label: `다음 판 · ${stageTitle(s)}`, go: () => ctx.goPlay(s) }; break; }
    }
  }
  if (target) ground.appendChild(el('button', { class: 'go big', type: 'button', text: target.label, onclick: target.go }));
  if (!tutorialDone) {
    ground.appendChild(el('p', { class: 'hint', text: '짧은 입문 3판을 마치면 초급·중급·고급 굴이 모두 열려요.' }));
  }

  // 오늘의 판: 날마다 하나, 누구에게나 같은 판(한국 시간 기준)
  if (tutorialDone) {
    const today = kstDateString();
    const daily = dailyStageFor(content, today);
    if (daily) {
      const d = store.content(content.version).daily[today];
      const [, m, day] = today.split('-').map(Number);
      const done = d && d.id === daily.id;
      ground.appendChild(el('button', {
        class: 'wood card daily', type: 'button', onclick: () => ctx.goPlay(daily, { date: today }),
      }, [
        el('span', { class: 'card-title', text: `오늘의 판 · ${m}월 ${day}일` }),
        done
          ? el('span', { class: 'card-sub' }, [starsRow(d.stars, 3, 16), ` ${d.moves}수 · 다시 도전`])
          : el('span', { class: 'card-sub', text: '날마다 바뀌는 한 판 · 모두 같은 판을 풀어요' }),
      ]));
    }
  }

  // 난이도별 굴 카드: 하나만 펼친다
  const cards = {};
  const openGroup = (group) => {
    ctx.state.tab = group;
    for (const g of GROUPS) cards[g].classList.toggle('open', g === group);
  };
  for (const g of GROUPS) {
    const list = content.groups[g];
    const done = list.filter((s) => rec(s)?.done).length;
    const stars = list.reduce((sum, s) => sum + (rec(s)?.stars ?? 0), 0);
    const grid = el('div', { class: 'stage-grid' });
    for (const s of list) {
      const r = rec(s);
      const open = isUnlocked(store, content, s);
      const isNext = open && !r?.done;
      grid.appendChild(el('button', {
        class: `stage${r?.done ? ' done' : ''}${isNext ? ' next' : ''}${open ? '' : ' locked'}`, type: 'button',
        'aria-label': `${GROUP_LABEL[g]} ${s.order}, ${s.size}×${s.size}${open ? (r?.done ? `, 별 ${r.stars}개` : '') : ', 잠김'}`,
        'aria-disabled': open ? null : 'true',
        onclick: () => {
          if (open) ctx.goPlay(s);
          else toast('앞 판을 끝내면 열려요');
        },
      }, [
        el('b', { text: String(s.order) }),
        open ? starsRow(r?.stars ?? 0, 3, 12) : lockGlyph(),
      ]));
    }
    const head = el('button', {
      class: 'burrow-head', type: 'button', 'aria-label': `${GROUP_LABEL[g]} 굴, ${done}/${list.length} 완료`,
      disabled: !tutorialDone,
      onclick: () => openGroup(cards[g].classList.contains('open') ? null : g),
    }, [
      el('span', { class: 'burrow-name' }, [el('b', { text: GROUP_LABEL[g] }), el('small', { text: GROUP_DESC[g] })]),
      el('span', { class: 'burrow-meta' }, [
        tutorialDone ? `${done}/${list.length}` : lockGlyph(),
        tutorialDone ? el('span', { class: 'burrow-stars' }, [starIcon(true, 14), ` ${stars}`]) : null,
      ]),
      el('span', { class: 'bar' }, [el('i', { style: `width:${(done / list.length) * 100}%` })]),
    ]);
    cards[g] = el('section', { class: `wood burrow${tutorialDone ? '' : ' closed'}` }, [head, grid]);
    ground.appendChild(cards[g]);
  }
  if (tutorialDone) openGroup(GROUPS.includes(ctx.state.tab) ? ctx.state.tab : 'beginner');

  // 입문 다시 보기
  if (tutorialDone) {
    const row = el('div', { class: 'replay' }, [el('span', { text: '입문 다시 보기' })]);
    content.groups.tutorial.forEach((s) => row.appendChild(el('button', {
      class: 'chip-btn', type: 'button', 'aria-label': `입문 ${s.order} 다시 하기`, text: String(s.order), onclick: () => ctx.goPlay(s),
    })));
    ground.appendChild(row);
  }

  ground.appendChild(el('p', {
    class: 'notice',
    text: '기록은 이 브라우저에만 저장돼요. 브라우저 데이터를 지우거나 기기를 바꾸면 기록이 사라질 수 있어요.',
  }));
  return { el: root, destroy() { root.remove(); } };
}
