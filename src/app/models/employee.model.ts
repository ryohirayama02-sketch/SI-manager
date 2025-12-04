export interface Employee {
  id: string; // FirestoreのドキュメントID
  name: string; // 氏名
  birthDate: string; // 生年月日（YYYY-MM-DD）
  joinDate: string; // 入社日
  isShortTime: boolean; // 短時間労働者か（後方互換性のため残す）
  weeklyWorkHoursCategory?:
    | '30hours-or-more'
    | '20-30hours'
    | 'less-than-20hours'; // 週の所定労働時間カテゴリ
  standardMonthlyRemuneration?: number; // 標準報酬月額（算定後）
  returnFromLeaveDate?: string; // 復職日（YYYY-MM-DD）
  retireDate?: string; // 退職日（YYYY-MM-DD）
  expectedDeliveryDate?: string; // 出産予定日（YYYY-MM-DD）
  maternityLeaveStart?: string; // 産休開始日（YYYY-MM-DD）
  maternityLeaveEndExpected?: string; // 産前産後休業終了予定日（YYYY-MM-DD）
  actualDeliveryDate?: string; // 出産日（YYYY-MM-DD）
  maternityLeaveEnd?: string; // 産前産後休業終了日（YYYY-MM-DD）
  childcareLeaveStart?: string; // 育休開始日（YYYY-MM-DD）
  childcareLeaveEndExpected?: string; // 育児休業等終了予定日（YYYY-MM-DD）
  childcareLeaveEnd?: string; // 育休終了日（YYYY-MM-DD）
  childcareChildName?: string; // 養育する子の氏名
  childcareChildBirthDate?: string; // 養育する子の生年月日（YYYY-MM-DD）
  childcareNotificationSubmitted?: boolean; // 育児休業取得届の提出済フラグ
  childcareLivingTogether?: boolean; // 子と同居しているか（養育しているか）
  // 申請書記入依頼チェックボックス
  sickPayApplicationRequest?: boolean; // 傷病手当金支給申請書の記入依頼あり
  childcareEmployerCertificateRequest?: boolean; // 育児休業関係の事業主証明書の記入依頼あり
  maternityAllowanceApplicationRequest?: boolean; // 出産手当金支給申請書の記入依頼あり
  // 申請書記入依頼のチェック日時（アラート生成用）
  sickPayApplicationRequestDate?: string; // 傷病手当金支給申請書の記入依頼日（YYYY-MM-DD）
  childcareEmployerCertificateRequestDate?: string; // 育児休業関係の事業主証明書の記入依頼日（YYYY-MM-DD）
  maternityAllowanceApplicationRequestDate?: string; // 出産手当金支給申請書の記入依頼日（YYYY-MM-DD）
  // 加入判定用の追加属性（オプショナル）
  weeklyHours?: number; // 週労働時間
  monthlyWage?: number; // 月額賃金（円）
  expectedEmploymentMonths?: number; // 雇用見込期間（月）
  isStudent?: boolean; // 学生かどうか
  consecutiveMonthsOver20Hours?: number; // 連続で20時間以上働いた月数
  officeNumber?: string; // 事業所番号（事業所マスタと紐づけ）
  prefecture?: string; // 事業所の都道府県（tokyo/hokkaido/osakaなど）- 事業所選択時に自動設定
  leaveOfAbsenceStart?: string; // 休職開始日（YYYY-MM-DD）
  leaveOfAbsenceEnd?: string; // 休職終了日（YYYY-MM-DD）
  // 資格取得時決定情報
  acquisitionGrade?: number; // 資格取得時決定の等級
  acquisitionStandard?: number; // 資格取得時決定の標準報酬月額
  acquisitionYear?: number; // 資格取得年
  acquisitionMonth?: number; // 資格取得月（1-12）
  // 個人情報
  nameKana?: string; // 氏名（カナ）
  gender?: string; // 性別（'male' | 'female' | 'other'）
  address?: string; // 住所
  myNumber?: string; // マイナンバー（個人番号）
  basicPensionNumber?: string; // 基礎年金番号
  insuredNumber?: string; // 被保険者整理番号
}
