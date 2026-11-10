// 게임 전역 설정. 이름·이미지 경로·광고 실험값은 여기 한곳에서 바꾼다.
export const CONFIG = {
  gameName: '햄스터 간식 배달', // 가칭
  logoLines: ['햄스터', '간식 배달'], // 홈과 로딩 화면에서 줄을 나눠 크게 보여 주는 이름
  version: '1.0.0',
  storageKey: 'hamster-snack-delivery',

  // public/ 아래 경로(배포 하위 경로에서도 동작하도록 상대 경로)
  assets: {
    hamsterIdle: 'assets/hamster-idle.png',
    hamsterSuccess: 'assets/hamster-success.png',
    snackSeed: 'assets/snack-seed.png',
  },

  // 애니메이션 시작값(ms)
  anim: {
    shift: 170,
    shiftFallback: 320, // 전환 종료 이벤트가 오지 않아도 잠금을 푸는 시간
    flowStep: 40,
    flowMax: 320,
    completeDelay: 520, // 모두 이어진 뒤 결과가 뜨기까지
    successSwap: 120,
    starStep: 100,
  },

  // 광고: 사업자 미정이므로 기본 비활성. provider가 없으면 항상 즉시 통과한다.
  ads: {
    enabled: false,
    minDistinctStages: 3, // 이전 실제 노출 이후 완료한 서로 다른 정규 판 수
    minPlayMs: 5 * 60 * 1000, // 이전 실제 노출(또는 입문 종료) 이후 일반 플레이 시간
    requestTimeoutMs: 3000, // 표시가 시작되기 전까지만 적용. 표시 중에는 타임아웃으로 재개하지 않는다.
    retryCooldownMs: 60 * 1000, // 재고 없음/실패 뒤 재요청 대기
  },
};

export const GROUP_LABEL = {
  tutorial: '입문',
  beginner: '초급',
  intermediate: '중급',
  advanced: '고급',
  daily: '오늘의 도전',
};

export const TUTORIAL_TEXT = {
  T1: '화살표를 누르면 그 줄이 한 칸 밀려요. 햄스터까지 굴을 이어 주세요.',
  T2: '끝에서 밀려난 타일은 반대편으로 돌아와요.',
  T3: '자물쇠 줄은 간식 창고가 있어서 움직이지 않아요. 햄스터 모두에게 굴을 이어 주면 배달 끝!',
};
