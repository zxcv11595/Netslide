// 게임 화면: 입력 → 세션(규칙) → 보드 연출 → 자동 완료/결과.
// 게임 상태(session), 렌더 전환(board.animateShift), 장식 효과(흐름)를 분리해 둔다.
import { CONFIG, GROUP_LABEL, TUTORIAL_TEXT } from '../config.js';
import { createSession } from '../game/session.js';
import {
  confirmCompletion, saveCurrent, clearCurrent, nextStage, isRegular,
} from '../game/progress.js';
import { buildLink, shareText } from '../game/links.js';
import { nextHint } from '../game/hint.js';
import { createBoard } from './board.js';
import { el, hamsterFrame, starIcon, prefersReducedMotion } from './art.js';
import { icon, pad2 } from './common.js';
import { shareResult } from './share.js';
import { toast } from './toast.js';

export function stageTitle(stage, date = null) {
  if (stage.group === 'daily') {
    if (!date) return `도전 ${pad2(stage.order)}`;
    const [, m, d] = date.split('-').map(Number);
    return `오늘의 도전 ${m}/${d}`;
  }
  return `${GROUP_LABEL[stage.group]} ${pad2(stage.order)}`;
}

// 지금 이동 수로 받을 수 있는 별
function starsAt(stage, moves) {
  if (stage.tutorial) return 0;
  return moves <= stage.star3 ? 3 : moves <= stage.star2 ? 2 : 1;
}

let hintData = null; // 힌트용 해답은 처음 쓸 때만 불러온다
async function loadSolution(content, stageId) {
  try {
    if (!hintData) hintData = (await import('../data/hints.json')).default;
    return hintData.contentVersion === content.version ? hintData.hints[stageId] || null : null;
  } catch {
    return null;
  }
}

