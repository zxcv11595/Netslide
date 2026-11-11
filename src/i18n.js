// 언어: 한국어가 원문이고, 영어는 아래 사전에서 찾는다.
//   t('한국어 문구')            → 지금 언어의 문구
//   t('{n}번 남았어요', { n })   → {이름} 자리에 값을 넣는다
//   영어 사전에서 {n:s}는 n이 1이 아닐 때만 s를 붙인다(1 hint, 2 hints)
//   t('번@ring')                → 같은 낱말을 자리마다 다르게 옮겨야 할 때 @뒤에 자리 이름을 붙인다(한국어에서는 떼고 쓴다)
// 언어는 게임 기록과 따로 저장한다(LANG_KEY). 바꾸면 화면을 새로 불러온다 — 모듈을 읽을 때 정해지는 문구(탭 이름 등)가 있기 때문이다.
// 처음에는 기기 언어가 한국어면 한국어, 아니면 영어다.
export const LANG_KEY = 'nutslide-lang';
export const LANGS = [['ko', '한국어'], ['en', 'English']];

function detect() {
  try {
    const saved = globalThis.localStorage?.getItem(LANG_KEY);
    if (saved === 'ko' || saved === 'en') return saved;
  } catch { /* 저장소를 못 쓰는 환경 */ }
  const nav = globalThis.navigator?.language;
  if (typeof globalThis.document === 'undefined' || !nav) return 'ko'; // 테스트·도구(Node)에서는 한국어
  return /^ko\b/i.test(nav) ? 'ko' : 'en';
}

let lang = detect();
if (typeof globalThis.document !== 'undefined') globalThis.document.documentElement.lang = lang;

export function getLang() { return lang; }

// 언어를 저장한다. 화면에 반영하려면 새로 불러와야 한다(설정 화면에서 그렇게 한다).
export function saveLang(next) {
  lang = next === 'en' ? 'en' : 'ko';
  try { globalThis.localStorage?.setItem(LANG_KEY, lang); } catch { /* 저장 못 해도 이번 화면에서는 바뀐다 */ }
  return lang;
}

export function t(key, vars) {
  let s = lang === 'en' && Object.hasOwn(EN, key) ? EN[key] : key.replace(/@[a-z]+$/, '');
  if (vars) {
    s = s.replace(/\{(\w+):s\}/g, (m, k) => (Number(vars[k]) === 1 ? '' : 's'));
    s = s.replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(vars, k) ? String(vars[k]) : m));
  }
  return s;
}

