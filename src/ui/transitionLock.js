// 줄 이동 연출 동안 입력을 잠그는 작은 잠금.
// 전환 종료 이벤트가 오지 않아도 fallback 시간이 지나면 반드시 풀린다.
// 논리 상태는 잠금과 무관하게 이미 확정되어 있으므로, 잠금은 화면과 입력만 다룬다.
export function createTransitionLock(timers = {
  setTimeout: (f, ms) => setTimeout(f, ms),
  clearTimeout: (t) => clearTimeout(t),
}) {
  let token = 0;
  let locked = false;
  let timer = null;
  let onDone = null;

  function finish(my) {
    if (my !== token || !locked) return;
    timers.clearTimeout(timer);
    timer = null;
    locked = false;
    const done = onDone;
    onDone = null;
    if (done) done();
  }

  return {
    get locked() { return locked; },
    // 잠금 시작. 반환된 함수를 부르거나 fallbackMs가 지나면 done이 정확히 한 번 호출된다.
    begin(fallbackMs, done) {
      if (locked) this.cancel();
      const my = ++token;
      locked = true;
      onDone = done;
      timer = timers.setTimeout(() => finish(my), fallbackMs);
      return () => finish(my);
    },
    // 화면 전환/재시작 등으로 취소: done을 부르지 않고 풀기만 한다.
    cancel() {
      token++;
      if (timer != null) timers.clearTimeout(timer);
      timer = null;
      locked = false;
      onDone = null;
    },
  };
}
