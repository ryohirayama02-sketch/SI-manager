import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FamilyAlertUiService } from '../../../../services/family-alert-ui.service';
import { EmployeeService } from '../../../../services/employee.service';
import { FamilyMemberService } from '../../../../services/family-member.service';
import { AlertsDashboardStateService } from '../../../../services/alerts-dashboard-state.service';
import { AlertDeletionService } from '../../../../services/alert-deletion.service';
import { Employee } from '../../../../models/employee.model';

export interface SupportAlert {
  id: string;
  employeeId: string;
  employeeName: string;
  familyMemberId: string;
  familyMemberName: string;
  relationship: string; // 続柄（配偶者、子、父母など）
  alertType:
    | '配偶者20歳到達'
    | '配偶者60歳到達'
    | '配偶者収入増加'
    | '配偶者別居'
    | '配偶者75歳到達'
    | '配偶者第3号取得'
    | '子扶養追加'
    | '子18歳到達'
    | '子22歳到達'
    | '子別居'
    | '子収入増加'
    | '子死亡結婚'
    | '親収入見直し'
    | '親別居'
    | '親75歳到達'
    | '親死亡';
  notificationName: string;
  alertDate: Date; // アラート対象日（到達日、変更日など）
  submitDeadline?: Date; // 提出期限（該当する場合）
  daysUntilDeadline?: number; // 提出期限までの日数
  details: string; // 詳細情報
}

@Component({
  selector: 'app-alert-family-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alert-family-tab.component.html',
  styleUrl: './alert-family-tab.component.css',
})
export class AlertFamilyTabComponent implements OnInit, OnChanges {
  @Input() set supportAlerts(value: SupportAlert[]) {
    this._supportAlerts = value || [];
  }
  get supportAlerts(): SupportAlert[] {
    return this._supportAlerts;
  }
  private _supportAlerts: SupportAlert[] = [];

  @Input() selectedSupportAlertIds: Set<string> = new Set();
  @Input() refreshToken: number = 0;
  @Output() alertSelectionChange = new EventEmitter<{
    alertId: string;
    selected: boolean;
  }>();
  @Output() selectAllChange = new EventEmitter<boolean>();
  @Output() deleteSelected = new EventEmitter<void>();

  private employees: Employee[] = [];

  constructor(
    private familyAlertUiService: FamilyAlertUiService,
    private employeeService: EmployeeService,
    private familyMemberService: FamilyMemberService,
    private state: AlertsDashboardStateService,
    private alertDeletionService: AlertDeletionService
  ) {}

