// 게임 화면: 입력 → 세션(규칙) → 보드 연출 → 자동 완료/결과.
// 게임 상태(session), 렌더 전환(board.animateShift), 장식 효과(흐름)를 분리해 둔다.
import { t } from '../i18n.js';
import { CONFIG, GROUP_LABEL } from '../config.js';
import { createSession } from '../game/session.js';
import {
  confirmCompletion, saveCurrent, clearCurrent, nextStage, isRegular, getRecord, shownShortest, hasFlag,
} from '../game/progress.js';
import { clearRewardHints } from '../game/hintWallet.js';
import { openHintPacks } from './shop.js';
import { track } from '../analytics.js';
import { buildLink, shareText } from '../game/links.js';
import { nextHint, guideCount } from '../game/hint.js';
import { requestPlan, warmPlan } from '../game/hintClient.js';
import hintData from '../data/hints.json';
import { moveFromCode, moveToCode, inverseMove } from '../core/rules.js';
import { solutionWalls } from '../core/walls.js';
import { createBoard } from './board.js';
import { el, hamsterFrame, starIcon, flagIcon, prefersReducedMotion } from './art.js';
import { icon, pad2 } from './common.js';
import { shareResult } from './share.js';
import { toast, hideToast } from './toast.js';
import { sound } from './sound.js';
import { createCoach } from './coach.js';
import { soundSwitches } from './settingRows.js';

export function stageTitle(stage, date = null) {
  if (stage.group === 'daily') {
    if (!date) return t('도전 {n}', { n: pad2(stage.order) });
    const [, m, d] = date.split('-').map(Number);
    return t('오늘의 도전 {m}/{d}', { m, d });
  }
  return `${GROUP_LABEL[stage.group]} ${pad2(stage.order)}`;
}

import { starsAt, starGauge } from '../core/stars.js';

// 힌트용 해답(3KB)은 게임에 함께 싣는다. 따로 불러오다 기다리는 일이 없게.
function loadSolution(content, stageId) {
  return hintData.contentVersion === content.version ? hintData.hints[stageId] || null : null;
}

