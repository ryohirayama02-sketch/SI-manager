import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-employee-basic-info-affiliation',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './employee-basic-info-affiliation.component.html',
  styleUrl: './employee-basic-info-affiliation.component.css'
})
export class EmployeeBasicInfoAffiliationComponent implements OnInit {
  @Input() form!: FormGroup;
  @Input() employeeId: string | null = null;

  constructor() {}

  ngOnInit(): void {}
}
