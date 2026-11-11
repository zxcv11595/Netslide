import { t } from './i18n.js';
import './styles.css';
import './scene.css';
import { CONFIG } from './config.js';
import { CONTENT, CONTENTS } from './data/content.js';
import { createStore } from './storage/storage.js';
// 광고 관리 코드. 폴더·파일 이름에 'ads'를 쓰지 않는다: 광고 차단 프로그램이 주소의 /ads/ 를 막아 게임이 로딩 화면에서 멈춘다.
import { createAdManager } from './breaks/breakManager.js';
import { isTutorialDone, nextTutorial, clearCurrent, migrateTutorialStars, migrateStarThresholds } from './game/progress.js';
import { parseLink } from './game/links.js';
import { kstDateString } from './game/daily.js';
import { grantDailyHint } from './game/hintWallet.js';
import { createHomeScreen, TIERS } from './ui/home.js';
import {
  createStagesScreen, createDailyScreen, createProfileScreen, createSettingsScreen, createPrivacyScreen,
} from './ui/screens.js';
import { createShopScreen } from './ui/shop.js';
import { installBackNav, openExitDialog } from './ui/backNav.js';
import { initAnalytics, track } from './analytics.js';
import { createPurchases } from './shop/purchases.js';
import { getLang } from './i18n.js';
import { createPlayScreen } from './ui/play.js';
import { toast } from './ui/toast.js';
import { initSound, sound } from './ui/sound.js';

const LINK_ERROR = {
  version: t('이 링크는 지금 버전에서 열 수 없는 판이에요.'),
  id: t('링크의 판을 찾지 못했어요.'),
  date: t('링크의 날짜가 올바르지 않아요.'),
  future: t('아직 열리지 않은 도전이에요.'),
};

// 로딩 화면을 타이틀로 바꾸고 누를 때까지 기다린다. click으로 받아야 눌렀던 손가락이 새 화면의 버튼을 같이 누르지 않는다.
async function titleGate() {
  const app = document.getElementById('app');
  const l = app && app.querySelector('.loading');
  if (!l) return;
  const img = l.querySelector('.character img');
  const happy = img ? img.src.replace('hamster-idle', 'hamster-success') : null;
  // 그림을 미리 읽되, 화면이 가려져 있으면 끝나지 않을 수 있으므로 오래 기다리지 않는다
  if (happy) { const pre = new Image(); pre.src = happy; await Promise.race([pre.decode().catch(() => {}), new Promise((r) => { setTimeout(r, 1500); })]); }
  const minShow = 1250 - performance.now(); // 게이지가 차오르는 모습을 잠깐은 보여 준다
  if (minShow > 0) await new Promise((r) => setTimeout(r, minShow));
  if (img && happy) img.src = happy;
  l.classList.add('done');
  l.setAttribute('role', 'button');
  l.setAttribute('aria-label', t('화면을 눌러 시작'));
  l.tabIndex = 0;
  await new Promise((resolve) => {
    const start = () => { l.removeEventListener('click', start); l.removeEventListener('keydown', onKey); resolve(); };
    const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); } };
    l.addEventListener('click', start);
    l.addEventListener('keydown', onKey);
  });
}

