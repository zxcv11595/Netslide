// 모의 결제. 실제 결제는 일어나지 않는다. CONFIG.shop.simulatePay가 켜져 있으면 'ok'로 붙어서
// 결제가 된 것처럼 구매를 끝까지 진행한다(출시 전에 끈다).
// 개발 서버에서는 주소에 ?mockPay=cancel | fail 을 붙여 취소·실패 화면도 시험한다.
export function createMockPay(mode = 'ok', delayMs = 900) {
  const wait = () => new Promise((r) => { setTimeout(r, delayMs); });
  const bought = new Set();
  return {
    async purchase(id) {
      await wait();
      if (mode === 'cancel') return 'cancelled';
      if (mode === 'fail') return 'failed';
      bought.add(id);
      return 'ok';
    },
    async restore() {
      await wait();
      if (mode === 'fail') throw new Error('mock restore failed');
      return [...bought];
    },
    priceOf: () => null,
  };
}
