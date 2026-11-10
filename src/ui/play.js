// 플레이 화면: 입력 → 세션(규칙) → 보드 연출 → 자동 완료/결과.
// 게임 상태(session), 렌더 전환(board.animateShift), 장식 효과(흐름)를 분리해 둔다.
import { CONFIG, GROUP_LABEL, TUTORIAL_TEXT } from '../config.js';
import { createSession } from '../game/session.js';
import {
  confirmCompletion, saveCurrent, clearCurrent, nextStage, isRegular,
} from '../game/progress.js';
import { buildLink, shareText } from '../game/links.js';
import { createBoard } from './board.js';
import { el, hamsterFrame, starIcon, prefersReducedMotion } from './art.js';
import { shareResult } from './share.js';
import { toast } from './toast.js';

export function stageTitle(stage, date = null) {
  if (stage.group === 'daily') {
    if (!date) return `도전 판 ${stage.order}`;
    const [, m, d] = date.split('-').map(Number);
    return `오늘의 판 ${m}/${d}`;
  }
  return `${GROUP_LABEL[stage.group]} ${stage.order}`;
}

// 지금 이동 수로 받을 수 있는 별
function starsAt(stage, moves) {
  if (stage.tutorial) return 0;
  return moves <= stage.star3 ? 3 : moves <= stage.star2 ? 2 : 1;
}

