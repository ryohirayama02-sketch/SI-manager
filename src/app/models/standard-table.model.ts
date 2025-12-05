export interface StandardTableRow {
  id?: string;
  roomId: string; // ルームID（マルチテナント対応）
  rank: number;
  lower: number;
  upper: number;
  standard: number;
  year?: number;
}
