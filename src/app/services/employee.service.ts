import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc, doc, getDoc, getDocs, updateDoc, deleteDoc } from '@angular/fire/firestore';
import { Employee } from '../models/employee.model';

@Injectable({ providedIn: 'root' })
export class EmployeeService {

  constructor(private firestore: Firestore) {}

  async addEmployee(employee: any): Promise<void> {
    const col = collection(this.firestore, 'employees');
    await addDoc(col, employee);
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
    await updateDoc(ref, data);
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
    await updateDoc(ref, info);
  }
}

