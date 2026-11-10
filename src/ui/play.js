// 플레이 화면: 입력 → 세션(규칙) → 보드 연출 → 완료 확정/결과.
// 게임 상태(session), 렌더 전환(board.animateShift), 장식 효과(흐름/전달)를 분리해 둔다.
import { CONFIG, GROUP_LABEL, TUTORIAL_TEXT } from '../config.js';
import { createSession } from '../game/session.js';
import {
  confirmCompletion, saveCurrent, clearCurrent, nextStage, getRecord, isRegular,
} from '../game/progress.js';
import { buildLink, shareText } from '../game/links.js';
import { createBoard } from './board.js';
import { el, hamsterFrame, starIcon, starsRow, prefersReducedMotion } from './art.js';
import { shareResult } from './share.js';
import { toast } from './toast.js';

export function stageTitle(stage, date = null) {
  if (stage.group === 'daily') {
    if (!date) return `도전 판 ${stage.order}`;
    const [, m, d] = date.split('-').map(Number);
    return `오늘의 도전 ${m}/${d}`;
  }
  return `${GROUP_LABEL[stage.group]} ${stage.order}`;
}

// ctx: { store, content, ads, goHome(), goPlay(stage, opts), afterTutorial }
// opts: { stage, date, history }
export function createPlayScreen(ctx, { stage, date = null, history = null }) {
  const { store, content, ads } = ctx;
  let session = createSession(stage, history);
  let destroyed = false;
  let completing = false; // 완료 확정 이후(더블 탭 방지)
  let leaving = false; // 다음 판 전환 중(중복 요청/중복 이동 방지)
  const timers = new Set();
  const later = (fn, ms) => {
    const t = setTimeout(() => { timers.delete(t); if (!destroyed) fn(); }, ms);
    timers.add(t);
  };

  const hasBonus = stage.tiles.some((t) => t.kind === 'goal' && t.bonus);
  const title = stageTitle(stage, date);

  // ----- 화면 구성 -----
  const movesEl = el('b', { text: '0' });
  const head = el('header', { class: 'play-head' }, [
    el('button', {
      class: 'icon-btn', type: 'button', 'aria-label': '목록으로 돌아가기', text: '←', onclick: () => { if (!leaving) ctx.goHome(); },
    }),
    el('div', { class: 'play-title' }, [
      el('strong', { text: title }),
      el('span', { text: `${stage.size}×${stage.size}` }),
    ]),
    el('div', { class: 'chips' }, [
      el('div', { class: 'chip' }, [el('span', { text: '이동' }), movesEl]),
      stage.tutorial ? null : el('div', { class: 'chip target', title: '별 3개 목표 이동 수' }, [
        el('span', { text: '목표' }), el('b', { text: String(stage.star3) }),
      ]),
    ]),
  ]);

  const reqPill = el('span', { class: 'pill req' });
  const bonusPill = hasBonus ? el('span', { class: 'pill bonus' }) : null;
  const hintEl = el('p', { class: 'status-hint' });
  const criteria = stage.tutorial ? TUTORIAL_TEXT[stage.id] || ''
    : hasBonus
      ? `★ 필수 잇기 · ★★ 보너스까지 · ★★★ 보너스까지 ${stage.star3}수 이내`
      : `★ 필수 잇기 · ★★ ${stage.star2}수 이내 · ★★★ ${stage.star3}수 이내`;
  const statusRow = el('div', { class: `status-row${stage.tutorial ? ' tutorial' : ''}` }, [
    hamsterFrame({ cls: 'small breathe' }),
    el('div', { class: 'status-body' }, [
      el('div', { class: 'pills' }, [reqPill, bonusPill]),
      hintEl,
    ]),
  ]);

  const board = createBoard({
    stage,
    onMove: handleMove,
    onLockedTap: () => toast('간식 창고가 있는 줄은 움직이지 않아요'),
  });
  const boardWrap = el('div', { class: 'board-wrap' });
  boardWrap.appendChild(board.el);

  const undoBtn = el('button', { class: 'btn', type: 'button', text: '↶ 되돌리기', onclick: handleUndo });
  const restartBtn = el('button', { class: 'btn', type: 'button', text: '↻ 다시 시작', onclick: handleRestart });
  const completeBtn = el('button', { class: 'btn primary complete', type: 'button', text: '배달 완료', onclick: handleComplete });
  const controls = el('div', { class: 'controls' }, [undoBtn, restartBtn, completeBtn]);

  const overlay = el('div', { class: 'result-overlay', hidden: true });
  const root = el('section', { class: 'screen play' }, [head, statusRow, boardWrap, controls, overlay]);

  // ----- 상태 표시 -----
  function refreshHud() {
    const { conn, result } = session;
    movesEl.textContent = String(session.moves);
    reqPill.textContent = `필수 ${conn.requiredConnected}/${conn.requiredTotal}`;
    reqPill.classList.toggle('done', result.requiredDone);
    if (bonusPill) {
      bonusPill.textContent = `★ 보너스 ${conn.bonusConnected}/${conn.bonusTotal}`;
      bonusPill.classList.toggle('done', conn.bonusConnected === conn.bonusTotal);
    }
    hintEl.replaceChildren();
    if (result.canComplete && !stage.tutorial) {
      hintEl.append('지금 완료하면 ', starsRow(result.stars, 3, 16));
      if (result.stars < 3) hintEl.append(hasBonus && !result.bonusDone ? ' · 보너스도 이어 볼까요?' : ' · 더 줄여 볼까요?');
    } else if (result.canComplete) {
      hintEl.textContent = '길이 이어졌어요! 배달 완료를 눌러 주세요.';
    } else {
      hintEl.textContent = criteria;
    }
    undoBtn.disabled = !session.canUndo;
    restartBtn.disabled = !session.canUndo;
    completeBtn.disabled = !result.canComplete;
    completeBtn.classList.toggle('ready', result.canComplete);
  }

  function persist() {
    if (session.moves > 0) saveCurrent(store, content, stage, session.historyCodes(), date);
    else clearCurrent(store, content);
  }

  // ----- 입력 -----
  function handleMove(move) {
    if (destroyed || completing || board.busy) return;
    const res = session.move(move);
    if (!res.ok) return; // 무효/잠긴 줄: 0수
    refreshHud();
    persist();
    board.animateShift(res.prevCells, res.applied, session.cells, session.conn);
  }

  function handleUndo() {
    if (destroyed || completing || board.busy) return;
    const res = session.undo();
    if (!res.ok) return;
    refreshHud();
    persist();
    board.animateShift(res.prevCells, res.applied, session.cells, session.conn);
  }

  function handleRestart() {
    if (destroyed || completing || board.busy) return;
    session.restart();
    refreshHud();
    persist();
    board.render(session.cells, session.conn);
  }

  // 완료 버튼: 배치/별/기록을 한 번만 확정한 뒤 연출한다. 연출이 끊겨도 기록은 이미 저장되어 있다.
  function handleComplete() {
    if (destroyed || completing || board.busy || !session.result.canComplete) return;
    completing = true;
    const result = session.result;
    const moves = session.moves;
    const outcome = confirmCompletion(store, content, stage, result, moves, date ? { date } : null);
    ads.noteStageCompleted(stage);
    board.setDisabled(true);
    undoBtn.disabled = true;
    restartBtn.disabled = true;
    completeBtn.disabled = true;
    board.playDelivery(session.cells, session.conn, () => showResult(result, moves, outcome));
  }

  // ----- 결과 -----
  function showResult(result, moves, outcome) {
    const next = nextStage(content, stage);
    const frame = hamsterFrame({ withSuccess: true, cls: 'big' });
    const stars = el('div', { class: 'result-stars', hidden: stage.tutorial, role: 'img', 'aria-label': stage.tutorial ? '완료' : `별 ${result.stars}개` });
    const starEls = [];
    if (!stage.tutorial) {
      for (let i = 0; i < 3; i++) {
        const s = starIcon(i < result.stars, 44);
        if (i < result.stars) { s.classList.add('pending'); starEls.push(s); }
        stars.appendChild(s);
      }
    }

    const notes = [];
    if (result.hasBonus) notes.push(result.bonusDone ? '보너스 햄스터까지 배달 완료!' : '보너스 햄스터는 아직 기다리고 있어요.');
    if (!stage.tutorial && outcome) {
      if (outcome.firstClear) notes.push('첫 완료!');
      else if (outcome.newBest) notes.push('최소 이동 기록을 새로 썼어요.');
      if (outcome.record.best != null) {
        notes.push(`내 기록: ${outcome.record.best}수${outcome.record.bestBonus != null ? ` · 보너스 포함 ${outcome.record.bestBonus}수` : ''}`);
      }
    }

    let primaryLabel = '목록으로';
    let primaryAction = () => ctx.goHome();
    if (stage.tutorial) {
      if (next) { primaryLabel = '다음 입문'; primaryAction = () => ctx.goPlay(next); } else if (ctx.afterTutorial) {
        primaryLabel = ctx.afterTutorial.label; primaryAction = ctx.afterTutorial.go;
      } else { primaryLabel = '난이도 고르기'; }
    } else if (next && isRegular(stage)) {
      primaryLabel = '다음 스테이지';
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

    const primary = el('button', { class: 'btn primary big', type: 'button', text: primaryLabel, onclick: once(primaryAction) });
    const card = el('div', { class: 'result-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': '배달 완료' }, [
      el('h2', { text: '배달 완료!' }),
      stars,
      frame,
      el('div', { class: 'result-stats' }, [
        el('b', { text: `${moves}수` }),
        stage.tutorial ? null : el('span', { text: `목표 ${stage.star3}수` }),
      ]),
      notes.length ? el('p', { class: 'result-notes', text: notes.join(' ') }) : null,
      primary,
      el('div', { class: 'result-row' }, [
        el('button', {
          class: 'btn', type: 'button', text: '다시 도전', onclick: () => { if (!leaving) ctx.goPlay(stage, { date }); },
        }),
        stage.tutorial ? null : el('button', {
          class: 'btn', type: 'button', text: '공유', onclick: () => {
            if (leaving) return;
            const url = buildLink(location.href, { version: content.version, stageId: stage.id, date });
            const text = shareText({
              gameName: CONFIG.gameName, title, stars: result.stars, moves,
              hasBonus: result.hasBonus, bonusDone: result.bonusDone, tutorial: stage.tutorial,
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
