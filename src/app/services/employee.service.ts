import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc, doc, getDoc, getDocs, updateDoc, deleteDoc } from '@angular/fire/firestore';
import { Employee } from '../models/employee.model';

@Injectable({ providedIn: 'root' })
export class EmployeeService {

  constructor(private firestore: Firestore) {}

  async addEmployee(employee: any): Promise<void> {
    // 後方互換性のため、hireDate → joinDate、shortTimeWorker → isShortTime の変換
    const normalizedEmployee: any = { ...employee };
    if (normalizedEmployee.hireDate && !normalizedEmployee.joinDate) {
      normalizedEmployee.joinDate = normalizedEmployee.hireDate;
      delete normalizedEmployee.hireDate;
    }
    if (normalizedEmployee.shortTimeWorker !== undefined && normalizedEmployee.isShortTime === undefined) {
      normalizedEmployee.isShortTime = normalizedEmployee.shortTimeWorker;
      delete normalizedEmployee.shortTimeWorker;
    }
    
    // undefinedの値を除外
    const cleanEmployee: any = {};
    for (const [key, value] of Object.entries(normalizedEmployee)) {
      if (value !== undefined) {
        cleanEmployee[key] = value;
      }
    }
    
    const col = collection(this.firestore, 'employees');
    await addDoc(col, cleanEmployee);
  }

  // 全従業員を取得
  async getAllEmployees(): Promise<any[]> {
    const colRef = collection(this.firestore, 'employees');
    const snap = await getDocs(colRef);

    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  }

  // IDで従業員を取得
  async getEmployeeById(id: string): Promise<any | null> {
    const ref = doc(this.firestore, `employees/${id}`);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  }

  // 新規作成（UC1）
  async createEmployee(data: Employee): Promise<void> {
    return Promise.resolve();
  }

  async updateEmployee(id: string, data: any): Promise<void> {
    const ref = doc(this.firestore, `employees/${id}`);
    
    // undefinedの値を除外
    const cleanData: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanData[key] = value;
      }
    }
    
    await updateDoc(ref, cleanData);
  }

  async deleteEmployee(id: string): Promise<void> {
    const ref = doc(this.firestore, `employees/${id}`);
    await deleteDoc(ref);
  }

  /**
   * 資格取得時決定情報を更新
   * @param employeeId 従業員ID
   * @param info 資格取得時決定情報
   */
  async updateAcquisitionInfo(
    employeeId: string,
    info: {
      acquisitionGrade: number;
      acquisitionStandard: number;
      acquisitionYear: number;
      acquisitionMonth: number;
    }
  ): Promise<void> {
    const ref = doc(this.firestore, `employees/${employeeId}`);
    
    // undefinedの値を除外
    const cleanData: any = {};
    for (const [key, value] of Object.entries(info)) {
      if (value !== undefined) {
        cleanData[key] = value;
      }
    }
    
    await updateDoc(ref, cleanData);
  }
}

