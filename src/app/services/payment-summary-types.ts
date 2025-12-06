import { Bonus } from '../models/bonus.model';

export interface MonthlyPremiumRow {
  month: number;
  healthEmployee: number;
  healthEmployer: number;
  careEmployee: number;
  careEmployer: number;
  pensionEmployee: number;
  pensionEmployer: number;
  exempt: boolean;
  notes: string[];
  isAcquisitionMonth?: boolean;
  acquisitionGrade?: number;
  acquisitionStandard?: number;
  acquisitionReason?: string;
  shikakuReportRequired?: boolean;
  shikakuReportDeadline?: string;
  shikakuReportReason?: string;
  isRetired?: boolean;
  isMaternityLeave?: boolean;
  isChildcareLeave?: boolean;
  isPensionStopped?: boolean;
  isHealthStopped?: boolean;
}

export interface MonthlyTotal {
  health: number;
  care: number;
  pension: number;
  total: number;
  isPensionStopped?: boolean;
  isHealthStopped?: boolean;
  isMaternityLeave?: boolean;
  isChildcareLeave?: boolean;
  isRetired?: boolean;
}

export interface CompanyMonthlyTotal {
  month: number;
  healthTotal: number;
  careTotal: number;
  pensionTotal: number;
  total: number;
}

export interface BonusAnnualTotal {
  healthEmployee: number;
  healthEmployer: number;
  careEmployee: number;
  careEmployer: number;
  pensionEmployee: number;
  pensionEmployer: number;
  totalEmployee: number;
  totalEmployer: number;
  total: number;
}

export interface CalculationResult {
  monthlyPremiumsByEmployee: {
    [employeeId: string]: MonthlyPremiumRow[];
  };
  monthlyTotals: {
    [month: number]: MonthlyTotal;
  };
  companyMonthlyTotals: CompanyMonthlyTotal[];
  bonusAnnualTotals: BonusAnnualTotal;
  bonusByMonth: { [month: number]: Bonus[] };
  errorMessages: { [employeeId: string]: string[] };
}

