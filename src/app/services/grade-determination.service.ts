import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GradeDeterminationService {
  // 協会けんぽ（一般）標準報酬月額テーブル（フォールバック用）
  private readonly STANDARD_TABLE = [
    { rank: 1, lower: 1, upper: 63000, standard: 58000 },
    { rank: 2, lower: 63000, upper: 73000, standard: 68000 },
    { rank: 3, lower: 73000, upper: 83000, standard: 78000 },
    { rank: 4, lower: 83000, upper: 93000, standard: 88000 },
    { rank: 5, lower: 93000, upper: 101000, standard: 98000 },
    { rank: 6, lower: 101000, upper: 107000, standard: 104000 },
    { rank: 7, lower: 107000, upper: 114000, standard: 110000 },
    { rank: 8, lower: 114000, upper: 122000, standard: 118000 },
    { rank: 9, lower: 122000, upper: 130000, standard: 126000 },
    { rank: 10, lower: 130000, upper: 138000, standard: 134000 },
    { rank: 11, lower: 138000, upper: 146000, standard: 142000 },
    { rank: 12, lower: 146000, upper: 155000, standard: 150000 },
    { rank: 13, lower: 155000, upper: 165000, standard: 160000 },
    { rank: 14, lower: 165000, upper: 175000, standard: 170000 },
    { rank: 15, lower: 175000, upper: 185000, standard: 180000 },
    { rank: 16, lower: 185000, upper: 195000, standard: 190000 },
    { rank: 17, lower: 195000, upper: 210000, standard: 200000 },
    { rank: 18, lower: 210000, upper: 230000, standard: 220000 },
    { rank: 19, lower: 230000, upper: 250000, standard: 240000 },
    { rank: 20, lower: 250000, upper: 270000, standard: 260000 },
    { rank: 21, lower: 270000, upper: 290000, standard: 280000 },
    { rank: 22, lower: 290000, upper: 310000, standard: 300000 },
    { rank: 23, lower: 310000, upper: 330000, standard: 320000 },
    { rank: 24, lower: 330000, upper: 350000, standard: 340000 },
    { rank: 25, lower: 350000, upper: 370000, standard: 360000 },
    { rank: 26, lower: 370000, upper: 395000, standard: 380000 },
    { rank: 27, lower: 395000, upper: 425000, standard: 410000 },
    { rank: 28, lower: 425000, upper: 455000, standard: 440000 },
    { rank: 29, lower: 455000, upper: 485000, standard: 470000 },
    { rank: 30, lower: 485000, upper: 515000, standard: 500000 },
    { rank: 31, lower: 515000, upper: 545000, standard: 530000 },
    { rank: 32, lower: 545000, upper: 575000, standard: 560000 },
    { rank: 33, lower: 575000, upper: 605000, standard: 590000 },
    { rank: 34, lower: 605000, upper: 635000, standard: 620000 },
    { rank: 35, lower: 635000, upper: 665000, standard: 650000 },
    { rank: 36, lower: 665000, upper: 695000, standard: 680000 },
    { rank: 37, lower: 695000, upper: 730000, standard: 710000 },
    { rank: 38, lower: 730000, upper: 770000, standard: 750000 },
    { rank: 39, lower: 770000, upper: 810000, standard: 790000 },
    { rank: 40, lower: 810000, upper: 855000, standard: 830000 },
    { rank: 41, lower: 855000, upper: 905000, standard: 880000 },
    { rank: 42, lower: 905000, upper: 955000, standard: 930000 },
    { rank: 43, lower: 955000, upper: 1005000, standard: 980000 },
    { rank: 44, lower: 1005000, upper: 1055000, standard: 1030000 },
    { rank: 45, lower: 1055000, upper: 1115000, standard: 1090000 },
    { rank: 46, lower: 1115000, upper: 1175000, standard: 1150000 },
    { rank: 47, lower: 1175000, upper: 1235000, standard: 1210000 },
    { rank: 48, lower: 1235000, upper: 1295000, standard: 1270000 },
    { rank: 49, lower: 1295000, upper: 1355000, standard: 1330000 },
    { rank: 50, lower: 1355000, upper: 9999999, standard: 1390000 },
  ];

  findGrade(
    gradeTable: any[],
    average: number
  ): { grade: number; remuneration: number } | null {
    if (isNaN(average) || average < 0) {
      return null;
    }
    if (!gradeTable || !Array.isArray(gradeTable)) {
      // Firestoreから読み込めない場合はハードコードされたテーブルを使用
      const row = this.STANDARD_TABLE.find(
        (r) => r && !isNaN(r.lower) && !isNaN(r.upper) && average >= r.lower && average < r.upper
      );
      return row && !isNaN(row.rank) && !isNaN(row.standard) ? { grade: row.rank, remuneration: row.standard } : null;
    }

    if (gradeTable.length === 0) {
      // Firestoreから読み込めない場合はハードコードされたテーブルを使用
      const row = this.STANDARD_TABLE.find(
        (r) => r && !isNaN(r.lower) && !isNaN(r.upper) && average >= r.lower && average < r.upper
      );
      return row && !isNaN(row.rank) && !isNaN(row.standard) ? { grade: row.rank, remuneration: row.standard } : null;
    }

    // Firestoreから読み込んだテーブルを使用
    const row = gradeTable.find(
      (r: any) => r && !isNaN(r.lower) && !isNaN(r.upper) && average >= r.lower && average < r.upper
    );
    return row && !isNaN(row.rank) && !isNaN(row.standard) ? { grade: row.rank, remuneration: row.standard } : null;
  }

  getStandardMonthlyRemuneration(
    avg: number | null,
    gradeTable: any[]
  ): { rank: number; standard: number } | null {
    if (avg === null || isNaN(avg) || avg < 0) {
      return null;
    }
    if (!gradeTable || !Array.isArray(gradeTable)) {
      return null;
    }
    const result = this.findGrade(gradeTable, avg);
    if (!result || isNaN(result.grade) || isNaN(result.remuneration)) {
      return null;
    }
    return { rank: result.grade, standard: result.remuneration };
  }
}







