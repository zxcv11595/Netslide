import './styles.css';
import { CONFIG } from './config.js';
import { CONTENT, CONTENTS } from './data/content.js';
import { createStore } from './storage/storage.js';
import { createAdManager } from './ads/adManager.js';
import { isTutorialDone, nextTutorial, getCurrent, clearCurrent } from './game/progress.js';
import { parseLink } from './game/links.js';
import { kstDateString } from './game/daily.js';
import { createHomeScreen, TIERS } from './ui/home.js';
import {
  createStagesScreen, createDailyScreen, createShopScreen, createRecordsScreen, createSettingsScreen,
} from './ui/screens.js';
import { createPlayScreen, stageTitle } from './ui/play.js';
import { toast } from './ui/toast.js';

const LINK_ERROR = {
  version: '이 링크는 지금 버전에서 열 수 없는 판이에요.',
  id: '링크의 판을 찾지 못했어요.',
  date: '링크의 날짜가 올바르지 않아요.',
  future: '아직 열리지 않은 도전이에요.',
};

async function boot() {
  const app = document.getElementById('app');
  document.title = CONFIG.gameName;
  const store = createStore({ key: CONFIG.storageKey });
  const content = CONTENT;

  // 광고: 사업자가 정해지기 전에는 provider가 없어 항상 통과한다.
  // 개발 서버에서만 ?mockAd=... 로 모의 provider를 붙여 흐름을 시험한다(운영 빌드에서는 제거된다).
  let provider = null;
  let adConfig = CONFIG.ads;
  if (import.meta.env.DEV) {
    const p = new URLSearchParams(location.search);
    if (p.has('mockAd')) {
      const { createMockProvider } = await import('./ads/mockProvider.js');
      provider = createMockProvider(p.get('mockAd'));
      adConfig = { ...CONFIG.ads, enabled: true };
      if (p.has('adNow')) adConfig = { ...adConfig, minDistinctStages: 1, minPlayMs: 0, retryCooldownMs: 0 };
    }
  }
  const ads = createAdManager({
    config: adConfig,
    provider,
    store,
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
    records: createRecordsScreen,
    settings: createSettingsScreen,
  };
  const ctx = { store, content, ads, state, go, goPlay };

  function go(name, params = {}) {
    mount((SCREENS[name] || createHomeScreen)(ctx, params));
  }

  function goPlay(stage, opts = {}) {
    if (TIERS.includes(stage.group)) state.tab = stage.group;
    let afterTutorial = null;
    if (stage.tutorial && pendingShared) {
      const shared = pendingShared;
      afterTutorial = {
        label: '공유받은 판',
        go: () => { pendingShared = null; goPlay(shared.stage, { date: shared.date }); },
      };
    }
    // 다른 판을 새로 시작하면 이전에 하던 판의 저장은 지운다(이어하기는 history를 넘겨받는다).
    if (!opts.history) clearCurrent(store, content);
    mount(createPlayScreen({ ...ctx, afterTutorial }, { stage, ...opts }));
  }

  // 첫 진입: 공유 링크 → 하던 판 복원 → 홈
  const link = parseLink(location.search, CONTENTS, kstDateString());
  if (link.type !== 'none') {
    // 새로고침해도 같은 링크 처리가 반복되지 않도록 주소에서 파라미터를 지운다.
    const clean = new URL(location.href);
    for (const k of ['v', 's', 'd']) clean.searchParams.delete(k);
    history.replaceState(null, '', clean);
  }
  if (link.type === 'error') {
    go('home');
    toast(LINK_ERROR[link.reason], 4000);
  } else if (link.type === 'stage') {
    if (!isTutorialDone(store, content) && !link.stage.tutorial) {
      pendingShared = link;
      goPlay(nextTutorial(store, content));
      toast(`짧은 입문을 마치면 공유받은 판(${stageTitle(link.stage, link.date)})으로 갈게요`, 4000);
    } else {
      goPlay(link.stage, { date: link.date });
    }
  } else {
    const cur = getCurrent(store, content);
    if (cur) goPlay(cur.stage, { date: cur.date, history: cur.history });
    else go('home');
  }

  if (store.issue && store.issue !== 'corrupt' && store.issue !== 'newer') {
    toast('저장할 수 없는 환경이라 기록이 유지되지 않아요', 4000);
  }
}

boot();