async function boot() {
  const app = document.getElementById('app');
  document.title = CONFIG.fullName;
  const ver = app.querySelector('.loading .ver');
  if (ver) ver.textContent = `v${CONFIG.version}`; // 타이틀 화면 오른쪽 아래
  // 개발 서버에서만: 주소에 ?reset 을 붙여 열면 저장된 기록을 모두 지우고 처음 시작 상태가 된다(언어 설정은 남긴다).
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('reset')) {
    try { localStorage.removeItem(CONFIG.storageKey); } catch { /* 저장소를 못 쓰는 환경 */ }
    const clean = new URL(location.href);
    clean.searchParams.delete('reset');
    history.replaceState(null, '', clean);
  }
  const store = createStore({ key: CONFIG.storageKey });
  const content = CONTENT;
  migrateTutorialStars(store, content);
  migrateStarThresholds(store, content);
  initSound(store.data.settings);
  // 보통 버튼을 누를 때의 "톡". 판의 화살표와 재시작·되돌리기는 자기 소리가 따로 있다.
  document.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest('button, a.r') : null;
    if (b && !b.disabled && !b.closest('.play-controls') && !b.closest('.board')) sound.tap();
  }, true);

  // 광고: 사업자가 정해지기 전에는 provider가 없어 항상 통과한다.
  // 개발 서버에서만 ?mockAd=... 로 모의 provider를 붙여 흐름을 시험한다(운영 빌드에서는 제거된다).
  let provider = null;
  let adConfig = CONFIG.ads;
  if (import.meta.env.DEV) {
    const p = new URLSearchParams(location.search);
    if (p.has('mockAd')) {
      const { createMockProvider } = await import('./breaks/mockBreak.js');
      provider = createMockProvider(p.get('mockAd'));
      adConfig = { ...CONFIG.ads, enabled: true };
      if (p.has('adNow')) adConfig = { ...adConfig, minDistinctStages: 1, minPlayMs: 0, retryCooldownMs: 0 };
    }
  }
  // 결제: 실제 사업자는 아직 없다. CONFIG.shop.simulatePay가 켜져 있으면 결제가 된 것처럼 끝까지 진행하는
  // 모의 결제를 붙인다(테스트용, 돈은 나가지 않는다). 끄면 provider가 없어 "아직 구매할 수 없어요"로 끝난다.
  // 개발 서버에서는 ?mockPay=cancel|fail 로 취소·실패 화면도 시험할 수 있다.
  let payProvider = null;
  const payMode = import.meta.env.DEV ? new URLSearchParams(location.search).get('mockPay') : null;
  if (payMode || CONFIG.shop.simulatePay) {
    const { createMockPay } = await import('./shop/mockPay.js');
    payProvider = createMockPay(payMode || 'ok');
  }
  const purchases = createPurchases({ store, provider: payProvider, lang: getLang() });
  purchases.restore(); // 광고 제거처럼 계속 남는 구매를 시작할 때 다시 확인한다(provider가 없으면 아무 일도 없다)

  const ads = createAdManager({
    config: adConfig,
    provider,
    store,
    noAds: () => purchases.owns('noads'),
    // 광고가 실제로 표시되는 동안에만 게임 입력을 멈춘다(오디오는 아직 없음).
    onPause: () => { app.inert = true; app.classList.add('paused'); },
    onResume: () => { app.inert = false; app.classList.remove('paused'); },
  });

  let screen = null;
  let pendingShared = null; // 입문 뒤에 돌아갈 공유 판
  const state = { tab: 'beginner' };

  function mount(next) {
    if (screen) screen.destroy();
    screen = next;
    app.replaceChildren(screen.el);
    window.scrollTo(0, 0);
  }

  const SCREENS = {
    home: createHomeScreen,
    stages: createStagesScreen,
    daily: createDailyScreen,
    shop: createShopScreen,
    profile: createProfileScreen,
    records: createProfileScreen, // 예전 이름
    settings: createSettingsScreen,
    privacy: createPrivacyScreen,
  };
  const ctx = { store, content, ads, purchases, state, go, goPlay };

  function go(name, params = {}) {
    mount((SCREENS[name] || createHomeScreen)(ctx, params));
  }

  // 뒤로 가기: 어느 화면에서든 종료 확인 창만 띄운다(앞 화면으로 돌아가는 동작은 넣지 않는다 — 사용자 지정).
  // 종료 창이 떠 있을 때 한 번 더 누르면 그 창이 닫힌다.
  let backNav = null;
  function handleBack() {
    const exitOpen = document.querySelector('.exit-sheet');
    if (exitOpen) { exitOpen.parentElement.click(); return; }
    if (app.inert) return; // 광고가 보이는 동안에는 아무것도 하지 않는다
    openExitDialog(() => backNav.exit());
  }

  function goPlay(stage, opts = {}) {
    if (TIERS.includes(stage.group)) state.tab = stage.group;
    let afterTutorial = null;
    if (stage.tutorial && pendingShared) {
      const shared = pendingShared;
      afterTutorial = {
        label: t('공유받은 판'),
        go: () => { pendingShared = null; goPlay(shared.stage, { date: shared.date }); },
      };
    }
    // 다른 판을 새로 시작하면 이전에 하던 판의 저장은 지운다(이어하기는 history를 넘겨받는다).
    if (!opts.history) clearCurrent(store, content);
    track('stage_start', { stage: stage.id });
    mount(createPlayScreen({ ...ctx, afterTutorial }, { stage, ...opts }));
  }

  // 타이틀: 다 불러오면 게이지가 가득 차고, 화면을 누르면 시작한다(눌러야 배경음도 시작된다)
  await titleGate();

  // 첫 진입: 공유 링크 → 하던 판 복원 → 홈
  const link = parseLink(location.search, CONTENTS, kstDateString());
  if (link.type !== 'none') {
    // 새로고침해도 같은 링크 처리가 반복되지 않도록 주소에서 파라미터를 지운다.
    const clean = new URL(location.href);
    for (const k of ['v', 's', 'd']) clean.searchParams.delete(k);
    history.replaceState(null, '', clean);
  }
  // 타이틀을 지난 뒤부터 뒤로 가기를 받는다(타이틀에서는 그대로 나간다)
  backNav = installBackNav({ onBack: handleBack });
  if (link.type === 'error') {
    go('home');
    toast(LINK_ERROR[link.reason], 4000);
  } else if (link.type === 'stage') {
    if (!isTutorialDone(store, content) && !link.stage.tutorial) {
      // 입문을 끝내기 전에 공유 링크로 들어오면 입문부터 하고, 끝난 뒤 그 판으로 간다(알림 없이)
      pendingShared = link;
      goPlay(nextTutorial(store, content));
    } else {
      goPlay(link.stage, { date: link.date });
    }
  } else if (!isTutorialDone(store, content)) {
    goPlay(nextTutorial(store, content)); // 입문 01을 끝내기 전에는 타이틀 다음에 바로 입문 01로 들어간다
  } else {
    go('home'); // 그 뒤로는 타이틀 다음에 항상 홈. 하던 판은 홈의 이어하기 버튼으로 간다
  }

  // 날마다 처음 들어오면 힌트 1개(보유 수가 적을 때만)
  const dailyHint = grantDailyHint(store, kstDateString());
  if (dailyHint > 0 && link.type === 'none') toast(t('오늘의 힌트 {n}개를 받았어요', { n: dailyHint }), 3200);

  initAnalytics();
  // 오프라인 실행: 배포한 웹에서만 서비스 워커를 켠다(개발 서버와 앱으로 감싼 경우는 제외)
  if (!import.meta.env.DEV && !window.Capacitor && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 지원하지 않거나 막힌 환경: 그냥 온라인으로만 동작 */ });
  }

  if (store.issue && store.issue !== 'corrupt' && store.issue !== 'newer') {
    toast(t('저장할 수 없는 환경이라 기록이 유지되지 않아요'), 4000);
  }
}

// 시작하다 실패해도 로딩 화면에서 멈추지 않게, 이유를 화면에 보여 준다.
function showBootError(err) {
  const app = document.getElementById('app');
  if (!app || app.querySelector('.screen')) return; // 이미 화면이 떴으면 건드리지 않는다
  const box = document.createElement('div');
  box.className = 'boot-error';
  box.innerHTML = `<b>${t('게임을 열지 못했어요')}</b><p>${t('광고 차단 프로그램을 쓰고 있다면 이 사이트에서 잠시 꺼 주세요. 그래도 안 되면 새로 고쳐 주세요.')}</p><small></small>`;
  box.querySelector('small').textContent = String(err && (err.message || err)).slice(0, 200);
  (app.querySelector('.loading') || app).appendChild(box);
}
boot().catch(showBootError);
