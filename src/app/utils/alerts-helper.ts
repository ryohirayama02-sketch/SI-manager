/**
 * アラート関連のヘルパー関数
 */

/**
 * 日本時間（JST）の現在日時を取得
 */
export function getJSTDate(): Date {
  const now = new Date();
  const jstOffset = 9 * 60; // 分単位
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const jst = new Date(utc + (jstOffset * 60000));
  return jst;
}

/**
 * 日付を正規化（時刻を00:00:00に設定）
 */
export function normalizeDate(date: Date): Date {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    // 無効な日付の場合は現在日時を使用
    const now = getJSTDate();
    const normalized = new Date(now);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

/**
 * 日付を日本語形式でフォーマット（YYYY年MM月DD日）
 */
export function formatDate(date: Date): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    // 無効な日付の場合は現在日時を使用
    const now = getJSTDate();
    return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
  }
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}年${month}月${day}日`;
}

/**
 * 提出期限を計算（基準日から5日後）
 */
export function calculateSubmitDeadline(baseDate: Date): Date {
  const deadline = new Date(baseDate);
  deadline.setDate(deadline.getDate() + 5);
  return deadline;
}

/**
 * 提出期限までの日数を計算
 */
export function calculateDaysUntilDeadline(deadline: Date, today: Date): number {
  return Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * 年齢到達日を計算（生年月日から指定年齢の日付を計算）
 */
export function calculateAgeReachDate(birthDate: Date, age: number): Date {
  return new Date(birthDate.getFullYear() + age, birthDate.getMonth(), birthDate.getDate() - 1);
}

/**
 * 年齢到達アラート開始日を計算（到達日の1ヶ月前）
 */
export function calculateAgeAlertStartDate(reachDate: Date): Date {
  const alertStartDate = new Date(reachDate);
  alertStartDate.setMonth(alertStartDate.getMonth() - 1);
  return alertStartDate;
}







