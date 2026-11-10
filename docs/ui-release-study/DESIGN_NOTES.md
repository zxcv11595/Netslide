# 출시 목적 UI 재검토 · 2026-11-11

사용자 의견: 이전 시안이 AI 느낌이 강함. Google Play 유사 퍼즐을 참고해 다시 제안.

## 실제 확인한 스토어

- [Roll the Ball — BitMango](https://play.google.com/store/apps/details?id=com.bitmango.rolltheballunrollme&hl=ko): 홈이 파인 타일, 타일 사이 경로 가독성, 보드 재질의 일관성 참고.
- [Energy — Infinity Games](https://play.google.com/store/apps/details?id=com.infinitygames.loopenergy&hl=ko): 보드를 중심으로 두는 정보 밀도, 연결/미연결 상태 대비 참고.
- [Railbound — Afterburn](https://play.google.com/store/apps/details?id=com.Afterburn.Railbound&hl=ko): 일러스트의 일관성과 작게 배치한 HUD 참고. 횡형/철도 규칙은 가져오지 않음.

스토어의 스크린샷을 브라우저로 열어 시각적으로 확인했다. 위 원칙의 적용은 디자인 판단이며 다운로드 수나 흥행을 보장하는 근거가 아니다. 각 게임의 자산/로고는 새 시안에 사용하지 않았다. references/*-inspection.png는 내부 조사 캡처이며 배포용 아트가 아니다.

## 새 방향

- 반복 카드와 긴 문구를 줄이고 제목·현재 판·스테이지를 먼저 읽게 한다.
- 햄스터는 원래 캐릭터 정체성을 유지하고, 보드에는 작은 얼굴만 사용한다.
- 스테이지는 네 칸씩 이어지는 스크롤 목록으로 9개 제한 없이 확장한다. 숫자는 디자인 예시다.
- 실제 게임 부품에만 가벼운 깊이를 주고, 보드 위 연결은 주황색으로 구분한다.
- 결과는 같은 플레이 화면 위의 팝업. 보너스/목표 이동 수를 다시 넣지 않는다.

이미지는 내장 image_gen 도구로 만든 검토용 시안이다. 원본 대기/성공 햄스터는 정체성 참고로만 사용했다. 실제 구현은 기존 TypeScript 지침과 순수 규칙을 따른다. 생성 이미지의 타일/연결/입력 표현은 실제 게임 검증을 대체하지 않으며, 이미지 전체를 게임 배경으로 붙이지 않는다. 사용자 최종 승인 상태가 아니다.

## 산출물과 확인

- ui-release-v2.png: 이번 제안. 메인/게임/결과를 한 장에 제시. v1에서 네 변 화살표와 공급원 행·열 잠금, 결과 연결 수를 수정했다.
- prompts/generation.txt, correction.txt: 내장 도구에 사용한 전체 프롬프트.
- 세 화면의 한국어, 크기별 단계, 이동 수, 별 표시 위치와 화살표/잠금을 시각 확인했다. 일부 터널 색/생성된 배치 표현은 실제 퍼즐 판정 기준으로 사용하지 않는다. 실제 판은 별도로 검증해야 한다.
- 게임 소스와 기존 전달 ZIP은 이번 시안 검토에서 변경하지 않았다. 시안 승인 후 구현 지침에 통합할 수 있다.
