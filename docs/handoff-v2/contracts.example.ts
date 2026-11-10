/** Claude를 위한 타입 경계 제안. 실행 구현/확정 데이터 스키마가 아니다. */
export type Direction = 'north' | 'east' | 'south' | 'west';
export type TileId = string;
export type StageId = string;
export type TierId = string; // 단계 수나 격자 크기를 유니온 상수로 제한하지 않는다.
export type Tile =
  | { readonly id: TileId; readonly kind: 'source'; readonly ports: readonly Direction[] }
  | { readonly id: TileId; readonly kind: 'tunnel'; readonly ports: readonly Direction[] }
  | { readonly id: TileId; readonly kind: 'goal'; readonly inlet: Direction }
  | { readonly id: TileId; readonly kind: 'directed'; readonly inlet: Direction; readonly outlet: Direction };

export interface Move { readonly axis: 'row' | 'column'; readonly index: number; readonly delta: -1 | 1 }
export interface Board { readonly size: number; readonly cells: readonly Tile[] }
export interface Tier { readonly id: TierId; readonly label: string; readonly size: number; readonly order: number }
export interface Stage {
  readonly id: StageId;
  readonly contentVersion: string;
  readonly tierId: TierId;
  readonly order: number;
  readonly initialBoard: Board;
  readonly tutorial: boolean;
}
export interface ConnectionResult {
  readonly reachedTileIds: ReadonlySet<TileId>;
  readonly connectedGoalIds: ReadonlySet<TileId>;
  readonly totalGoals: number;
  readonly canComplete: boolean;
  readonly pathsToGoals: ReadonlyMap<TileId, readonly TileId[]>;
}
export type ShiftResult =
  | { readonly ok: true; readonly board: Board }
  | { readonly ok: false; readonly reason: 'locked' | 'invalid' };
export type EarnedStars = 1 | 2 | 3;
export type StarEvaluation =
  | { readonly status: 'pending-policy' }
  | { readonly status: 'evaluated'; readonly stars: EarnedStars; readonly policyVersion: string };
export interface StageRecord {
  readonly completed: true;
  readonly bestMoves: number;
  readonly bestStars: EarnedStars | null;
  readonly starPolicyVersion: string | null;
}
export interface ResumeState { readonly stageId: StageId; readonly history: readonly Move[] }
export interface ContentSave {
  readonly records: Readonly<Record<StageId, StageRecord>>;
  readonly current: ResumeState | null;
}
export interface SaveData {
  readonly schemaVersion: number;
  readonly content: Readonly<Record<string, ContentSave>>;
}
export type ParseResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly errors: readonly string[] };
export type ParseSave = (input: unknown) => ParseResult<SaveData>;
export type EvaluateConnections = (board: Board) => ConnectionResult;
export type ShiftBoard = (board: Board, move: Move) => ShiftResult;
export type SolveResult =
  | { readonly status: 'solved'; readonly moves: readonly Move[]; readonly shortestProven: boolean; readonly states: number }
  | { readonly status: 'exhausted'; readonly states: number }
  | { readonly status: 'limit-reached'; readonly states: number; readonly foundSolution: readonly Move[] | null };
// 구현 시 크기/행렬/타일 ID/공급원 수/입구/이력/음이 아닌 정수/저장 버전을 런타임 검증한다.
// 별 정책 미확정과 실제 획득 별을 구분한다. pending-policy는 출시 평가식이 아니다.
