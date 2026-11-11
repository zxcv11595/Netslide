import { t } from './i18n.js';
// 게임 전역 설정. 이름·이미지 경로·광고 실험값은 여기 한곳에서 바꾼다.
export const CONFIG = {
  gameName: 'Nutslide', // 로고와 공유 문구에 쓰는 짧은 이름
  // 정식 이름: 한국어 "Nutslide: 햄스터 슬라이드 퍼즐", 영어 "Nutslide: Hamster Slide Puzzle"
  subtitle: { ko: t('햄스터 슬라이드 퍼즐'), en: 'Hamster Slide Puzzle' },
  tagline: t('슬라이드 퍼즐 게임'), // 홈과 로딩 화면의 로고 아래에 보이는 한글 부제
  fullName: t('Nutslide: 햄스터 슬라이드 퍼즐'), // 브라우저 탭과 공유 제목(지금은 한국어만)
  logoLines: ['Nutslide'], // 홈 제목의 줄바꿈. 로딩 제목은 index.html에서 맞춘다.
  version: '1.0.0',
  contactEmail: '', // 문의 받을 주소. 채우면 설정에 '문의하기'가 나타난다
  storageKey: 'hamster-snack-delivery',

  // public/ 아래 경로(배포 하위 경로에서도 동작하도록 상대 경로)
  assets: {
    hamsterIdle: 'assets/hamster-idle.webp',
    hamsterSuccess: 'assets/hamster-success.webp',
    snackSeed: 'assets/acorn.webp',
  },

  // 애니메이션 시작값(ms)
  anim: {
    shift: 170,
    shiftFallback: 320, // 전환 종료 이벤트가 오지 않아도 잠금을 푸는 시간
    flowStep: 40,
    flowMax: 320,
    completeDelay: 520, // 모두 이어진 뒤 결과가 뜨기까지
    successSwap: 120,
    starStep: 180, // 결과 창의 별이 하나씩 뜨는 간격
  },

  // 힌트. 처음 주는 개수는 storage.js의 START_HINTS(3)다.
  hints: {
    infinite: false, // true면 힌트가 줄지 않는다(테스트용)
    wallCost: 1, // 벽 보기: 정답에서 길이 이어지지 않는 곳에 벽을 세운다. 그 판을 끝낼 때까지 남는다
    guideCost: 2, // 경로 안내: 남은 경로의 절반을 화살표로 알려 준다
    clearCost: 3, // 즉시 성공에 쓰는 힌트 수(별 1개로 기록)
    minGuide: 2, // 힌트 하나로 안내하는 최소 수. 실제로는 남은 길의 절반(내림)
    searchMs: 5000, // 힌트 버튼을 누른 순간부터 답이 나올 때까지의 제한 시간(안전장치). 보통은 maxStates에서 먼저 끝난다
    searchBudgetMs: 4500, // 그중 길 찾기에 쓰는 시간
    waitMinMs: 700, // "길을 찾는 중" 표시를 최소한 이만큼은 보여 준다(점이 하나씩 생기는 것이 보이게)
    maxStates: 60000, // 길 찾기에서 앞으로 살펴볼 배치 수 상한. 이 수로 끊어서 어떤 휴대폰에서도 같은 힌트가 나온다
    dailyFree: 1, // 날마다 처음 접속할 때 주는 힌트(0이면 주지 않고 안내 목록에서도 빠진다). 처음 시작한 날은 시작 힌트로 대신한다
    freeCap: 999, // 날마다 주는 힌트는 보유 수가 이보다 적을 때만(지금은 사실상 제한 없음)
    dailyClear: 1, // 그날의 오늘의 도전을 처음 끝내면
    clearReward: 0, // 정규 판을 직접 풀어 처음 성공하면(지금은 주지 않는다. 0이면 안내 목록에서도 빠진다)
    flagReward: 1, // 정규 판을 최단 경로로 처음 성공하면(판마다 한 번)
  },

  // 상점. 실제 결제 사업자는 아직 없다.
  shop: {
    simulatePay: true, // 테스트용: 결제가 된 것처럼 구매 과정을 끝까지 보여 주고 상품도 준다(돈은 나가지 않는다). 출시 전에 false로
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
  tutorial: t('입문'),
  beginner: t('초급'),
  intermediate: t('중급'),
  advanced: t('고급'),
  daily: t('오늘의 도전'),
};
