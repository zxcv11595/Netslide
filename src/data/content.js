// 게임이 쓰는 검증된 판 데이터. 콘텐츠 버전별로 보관해 과거 공유 링크가 같은 판으로 열리게 한다.
// 판이나 규칙을 바꿔 새 버전을 낼 때는 기존 JSON을 지우지 말고 새 파일을 추가해 CONTENTS에 등록한다.
import v1 from './stages.json';
import { parseContent } from './parse.js';

const current = parseContent(v1);

export const CONTENT = current;
export const CONTENTS = { [String(current.version)]: current };
