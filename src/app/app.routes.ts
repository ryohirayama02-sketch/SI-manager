import { Routes } from '@angular/router';
import { EmployeeListPageComponent } from './features/employees/employee-list-page/employee-list-page.component';
import { EmployeeDetailPageComponent } from './features/employees/employee-detail-page/employee-detail-page.component';
import { EmployeeCreatePageComponent } from './features/employees/employee-create-page/employee-create-page.component';
import { MonthlySalariesPageComponent } from './features/monthly-salaries/monthly-salaries-page.component';
import { SettingsPageComponent } from './features/settings/settings-page/settings-page.component';

export const routes: Routes = [
  {
    path: 'employees',
    component: EmployeeListPageComponent
  },
  {
    path: 'employees/new',
    component: EmployeeCreatePageComponent
  },
  {
    path: 'employees/:id',
    component: EmployeeDetailPageComponent
  },
  {
    path: 'monthly-salaries',
    component: MonthlySalariesPageComponent
  },
  {
    path: 'settings',
    component: SettingsPageComponent
  },
  {
    path: '',
    redirectTo: '/employees',
    pathMatch: 'full'
  }
];