  async ngOnInit(): Promise<void> {
    // @Input()でsupportAlertsが渡されていない場合、自分でロードする
    // state.supportAlertsは常に最新のルームのデータを使用するため、常に再読み込みする
    // （前のルームのデータが残っている可能性があるため）
    if (!this._supportAlerts || this._supportAlerts.length === 0) {
      this.employees = await this.employeeService.getAllEmployees();
      await this.loadSupportAlerts();
    }
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['refreshToken'] && !changes['refreshToken'].firstChange) {
      this.employees = await this.employeeService.getAllEmployees();
      await this.loadSupportAlerts(true);
    }
  }

  private getJSTDate(): Date {
    const now = new Date();
    const jstOffset = 9 * 60;
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc + jstOffset * 60000);
  }

  async loadSupportAlerts(force: boolean = false): Promise<void> {
    const alerts: SupportAlert[] = [];
    const today = this.getJSTDate();
    today.setHours(0, 0, 0, 0);
    const deletedIds = await this.alertDeletionService.getDeletedIds('family');

    // 現在のルームの従業員IDセットを作成（他のルームのデータを除外するため）
    const currentRoomEmployeeIds = new Set(
      this.employees.map((emp) => emp.id).filter((id) => id)
    );

    console.log(
      `[alert-family-tab] loadSupportAlerts開始: 今日=${this.formatDate(
        today
      )}, 従業員数=${this.employees.length}`
    );

    try {
      for (const emp of this.employees) {
        // 従業員IDが有効でない場合はスキップ
        if (!emp.id) {
          continue;
        }

        const familyMembers =
          await this.familyMemberService.getFamilyMembersByEmployeeId(emp.id);

        // 取得した家族情報が現在のルームの従業員に属しているかを確認
        // （念のため、二重チェック）
        const validFamilyMembers = familyMembers.filter(
          (member) =>
            member.employeeId === emp.id &&
            currentRoomEmployeeIds.has(member.employeeId)
        );

        console.log(
          `[alert-family-tab] 従業員=${emp.name}, 家族数=${familyMembers.length}, 有効な家族数=${validFamilyMembers.length}`
        );

        for (const member of validFamilyMembers) {
          const birthDate = new Date(member.birthDate);
          birthDate.setHours(0, 0, 0, 0);
          const age = this.familyMemberService.calculateAge(member.birthDate);
          const relationship = member.relationship || '';
          const income =
            member.expectedIncome !== null && member.expectedIncome !== undefined
              ? member.expectedIncome
              : null;

          console.log(
            `[alert-family-tab] 家族チェック: 従業員=${emp.name}, 家族=${member.name}, 続柄=${relationship}, 生年月日=${member.birthDate}, 現在年齢=${age}`
          );

          // 【1】配偶者に関するアラート
          if (
            relationship === '配偶者' ||
            relationship === '妻' ||
            relationship === '夫'
          ) {
            // ① 20歳到達（年金加入開始）
            const age20Date = new Date(
              birthDate.getFullYear() + 20,
              birthDate.getMonth(),
              birthDate.getDate()
            );
            age20Date.setHours(0, 0, 0, 0);
            const age20AlertStart = new Date(age20Date);
            age20AlertStart.setMonth(age20AlertStart.getMonth() - 1);
            if (today >= age20AlertStart && age >= 19 && age < 21) {
              const submitDeadline = new Date(age20Date);
              submitDeadline.setDate(submitDeadline.getDate() + 14);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `spouse_20_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '配偶者20歳到達',
                notificationName: '国民年金第3号被保険者関係届',
                alertDate: age20Date,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `配偶者が20歳になります。国民年金第3号被保険者関係届が必要です（提出期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }

            // ② 60歳到達（第3号の終了）
            const age60Date = new Date(
              birthDate.getFullYear() + 60,
              birthDate.getMonth(),
              birthDate.getDate()
            );
            age60Date.setHours(0, 0, 0, 0);
            const age60AlertStart = new Date(age60Date);
            age60AlertStart.setMonth(age60AlertStart.getMonth() - 1);
            if (today >= age60AlertStart && age >= 59 && age < 61) {
              const submitDeadline = new Date(age60Date);
              submitDeadline.setDate(submitDeadline.getDate() + 14);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `spouse_60_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '配偶者60歳到達',
                notificationName: '国民年金第3号被保険者資格喪失届の確認',
                alertDate: age60Date,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `配偶者が60歳に到達します。国民年金第3号被保険者資格喪失届の確認が必要です（提出期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }

            // ③ 収入増加（130万円超または月108,333円超）
            if (member.expectedIncome && member.expectedIncome > 1300000) {
              const submitDeadline = new Date(today);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `spouse_income_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '配偶者収入増加',
                notificationName:
                  '被扶養者（異動）削除届・国民年金第3号資格喪失届',
                alertDate: today,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `配偶者の収入が扶養基準を超える可能性があります（収入見込: ${member.expectedIncome.toLocaleString(
                  'ja-JP'
                )}円）。被扶養者（異動）削除届および国民年金第3号資格喪失届が必要です（提出期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }

            // ④ 同居⇒別居の変更
            if (!member.livingTogether) {
              const submitDeadline = new Date(today);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `spouse_separate_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '配偶者別居',
                notificationName: '被扶養者（異動）の仕送り状況確認',
                alertDate: today,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `配偶者が別居予定です。別居扶養の要件（仕送り証明）の確認が必要です。扶養継続不可と判断される場合は被扶養者（異動）削除届が必要です（提出期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }

            // ⑤ 75歳到達（後期高齢者医療／扶養不可）
            const age75Date = new Date(
              birthDate.getFullYear() + 75,
              birthDate.getMonth(),
              birthDate.getDate()
            );
            age75Date.setHours(0, 0, 0, 0);
            const age75AlertStart = new Date(age75Date);
            age75AlertStart.setMonth(age75AlertStart.getMonth() - 1);
            if (today >= age75AlertStart && age >= 74 && age < 76) {
              const submitDeadline = new Date(age75Date);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `spouse_75_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '配偶者75歳到達',
                notificationName: '健康保険被扶養者異動届',
                alertDate: age75Date,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `配偶者が75歳になります。後期高齢者医療制度へ移行するため、健康保険被扶養者異動届（削除）が必要です（提出期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }

            // ⑥ 第3号取得（配偶者が第3号となった場合）※見込年収<1,060,000かつ20-59歳
            if (
              member.isThirdCategory &&
              income !== null &&
              income !== undefined &&
              income < 1060000 &&
              age >= 20 &&
              age < 60
            ) {
              const submitDeadline = new Date(today);
              submitDeadline.setDate(submitDeadline.getDate() + 14);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `spouse_third_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '配偶者第3号取得',
                notificationName: '国民年金第3号被保険者関係届',
                alertDate: today,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `配偶者が第3号に該当しました（見込年収${income.toLocaleString(
                  'ja-JP'
                )}円）。国民年金第3号被保険者関係届を14日以内に提出してください（期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }
          }

          // 【2】子どもに関するアラート
          if (
            relationship === '子' ||
            relationship === '長男' ||
            relationship === '長女' ||
            relationship === '次男' ||
            relationship === '次女' ||
            relationship.includes('子')
          ) {
        // 0) 扶養追加（健康保険被扶養者（異動）届）: 75歳未満かつ見込年収106万円未満のみ
        if (
          age < 75 &&
          income !== null &&
          income !== undefined &&
          income < 1060000
        ) {
          const submitDeadline = new Date(today);
          submitDeadline.setDate(submitDeadline.getDate() + 5);
          const daysUntilDeadline = Math.ceil(
            (submitDeadline.getTime() - today.getTime()) /
              (1000 * 60 * 60 * 24)
          );

          alerts.push({
            id: `child_new_dependent_${emp.id}_${member.id}`,
            employeeId: emp.id,
            employeeName: emp.name,
            familyMemberId: member.id || '',
            familyMemberName: member.name,
            relationship: relationship,
            alertType: '子扶養追加',
            notificationName: '健康保険被扶養者異動届',
            alertDate: today,
            submitDeadline: submitDeadline,
            daysUntilDeadline: daysUntilDeadline,
            details: `子が扶養条件（75歳未満・見込年収106万円未満）に該当しました。健康保険被扶養者異動届（扶養追加）を提出してください（期限: ${this.formatDate(
              submitDeadline
            )}）。`,
          });
        }

            // ① 18歳到達（高校卒業）
            const age18Year = birthDate.getFullYear() + 18;
            const age18GraduationDate = new Date(age18Year, 2, 31);
            age18GraduationDate.setHours(0, 0, 0, 0);
            // アラート発火は卒業予定日の30日前（3/1想定）
            const age18AlertStart = new Date(age18Year, 2, 1);
            if (today >= age18AlertStart && age >= 17 && age < 19) {
              const submitDeadline = new Date(age18GraduationDate);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `child_18_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '子18歳到達',
                notificationName: '扶養見直し（届出不要）',
                alertDate: age18GraduationDate,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `子が18歳に到達します（高校卒業予定: ${age18Year}年3月31日）。進学・就労有無による扶養見直しが必要です（届出不要）。提出期限: ${this.formatDate(
                  submitDeadline
                )}。`,
              });
            }

            // ② 22歳到達（大学卒業＋収入増の可能性）
            const age22Year = birthDate.getFullYear() + 22;
            const age22GraduationDate = new Date(age22Year, 2, 31);
            age22GraduationDate.setHours(0, 0, 0, 0);
            // アラート発火は卒業予定日の30日前（3/1想定）
            const age22AlertStart = new Date(age22Year, 2, 1);
            if (today >= age22AlertStart && age >= 21 && age < 23) {
              const submitDeadline = new Date(age22GraduationDate);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `child_22_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '子22歳到達',
                notificationName: '子の就職状況・収入を確認',
                alertDate: age22GraduationDate,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `子が22歳に到達します（大学卒業予定: ${age22Year}年3月31日）。就職して厚生年金加入する場合、扶養外れるため被扶養者（異動）削除届が必要です（提出期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }

            // ④ 同居→別居（実家・一人暮らし）
            if (!member.livingTogether) {
              const submitDeadline = new Date(today);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `child_separate_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '子別居',
                notificationName: '被扶養者（異動）削除届（仕送りがない場合）',
                alertDate: today,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `子が別居します。別居扶養の要件（仕送り）が必要です。仕送りがない場合は被扶養者（異動）削除届が必要です（提出期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }

            // ⑤ アルバイト収入の増減（130万円基準）
            if (member.expectedIncome && member.expectedIncome > 1300000) {
              const submitDeadline = new Date(today);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `child_income_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '子収入増加',
                notificationName: '被扶養者（異動）削除届',
                alertDate: today,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `子の収入が扶養基準を超過する可能性があります（収入見込: ${member.expectedIncome.toLocaleString(
                  'ja-JP'
                )}円）。被扶養者（異動）削除届が必要です（提出期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }
          }

          // 【3】自分の両親（高齢者扶養）に関するアラート
          if (
            relationship === '父' ||
            relationship === '母' ||
            relationship === '父母' ||
            relationship.includes('父') ||
            relationship.includes('母')
          ) {
            // ① 60歳以上の親の所得増減
            if (age >= 60) {
              if (member.expectedIncome && member.expectedIncome > 1800000) {
                alerts.push({
                  id: `parent_income_${emp.id}_${member.id}`,
                  employeeId: emp.id,
                  employeeName: emp.name,
                  familyMemberId: member.id || '',
                  familyMemberName: member.name,
                  relationship: relationship,
                  alertType: '親収入見直し',
                  notificationName: '扶養基準確認',
                  alertDate: today,
                  details: `親の収入見直しが必要です（収入見込: ${member.expectedIncome.toLocaleString(
                    'ja-JP'
                  )}円）。扶養基準に該当するか確認してください。`,
                });
              }
            }

            // ② 同居→別居
            if (!member.livingTogether) {
              const submitDeadline = new Date(today);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `parent_separate_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '親別居',
                notificationName: '被扶養者（異動）の仕送り状況確認',
                alertDate: today,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `親が別居します。別居扶養の条件（仕送り）が必要です。仕送りがない場合は被扶養者（異動）削除届が必要です（提出期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }

            // ③ 75歳到達（後期高齢者医療へ切替）
            const age75Date = new Date(
              birthDate.getFullYear() + 75,
              birthDate.getMonth(),
              birthDate.getDate()
            );
            age75Date.setHours(0, 0, 0, 0);
            const age75AlertStart = new Date(age75Date);
            age75AlertStart.setMonth(age75AlertStart.getMonth() - 1);
            if (today >= age75AlertStart && age >= 74 && age < 76) {
              const submitDeadline = new Date(age75Date);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `parent_75_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '親75歳到達',
                notificationName: '被扶養者（異動）削除届',
                alertDate: age75Date,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `親が75歳になります。後期高齢者医療制度へ移行します。被扶養者（異動）削除届が必要です（提出期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }
          }
        }
      }

      alerts.sort((a, b) => {
        return b.alertDate.getTime() - a.alertDate.getTime();
      });

      const filteredAlerts = alerts.filter((a) => !deletedIds.has(a.id));

      // 常に最新で上書き（force）、または初回のみセット
      if (force || !this._supportAlerts || this._supportAlerts.length === 0) {
        this._supportAlerts = filteredAlerts;
      }

      // state.supportAlertsも更新（届出スケジュールで使用されるため）
      this.state.supportAlerts = filteredAlerts;
      this.state.updateScheduleData();
    } catch (error) {
      console.error('[alert-family-tab] loadSupportAlertsエラー:', error);
    }
  }

  /**
   * 日付をフォーマット
   */
  formatDate(date: Date): string {
    return this.familyAlertUiService.formatDate(date);
  }

  // 扶養アラートの選択管理
  toggleSupportAlertSelection(alertId: string): void {
    const isSelected = this.selectedSupportAlertIds.has(alertId);
    this.alertSelectionChange.emit({ alertId, selected: !isSelected });
  }

  toggleAllSupportAlertsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.selectAllChange.emit(target.checked);
  }

  isSupportAlertSelected(alertId: string): boolean {
    return this.selectedSupportAlertIds.has(alertId);
  }

  // 扶養アラートの削除
  async deleteSelectedSupportAlerts(): Promise<void> {
    // @Input()でsupportAlertsが渡されている場合は親に委譲
    // そうでない場合は自分で削除処理を行う
    if (
      this._supportAlerts &&
      this._supportAlerts.length > 0 &&
      this._supportAlerts === this.state.supportAlerts
    ) {
      // 親経由で削除（state経由）
      this.deleteSelected.emit();
    } else {
      // 自分でロードしたアラートを削除
      const selectedIds = Array.from(this.selectedSupportAlertIds);
      if (selectedIds.length === 0) return;

      for (const id of selectedIds) {
        await this.alertDeletionService.markAsDeleted('family', id);
      }

      this._supportAlerts = this._supportAlerts.filter(
        (alert) => !selectedIds.includes(alert.id)
      );
      this.selectedSupportAlertIds.clear();

      // stateも更新
      this.state.supportAlerts = this._supportAlerts;
      this.state.updateScheduleData();
    }
  }
}
