export interface Employee {
  id: string;

  // --- 個人情報 ---
  name: string;
  nameKana?: string;
  gender?: string;
  birthDate: string;
  address?: string;
  myNumber?: string;
  basicPensionNumber?: string;
  insuredNumber?: string;

  // --- 雇用条件 ---
  weeklyWorkHoursCategory?:
    | '30hours-or-more'
    | '20-30hours'
    | 'less-than-20hours'
    | '';
  monthlyWage?: number | null;
  expectedEmploymentMonths?: 'within-2months' | 'over-2months' | '' | null;
  isStudent?: boolean;

  // 自動算出
  isShortTime: boolean;
  weeklyHours?: number | null;

  // --- 所属 ---
  prefecture: string;
  officeNumber: string;
  department?: string;

  // --- 入退社 ---
  joinDate: string;
  retireDate?: string | null;

  // --- 資格取得・喪失 ---
  healthInsuranceAcquisitionDate?: string | null;
  pensionAcquisitionDate?: string | null;
  healthInsuranceLossDate?: string | null;
  pensionLossDate?: string | null;

  // --- 標準報酬（月額） ---
  currentStandardMonthlyRemuneration?: number | null;
  determinationReason?: '' | 'teiji' | 'suiji' | 'shikaku' | 'other';

  // 最終決定情報
  lastTeijiKetteiYear?: number | null;
  lastTeijiKetteiMonth?: number | null;
  lastSuijiKetteiYear?: number | null;
  lastSuijiKetteiMonth?: number | null;

  // --- 休職 ---
  leaveOfAbsenceStart?: string | null;
  leaveOfAbsenceEnd?: string | null;
  returnFromLeaveDate?: string | null;

  // --- 産前産後休業 ---
  expectedDeliveryDate?: string | null;
  maternityLeaveStart?: string | null;
  maternityLeaveEndExpected?: string | null;
  actualDeliveryDate?: string | null;
  maternityLeaveEnd?: string | null;

  // --- 育児休業 ---
  childcareChildName?: string | null;
  childcareChildBirthDate?: string | null;
  childcareLeaveStart?: string | null;
  childcareLeaveEndExpected?: string | null;
  childcareLeaveEnd?: string | null;
  childcareNotificationSubmitted?: boolean;
  childcareLivingTogether?: boolean;

  // --- 申請書記入依頼 ---
  sickPayApplicationRequest?: boolean;
  childcareEmployerCertificateRequest?: boolean;
  maternityAllowanceApplicationRequest?: boolean;
}
