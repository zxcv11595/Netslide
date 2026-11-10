// 작은 광고 어댑터. 판 사이('다음 스테이지' 전환)에서만 전면 광고 기회를 만든다.
// 사업자가 정해지지 않았으므로 provider가 없으면 항상 즉시 통과(no-op)한다.
//
// provider 인터페이스(사업자 SDK를 감싸서 구현):
//   isReady(): boolean                      — SDK 로딩/준비가 끝났는가
//   show({ onStart, onFinish })             — 전면 광고 1회 요청
//     onStart()                             — 광고가 실제로 화면에 표시되기 시작함
//     onFinish('shown' | 'no-fill' | 'error') — SDK의 공식 완료/실패 콜백에서 정확히 한 번 호출
//
// 상태: 'idle'(요청 없음) / 'requesting'(요청함, 아직 표시 전) / 'showing'(실제 표시 중)
import { isRegular } from '../game/progress.js';

export function createAdManager({
  config, provider = null, store,
  now = () => Date.now(),
  timers = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t) },
  onPause = () => {}, onResume = () => {},
}) {
  let state = 'idle';
  let inflight = null;
  let lastFailAt = -Infinity;
  let playSince = null;
  const stats = { requests: 0, impressions: 0, failures: 0 };

  const ads = () => store.data.ads;
  const enabled = () => !!config.enabled && !!provider;

  function eligible() {
    return enabled()
      && ads().doneIds.length >= config.minDistinctStages
      && ads().playMs >= config.minPlayMs
      && now() - lastFailAt >= config.retryCooldownMs;
  }

  function recordImpression() {
    const a = ads();
    a.playMs = 0;
    a.doneIds = [];
    a.lastShownAt = now();
    a.impressions += 1;
    stats.impressions += 1;
    if (playSince != null) playSince = now();
    store.save();
  }

  function request() {
    stats.requests += 1;
    state = 'requesting';
    let started = false;
    let finished = false;
    let settle;
    const promise = new Promise((resolve) => { settle = resolve; });
    let settled = false;
    const resolveOnce = (outcome) => {
      if (settled) return;
      settled = true;
      timers.clearTimeout(timer);
      inflight = null;
      settle({ outcome });
    };
    // 표시가 시작되기 전까지만 기다린다. 넘으면 사용자를 붙잡지 않고 다음 판으로 보낸다.
    // 이 요청이 끝났다는 콜백이 오기 전에는 새 요청을 하지 않는다(state 유지).
    const timer = timers.setTimeout(() => { if (!started) resolveOnce('timeout'); }, config.requestTimeoutMs);

    const onStart = () => {
      if (finished || started) return;
      started = true;
      state = 'showing';
      timers.clearTimeout(timer);
      onPause(); // 실제 표시 중에만 게임 입력/오디오 정지. 늦게 뜬 광고도 정지는 한다.
    };
    const onFinish = (result) => {
      if (finished) return;
      finished = true;
      const shown = started && result === 'shown';
      if (started) onResume();
      if (shown) recordImpression();
      else { lastFailAt = now(); stats.failures += 1; } // 실패는 노출로 세지 않는다
      state = 'idle';
      // 이미 타임아웃으로 넘어간 요청의 늦은 콜백은 화면을 이동시키지 않는다(resolveOnce가 무시).
      resolveOnce(shown ? 'shown' : (result === 'no-fill' ? 'no-fill' : 'error'));
    };
    inflight = promise;
    try {
      provider.show({ onStart, onFinish });
    } catch {
      onFinish('error');
    }
    return promise;
  }

  return {
    get state() { return state; },
    get stats() { return { ...stats }; },
    isEnabled: enabled,
    isEligible: eligible,

    // 정규 판 완료 기록: 재도전 반복으로 조건을 채우지 못하게 서로 다른 판만 센다.
    noteStageCompleted(stage) {
      if (!isRegular(stage)) return;
      if (!ads().doneIds.includes(stage.id)) { ads().doneIds.push(stage.id); store.save(); }
    },

    // 입문 이후 일반 플레이 시간 누적
    startPlayClock(stage) {
      playSince = isRegular(stage) ? now() : null;
    },
    stopPlayClock() {
      if (playSince == null) return;
      ads().playMs += Math.max(0, now() - playSince);
      playSince = null;
      store.save();
    },

    // '다음 스테이지' 전환에서만 호출한다. 진행 상태는 호출 전에 이미 저장되어 있어야 한다.
    // 어떤 결과든 호출자는 다음 판으로 진행하면 된다.
    showBetweenStages() {
      if (inflight) return inflight; // 중복 클릭: 같은 요청을 공유
      if (!enabled()) return Promise.resolve({ outcome: 'disabled' });
      if (state !== 'idle') return Promise.resolve({ outcome: 'busy' });
      if (playSince != null) { ads().playMs += Math.max(0, now() - playSince); playSince = now(); }
      if (!eligible()) return Promise.resolve({ outcome: 'not-eligible' });
      let ready = false;
      try { ready = !!provider.isReady(); } catch { ready = false; }
      if (!ready) return Promise.resolve({ outcome: 'not-ready' }); // '광고 준비 중'으로 붙잡지 않는다
      return request();
    },
  };
}
