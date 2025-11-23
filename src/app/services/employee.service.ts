import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';

@Injectable({ providedIn: 'root' })
export class EmployeeService {

  constructor() {}

  // 全従業員を取得（後で Firestore 実装）
  async getAllEmployees(): Promise<Employee[]> {
    return Promise.resolve([
      {
        id: 'emp1',
        name: '田中 太郎',
        birthDate: '1985-04-12',
        joinDate: '2020-01-01',
        isShortTime: false,
        standardMonthlyRemuneration: 300000
      },
      {
        id: 'emp2',
        name: '佐藤 花子',
        birthDate: '1990-11-03',
        joinDate: '2021-04-10',
        isShortTime: true,
        standardMonthlyRemuneration: 200000
      }
    ]);
  }

  // IDで従業員を取得
  async getEmployeeById(id: string): Promise<Employee | null> {
    return Promise.resolve(null);
  }

  // 新規作成（UC1）
  async createEmployee(data: Employee): Promise<void> {
    return Promise.resolve();
  }
}

