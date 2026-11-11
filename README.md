# Nutslide: 햄스터 슬라이드 퍼즐

영어 이름: Nutslide: Hamster Slide Puzzle

줄을 밀어 터널을 잇고 햄스터에게 간식을 보내는 모바일 세로형 웹 퍼즐입니다.
설치·가입 없이 브라우저에서 바로 플레이하며, 정적 호스팅으로 배포합니다.

- 기술: Vite + Vanilla JavaScript + HTML/CSS, 보드는 SVG (TypeScript·프레임워크·엔진 없음)
- 요구 사항 원문: [docs/archive/CLAUDE_CODE_HANDOFF.md](docs/archive/CLAUDE_CODE_HANDOFF.md) (예전 문서, 지금은 CLAUDE.md가 기준)
- 판 목록/검증 보고서: [docs/STAGE_REPORT.md](docs/STAGE_REPORT.md)

## 명령

Node.js 20 이상이 필요합니다(개발은 24에서 확인).

| 목적 | 명령 |
|---|---|
| 설치 | `npm install` |
| 개발 서버 | `npm run dev` |
| 자동 테스트 | `npm test` |
| 판 검증(해답 재생) | `npm run verify` |
| 판 검증(최단 수 재증명, 약 3분) | `npm run verify -- --deep` |
| 판 다시 생성(약 3분) | `npm run generate` |
| 운영 빌드 | `npm run build` → `dist/` |
| 빌드 미리 보기 | `npm run preview` |

`dist/`를 그대로 정적 호스팅에 올리면 됩니다. `vite.config.js`의 `base`가 `./`라서
`https://example.com/games/hamster/` 같은 하위 경로에서도 이미지와 링크가 동작합니다.

## 폴더

```
src/core/      순수 규칙(rules.js)과 풀이 탐색(solver.js, 개발 도구 전용)
src/game/      현재 판·이력(session), 해금·기록(progress), 일일(daily), 공유 링크(links)
src/ui/        화면·입력·애니메이션 (board, play, home, art, share, toast, transitionLock)
src/data/      검증된 판 데이터(stages.json)와 로더
src/storage/   버전이 있는 localStorage 저장
src/breaks/    작은 광고 어댑터(기본 비활성)와 개발용 모의 provider
tools/         판 생성(generate.js)·검증(verify.js), tools/out/ 은 개발용 해답 자료
tests/         node:test 자동 테스트
public/assets/ 게임 표시용 이미지(파생본)
art-src/       제공받은 원본 이미지와 시안(게임에 직접 쓰지 않음)
```

## 구현 규칙 요약

- 보드는 3×3 / 4×4 / 5×5. 공급원(간식 창고)은 1개이며 그 행과 열은 잠겨 움직이지 않습니다.
- 가장자리 버튼은 "미는 방향"을 뜻합니다. 왼쪽 버튼은 줄을 오른쪽으로, 위쪽 버튼은 아래로 한 칸 밉니다.
  끝 타일은 반대편으로 돌아오고 타일은 회전하지 않습니다.
- 연결은 인접한 두 타일의 열린 방향이 마주 볼 때만 성립합니다. 보드 반대편 가장자리끼리는 이어지지 않습니다.
- 방향 타일은 지정 입구로 들어온 흐름만 지정 출구로 보냅니다.
- 이동할 때마다 현재 배치 전체에서 연결을 다시 계산합니다.
- 필수 목표가 모두 이어지면 `배달 완료` 버튼이 켜집니다. 자동으로 넘어가지 않으며 눌러서 확정할 때만 기록·해금합니다.
- 별
  - 보너스 있는 판: 1 = 필수 / 2 = 필수 + 모든 보너스 / 3 = 2별 조건 + `star3` 이동 수 이내
  - 보너스 없는 판: 1 = 필수 / 2 = `star2` 이내 / 3 = `star3` 이내 (`star3 < star2`)
  - 입문은 별 없이 완료만 표시
- 이동 한 칸 = 1수, 잠긴 줄·무효 입력 = 0수, 되돌리기는 무제한이며 기록은 최종 풀이 길이입니다.
- 화면의 "목표 N"은 3별 기준 이동 수입니다(모든 수를 "목표 이동 수"로 표기).

