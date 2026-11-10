# Claude 전달 패키지 · 2026-11-11 개정

1. CLAUDE_CODE_HANDOFF.md — 최신 규칙/기술/역할/검사 지시.
2. UI_SPEC.md — 세 화면의 구성과 상태별 동작.
3. IMPLEMENTATION_REVIEW.md — 현재 ProjectF와 명세의 차이.
4. contracts.example.ts — 타입 경계 제안. 구현 완료 파일이 아니다.
5. references/ui-preview.html — 로컬에서 여는 화면 시안. 상단 버튼으로 화면 전환.
6. references/main.png, game.png, clear.png — 세 화면 캡처.
7. assets/ — 기존 햄스터 대기/성공/간식 원본 세 PNG.
8. ART_PROMPTS.md — 기존 아트 제작 기록.
9. VALIDATION.md — 시안 확인 범위와 한계.

핵심 변경: 보너스 삭제, 플레이 중 별 기준 숨김, 크기별 단계, 확장 가능한 목록, **TypeScript 사용**. 구버전 JavaScript 전용 지침은 폐기한다.

시안은 디자인 검토용이며 최종 승인/실제 게임 화면이 아니다. 별 평가 기준·최소 풀이 수·출시 판 수는 확정하지 않았다. 기존 프로젝트는 JavaScript 상태이며 이번 작업은 문서/시안만 갱신했다.

시안은 파일을 직접 열거나 `python -m http.server 8769`를 이 폴더에서 실행한 뒤 `http://localhost:8769/references/ui-preview.html`로 확인한다. 일일/공유 등 비동작 요소는 검토용이며 실제 구현에서는 미완료 기능을 숨긴다. 6×6/7×7 조작안은 포함하지 않는다.

이전 Downloads 패키지와 art-src/references/ui-concept.png는 오래된 요구가 남아 있어 최신 참고 자료로 사용하지 않는다. 원본은 보존한다.
