export interface Employee {
  id: string; // FirestoreのドキュメントID
  name: string; // 氏名
  birthDate: string; // 生年月日（YYYY-MM-DD）
  joinDate: string; // 入社日
  isShortTime: boolean; // 短時間労働者か
  standardMonthlyRemuneration?: number; // 標準報酬月額（算定後）
  returnFromLeaveDate?: string; // 復職日（YYYY-MM-DD）
  retireDate?: string; // 退職日（YYYY-MM-DD）
  maternityLeaveStart?: string; // 産休開始日（YYYY-MM-DD）
  maternityLeaveEnd?: string; // 産休終了日（YYYY-MM-DD）
  childcareLeaveStart?: string; // 育休開始日（YYYY-MM-DD）
  childcareLeaveEnd?: string; // 育休終了日（YYYY-MM-DD）
  childcareNotificationSubmitted?: boolean; // 育児休業取得届の提出済フラグ
  childcareLivingTogether?: boolean; // 子と同居しているか（養育しているか）
  // 加入判定用の追加属性（オプショナル）
  weeklyHours?: number; // 週労働時間
  monthlyWage?: number; // 月額賃金（円）
  expectedEmploymentMonths?: number; // 雇用見込期間（月）
  isStudent?: boolean; // 学生かどうか
  consecutiveMonthsOver20Hours?: number; // 連続で20時間以上働いた月数
  prefecture?: string; // 事業所の都道府県（tokyo/hokkaido/osakaなど）
  leaveOfAbsenceStart?: string; // 休職開始日（YYYY-MM-DD）
  leaveOfAbsenceEnd?: string; // 休職終了日（YYYY-MM-DD）
  // 資格取得時決定情報
  acquisitionGrade?: number; // 資格取得時決定の等級
  acquisitionStandard?: number; // 資格取得時決定の標準報酬月額
  acquisitionYear?: number; // 資格取得年
  acquisitionMonth?: number; // 資格取得月（1-12）
}
