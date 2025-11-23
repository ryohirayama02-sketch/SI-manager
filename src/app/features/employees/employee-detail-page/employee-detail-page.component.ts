import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { EmployeeService } from '../../../services/employee.service';

@Component({
  selector: 'app-employee-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './employee-detail-page.component.html',
  styleUrl: './employee-detail-page.component.css'
})
export class EmployeeDetailPageComponent implements OnInit {
  employee: any | null = null;
  id: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private employeeService: EmployeeService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    this.id = this.route.snapshot.paramMap.get('id');
    if (!this.id) return;

    this.employee = await this.employeeService.getEmployeeById(this.id);
  }

  getAge(birthDate: string): number | null {
    if (!birthDate) return null;
    const today = new Date();
    const bd = new Date(birthDate);
    let age = today.getFullYear() - bd.getFullYear();
    const m = today.getMonth() - bd.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
    return age;
  }

  isCareInsuranceTarget(): boolean {
    const age = this.getAge(this.employee?.birthDate);
    return age !== null && age >= 40 && age <= 64;
  }

  async deleteEmployee(): Promise<void> {
    if (!this.id) return;

    const ok = confirm('本当に削除しますか？');
    if (!ok) return;

    await this.employeeService.deleteEmployee(this.id);
    this.router.navigate(['/employees']);
  }
}