규칙 함수는 `src/core/rules.js`에만 있습니다.

| 함수 | 역할 |
|---|---|
| `shiftBoard(stage, cells, move)` | 합법성 검사와 순환 이동 |
| `evaluateConnections(stage, cells)` | 공급원에서 BFS로 흐름·목표 연결 상태 계산 |
| `evaluateResult(stage, conn, moves)` | 필수·보너스 달성과 별 |

게임(`src/game/session.js`)과 도구(`tools/*.js`)가 같은 함수를 호출합니다. 화면 코드는 연결·별 규칙을 따로 구현하지 않습니다.

## 데이터 형식

`src/data/stages.json`

```json
{
  "contentVersion": 1,
  "dailyEpoch": "2026-11-11",
  "stages": [
    { "id": "B10", "group": "beginner", "order": 10, "size": 4,
      "tiles": ["p5 p10 p3 p6", "p12 s6 p9 p0", "g1 p7 b8 p11", "p0 p13 p14 p5"],
      "star3": 5 }
  ],
  "daily": [ { "id": "D01", "group": "daily", "order": 1, "size": 4, "tiles": ["..."], "star3": 6 } ]
}
```

- `id`(고정 식별자), `group`(난이도), `order`(표시 순서)는 서로 독립입니다.
- `tiles`는 시작 배치를 행 단위로 적습니다. 방향 비트는 N=1, E=2, S=4, W=8.
  - `p<포트>` 수로(`p0`은 빈 칸), `s<포트>` 공급원, `g<입구>` 필수 목표, `b<입구>` 보너스 목표,
    `o<입구><출구>` 방향 타일(예: `o82` = 서쪽으로 들어와 동쪽으로 나감)
- `star2`는 보너스 없는 판에만 있습니다.
- 해답은 이 파일에 넣지 않고 `tools/out/solutions.json`(개발용)에 둡니다.
  클라이언트에서 해답을 숨기거나 치트를 막는 장치는 아닙니다.

런타임 배치는 `cells[위치] = 타일 ID`(타일 ID = 시작 위치) 배열이고, 저장에는 이동 표기(`r0+`, `c2-`) 목록만 남깁니다.

## 판을 고치거나 추가할 때

1. `tools/generate.js`의 `PLAN`/`DAILY_PLAN`/`TUTORIALS`를 고치고 `npm run generate`를 실행합니다.
2. `npm run verify`, `npm test`로 확인합니다.
3. 이미 공개한 판을 바꿀 때는 `CONTENT_VERSION`을 올리고, 이전 `stages.json`을 지우지 말고
   다른 이름으로 남겨 `src/data/content.js`의 `CONTENTS`에 등록합니다. 그래야 과거 공유 링크가 같은 판으로 열립니다.
   기록은 콘텐츠 버전별로 따로 저장됩니다.

## 설정을 바꾸는 곳

- 게임 이름, 이미지 경로, 애니메이션 시간, 광고 실험값: `src/config.js`
  (브라우저 탭 제목의 초기값과 설명은 `index.html`에도 있습니다)
- 광고 연결: `src/breaks/breakManager.js` 머리말의 provider 인터페이스 참고. 사업자가 정해지면 그 SDK를 감싼 provider를 `src/main.js`에서 넘기고 `CONFIG.ads.enabled`를 켭니다.
- 개발 서버에서만 `?mockAd=fill|nofill|error|slow|notready` 와 `&adNow=1`(조건 무시)로 광고 흐름을 시험할 수 있습니다.
  운영 빌드에는 모의 광고 코드가 들어가지 않습니다.

## 현재 상태

- 광고: 연결부만 구현(기본 비활성, provider 없음). 사업자 SDK 연동과 광고 제거 결제는 후속 작업입니다.
- 제외: 성장·꾸미기·도감·힌트, 소리, 계정·서버.
- 실제 브라우저 확인은 데스크톱 앱 내장 브라우저(Chromium)의 320/360/375px 폭과 PC 크기에서만 했습니다. 실제 휴대폰, Safari, Firefox는 확인하지 않았습니다.
- 동작 줄이기는 스크립트 경로만 확인했고 OS 설정을 켠 상태의 CSS는 확인하지 않았습니다.