// ctx: { store, content, ads, go(name, params), goPlay(stage, opts), afterTutorial }
// opts: { stage, date, history }
export function createPlayScreen(ctx, { stage, date = null, history = null }) {
  const { store, content, ads } = ctx;
  const session = createSession(stage, history);
  let destroyed = false;
  let completing = false; // 완료 확정 이후(중복 저장 방지)
  let leaving = false; // 다음 판 전환 중(중복 요청/중복 이동 방지)
  const H = CONFIG.hints;
  let hintBusy = false; // 길을 찾는 중(이동을 잠깐 막는다)
  let undoLeft = 0; // 길이 너무 멀 때: 이만큼 되돌리면 힌트를 쓸 수 있다고 안내하는 중
  let guideQ = null; // 힌트 하나로 이어서 안내할 수(표기 배열). 맨 앞이 다음에 밀 줄
  let lastFed = Infinity; // 배달 수가 늘 때만 소리를 내기 위한 직전 값(처음 그릴 때는 내지 않는다)
  // 벽 보기 힌트를 켠 판. 같은 판을 재도전하거나 다시 들어와도 남고, 다른 판을 시작하면 사라진다(ctx.state.wallsFor에 기억).
  const wallKey = `${stage.id}|${date || ''}`;
  if (ctx.state.wallsFor !== wallKey) ctx.state.wallsFor = null;
  let wallsOn = ctx.state.wallsFor === wallKey;
  let skipped = false; // 바로 클리어로 끝낸 판
  const timers = new Set();
  const later = (fn, ms) => {
    const t = setTimeout(() => { timers.delete(t); if (!destroyed) fn(); }, ms);
    timers.add(t);
  };
  // 진동은 사용자가 직접 화면을 누른 뒤에만 시도한다(브라우저가 그 전에는 막는다)
  const buzz = (ms) => { if (store.data.settings.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate?.(ms); };
  const title = stageTitle(stage, date);
  const backTo = () => {
    if (isRegular(stage)) ctx.go('stages', { group: stage.group });
    else ctx.go(stage.group === 'daily' ? 'daily' : 'home');
  };

  // ----- 머리줄: 뒤로 / 판 이름 / 설정 -----
  const head = el('div', { class: 'head-row' }, [
    el('button', { class: 'btn sq', type: 'button', 'aria-label': t('목록으로 돌아가기'), onclick: () => { if (!leaving) backTo(); } }, [icon('back')]),
    el('h1', { class: 'screen-title', text: title }),
    el('button', { class: 'btn sq', type: 'button', 'aria-label': t('설정'), onclick: () => openSettingsSheet() }, [icon('gear')]),
  ]);

  // ----- 판 -----
  const board = createBoard({
    stage,
    onMove: handleMove,
    onLockedTap: () => sound.locked(),
  });
  if (wallsOn) board.setWalls(solutionWalls(stage, loadSolution(content, stage.id)));
  const boardWrap = el('div', { class: 'board-wrap' });

  // ----- 계기판: 동그란 게이지(민 횟수) + 도토리 하나(찾은 수 / 전체) + 별 기준 세 줄 -----
  const RING_R = 35;
  const RING_C = 2 * Math.PI * RING_R;
  const ringSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ringSvg.setAttribute('viewBox', '0 0 80 80');
  ringSvg.setAttribute('aria-hidden', 'true');
  const ringCircle = (cls) => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', '40'); c.setAttribute('cy', '40'); c.setAttribute('r', String(RING_R)); c.setAttribute('class', cls);
    return c;
  };
  const ringFill = ringCircle('ring-fill');
  ringFill.setAttribute('stroke-dasharray', `${RING_C} ${RING_C}`);
  ringSvg.append(ringCircle('ring-track'), ringFill);
  const movesEl = el('b', { text: '0' });
  const moveCount = el('div', { class: 'ring-num' }, [
    el('span', { class: 'ring-value' }, [movesEl, el('span', { class: 'ring-unit', text: t('번@ring') })]),
  ]);
  const ring = el('div', { class: 'ring', role: 'img' }, [ringSvg, moveCount]);
  const hamImg = el('img', { src: CONFIG.assets.snackSeed, alt: '', draggable: 'false' });
  const litEl = el('b', { text: '0' });
  const hamBox = el('div', { class: 'hud-ham', role: 'img' }, [hamImg, el('span', {}, [litEl, el('i', { text: ` / ${session.conn.requiredTotal}` })])]);
  const lineEls = [[3, stage.star3], [2, stage.star2], [1, null]].map(([n, limit]) => el('div', { class: 'hud-line', 'data-n': String(n) }, [
    el('span', { class: 'st', 'aria-hidden': 'true' }, Array.from({ length: 3 }, (_, i) => starIcon(i < n, 15))),
    el('b', { text: limit == null ? t('성공') : String(limit) }), // 별 줄에는 단위(번)를 붙이지 않는다
  ]));
  // 왼쪽 최단 경로와 찾은 도토리 수 · 가운데 횟수 게이지 · 오른쪽 별 기준 세 줄 (2026-11-12 확정)
  // 표시된 최단보다 짧게 푼 기록이 있으면(최단이 증명되지 않은 판) 그 기록을 최단 경로로 보여 준다
  const shortAtStart = shownShortest(stage, getRecord(store, content, stage.id));
  // 이 판을 시작할 때 깃발이 하나도 없었으면, 첫 깃발을 받을 때 한 줄로 설명한다
  const noFlagYet = ![...content.byId.values()].some((s) => hasFlag(s, getRecord(store, content, s.id)));
  const shortEl = el('div', { class: 'hud-short' }, [el('span', {}, [flagIcon(13), t('최단 경로')]), el('b', { text: t('{moves}번', { moves: shortAtStart }) })]);
  const dash = el('div', { class: 'dash hud' }, [
    el('div', { class: 'hud-right' }, [shortEl, hamBox]),
    ring,
    el('div', { class: 'hud-info' }, lineEls),
  ]);

  // ----- 아래 버튼 세 개: 재시작 / 힌트 / 되돌리기 -----
  if (H.infinite && store.data.hints < 99) store.data.hints = 99; // 테스트용 무한 힌트
  const hintCount = el('span', { class: 'cnt', text: String(store.data.hints) });
  const hintBtn = stage.tutorial ? el('div', { class: 'dock-space' }) : el('button', {
    class: 'btn dock hint', type: 'button', 'aria-label': t('힌트, {n}개 남음', { n: store.data.hints }), onclick: openHintSheet,
  }, [icon('bulb', 'bulb'), hintCount]);
  const undoBtn = el('button', { class: 'btn dock', type: 'button', 'aria-label': t('되돌리기'), onclick: handleUndo }, [icon('undo')]);
  const restartBtn = el('button', { class: 'btn dock', type: 'button', 'aria-label': t('재시작'), onclick: handleRestart }, [icon('redo')]);
  const controls = el('div', { class: 'play-controls dock-row' }, [restartBtn, hintBtn, undoBtn]);
  const boardCluster = el('div', { class: 'board-cluster' }, [board.el, controls]);
  boardWrap.appendChild(boardCluster);
  // 힌트 길을 찾는 동안 판 위에 잠깐 뜨는 표시
  const seekingText = el('span', { class: 'seeking-text', text: t('경로를 찾는 중') });
  const seeking = el('div', { class: 'seeking', role: 'status', 'aria-live': 'polite', hidden: true }, [
    el('i', { class: 'seeking-dots', 'aria-hidden': 'true' }, [el('b'), el('b'), el('b')]),
    seekingText,
    el('span', { class: 'seeking-trail', 'aria-hidden': 'true' }, [el('i', { text: '.' }), el('i', { text: '.' }), el('i', { text: '.' })]),
  ]);
  boardWrap.appendChild(seeking);
  // 힌트 안내: 판 가운데에 잠깐 뜨는 카드(제목 + 설명 한 줄)
  const noteTitle = el('b');
  const noteSub = el('span');
  const noteEl = el('div', { class: 'board-note', role: 'status', 'aria-live': 'polite', hidden: true }, [noteTitle, noteSub]);
  boardWrap.appendChild(noteEl);
  let noteTimer = null;
  function note(titleText, subText = '', ms = 2600) {
    noteTitle.textContent = titleText;
    noteSub.textContent = subText;
    noteSub.hidden = !subText;
    noteEl.hidden = false;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { noteEl.hidden = true; }, ms);
  }
  function hideNote() { clearTimeout(noteTimer); noteEl.hidden = true; }

  const overlay = el('div', { class: 'result-overlay', hidden: true });
  const sheet = el('div', { class: 'modal-overlay', hidden: true, onclick: (e) => { if (e.target === sheet) closeSheet(); } });
  // 광고 자리: 띠 광고 크기(320×50). 광고를 붙이기 전까지는 '준비 중' 점선이다.
  // 광고 제거를 샀으면 자리는 그대로 두고 보이지 않게만 한다(판 위치가 달라지지 않게).
  const adSlot = el('div', { class: `ghost ad-slot${ctx.purchases?.owns('noads') ? ' off' : ''}`, 'aria-hidden': 'true', text: t('광고 자리 · 준비 중') });
  const root = el('section', { class: 'screen play' }, [
    el('div', { class: 'sky' }, [head]), dash, boardWrap, adSlot, overlay, sheet,
  ]);

  // ----- 입문 1의 안내: 화면을 어둡게 하고 한 곳씩 밝혀 설명한다 -----
  // 1단계 "무엇을 하는 게임인지"(판을 밝힘) → 2단계 "이 화살표를 누르세요"(화살표만 밝힘, 그것만 눌림)
  const coach = stage.id === 'T1' ? createCoach() : null;
  let coachStep = null;
  const unionRect = (nodes) => {
    let box = null;
    for (const n of nodes) {
      const r = n.getBoundingClientRect();
      box = box ? { left: Math.min(box.left, r.left), top: Math.min(box.top, r.top), right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom) } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    return box ? { left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top } : null;
  };
  function coachPress() {
    coachStep = 'press';
    coach.show({
      title: t('화살표를 눌러 보세요'), text: t('누르면 이 줄이 한 칸 밀려요.'), button: null, pad: 3, round: 14,
      rect: () => { const h = root.querySelector('.edge-btn.hinted .btn-face') || root.querySelector('.edge-btn.hinted'); return h ? unionRect([h]) : null; },
    });
  }
  function coachStart() {
    if (!coach || session.moves > 0) return;
    coachStep = 'goal';
    coach.show({
      title: t('햄스터가 도토리를 찾아가요'), text: t('나무 길이 모든 도토리까지 이어지면 성공이에요.'), button: t('다음'), onNext: coachPress, pad: 4, round: 20,
      rect: () => unionRect(root.querySelectorAll('.board .tile')),
    });
  }

  // ----- 상태 표시 -----
  function refreshHud() {
    const { conn } = session;
    const count = String(session.moves);
    if (movesEl.textContent !== count) {
      // 횟수가 바뀌면 숫자가 한 번 통 튄다
      moveCount.style.setProperty('--move-digits', String(count.length));
      movesEl.classList.remove('bump');
      void movesEl.offsetWidth;
      movesEl.classList.add('bump');
    }
    movesEl.textContent = count;
    const full = conn.requiredTotal > 0 && conn.requiredConnected >= conn.requiredTotal;
    litEl.textContent = String(conn.requiredConnected);
    hamBox.classList.toggle('full', full);
    hamBox.setAttribute('aria-label', t('찾은 도토리 {a}개, 전체 {b}개', { a: conn.requiredConnected, b: conn.requiredTotal }));
    if (conn.requiredConnected > lastFed && !session.result.canComplete) sound.fed();
    lastFed = conn.requiredConnected;
    const now = starsAt(stage, session.moves);
    ringFill.setAttribute('stroke-dasharray', `${RING_C * starGauge(stage, session.moves)} ${RING_C}`);
    lineEls.forEach((line) => {
      const n = Number(line.dataset.n);
      line.classList.toggle('cur', n === now);
      line.classList.toggle('lost', n > now);
    });
    ring.dataset.stars = String(now);
    ring.setAttribute('aria-label', t('{moves}번 밀었어요. 지금 끝내면 별 {now}개. 별 셋은 {s3}번, 별 둘은 {s2}번까지', { moves: session.moves, now, s3: stage.star3, s2: stage.star2 }));
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
  // 입문 1에서만 다음에 누를 화살표를 알려 준다(힌트 개수와 무관). 입문 2·3은 화살표 없이 스스로 푼다.
  function guide() {
    if (!stage.tutorial || stage.id !== 'T1' || completing || session.result.canComplete) return;
    const hint = nextHint(stage, session.cells, session.historyCodes(), null);
    if (hint.type === 'move') board.showHint(hint.move);
  }

  function afterShift() {
    // 모든 햄스터에게 길이 닿으면 자동으로 배달 완료
    if (session.result.canComplete) complete();
    else guide();
  }

  function handleMove(move) {
    if (destroyed || completing || board.busy || hintBusy) return;
    // 입문 1의 안내 중에는 밝혀 준 화살표만 눌린다
    if (coach && coach.active) {
      const want = nextHint(stage, session.cells, session.historyCodes(), null);
      if (coachStep !== 'press' || (want.type === 'move' && moveToCode(want.move) !== moveToCode(move))) return;
      coach.hide();
    }
    const res = session.move(move);
    if (!res.ok) return; // 무효/잠긴 줄: 0수
    // 안내 중: 표시된 줄이면 다음 수로, 다른 줄이면 그 수를 되돌리는 화살표를 맨 앞에 끼운다(무료 교정)
    undoLeft = 0;
    hideNote();
    let wrong = false;
    if (guideQ) {
      if (guideQ[0] === moveToCode(move)) guideQ.shift();
      else { guideQ.unshift(moveToCode(inverseMove(move))); wrong = true; }
    }
    clearHint();
    buzz(8);
    sound.slide();
    refreshHud();
    persist();
    board.animateShift(res.prevCells, res.applied, session.cells, session.conn, () => { afterShift(); afterGuideStep(wrong); });
  }

  // 되돌린 수가 안내하려던 수면 안내를 한 칸 나아가고, 아니면 방금 지운 수를 다시 안내한다
  function guideAfterUndo(undone) {
    if (!guideQ) return;
    if (guideQ[0] === moveToCode(inverseMove(moveFromCode(undone)))) guideQ.shift();
    else guideQ.unshift(undone);
  }

  function handleUndo() {
    if (destroyed || completing || board.busy || hintBusy) return;
    const codes = session.historyCodes();
    const res = session.undo();
    if (!res.ok) return;
    guideAfterUndo(codes[codes.length - 1]);
    sound.back();
    clearHint();
    if (undoLeft > 0) {
      undoLeft -= 1;
      if (undoLeft > 0 && session.canUndo) undoBtn.classList.add('hinted');
      else { undoLeft = 0; note(t('이제 경로를 알려 줄 수 있어요'), t('힌트를 다시 눌러 보세요')); }
    }
    refreshHud();
    persist();
    board.animateShift(res.prevCells, res.applied, session.cells, session.conn, () => { afterShift(); afterGuideStep(false); });
  }

  function handleRestart() {
    if (destroyed || completing || board.busy || hintBusy) return;
    const codes = session.historyCodes();
    for (let i = codes.length - 1; i >= 0; i--) guideAfterUndo(codes[i]);
    undoLeft = 0;
    sound.back();
    session.restart();
    clearHint();
    refreshHud();
    persist();
    board.render(session.cells, session.conn);
    guide();
    afterGuideStep(false);
  }

  // ----- 힌트 -----
  function setHints(n) {
    if (H.infinite) n = Math.max(n, 99); // 테스트용 무한 힌트
    store.data.hints = Math.max(0, n);
    store.save();
    hintCount.textContent = String(store.data.hints);
    if (!stage.tutorial) hintBtn.setAttribute('aria-label', t('힌트, {n}개 남음', { n: store.data.hints }));
  }

  function showGuide() {
    clearHint();
    if (guideQ && guideQ.length) board.showHint(moveFromCode(guideQ[0]));
  }

  function afterGuideStep(wrong) {
    if (!guideQ || completing || destroyed) return;
    if (guideQ.length === 0) {
      guideQ = null;
      note(t('안내는 여기까지예요'), t('이어서 풀어 보세요!'));
      return;
    }
    showGuide();
    if (wrong) { sound.wrong(); note(t('그 줄이 아니에요'), t('깜빡이는 화살표로 되돌려 주세요')); }
  }

  function closeSheet() {
    sheet.hidden = true;
    sheet.replaceChildren();
  }

  function openSheet(label, children) {
    sound.open();
    sheet.replaceChildren(el('div', { class: 'modal-card hint-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, children));
    sheet.hidden = false;
    sheet.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  }

  // desc에 배열을 주면 줄을 나눠 적는다
  const choice = (cls, label, cost, desc, onclick, disabled) => el('button', { class: cls, type: 'button', disabled, onclick }, [
    el('span', { class: 'ch-main' }, [label, cost == null ? null : el('em', {}, [icon('bulb', 'bulb'), ` ${cost}`])]),
    el('small', {}, [].concat(desc).flatMap((t, i) => (i ? [el('br'), t] : [t]))),
  ]);
  const earnRow = (ic, label, gain) => el('div', { class: 'earn-row' }, [
    ic === 'star' ? starIcon(true, 18) : ic === 'flag' ? flagIcon(18) : icon(ic), el('span', { text: label }), el('b', {}, [icon('bulb', 'bulb'), gain]),
  ]);
  const soonRow = (name) => el('div', { class: 'ghost soon-row' }, [name, el('span', { class: 'soon', text: t('준비 중') })]);

  // 오른쪽 위 톱니: 소리·진동 스위치와 나가기
  function openSettingsSheet() {
    if (destroyed || completing || hintBusy) return;
    openSheet(t('설정'), [
      el('h2', { text: t('설정') }),
      el('div', { class: 'card set' }, soundSwitches(store)),
      el('button', { class: 'btn wide', type: 'button', onclick: () => { closeSheet(); if (!leaving) backTo(); } }, [icon('back'), t('목록으로 나가기')]),
      el('button', { class: 'link-btn', type: 'button', text: t('닫기'), onclick: closeSheet }),
    ]);
  }

  // 전구 버튼: 벽 보기(1) / 경로 안내(2) / 즉시 성공(3)을 고르는 창. 힌트가 모자라면 얻는 법을 함께 보여 준다.
  function openHintSheet() {
    if (destroyed || completing || board.busy || hintBusy) return;
    if (guideQ && guideQ.length) { showGuide(); note(t('안내 중이에요'), t('화살표를 따라 밀어 보세요')); return; }
    const have = store.data.hints;
    openSheet(t('힌트'), [
      el('h2', {}, [`${t('힌트')} `, el('b', {}, [icon('bulb', 'bulb'), ` ${have}`])]),
      wallsOn
        ? choice('btn choice', t('벽 보기'), null, t('벽을 보고 있어요.'), null, true)
        : choice('go choice', t('벽 보기'), H.wallCost, [t('길이 이어지지 않는 곳에 벽을 세워요.'), t('완성된 경로를 짐작할 수 있어요.')], useWalls, have < H.wallCost),
      choice(wallsOn ? 'go choice' : 'btn choice', t('경로 안내'), H.guideCost, t('남은 경로의 절반을 화살표로 알려 줘요.'), useHint, have < H.guideCost),
      choice('btn choice', t('즉시 성공'), H.clearCost, t('바로 성공하고 별 1개를 받아요.'), useClear, have < H.clearCost),
      have < H.clearCost ? el('div', { class: 'earn' }, [
        el('h3', { text: t('힌트 받는 법') }),
        H.dailyFree > 0 ? earnRow('cal', t('날마다 접속'), `+${H.dailyFree}`) : null,
        earnRow('play', t('오늘의 도전 완료'), `+${H.dailyClear}`),
        H.clearReward > 0 ? earnRow('star', t('판을 처음 성공'), `+${H.clearReward}`) : null,
        earnRow('flag', t('최단 경로로 성공'), `+${H.flagReward}`),
      ]) : null,
      // 준비 중인 자리(광고·결제를 붙이면 실제 버튼으로 바꾼다)
      soonRow(t('광고 보고 힌트 받기')),
      el('button', {
        class: 'btn soon-row buy-row', type: 'button',
        onclick: () => { closeSheet(); openHintPacks(ctx, () => { if (!destroyed) setHints(store.data.hints); }); },
      }, [t('힌트 묶음 구매'), icon('play')]),
      el('button', { class: 'link-btn', type: 'button', text: t('닫기'), onclick: closeSheet }),
    ]);
  }

  // 벽 보기: 보관한 정답에서 길이 이어지지 않는 칸 사이에 벽을 세운다. 재시작해도 남고, 판을 나가면 사라진다.
  function useWalls() {
    closeSheet();
    if (destroyed || completing || board.busy || hintBusy || wallsOn || store.data.hints < H.wallCost) return;
    const walls = solutionWalls(stage, loadSolution(content, stage.id));
    if (!walls.length) { toast(t('이 판은 벽 보기를 쓸 수 없어요.')); return; }
    setHints(store.data.hints - H.wallCost);
    wallsOn = true;
    track('hint_use', { kind: 'walls', stage: stage.id });
    ctx.state.wallsFor = wallKey;
    board.setWalls(walls);
    sound.hint();
    note(t('벽을 세웠어요'), t('벽으로 막힌 곳은 길이 이어지지 않아요'), 3200);
  }

  const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

  // 지금 배치에서 길을 찾아 그 절반을 이어서 안내한다.
  // 버튼을 누른 순간부터 searchMs 안에 반드시 답한다. 그동안 판 위에 "길을 찾는 중" 표시가 뜬다.
  async function useHint() {
    closeSheet();
    if (destroyed || completing || board.busy || hintBusy || store.data.hints < H.guideCost) return;
    hintBusy = true;
    undoLeft = 0;
    clearHint();
    seeking.hidden = false;
    const t0 = performance.now();
    let plan = null; // null이면 시간 안에 답이 오지 않은 것
    try {
      plan = await Promise.race([
        requestPlan(stage, session.cells.slice(), session.historyCodes(), loadSolution(content, stage.id), { budgetMs: H.searchBudgetMs, maxStates: H.maxStates }),
        pause(H.searchMs).then(() => null),
      ]);
    } catch { /* 못 찾은 것으로 처리 */ }
    // 표시가 번쩍하고 사라지지 않게 최소한은 보여 준다
    const shown = performance.now() - t0;
    if (shown < H.waitMinMs) await pause(H.waitMinMs - shown);
    seeking.hidden = true;
    hintBusy = false;
    if (destroyed || completing) return;
    if (plan && plan.type === 'path') { startGuide(plan); return; }
    if (plan && plan.type === 'far' && session.canUndo) {
      // 여기서는 너무 멀다: 차감하지 않고, 되돌릴 수를 알려 주며 한 번에 되돌릴 수 있게 한다
      const n = Math.min(plan.undo, session.moves);
      openSheet(t('경로가 너무 멀어요'), [
        el('h2', { text: t('경로가 너무 멀어요') }),
        el('p', { class: 'sheet-text' }, [
          t('여기서는 경로를 찾기 어려워요.'), el('br'),
          el('b', { text: t('{n}번@undo', { n }) }), t(' 되돌리면 알려 줄 수 있어요.'),
        ]),
        el('p', { class: 'sheet-sub', text: t('힌트는 줄지 않았어요.') }),
        el('button', { class: 'go choice', type: 'button', onclick: () => { closeSheet(); undoMany(n); } }, [
          el('span', { class: 'ch-main' }, [icon('undo'), t('{n}번 한 번에 되돌리기', { n })]),
        ]),
        el('button', { class: 'link-btn', type: 'button', text: t('닫기'), onclick: closeSheet }),
      ]);
      return;
    }
    if (plan) note(t('지금은 알려 줄 수가 없어요'), t('힌트는 줄지 않았어요'), 3200);
    else note(t('시간 안에 경로를 찾지 못했어요'), t('힌트는 줄지 않았어요'), 3200);
  }

  // 여러 수를 한 번에 되돌린다(힌트의 "너무 멀어요" 창에서)
  function undoMany(n) {
    if (destroyed || completing || board.busy || hintBusy) return;
    let done = 0;
    while (done < n && session.canUndo && session.undo().ok) done++;
    if (!done) return;
    guideQ = null;
    undoLeft = 0;
    clearHint();
    refreshHud();
    persist();
    board.render(session.cells, session.conn);
    note(t('{n}번 되돌렸어요', { n: done }), t('힌트를 다시 누르면 경로를 알려 줄게요'), 3200);
  }

  function startGuide(plan) {
    if (destroyed || completing || store.data.hints < H.guideCost) return;
    setHints(store.data.hints - H.guideCost);
    track('hint_use', { kind: 'guide', stage: stage.id });
    const n = guideCount(plan, H.minGuide);
    guideQ = plan.moves.slice(0, n);
    showGuide();
    sound.hint();
    const left = plan.exact ? t('{n}번 남았어요', { n: plan.moves.length }) : t('약 {n}번 남았어요', { n: plan.moves.length });
    if (n >= plan.moves.length) note(left, t('화살표를 따라 끝까지 밀어 보세요'), 3200);
    else note(left, t('화살표를 따라 {n}번 밀어 보세요', { n }), 3200);
  }

  // 즉시 성공: 미는 순서를 보여 주지 않고 완성된 판으로 바로 바꾼 뒤 별 1개로 끝낸다.
  // (재생을 보고 외워 재도전하는 것을 막으려고 2026-11-11에 재생을 뺐다.) 힌트는 끝났을 때 차감한다.
  function useClear() {
    closeSheet();
    if (destroyed || completing || board.busy || hintBusy || store.data.hints < H.clearCost) return;
    const solution = loadSolution(content, stage.id);
    if (!solution || !solution.length) { toast(t('이 판은 즉시 성공을 쓸 수 없어요.')); return; }
    guideQ = null;
    clearHint();
    session.restart();
    clearCurrent(store, content);
    for (const code of solution) {
      if (session.result.canComplete || !session.move(moveFromCode(code)).ok) break;
    }
    refreshHud();
    board.render(session.cells, session.conn);
    if (!session.result.canComplete) {
      toast(t('즉시 성공을 끝내지 못했어요. 힌트는 줄지 않았어요.'), 3200);
      return;
    }
    skipped = true;
    setHints(store.data.hints - H.clearCost);
    track('hint_use', { kind: 'clear', stage: stage.id });
    complete();
  }

  // 배치/별/기록을 한 번만 확정한 뒤 연출한다. 연출이 끊겨도 기록은 이미 저장되어 있다.
  function complete() {
    if (destroyed || completing || !session.result.canComplete) return;
    completing = true;
    track('stage_clear', { stage: stage.id, stars: skipped ? 0 : session.result.stars, moves: session.moves, skipped });
    const result = skipped ? { ...session.result, stars: 1 } : session.result;
    const moves = session.moves;
    const firstDaily = !!date && !store.content(content.version).daily[date];
    const prevRec = getRecord(store, content, stage.id);
    const outcome = confirmCompletion(store, content, stage, session.result, moves, date ? { date } : null, { skipped });
    // 받은 힌트: 그날의 도전을 처음 끝내면 1개, 정규 판 첫 성공 1개, 그 판의 첫 깃발 1개
    const before = store.data.hints;
    if (firstDaily) store.data.hints += H.dailyClear;
    store.data.hints += clearRewardHints({
      regular: isRegular(stage) && !date, skipped, prev: prevRec,
      hadFlag: hasFlag(stage, prevRec), flagNow: hasFlag(stage, outcome?.record),
    });
    const gotHints = store.data.hints - before;
    if (gotHints > 0) setHints(store.data.hints);
    guideQ = null;
    hideNote();
    hideToast();
    ads.noteStageCompleted(stage);
    clearHint();
    buzz(30);
    sound.win();
    board.setDisabled(true);
    board.celebrate();
    undoBtn.disabled = true;
    restartBtn.disabled = true;
    later(() => showResult(result, moves, outcome, gotHints), prefersReducedMotion() ? 0 : CONFIG.anim.completeDelay);
  }

  // ----- 결과 -----
  function showResult(result, moves, outcome, gotHint) {
    const next = nextStage(content, stage);
    const frame = hamsterFrame({ withSuccess: true, cls: 'big' });
    const ham = el('div', { class: 'res-ham' }, [el('i'), el('i'), el('i'), el('i'), frame]);
    const stars = el('div', {
      class: 'result-stars', role: 'img', 'aria-label': t('별 {n}개', { n: result.stars }),
    });
    const starEls = [];
    {
      for (let i = 0; i < 3; i++) {
        const s = starIcon(i < result.stars, 50);
        if (i < result.stars) { s.classList.add('pending'); starEls.push(s); }
        stars.appendChild(s);
      }
    }

    // 기록 표시는 짧게: 새 기록이면 배지, 아니면 내 최고 수만
    let badge = null;
    if (!stage.tutorial && outcome && !skipped) {
      if (outcome.firstClear || outcome.newBest) badge = el('span', { class: 'new', text: outcome.firstClear ? t('첫 성공') : t('새 기록') });
      else if (outcome.record.best != null && outcome.record.best < moves) badge = el('span', { class: 'new plain', text: t('최고기록 {n}', { n: outcome.record.best }) });
    }

    // 최단 경로 깃발과 기록 깨기(즉시 성공은 해당 없음)
    const isShortest = !skipped && moves <= stage.shortest;
    const brokeRecord = !skipped && !stage.tutorial && moves < shortAtStart;
    if (brokeRecord) badge = null;

    let primaryLabel = t('목록');
    let primaryAction = backTo;
    if (stage.tutorial) {
      if (next) { primaryLabel = t('다음 판'); primaryAction = () => ctx.goPlay(next); } else if (ctx.afterTutorial) {
        primaryLabel = ctx.afterTutorial.label; primaryAction = ctx.afterTutorial.go;
      } else { primaryLabel = t('스테이지 고르기'); primaryAction = () => ctx.go('home'); }
    } else if (next && isRegular(stage)) {
      primaryLabel = t('다음 판');
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
    const resultCount = el('b', { text: t('{moves}번', { moves }) });
    const card = el('div', { class: 'result-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('성공') }, [
      isShortest ? el('h2', { class: 'flag-title' }, [flagIcon(28), t('최단 경로 성공!')]) : el('h2', { text: t('성공@title') }),
      stars,
      ham,
      skipped ? null : brokeRecord ? el('div', { class: 'pill record' }, [el('span', { text: t('기록을 깼어요!') }), el('small', { text: t('최단 경로 {a} → {b}', { a: shortAtStart, b: moves }) })]) : el('div', { class: 'pill' }, [el('span', { class: 'pill-time' }, [resultCount, t(' 만에 성공')]), badge]),
      isShortest && noFlagYet ? el('p', { class: 'got-hint flag-tip' }, [flagIcon(18), t(' 최단 경로로 성공한 판마다 깃발을 모아요')]) : null,
      gotHint ? el('p', { class: 'got-hint' }, [icon('bulb', 'bulb'), t(' 힌트 {n}개를 받았어요', { n: gotHint })]) : null,
      primary,
      el('div', { class: 'two' }, [
        el('button', {
          class: 'btn wide', type: 'button', onclick: () => { if (!leaving) ctx.goPlay(stage, { date }); },
        }, [icon('redo'), t('재도전')]),
        stage.tutorial || skipped ? null : el('button', {
          class: 'btn wide', type: 'button', onclick: () => {
            if (leaving) return;
            const url = buildLink(location.href, { version: content.version, stageId: stage.id, date });
            const text = shareText({
              gameName: CONFIG.gameName, title, stars: result.stars, moves, hasBonus: false, tutorial: stage.tutorial, shortest: isShortest, record: brokeRecord,
            });
            shareResult({ title: CONFIG.fullName, text, url });
          },
        }, [icon('share'), t('공유')]),
      ]),
      primaryAction === backTo ? null : el('button', { class: 'link-btn', type: 'button', text: t('목록'), onclick: once(backTo) }),
    ]);
    card.classList.add(`stars-${result.stars}`);
    overlay.replaceChildren(card);
    overlay.hidden = false;
    primary.focus({ preventScroll: true });

    // 대기 → 성공 전환, 짧은 점프, 별 등장(총 1초 안팎)
    const reduce = prefersReducedMotion();
    if (!reduce) {
      // 별이 다 뜬 뒤 색종이가 한 번 터진다(별이 많을수록, 최단 경로면 더 많이). 즉시 성공에는 없다.
      const starsDone = CONFIG.anim.successSwap + 150 + result.stars * CONFIG.anim.starStep;
      if (!skipped) {
        const n = (result.stars === 3 ? 20 : result.stars === 2 ? 12 : 7) + (isShortest ? 8 : 0);
        const tones = ['#f7a928', '#ee962b', '#ffd98a', '#c98a4b', '#8a5a33', '#fff3d6'];
        const bits = [];
        for (let i = 0; i < n; i++) {
          const side = i % 2 ? 1 : -1;
          const x = side * (24 + Math.random() * 130);
          bits.push(el('i', { style: `--x:${x.toFixed(0)}px;--up:${(-40 - Math.random() * 70).toFixed(0)}px;--y:${(60 + Math.random() * 110).toFixed(0)}px;--r:${(side * (200 + Math.random() * 400)).toFixed(0)}deg;--d:${(Math.random() * 160).toFixed(0)}ms;--c:${tones[i % tones.length]}` }));
        }
        const fx = el('div', { class: 'confetti', 'aria-hidden': 'true' }, bits);
        card.appendChild(fx);
        later(() => fx.classList.add('fly'), starsDone);
        later(() => fx.remove(), starsDone + 1700);
      }
      // 민 횟수는 0에서부터 빠르게 올라간다
      if (!skipped && !brokeRecord && moves > 1) {
        const steps = Math.min(moves, 12);
        for (let k = 0; k <= steps; k++) {
          const count = Math.round((moves * k) / steps);
          later(() => { resultCount.textContent = t('{moves}번', { moves: count }); }, 260 + k * 35);
        }
      }
    }
    const swap = () => { frame.classList.add('success'); ham.classList.add('cheer'); if (!reduce) frame.classList.add('jump'); };
    if (reduce) {
      swap();
      starEls.forEach((s) => s.classList.remove('pending'));
    } else {
      later(swap, CONFIG.anim.successSwap);
      starEls.forEach((s, i) => later(() => { s.classList.remove('pending'); s.classList.add('pop'); sound.star(i); },
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
  // 화면이 붙은 뒤에 위치를 재야 하므로 한 박자 늦게 시작한다
  if (coach) later(coachStart, 350);
  // 힌트를 처음 눌렀을 때 빠르도록, 완성 쪽에서 거꾸로 펼친 표를 미리 만들어 둔다
  if (!stage.tutorial) warmPlan(stage, loadSolution(content, stage.id));

  return {
    el: root,
    destroy() {
      destroyed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      ads.stopPlayClock();
      for (const t of timers) clearTimeout(t);
      timers.clear();
      coach?.destroy();
      board.destroy();
      root.remove();
    },
  };
}