// 영어 문구. 왼쪽은 코드에 적힌 한국어 원문 그대로다.
const EN = {
  // ----- 이름 -----
  '햄스터 슬라이드 퍼즐': 'Hamster Slide Puzzle',
  '슬라이드 퍼즐 게임': 'Sliding puzzle game',
  'Nutslide: 햄스터 슬라이드 퍼즐': 'Nutslide: Hamster Slide Puzzle',
  // ----- 난이도 -----
  '입문': 'Tutorial',
  '초급': 'Beginner',
  '중급': 'Intermediate',
  '고급': 'Advanced',
  '전문가': 'Expert',
  '오늘의 도전': 'Daily Challenge',
  '오늘의 도전@tab': 'Daily',
  // ----- 입문 설명 -----
  // ----- 시작·알림 -----
  '이 링크는 지금 버전에서 열 수 없는 판이에요.': 'This link is for a puzzle that this version cannot open.',
  '링크의 판을 찾지 못했어요.': 'The puzzle in this link was not found.',
  '링크의 날짜가 올바르지 않아요.': 'The date in this link is not valid.',
  '아직 열리지 않은 도전이에요.': 'This challenge is not open yet.',
  '화면을 눌러 시작': 'Tap to start',
  '공유받은 판': 'Shared puzzle',
  '오늘의 힌트 {n}개를 받았어요': 'You got {n} hint{n:s} today',
  '저장할 수 없는 환경이라 기록이 유지되지 않아요': 'Saving is unavailable here, so progress will not be kept',
  '게임을 열지 못했어요': 'The game could not start',
  '광고 차단 프로그램을 쓰고 있다면 이 사이트에서 잠시 꺼 주세요. 그래도 안 되면 새로 고쳐 주세요.': 'If you use an ad blocker, please turn it off for this site. If that does not help, reload the page.',
  // ----- 판(읽어 주는 글) -----
  '별 {n}개': '{n} star{n:s}',
  '위로': 'up',
  '오른쪽으로': 'right',
  '아래로': 'down',
  '왼쪽으로': 'left',
  '{n}×{n} 퍼즐 판': '{n}×{n} puzzle board',
  '{n}번째 가로줄': 'Row {n}',
  '{n}번째 세로줄': 'Column {n}',
  '{line}: 햄스터가 있어 움직이지 않는 줄': '{line}: locked because the hamster is on it',
  '{line}을 {dir} 한 칸 밀기': 'Slide {line} {dir} one step',
  // ----- 탭·머리줄 -----
  '홈': 'Home',
  '상점': 'Shop',
  '내 정보': 'Profile',
  '메뉴': 'Menu',
  '뒤로': 'Back',
  // ----- 홈 -----
  '이 브라우저에서는 저장할 수 없어요. 창을 닫으면 기록이 사라져요.': 'This browser cannot save. Your progress is lost when you close the window.',
  '저장에 실패했어요. 지금부터의 기록은 창을 닫으면 사라질 수 있어요.': 'Saving failed. Progress from now on may be lost when you close the window.',
  '저장된 기록을 읽지 못해 새로 시작했어요.': 'Saved progress could not be read, so the game started fresh.',
  '더 새로운 버전의 기록이 있어 이 화면에서는 새로 시작했어요.': 'Progress from a newer version was found, so this screen started fresh.',
  '월': 'Mon', '화': 'Tue', '수': 'Wed', '목': 'Thu', '금': 'Fri', '토': 'Sat', '일': 'Sun',
  '이어하기': 'Continue',
  '시작하기': 'Start',
  '{n}일 연속': '{n} days',
  '다시': 'Again',
  '도전': 'Play',
  '모은 별': 'Stars',
  '모은 깃발': 'Flags',
  '{n}일': '{n}d',
  '연속 도전': 'Streak',
  '스테이지': 'Stages',
  '{done}/{total} 완료, 깃발 {flags}개, 별 {stars}개': '{done}/{total} cleared, {flags} flags, {stars} stars',
  '잠김': 'locked',
  '준비 중': 'Soon',
  // ----- 게임 화면 -----
  '도전 {n}': 'Daily {n}',
  '오늘의 도전 {m}/{d}': 'Daily {m}/{d}',
  '목록으로 돌아가기': 'Back to list',
  '설정': 'Settings',
  '번@ring': 'moves',
  '성공': 'Clear',
  '최단 경로': 'Shortest',
  '힌트, {n}개 남음': 'Hints, {n} left',
  '되돌리기': 'Undo',
  '재시작': 'Restart',
  '경로를 찾는 중': 'Finding a path',
  '광고 자리 · 준비 중': 'Ad space · Coming soon',
  '화살표를 눌러 보세요': 'Tap the arrow',
  '누르면 이 줄이 한 칸 밀려요.': 'It slides the whole line one step.',
  '햄스터가 도토리를 찾아가요': 'The hamster wants its acorns',
  '나무 길이 모든 도토리까지 이어지면 성공이에요.': 'Connect the wooden path to every acorn to win.',
  '다음': 'Next',
  '찾은 도토리 {a}개, 전체 {b}개': '{a} of {b} acorns reached',
  '{moves}번 밀었어요. 지금 끝내면 별 {now}개. 별 셋은 {s3}번, 별 둘은 {s2}번까지': '{moves} move{moves:s} so far. Finishing now gives {now} star{now:s}. 3 stars within {s3} moves, 2 stars within {s2}.',
  '이제 경로를 알려 줄 수 있어요': 'I can show the path now',
  '힌트를 다시 눌러 보세요': 'Tap the hint button again',
  '안내는 여기까지예요': 'The guide ends here',
  '이어서 풀어 보세요!': 'Keep going from here!',
  '그 줄이 아니에요': 'Not that row',
  '깜빡이는 화살표로 되돌려 주세요': 'Use the blinking arrow to go back',
  '목록으로 나가기': 'Exit to list',
  '닫기': 'Close',
  '안내 중이에요': 'Guide in progress',
  '화살표를 따라 밀어 보세요': 'Follow the arrows',
  '힌트': 'Hints',
  '벽 보기': 'Show walls',
  '벽을 보고 있어요.': 'Walls are showing.',
  '길이 이어지지 않는 곳에 벽을 세워요.': 'Puts walls where the path does not connect.',
  '완성된 경로를 짐작할 수 있어요.': 'It hints at the finished path.',
  '경로 안내': 'Path guide',
  '남은 경로의 절반을 화살표로 알려 줘요.': 'Arrows show half of the remaining path.',
  '즉시 성공': 'Instant clear',
  '바로 성공하고 별 1개를 받아요.': 'Clears the puzzle right away with 1 star.',
  '힌트 받는 법': 'How to get hints',
  '날마다 접속': 'Daily login',
  '오늘의 도전 완료': 'Clear the Daily Challenge',
  '판을 처음 성공': 'First clear of a stage',
  '최단 경로로 성공': 'Clear with the shortest path',
  '광고 보고 힌트 받기': 'Watch an ad for a hint',
  '힌트 묶음 구매': 'Hint packs',
  '이 판은 벽 보기를 쓸 수 없어요.': 'Walls are not available for this puzzle.',
  '벽을 세웠어요': 'Walls are up',
  '벽으로 막힌 곳은 길이 이어지지 않아요': 'The path never crosses a wall',
  '경로가 너무 멀어요': 'Too far from the path',
  '여기서는 경로를 찾기 어려워요.': 'It is hard to find a path from here.',
  '{n}번@undo': 'Undo {n} move{n:s}',
  ' 되돌리면 알려 줄 수 있어요.': ' and I can guide you.',
  '힌트는 줄지 않았어요.': 'No hints were used.',
  '{n}번 한 번에 되돌리기': 'Undo {n} move{n:s} at once',
  '지금은 알려 줄 수가 없어요': 'I cannot guide you right now',
  '힌트는 줄지 않았어요': 'No hints were used',
  '시간 안에 경로를 찾지 못했어요': 'No path was found in time',
  '{n}번 되돌렸어요': 'Undid {n} move{n:s}',
  '힌트를 다시 누르면 경로를 알려 줄게요': 'Tap the hint button again for the path',
  '{n}번 남았어요': '{n} move{n:s} left',
  '약 {n}번 남았어요': 'About {n} move{n:s} left',
  '화살표를 따라 끝까지 밀어 보세요': 'Follow the arrows to the end',
  '화살표를 따라 {n}번 밀어 보세요': 'Follow the arrows for {n} move{n:s}',
  '이 판은 즉시 성공을 쓸 수 없어요.': 'Instant clear is not available for this puzzle.',
  '즉시 성공을 끝내지 못했어요. 힌트는 줄지 않았어요.': 'Instant clear did not finish. No hints were used.',
  // ----- 결과 -----
  '첫 성공': 'First clear',
  '새 기록': 'New best',
  '최고기록 {n}': 'Best {n}',
  '목록': 'Back to list',
  '다음 판': 'Next',
  '스테이지 고르기': 'Choose a stage',
  '성공@title': 'Clear!',
  '최단 경로 성공!': 'Shortest path!',
  '기록을 깼어요!': 'New record!',
  '최단 경로 {a} → {b}': 'Shortest {a} → {b}',
  ' 만에 성공': '',
  ' 최단 경로로 성공한 판마다 깃발을 모아요': ' Earn a flag for every shortest-path clear',
  ' 힌트 {n}개를 받았어요': ' You got {n} hint{n:s}',
  '재도전': 'Retry',
  '공유': 'Share',
  // ----- 판 목록·달력 -----
  '{group} {n}': '{group} {n}',
  ', 별 {n}개': ', {n} star{n:s}',
  ', 최단 경로 깃발': ', shortest-path flag',
  ', 잠김': ', locked',
  ', 오늘': ', today',
  '{m}월 {d}일': '{m}/{d}',
  '이전 달': 'Previous month',
  '{y}년 {m}월': '{y}-{m}',
  '다음 달': 'Next month',
  '{n}일 연속 도전 중': '{n}-day streak',
  '다시 도전': 'Play again',
  '도전하기': 'Play',
  '매일 새로운 퍼즐을 모두 함께 풀어요.': 'A new puzzle every day, the same for everyone.',
  '지난 날짜를 누르면 그날의 퍼즐을 풀 수 있어요.': 'Tap a past date to play that day\'s puzzle.',
  '오늘의 퍼즐을 처음 성공하면 힌트 1개를 받아요.': 'Clear today\'s puzzle for the first time to get 1 hint.',
  // ----- 상점 -----
  '광고 제거': 'Remove ads',
  '힌트 {n}개': '{n} hints',
  '힌트@shop': 'Hints',
  '내 힌트': 'My hints',
  '내 힌트 {n}개': 'My hints: {n}',
  '{n}개': '{n}',
  '판 사이 광고와 아래 광고 띠가 사라져요.': 'Removes ads between stages and the banner below.',
  '가장 많이 골라요': 'Most popular',
  '가장 알뜰해요': 'Best value',
  '조금만 필요할 때': 'Just a few',
  '구매함': 'Owned',
  '구매 복원': 'Restore purchases',
  '확인하는 중…': 'Checking…',
  '결제는 앱 출시 때 열려요. 지금은 구매되지 않아요.': 'Purchases will open when the app launches. Nothing is charged now.',
  '{name} 구매, {price}': 'Buy {name}, {price}',
  '구매 복원은 앱 출시 때 열려요': 'Restore will be available when the app launches',
  '구매를 복원하지 못했어요. 잠시 뒤 다시 해 주세요.': 'Could not restore purchases. Please try again later.',
  '구매를 복원했어요': 'Purchases restored',
  '복원할 구매가 없어요': 'Nothing to restore',
  // 구매 창
  '구매 확인': 'Confirm purchase',
  '{price}에 구매할까요?': 'Buy for {price}?',
  '결제는 스토어 결제 창에서 진행돼요.': 'Payment is handled by the store.',
  '취소': 'Cancel',
  '구매하기': 'Buy',
  '확인': 'OK',
  '결제 중이에요': 'Processing…',
  '잠시만 기다려 주세요.': 'Please wait a moment.',
  '구매를 취소했어요': 'Purchase cancelled',
  '구매 완료': 'Purchase complete',
  '힌트 {n}개를 받았어요.': 'You got {n} hints.',
  '이제 광고가 나오지 않아요.': 'Ads are now turned off.',
  '이미 구매했어요': 'Already purchased',
  '결제되지 않았어요.': 'You were not charged.',
  '아직 구매할 수 없어요': 'Not available yet',
  '결제는 앱 출시 때 열려요.': 'Purchases will open when the app launches.',
  '결제하지 못했어요': 'Payment failed',
  '잠시 뒤 다시 해 주세요.': 'Please try again later.',
  '다시 시도': 'Try again',
  // 뒤로 가기와 종료
  '게임 종료': 'Quit game',
  '게임을 종료할까요?': 'Quit the game?',
  '기록은 저장되어 있어요.': 'Your progress is saved.',
  '종료': 'Quit',
  '계속하기@exit': 'Keep playing',
  '뒤로 가기를 한 번 더 누르면 종료돼요': 'Press back again to quit',
  // ----- 내 정보 -----
  '성취': 'Achievements',
  '성공한 판': 'Puzzles cleared',
  '별 3개를 받은 판': '3-star puzzles',
  '놓친 별': 'Stars missed',
  '최단 경로로 성공한 판': 'Shortest-path clears',
  '이번 달 도전 횟수': 'Played this month',
  '현재 연속 도전 횟수': 'Current streak',
  '최고 연속 도전 횟수': 'Best streak',
  '별 3개를 받은 날': '3-star days',
  '현재까지 도전한 날': 'Days played',
  '번@count': '',
  '일@count': '',
  '손님 햄스터': 'Guest Hamster',
  '이 폰에만 기록이 저장돼요': 'Progress is saved on this device only',
  '로그인하고 기록 저장하기 · 준비 중': 'Sign in to save progress · Coming soon',
  // ----- 설정 -----
  '문의하기': 'Contact',
  '버전': 'Version',
  '언어': 'Language',
  '배경음': 'Music',
  '효과음': 'Sound effects',
  '버튼음': 'Button sounds',
  '진동': 'Vibration',
  '개인정보 처리방침': 'Privacy Policy',
  // ----- 개인정보 처리방침 -----
  '{name} · 시행일 2026년 11월 11일': '{name} · Effective November 11, 2026',
  '수집하는 개인정보': 'Personal information we collect',
  '이 게임은 이름, 이메일, 위치, 기기 식별 정보 등 어떤 개인정보도 수집하지 않습니다. 회원 가입이나 로그인도 없습니다.': 'This game does not collect any personal information such as your name, email, location or device identifiers. There is no sign-up or sign-in.',
  '기기에 저장하는 정보': 'Information stored on your device',
  '게임을 이어서 할 수 있도록 끝낸 판과 별, 하던 판의 진행 상태, 오늘의 도전 기록, 남은 힌트 수, 소리·진동 설정을 이 기기에만 저장합니다.': 'So you can keep playing, the game stores cleared puzzles and stars, the puzzle in progress, Daily Challenge records, remaining hints, and sound and vibration settings on this device only.',
  '이 정보는 기기 밖으로 전송되지 않으며, 브라우저 데이터를 지우거나 앱을 삭제하면 함께 지워집니다.': 'This information is never sent off the device. It is removed when you clear browser data or delete the app.',
  '외부 전송': 'Sharing with others',
  '게임 기록을 외부 서버나 제3자에게 보내지 않습니다. 광고, 분석 도구, 결제 기능을 사용하지 않습니다.': 'Game records are not sent to any server or third party. The game does not use ads, analytics or payments.',
  '방침의 변경': 'Changes to this policy',
  '광고, 결제, 순위표처럼 정보를 다루는 기능이 추가되면 이 방침을 먼저 고치고 시행일과 함께 알립니다.': 'If features that handle information are added, such as ads, payments or leaderboards, this policy will be updated first and announced with its effective date.',
  '문의': 'Contact',
  '앱 스토어 등록 정보에 적힌 개발자 연락처로 보내 주세요.': 'Please use the developer contact listed on the app store page.',
  // ----- 공유 -----
  '공유할 내용': 'Text to share',
  '직접 복사하기': 'Copy manually',
  '자동으로 복사하지 못했어요. 아래 내용을 직접 복사해 주세요.': 'Could not copy automatically. Please copy the text below.',
  '결과와 링크를 복사했어요': 'Result and link copied',
  '완료': 'Cleared',
  ' · 보너스 달성': ' · Bonus done',
  ' · 보너스 미달성': ' · Bonus missed',
  ' · 🚩 기록을 깼어요!': ' · 🚩 New record!',
  ' · 🚩 최단 경로 성공!': ' · 🚩 Shortest path!',
  '{moves}번': '{moves} move{moves:s}',
  // ----- 성취 -----
  '{label} 1판 성공': 'Clear 1 {label} puzzle',
  '{label} 모두 성공': 'Clear all {label} puzzles',
  '첫 걸음': 'First steps',
  '첫 도토리 찾기': 'First acorn',
  '첫 별 3개': 'First 3-star clear',
  '첫 오늘의 도전': 'First Daily Challenge',
  '판 성공': 'Puzzles',
  '별 모으기': 'Stars',
  '별 모두 모으기': 'Collect every star',
  '깃발 모으기': 'Flags',
  '깃발 모두 모으기': 'Collect every flag',
  '깃발 {n}개': '{n} flag{n:s}',
  '3일 연속 도전': '3-day streak',
  '7일 연속 도전': '7-day streak',
  '30일 연속 도전': '30-day streak',
  '도전한 날 10일': '10 days played',
  '도전한 날 30일': '30 days played',
};

// 테스트용: 사전에 있는 한국어 원문 목록
export function translatedKeys() { return Object.keys(EN); }
