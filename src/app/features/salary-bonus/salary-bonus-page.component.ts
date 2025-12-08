import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MonthlySalariesPageComponent } from '../monthly-salaries/monthly-salaries-page.component';
import { BonusPageComponent } from '../bonus/bonus-page.component';

@Component({
  selector: 'app-salary-bonus-page',
  standalone: true,
  imports: [CommonModule, MonthlySalariesPageComponent, BonusPageComponent],
  templateUrl: './salary-bonus-page.component.html',
  styleUrl: './salary-bonus-page.component.css'
})
export class SalaryBonusPageComponent {
  activeTab: 'salary' | 'bonus' = 'salary';
}











