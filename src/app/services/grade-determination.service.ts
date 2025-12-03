import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GradeDeterminationService {
  // 協会けんぽ（一般）標準報酬月額テーブル（簡略化版）
  private readonly STANDARD_TABLE = [
    { rank: 1, lower: 58000, upper: 63000, standard: 58000 },
    { rank: 2, lower: 63000, upper: 68000, standard: 63000 },
    { rank: 3, lower: 68000, upper: 73000, standard: 68000 },
    { rank: 4, lower: 73000, upper: 79000, standard: 73000 },
    { rank: 5, lower: 79000, upper: 85000, standard: 79000 },
    { rank: 6, lower: 85000, upper: 91000, standard: 85000 },
    { rank: 7, lower: 91000, upper: 97000, standard: 91000 },
    { rank: 8, lower: 97000, upper: 103000, standard: 97000 },
    { rank: 9, lower: 103000, upper: 109000, standard: 103000 },
    { rank: 10, lower: 109000, upper: 115000, standard: 109000 },
    { rank: 11, lower: 115000, upper: 122000, standard: 115000 },
    { rank: 12, lower: 122000, upper: 129000, standard: 122000 },
    { rank: 13, lower: 129000, upper: 137000, standard: 129000 },
  ];

  findGrade(
    gradeTable: any[],
    average: number
  ): { grade: number; remuneration: number } | null {
    if (gradeTable.length === 0) {
      // Firestoreから読み込めない場合はハードコードされたテーブルを使用
      const row = this.STANDARD_TABLE.find(
        (r) => average >= r.lower && average < r.upper
      );
      return row ? { grade: row.rank, remuneration: row.standard } : null;
    }

    // Firestoreから読み込んだテーブルを使用
    const row = gradeTable.find(
      (r: any) => average >= r.lower && average < r.upper
    );
    return row ? { grade: row.rank, remuneration: row.standard } : null;
  }

  getStandardMonthlyRemuneration(
    avg: number | null,
    gradeTable: any[]
  ): { rank: number; standard: number } | null {
    if (avg === null) return null;
    const result = this.findGrade(gradeTable, avg);
    if (!result) return null;
    return { rank: result.grade, standard: result.remuneration };
  }
}



