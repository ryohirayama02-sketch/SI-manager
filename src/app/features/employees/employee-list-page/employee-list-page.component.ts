import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { EmployeeService } from '../../../services/employee.service';
import { Employee } from '../../../models/employee.model';

@Component({
  selector: 'app-employee-list-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './employee-list-page.component.html',
  styleUrl: './employee-list-page.component.css'
})
export class EmployeeListPageComponent implements OnInit {
  employees: Employee[] = [];

  constructor(
    private employeeService: EmployeeService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    this.employees = await this.employeeService.getAllEmployees();
  }

  goDetail(id: string): void {
    this.router.navigate(['/employees', id]);
  }

  goCreate(): void {
    this.router.navigate(['/employees/new']);
  }
}


