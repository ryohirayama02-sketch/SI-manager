import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
} from '@angular/fire/firestore';
import { Employee } from '../models/employee.model';
import { Observable } from 'rxjs';
import { RoomIdService } from './room-id.service';
import { EditLogService } from './edit-log.service';

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  constructor(
    private firestore: Firestore,
    private roomIdService: RoomIdService,
    private editLogService: EditLogService
  ) {}

  async addEmployee(employee: any): Promise<string> {
    const roomId = this.roomIdService.requireRoomId();

    // 後方互換性のため、hireDate → joinDate、shortTimeWorker → isShortTime の変換
    const normalizedEmployee: any = { ...employee };
    if (normalizedEmployee.hireDate && !normalizedEmployee.joinDate) {
      normalizedEmployee.joinDate = normalizedEmployee.hireDate;
      delete normalizedEmployee.hireDate;
    }
    if (
      normalizedEmployee.shortTimeWorker !== undefined &&
      normalizedEmployee.isShortTime === undefined
    ) {
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

    // roomIdを自動付与
    cleanEmployee.roomId = roomId;

    const col = collection(this.firestore, 'employees');
    const docRef = await addDoc(col, cleanEmployee);

    // 編集ログを記録
    await this.editLogService.logEdit(
      'create',
      'employee',
      docRef.id,
      cleanEmployee.name || '不明',
      `従業員「${cleanEmployee.name || '不明'}」を追加しました`
    );

    return docRef.id;
  }

  // 全従業員を取得（roomIdでフィルタリング）
  async getAllEmployees(): Promise<any[]> {
    const roomId = this.roomIdService.getCurrentRoomId();
    if (!roomId) {
      console.warn(
        '[EmployeeService] roomIdが取得できないため、空配列を返します'
      );
      return [];
    }

    const colRef = collection(this.firestore, 'employees');
    const q = query(colRef, where('roomId', '==', roomId));
    const snap = await getDocs(q);

    return snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  }

  // IDで従業員を取得（roomIdで検証）
  async getEmployeeById(id: string): Promise<any | null> {
    const roomId = this.roomIdService.getCurrentRoomId();
    if (!roomId) {
      console.warn(
        '[EmployeeService] roomIdが取得できないため、nullを返します'
      );
      return null;
    }

    const ref = doc(this.firestore, `employees/${id}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const data = snap.data();

    // roomIdの検証（セキュリティチェック）
    if (data['roomId'] !== roomId) {
      console.warn('[EmployeeService] roomIdが一致しないため、nullを返します', {
        requestedRoomId: roomId,
        documentRoomId: data['roomId'],
      });
      return null;
    }

    // 後方互換性のため、hireDate → joinDate、shortTimeWorker → isShortTime の変換
    const normalizedData: any = { ...data };
    if (normalizedData.hireDate && !normalizedData.joinDate) {
      normalizedData.joinDate = normalizedData.hireDate;
    }
    if (
      normalizedData.shortTimeWorker !== undefined &&
      normalizedData.isShortTime === undefined
    ) {
      normalizedData.isShortTime = normalizedData.shortTimeWorker;
    }

    return normalizedData;
  }

  async updateEmployee(id: string, data: Partial<Employee>): Promise<void> {
    const roomId = this.roomIdService.requireRoomId();

    const ref = doc(this.firestore, `employees/${id}`);

    // 既存データのroomIdを確認（セキュリティチェック）
    const existingDoc = await getDoc(ref);
    if (!existingDoc.exists()) {
      throw new Error('従業員データが見つかりません');
    }
    const existingData = existingDoc.data();
    if (existingData['roomId'] !== roomId) {
      throw new Error('この従業員データにアクセスする権限がありません');
    }

    // undefinedの値を除外（空文字列やnullは含める）
    const cleanData: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanData[key] = value;
      }
    }

    // roomIdは変更不可（セキュリティのため）
    delete cleanData.roomId;

    console.log('[employee.service] updateEmployee:', {
      id,
      cleanData,
      officeNumber: cleanData.officeNumber,
      prefecture: cleanData.prefecture,
      department: cleanData.department,
    });

    await updateDoc(ref, cleanData);

    // 保存後に確認
    const savedDoc = await getDoc(ref);
    const savedData = savedDoc.data();
    console.log('[employee.service] 保存後の確認:', {
      officeNumber: savedData?.['officeNumber'],
      prefecture: savedData?.['prefecture'],
      department: savedData?.['department'],
    });

    // 編集ログを記録
    await this.editLogService.logEdit(
      'update',
      'employee',
      id,
      existingData['name'] || '不明',
      `従業員「${existingData['name'] || '不明'}」を更新しました`
    );
  }

  async deleteEmployee(id: string): Promise<void> {
    const roomId = this.roomIdService.requireRoomId();

    const ref = doc(this.firestore, `employees/${id}`);

    // 既存データのroomIdを確認（セキュリティチェック）
    const existingDoc = await getDoc(ref);
    if (!existingDoc.exists()) {
      throw new Error('従業員データが見つかりません');
    }
    const existingData = existingDoc.data();
    if (existingData['roomId'] !== roomId) {
      throw new Error('この従業員データを削除する権限がありません');
    }

    // 編集ログを記録（削除前に記録）
    await this.editLogService.logEdit(
      'delete',
      'employee',
      id,
      existingData['name'] || '不明',
      `従業員「${existingData['name'] || '不明'}」を削除しました`
    );

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
    const roomId = this.roomIdService.requireRoomId();

    const ref = doc(this.firestore, `employees/${employeeId}`);

    // 既存データのroomIdを確認（セキュリティチェック）
    const existingDoc = await getDoc(ref);
    if (!existingDoc.exists()) {
      throw new Error('従業員データが見つかりません');
    }
    const existingData = existingDoc.data();
    if (existingData['roomId'] !== roomId) {
      throw new Error('この従業員データにアクセスする権限がありません');
    }

    // undefinedの値を除外
    const cleanData: any = {};
    for (const [key, value] of Object.entries(info)) {
      if (value !== undefined) {
        cleanData[key] = value;
      }
    }

    await updateDoc(ref, cleanData);
  }

  /**
   * 従業員コレクションの変更を監視する（roomIdでフィルタリング）
   * @returns Observable<void>
   */
  observeEmployees(): Observable<void> {
    const roomId = this.roomIdService.getCurrentRoomId();
    if (!roomId) {
      return new Observable<void>((observer) => {
        observer.complete();
      });
    }

    const colRef = collection(this.firestore, 'employees');
    const q = query(colRef, where('roomId', '==', roomId));
    return new Observable<void>((observer) => {
      const unsubscribe = onSnapshot(q, () => {
        observer.next();
      });
      return () => unsubscribe();
    });
  }

  /**
   * 全従業員を取得（getAllEmployees のエイリアス）
   */
  async getEmployees(): Promise<Employee[]> {
    return this.getAllEmployees();
  }
}
