// 개발용 모의 광고 provider. main.js에서 개발 서버(import.meta.env.DEV)일 때만 불러오므로
// 운영 빌드에는 포함되지 않는다. ?mockAd=fill | nofill | error | slow | notready
export function createMockProvider(mode = 'fill') {
  return {
    isReady: () => mode !== 'notready',
    show({ onStart, onFinish }) {
      if (mode === 'nofill') { setTimeout(() => onFinish('no-fill'), 300); return; }
      if (mode === 'error') { setTimeout(() => onFinish('error'), 300); return; }
      const delay = mode === 'slow' ? 6000 : 300; // slow: 요청 타임아웃 뒤에 늦게 뜨는 광고
      setTimeout(() => {
        const overlay = document.createElement('div');
        overlay.className = 'mock-ad';
        overlay.innerHTML = '<div><p>[개발용] 모의 전면 광고</p><button type="button">광고 닫기</button></div>';
        overlay.querySelector('button').addEventListener('click', () => {
          overlay.remove();
          onFinish('shown');
        });
        document.body.appendChild(overlay);
        onStart();
      }, delay);
    },
  };
}
