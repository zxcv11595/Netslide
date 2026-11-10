// 홈: 입문 → 난이도 탭 + 스테이지 목록, 오늘의 도전. 대형 월드맵은 만들지 않는다.
import { CONFIG, GROUP_LABEL } from '../config.js';
import {
  getRecord, isTutorialDone, isUnlocked, nextTutorial, getCurrent,
} from '../game/progress.js';
import { dailyStageFor, kstDateString } from '../game/daily.js';
import { el, svg, hamsterFrame, starsRow } from './art.js';
import { stageTitle } from './play.js';
import { toast } from './toast.js';

const TABS = ['beginner', 'intermediate', 'advanced'];
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
  const root = el('section', { class: 'screen home' });

  root.appendChild(el('header', { class: 'home-head' }, [
    hamsterFrame({ cls: 'hero breathe' }),
    el('div', {}, [
      el('h1', { text: CONFIG.gameName }),
      el('p', { class: 'tagline', text: '줄을 밀어 간식 길을 이어 주세요' }),
    ]),
  ]));

  if (store.issue) root.appendChild(el('p', { class: 'notice warn', role: 'status', text: ISSUE_TEXT[store.issue] }));

  // 하던 판 이어하기
  const cur = getCurrent(store, content);
  if (cur) {
    root.appendChild(el('button', {
      class: 'card resume', type: 'button',
      onclick: () => ctx.goPlay(cur.stage, { date: cur.date, history: cur.history }),
    }, [
      el('span', { class: 'card-title', text: '하던 판 이어하기' }),
      el('span', { class: 'card-sub', text: `${stageTitle(cur.stage, cur.date)} · ${cur.history.length}수 진행` }),
    ]));
  }

  // 입문
  const tutorials = content.groups.tutorial;
  const tutDoneCount = tutorials.filter((s) => getRecord(store, content, s.id)?.done).length;
  const tutSection = el('section', { class: 'block' }, [
    el('h2', {}, ['입문 ', el('small', { text: `${tutDoneCount}/${tutorials.length}` })]),
  ]);
  if (!tutorialDone) {
    const nt = nextTutorial(store, content);
    tutSection.appendChild(el('button', {
      class: 'btn primary big', type: 'button',
      text: tutDoneCount ? '입문 이어하기' : '입문 시작하기',
      onclick: () => ctx.goPlay(nt),
    }));
    tutSection.appendChild(el('p', { class: 'hint', text: '짧은 입문 3판을 마치면 초급·중급·고급을 모두 고를 수 있어요.' }));
  } else {
    const row = el('div', { class: 'stage-grid compact' });
    tutorials.forEach((s) => row.appendChild(el('button', {
      class: 'stage done', type: 'button', 'aria-label': `입문 ${s.order} 다시 하기`, onclick: () => ctx.goPlay(s),
    }, [el('b', { text: String(s.order) }), el('span', { class: 'check', text: '완료' })])));
    tutSection.appendChild(row);
  }
  root.appendChild(tutSection);

  if (tutorialDone) {
    // 오늘의 도전 (한국 시간 날짜 기준)
    const today = kstDateString();
    const daily = dailyStageFor(content, today);
    if (daily) {
      const rec = store.content(content.version).daily[today];
      const [, m, d] = today.split('-').map(Number);
      root.appendChild(el('button', {
        class: 'card daily', type: 'button', onclick: () => ctx.goPlay(daily, { date: today }),
      }, [
        el('span', { class: 'card-title', text: `오늘의 도전 · ${m}월 ${d}일` }),
        rec && rec.id === daily.id
          ? el('span', { class: 'card-sub' }, [starsRow(rec.stars, 3, 16), ` ${rec.moves}수 · 다시 도전하기`])
          : el('span', { class: 'card-sub', text: `${daily.size}×${daily.size} · 오늘은 모두 같은 판이에요` }),
      ]));
    }

    // 난이도 탭 + 스테이지 목록
    const tabsEl = el('div', { class: 'tabs', role: 'tablist', 'aria-label': '난이도' });
    const grid = el('div', { class: 'stage-grid', role: 'tabpanel' });
    const tabBtns = {};
    const showTab = (group) => {
      ctx.state.tab = group;
      for (const g of TABS) {
        tabBtns[g].classList.toggle('active', g === group);
        tabBtns[g].setAttribute('aria-selected', g === group ? 'true' : 'false');
      }
      grid.replaceChildren();
      for (const s of content.groups[group]) {
        const rec = getRecord(store, content, s.id);
        const open = isUnlocked(store, content, s);
        const btn = el('button', {
          class: `stage${rec?.done ? ' done' : ''}${open ? '' : ' locked'}`, type: 'button',
          'aria-label': `${GROUP_LABEL[group]} ${s.order}, ${s.size}×${s.size}${open ? (rec?.done ? `, 별 ${rec.stars}개` : '') : ', 잠김'}`,
          'aria-disabled': open ? null : 'true',
          onclick: () => {
            if (open) ctx.goPlay(s);
            else toast('앞 판을 완료하면 열려요');
          },
        }, [
          el('b', { text: String(s.order) }),
          el('span', { class: 'size', text: `${s.size}×${s.size}` }),
          open ? starsRow(rec?.stars ?? 0, 3, 13) : lockGlyph(),
        ]);
        grid.appendChild(btn);
      }
    };
    for (const g of TABS) {
      const done = content.groups[g].filter((s) => getRecord(store, content, s.id)?.done).length;
      tabBtns[g] = el('button', {
        class: 'tab', type: 'button', role: 'tab', onclick: () => showTab(g),
      }, [GROUP_LABEL[g], el('small', { text: ` ${done}/${content.groups[g].length}` })]);
      tabsEl.appendChild(tabBtns[g]);
    }
    root.appendChild(el('section', { class: 'block' }, [el('h2', { text: '스테이지' }), tabsEl, grid]));
    showTab(TABS.includes(ctx.state.tab) ? ctx.state.tab : 'beginner');
  }

  root.appendChild(el('p', {
    class: 'notice',
    text: '기록은 이 브라우저에만 저장돼요. 브라우저 데이터를 지우거나 기기를 바꾸면 기록이 사라질 수 있어요.',
  }));
  return { el: root, destroy() { root.remove(); } };
}