// ctx: { store, content, ads, goHome(), goPlay(stage, opts), afterTutorial }
// opts: { stage, date, history }
export function createPlayScreen(ctx, { stage, date = null, history = null }) {
  const { store, content, ads } = ctx;
  const session = createSession(stage, history);
  let destroyed = false;
  let completing = false; // 완료 확정 이후(중복 저장 방지)
  let leaving = false; // 다음 판 전환 중(중복 요청/중복 이동 방지)
  const timers = new Set();
  const later = (fn, ms) => {
    const t = setTimeout(() => { timers.delete(t); if (!destroyed) fn(); }, ms);
    timers.add(t);
  };
  const title = stageTitle(stage, date);

  // ----- 하늘: 햄스터 + 나무 팻말 -----
  const movesEl = el('em', { text: '0' });
  const fedEl = el('em', { text: '0/0' });
  const sky = el('div', { class: 'sky' }, [
    el('button', {
      class: 'icon-btn back', type: 'button', 'aria-label': '목록으로 돌아가기', text: '←', onclick: () => { if (!leaving) ctx.goHome(); },
    }),
    hamsterFrame({ cls: 'sky-ham breathe' }),
    el('div', { class: 'sign' }, [
      el('b', { text: title }),
      el('div', { class: 'sign-nums' }, [
        el('div', { class: 'num' }, [el('small', { text: '이동' }), movesEl]),
        el('div', { class: 'num' }, [el('small', { text: '배달' }), fedEl]),
      ]),
    ]),
  ]);

  // ----- 땅속: 판 + 이동 막대 + 버튼 -----
  const board = createBoard({
    stage,
    onMove: handleMove,
    onLockedTap: () => toast('간식 창고가 있는 줄은 움직이지 않아요'),
  });
  const boardWrap = el('div', { class: 'board-wrap' });
  boardWrap.appendChild(board.el);

  // 이동 막대: 별 기준 눈금과 지금 받을 수 있는 별
  let meter = null;
  let fillEl = null;
  let liveStars = [];
  if (!stage.tutorial) {
    const max = stage.star2 + 2;
    fillEl = el('i', { class: 'fill' });
    liveStars = [0, 1, 2].map(() => starIcon(true, 22));
    meter = el('div', { class: 'wood meter', role: 'img' }, [
      el('div', { class: 'live-stars' }, liveStars),
      el('div', { class: 'track' }, [
        fillEl,
        el('span', { class: 'mark m3', style: `left:${(stage.star3 / max) * 100}%` }, [el('i'), `★★★ ${stage.star3}`]),
        el('span', { class: 'mark m2', style: `left:${(stage.star2 / max) * 100}%` }, [el('i'), `★★ ${stage.star2}`]),
      ]),
    ]);
  }
  const tip = stage.tutorial ? el('p', { class: 'wood tip', text: TUTORIAL_TEXT[stage.id] || '' }) : null;

  const undoBtn = el('button', { class: 'wood-btn', type: 'button', text: '↶ 되돌리기', onclick: handleUndo });
  const restartBtn = el('button', { class: 'wood-btn', type: 'button', text: '↻ 다시 시작', onclick: handleRestart });
  const controls = el('div', { class: 'controls' }, [undoBtn, restartBtn]);

  const ground = el('div', { class: 'ground' }, [tip, boardWrap, meter, controls]);
  const overlay = el('div', { class: 'result-overlay', hidden: true });
  const root = el('section', { class: 'screen play' }, [sky, ground, overlay]);

  // ----- 상태 표시 -----
  function refreshHud() {
    const { conn } = session;
    movesEl.textContent = String(session.moves);
    fedEl.textContent = `${conn.requiredConnected}/${conn.requiredTotal}`;
    if (meter) {
      const now = starsAt(stage, session.moves);
      liveStars.forEach((s, i) => s.classList.toggle('off', i >= now));
      fillEl.style.width = `${Math.min(100, (session.moves / (stage.star2 + 2)) * 100)}%`;
      meter.setAttribute('aria-label', `지금 끝내면 별 ${now}개. 별 셋은 ${stage.star3}수, 별 둘은 ${stage.star2}수까지`);
    }
    undoBtn.disabled = !session.canUndo;
    restartBtn.disabled = !session.canUndo;
  }

  function persist() {
    if (session.moves > 0) saveCurrent(store, content, stage, session.historyCodes(), date);
    else clearCurrent(store, content);
  }

  // ----- 입력 -----
  function afterShift() {
    // 모든 햄스터에게 길이 닿으면 자동으로 배달 완료
    if (session.result.canComplete) complete();
  }

  function handleMove(move) {
    if (destroyed || completing || board.busy) return;
    const res = session.move(move);
    if (!res.ok) return; // 무효/잠긴 줄: 0수
    refreshHud();
    persist();
    board.animateShift(res.prevCells, res.applied, session.cells, session.conn, afterShift);
  }

  function handleUndo() {
    if (destroyed || completing || board.busy) return;
    const res = session.undo();
    if (!res.ok) return;
    refreshHud();
    persist();
    board.animateShift(res.prevCells, res.applied, session.cells, session.conn, afterShift);
  }

  function handleRestart() {
    if (destroyed || completing || board.busy) return;
    session.restart();
    refreshHud();
    persist();
    board.render(session.cells, session.conn);
  }

  // 배치/별/기록을 한 번만 확정한 뒤 연출한다. 연출이 끊겨도 기록은 이미 저장되어 있다.
  function complete() {
    if (destroyed || completing || !session.result.canComplete) return;
    completing = true;
    const result = session.result;
    const moves = session.moves;
    const outcome = confirmCompletion(store, content, stage, result, moves, date ? { date } : null);
    ads.noteStageCompleted(stage);
    board.setDisabled(true);
    board.celebrate();
    undoBtn.disabled = true;
    restartBtn.disabled = true;
    later(() => showResult(result, moves, outcome), prefersReducedMotion() ? 0 : CONFIG.anim.completeDelay);
  }

  // ----- 결과 -----
  function showResult(result, moves, outcome) {
    const next = nextStage(content, stage);
    const frame = hamsterFrame({ withSuccess: true, cls: 'big' });
    const stars = el('div', {
      class: 'result-stars', hidden: stage.tutorial, role: 'img', 'aria-label': stage.tutorial ? '완료' : `별 ${result.stars}개`,
    });
    const starEls = [];
    if (!stage.tutorial) {
      for (let i = 0; i < 3; i++) {
        const s = starIcon(i < result.stars, 48);
        if (i < result.stars) { s.classList.add('pending'); starEls.push(s); }
        stars.appendChild(s);
      }
    }

    // 기록 표시는 짧게: 새 기록이면 배지, 아니면 내 최고 수만
    let badge = null;
    if (!stage.tutorial && outcome) {
      if (outcome.firstClear || outcome.newBest) badge = el('span', { class: 'badge', text: outcome.firstClear ? '첫 배달' : '새 기록' });
      else if (outcome.record.best != null && outcome.record.best < moves) badge = el('span', { class: 'badge plain', text: `내 최고 ${outcome.record.best}수` });
    }

    let primaryLabel = '목록으로';
    let primaryAction = () => ctx.goHome();
    if (stage.tutorial) {
      if (next) { primaryLabel = '다음 입문'; primaryAction = () => ctx.goPlay(next); } else if (ctx.afterTutorial) {
        primaryLabel = ctx.afterTutorial.label; primaryAction = ctx.afterTutorial.go;
      } else { primaryLabel = '굴 고르러 가기'; }
    } else if (next && isRegular(stage)) {
      primaryLabel = '다음 판';
      primaryAction = goNextWithAdChance;
    }

    async function goNextWithAdChance() {
      // 광고 기회는 이 전환에서만. 진행 상태는 완료 확정 때 이미 저장했다.
      // 광고가 없거나 실패해도 그대로 다음 판으로 간다.
      await ads.showBetweenStages();
      if (!destroyed) ctx.goPlay(next);
    }

    const once = (fn) => () => {
      if (leaving || destroyed) return;
      leaving = true;
      Promise.resolve(fn()).catch(() => { if (!destroyed) ctx.goHome(); });
    };

    const primary = el('button', { class: 'go big', type: 'button', text: primaryLabel, onclick: once(primaryAction) });
    const card = el('div', { class: 'result-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': '배달 완료' }, [
      el('h2', { text: '배달 완료!' }),
      stars,
      frame,
      el('div', { class: 'result-stats' }, [el('b', { text: `${moves}수` }), badge]),
      primary,
      el('div', { class: 'result-row' }, [
        el('button', {
          class: 'sub-btn', type: 'button', text: '다시 도전', onclick: () => { if (!leaving) ctx.goPlay(stage, { date }); },
        }),
        stage.tutorial ? null : el('button', {
          class: 'sub-btn', type: 'button', text: '공유', onclick: () => {
            if (leaving) return;
            const url = buildLink(location.href, { version: content.version, stageId: stage.id, date });
            const text = shareText({
              gameName: CONFIG.gameName, title, stars: result.stars, moves, hasBonus: false, tutorial: stage.tutorial,
            });
            shareResult({ title: CONFIG.gameName, text, url });
          },
        }),
      ]),
    ]);
    overlay.replaceChildren(card);
    overlay.hidden = false;
    primary.focus({ preventScroll: true });

    // 대기 → 성공 전환, 짧은 점프, 별 등장(총 1초 안팎)
    const reduce = prefersReducedMotion();
    const swap = () => { frame.classList.add('success'); if (!reduce) frame.classList.add('jump'); };
    if (reduce) {
      swap();
      starEls.forEach((s) => s.classList.remove('pending'));
    } else {
      later(swap, CONFIG.anim.successSwap);
      starEls.forEach((s, i) => later(() => { s.classList.remove('pending'); s.classList.add('pop'); },
        CONFIG.anim.successSwap + 150 + i * CONFIG.anim.starStep));
    }
  }

  // ----- 수명 -----
  const onVisibility = () => {
    if (document.hidden) ads.stopPlayClock();
    else ads.startPlayClock(stage);
  };
  document.addEventListener('visibilitychange', onVisibility);
  ads.startPlayClock(stage);

  board.render(session.cells, session.conn, { instant: true });
  refreshHud();

  return {
    el: root,
    destroy() {
      destroyed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      ads.stopPlayClock();
      for (const t of timers) clearTimeout(t);
      timers.clear();
      board.destroy();
      root.remove();
    },
  };
}
