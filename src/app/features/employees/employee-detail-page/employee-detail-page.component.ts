import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-employee-detail-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './employee-detail-page.component.html',
  styleUrl: './employee-detail-page.component.css'
})
export class EmployeeDetailPageComponent implements OnInit {
  employeeId: string | null = null;

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.employeeId = this.route.snapshot.paramMap.get('id');
    console.log('従業員ID:', this.employeeId);
  }
}