// ctx: { store, content, ads, go(name, params), goPlay(stage, opts), afterTutorial }
// opts: { stage, date, history }
export function createPlayScreen(ctx, { stage, date = null, history = null }) {
  const { store, content, ads } = ctx;
  const session = createSession(stage, history);
  let destroyed = false;
  let completing = false; // 완료 확정 이후(중복 저장 방지)
  let leaving = false; // 다음 판 전환 중(중복 요청/중복 이동 방지)
  let hintBusy = false;
  let guiding = false; // 힌트를 쓴 뒤 되돌리기 안내를 따라가는 중
  let solution = null;
  const timers = new Set();
  const later = (fn, ms) => {
    const t = setTimeout(() => { timers.delete(t); if (!destroyed) fn(); }, ms);
    timers.add(t);
  };
  // 진동은 사용자가 직접 화면을 누른 뒤에만 시도한다(브라우저가 그 전에는 막는다)
  const buzz = (ms) => { if (store.data.settings.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate?.(ms); };
  const title = stageTitle(stage, date);
  const backTo = () => {
    if (leaving) return;
    if (isRegular(stage)) ctx.go('stages', { group: stage.group });
    else ctx.go(stage.group === 'daily' ? 'daily' : 'home');
  };

  // ----- 머리줄: 뒤로 / 판 이름 / 힌트 -----
  const hintCount = el('span', { class: 'cnt', text: String(store.data.hints) });
  const hintBtn = stage.tutorial ? el('div', { class: 'sq-space' }) : el('button', {
    class: 'btn sq hint', type: 'button', 'aria-label': `힌트, ${store.data.hints}개 남음`, onclick: handleHint,
  }, [icon('bulb', 'bulb'), hintCount]);
  const head = el('div', { class: 'head-row' }, [
    el('button', { class: 'btn sq', type: 'button', 'aria-label': '목록으로 돌아가기', onclick: backTo }, [icon('back')]),
    el('h1', { class: 'screen-title', text: title }),
    hintBtn,
  ]);

  const movesEl = el('b', { text: '0' });
  const fedEl = el('b', { text: '0/0' });
  const chips = el('div', { class: 'chips' }, [
    el('div', { class: 'chip' }, ['이동 ', movesEl]),
    el('div', { class: 'chip' }, ['배달 ', fedEl]),
  ]);
  const tip = stage.tutorial ? el('p', { class: 'card tip', text: TUTORIAL_TEXT[stage.id] || '' }) : null;

  // ----- 판 -----
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
    liveStars = [0, 1, 2].map(() => starIcon(true, 20));
    meter = el('div', { class: 'card meter', role: 'img' }, [
      el('div', { class: 'live-stars' }, liveStars),
      el('div', { class: 'track' }, [
        fillEl,
        el('span', { class: 'mark m3', style: `left:${(stage.star3 / max) * 100}%` }, [el('i'), `★★★ ${stage.star3}`]),
        el('span', { class: 'mark m2', style: `left:${(stage.star2 / max) * 100}%` }, [el('i'), `★★ ${stage.star2}`]),
      ]),
    ]);
  }

  const undoBtn = el('button', { class: 'btn wide', type: 'button', onclick: handleUndo }, [icon('undo'), '되돌리기']);
  const restartBtn = el('button', { class: 'btn wide', type: 'button', onclick: handleRestart }, [icon('redo'), '재시작']);
  const controls = el('div', { class: 'two' }, [undoBtn, restartBtn]);
  // 광고 배너가 들어갈 자리(아직 광고가 없어 점선으로만 표시)
  const adSlot = el('div', { class: 'ghost ad-slot', 'aria-hidden': 'true', text: '광고 자리 · 준비 중' });

  const overlay = el('div', { class: 'result-overlay', hidden: true });
  const root = el('section', { class: 'screen play' }, [
    head, el('div', { class: 'hr' }), chips, tip, boardWrap, meter, controls, adSlot, overlay,
  ]);

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

  function clearHint() {
    board.showHint(null);
    undoBtn.classList.remove('hinted');
  }

  // ----- 입력 -----
  // 입문에서는 다음에 누를 화살표를 항상 알려 준다(힌트 개수와 무관)
  function guide() {
    if (!stage.tutorial || completing || session.result.canComplete) return;
    const hint = nextHint(stage, session.cells, session.historyCodes(), null);
    if (hint.type === 'move') board.showHint(hint.move);
  }

  function afterShift() {
    // 모든 햄스터에게 길이 닿으면 자동으로 배달 완료
    if (session.result.canComplete) complete();
    else guide();
  }

  function handleMove(move) {
    if (destroyed || completing || board.busy) return;
    const res = session.move(move);
    if (!res.ok) return; // 무효/잠긴 줄: 0수
    guiding = false;
    clearHint();
    buzz(8);
    refreshHud();
    persist();
    board.animateShift(res.prevCells, res.applied, session.cells, session.conn, afterShift);
  }

  function handleUndo() {
    if (destroyed || completing || board.busy) return;
    const res = session.undo();
    if (!res.ok) return;
    clearHint();
    refreshHud();
    persist();
    board.animateShift(res.prevCells, res.applied, session.cells, session.conn, () => {
      afterShift();
      // 되돌리기 안내를 따라가는 중이면 같은 힌트로 이어서 안내한다
      if (guiding && !completing) showHintNow();
    });
  }

  function handleRestart() {
    if (destroyed || completing || board.busy) return;
    session.restart();
    guiding = false;
    clearHint();
    refreshHud();
    persist();
    board.render(session.cells, session.conn);
    guide();
  }

  // 지금 배치에서 다음에 밀 줄을 찾아 강조한다. 못 찾으면 되돌리기를 강조하고 계속 안내한다.
  function showHintNow() {
    const hint = nextHint(stage, session.cells, session.historyCodes(), solution);
    clearHint();
    if (hint.type === 'move') { board.showHint(hint.move); guiding = false; return true; }
    if (hint.type === 'undo') { undoBtn.classList.add('hinted'); guiding = true; return true; }
    guiding = false;
    return false;
  }

  // 힌트: 다음에 밀 줄 하나를 알려 준다. 한 번 쓰면 1개가 줄어든다.
  async function handleHint() {
    if (destroyed || completing || board.busy || hintBusy) return;
    if (store.data.hints <= 0) {
      toast('힌트가 없어요. 오늘의 도전을 끝내면 1개를 받아요.', 3600);
      return;
    }
    hintBusy = true;
    solution = await loadSolution(content, stage.id);
    hintBusy = false;
    if (destroyed || completing || board.busy) return;
    if (!showHintNow()) { toast('지금은 알려 줄 수가 없어요'); return; }
    if (guiding) toast('여기서는 길을 찾기 어려워요. 표시된 되돌리기를 따라가면 다음 수를 알려 줄게요.', 3600);
    store.data.hints -= 1;
    store.save();
    hintCount.textContent = String(store.data.hints);
    hintBtn.setAttribute('aria-label', `힌트, ${store.data.hints}개 남음`);
  }

  // 배치/별/기록을 한 번만 확정한 뒤 연출한다. 연출이 끊겨도 기록은 이미 저장되어 있다.
  function complete() {
    if (destroyed || completing || !session.result.canComplete) return;
    completing = true;
    const result = session.result;
    const moves = session.moves;
    const firstDaily = !!date && !store.content(content.version).daily[date];
    const outcome = confirmCompletion(store, content, stage, result, moves, date ? { date } : null);
    if (firstDaily) { store.data.hints += 1; store.save(); } // 그날의 도전을 처음 끝내면 힌트 1개
    ads.noteStageCompleted(stage);
    clearHint();
    buzz(30);
    board.setDisabled(true);
    board.celebrate();
    undoBtn.disabled = true;
    restartBtn.disabled = true;
    later(() => showResult(result, moves, outcome, firstDaily), prefersReducedMotion() ? 0 : CONFIG.anim.completeDelay);
  }

  // ----- 결과 -----
  function showResult(result, moves, outcome, gotHint) {
    const next = nextStage(content, stage);
    const frame = hamsterFrame({ withSuccess: true, cls: 'big' });
    const ham = el('div', { class: 'res-ham' }, [el('i'), el('i'), el('i'), el('i'), frame]);
    const stars = el('div', {
      class: 'result-stars', hidden: stage.tutorial, role: 'img', 'aria-label': stage.tutorial ? '완료' : `별 ${result.stars}개`,
    });
    const starEls = [];
    if (!stage.tutorial) {
      for (let i = 0; i < 3; i++) {
        const s = starIcon(i < result.stars, 50);
        if (i < result.stars) { s.classList.add('pending'); starEls.push(s); }
        stars.appendChild(s);
      }
    }

    // 기록 표시는 짧게: 새 기록이면 배지, 아니면 내 최고 수만
    let badge = null;
    if (!stage.tutorial && outcome) {
      if (outcome.firstClear || outcome.newBest) badge = el('span', { class: 'new', text: outcome.firstClear ? '첫 배달' : '새 기록' });
      else if (outcome.record.best != null && outcome.record.best < moves) badge = el('span', { class: 'new plain', text: `최고 ${outcome.record.best}` });
    }

    let primaryLabel = '목록';
    let primaryAction = backTo;
    if (stage.tutorial) {
      if (next) { primaryLabel = '다음 판'; primaryAction = () => ctx.goPlay(next); } else if (ctx.afterTutorial) {
        primaryLabel = ctx.afterTutorial.label; primaryAction = ctx.afterTutorial.go;
      } else { primaryLabel = '스테이지 고르기'; primaryAction = () => ctx.go('home'); }
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
      Promise.resolve(fn()).catch(() => { if (!destroyed) ctx.go('home'); });
    };

    const primary = el('button', { class: 'go', type: 'button', onclick: once(primaryAction) }, [primaryLabel, icon('play')]);
    const card = el('div', { class: 'result-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': '배달 완료' }, [
      el('h2', { text: '배달 완료!' }),
      stars,
      ham,
      el('div', { class: 'pill' }, ['이동 ', el('b', { text: String(moves) }), badge]),
      gotHint ? el('p', { class: 'got-hint' }, [icon('bulb', 'bulb'), ' 힌트 1개를 받았어요']) : null,
      primary,
      el('div', { class: 'two' }, [
        el('button', {
          class: 'btn wide', type: 'button', onclick: () => { if (!leaving) ctx.goPlay(stage, { date }); },
        }, [icon('redo'), '재도전']),
        stage.tutorial ? null : el('button', {
          class: 'btn wide', type: 'button', onclick: () => {
            if (leaving) return;
            const url = buildLink(location.href, { version: content.version, stageId: stage.id, date });
            const text = shareText({
              gameName: CONFIG.gameName, title, stars: result.stars, moves, hasBonus: false, tutorial: stage.tutorial,
            });
            shareResult({ title: CONFIG.gameName, text, url });
          },
        }, [icon('share'), '공유']),
      ]),
      primaryAction === backTo ? null : el('button', { class: 'link-btn', type: 'button', text: '목록', onclick: once(backTo) }),
    ]);
    overlay.replaceChildren(card);
    overlay.hidden = false;
    primary.focus({ preventScroll: true });

    // 대기 → 성공 전환, 짧은 점프, 별 등장(총 1초 안팎)
    const reduce = prefersReducedMotion();
    const swap = () => { frame.classList.add('success'); ham.classList.add('cheer'); if (!reduce) frame.classList.add('jump'); };
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
  guide();

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
