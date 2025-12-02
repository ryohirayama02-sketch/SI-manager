import { Routes } from '@angular/router';
import { EmployeeListPageComponent } from './features/employees/employee-list-page/employee-list-page.component';
import { EmployeeCreatePageComponent } from './features/employees/employee-create-page/employee-create-page.component';
import { EmployeeEditPageComponent } from './features/employees/employee-edit-page/employee-edit-page.component';
import { MonthlySalariesPageComponent } from './features/monthly-salaries/monthly-salaries-page.component';
import { SettingsPageComponent } from './features/settings/settings-page/settings-page.component';
import { BonusPageComponent } from './features/bonus/bonus-page.component';
import { SalaryBonusPageComponent } from './features/salary-bonus/salary-bonus-page.component';
import { BonusEditPageComponent } from './features/bonus/bonus-edit-page/bonus-edit-page.component';
import { InsuranceResultPageComponent } from './features/insurance-result/insurance-result-page.component';
import { PaymentSummaryPageComponent } from './features/insurance-payment-summary/payment-summary-page.component';
import { MonthlyChangeAlertPageComponent } from './features/monthly-change-alert/monthly-change-alert-page.component';
import { AlertsDashboardPageComponent } from './features/alerts-dashboard/alerts-dashboard-page.component';
import { LoginPageComponent } from './pages/login/login-page.component';
import { SignupPageComponent } from './pages/signup/signup-page.component';
import { RoomEnterPageComponent } from './pages/room-enter/room-enter-page.component';
import { authGuard } from './guards/auth.guard';
import { roomGuard } from './guards/room.guard';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginPageComponent,
  },
  {
    path: 'signup',
    component: SignupPageComponent,
  },
  {
    path: 'room-enter',
    component: RoomEnterPageComponent,
  },
  {
    path: 'employees',
    component: EmployeeListPageComponent,
    canActivate: [authGuard, roomGuard],
  },
  {
    path: 'employees/new',
    component: EmployeeCreatePageComponent,
    canActivate: [authGuard, roomGuard],
  },
  {
    path: 'employees/:id/edit',
    component: EmployeeEditPageComponent,
    canActivate: [authGuard, roomGuard],
  },
  {
    path: 'salary-bonus',
    component: SalaryBonusPageComponent,
    canActivate: [authGuard, roomGuard],
  },
  {
    path: 'monthly-salaries',
    component: MonthlySalariesPageComponent,
    canActivate: [authGuard, roomGuard],
  },
  {
    path: 'settings',
    component: SettingsPageComponent,
    canActivate: [authGuard, roomGuard],
  },
  {
    path: 'bonus',
    component: BonusPageComponent,
    canActivate: [authGuard, roomGuard],
  },
  {
    path: 'bonus/:employeeId/:bonusId/edit',
    component: BonusEditPageComponent,
    canActivate: [authGuard, roomGuard],
  },
  {
    path: 'insurance-result',
    component: InsuranceResultPageComponent,
    canActivate: [authGuard, roomGuard],
  },
  {
    path: 'insurance-payment-summary',
    component: PaymentSummaryPageComponent,
    canActivate: [authGuard, roomGuard],
  },
  {
    path: 'monthly-change-alert',
    component: MonthlyChangeAlertPageComponent,
    canActivate: [authGuard, roomGuard],
  },
  {
    path: 'alerts',
    component: AlertsDashboardPageComponent,
    canActivate: [authGuard, roomGuard],
  },
  {
    path: '',
    redirectTo: '/login',
    pathMatch: 'full',
  },
];
