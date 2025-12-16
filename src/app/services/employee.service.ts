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
  collectionData,
} from '@angular/fire/firestore';
import { Employee } from '../models/employee.model';
import { Observable } from 'rxjs';
import { RoomIdService } from './room-id.service';
import { EditLogService } from './edit-log.service';
import { UncollectedPremiumService } from './uncollected-premium.service';

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  constructor(
    private firestore: Firestore,
    private roomIdService: RoomIdService,
    private editLogService: EditLogService,
    private uncollectedPremiumService: UncollectedPremiumService
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

    const col = collection(this.firestore, `rooms/${roomId}/employees`);
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
    const roomId = this.roomIdService.requireRoomId();
    const colRef = collection(this.firestore, `rooms/${roomId}/employees`);
    const snap = await getDocs(colRef);

    const employees = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return employees;
  }

  // IDで従業員を取得（roomIdで検証）
  async getEmployeeById(id: string): Promise<any | null> {
    const roomId = this.roomIdService.requireRoomId();
    const ref = doc(this.firestore, `rooms/${roomId}/employees/${id}`);
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

    const ref = doc(this.firestore, `rooms/${roomId}/employees/${id}`);

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

    await updateDoc(ref, cleanData);

    // 編集ログを記録
    await this.editLogService.logEdit(
      'update',
      'employee',
      id,
      existingData['name'] || '不明',
      `従業員「${existingData['name'] || '不明'}」を更新しました`
    );
  }

  // ---------- rooms/{roomId}/employees 系（新構造用） ----------

  /**
   * 指定ルームの従業員一覧を取得（リアルタイム購読）
   */
  getEmployeesByRoom(roomId: string): Observable<Employee[]> {
    const colRef = collection(this.firestore, `rooms/${roomId}/employees`);
    return collectionData(colRef, { idField: 'id' }) as Observable<Employee[]>;
  }

  /**
   * 指定ルームの従業員を取得
   */
  async getEmployeeByRoom(
    roomId: string,
    employeeId: string
  ): Promise<Employee | null> {
    const ref = doc(this.firestore, `rooms/${roomId}/employees/${employeeId}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as Employee;
    return { ...(data as any), id: snap.id };
  }

  /**
   * 指定ルームに従業員を作成（自動ID）
   */
  async createEmployeeInRoom(
    roomId: string,
    employee: Employee
  ): Promise<string> {
    const colRef = collection(this.firestore, `rooms/${roomId}/employees`);
    const payload = { ...employee, roomId };
    const docRef = await addDoc(colRef, payload);
    return docRef.id;
  }

  /**
   * 指定ルームの従業員を更新（roomId を保持）
   */
  async updateEmployeeInRoom(
    roomId: string,
    employeeId: string,
    employee: Employee
  ): Promise<void> {
    const ref = doc(this.firestore, `rooms/${roomId}/employees/${employeeId}`);
    const payload = { ...employee, roomId };
    await updateDoc(ref, payload as any);
  }

  /**
   * 指定ルームの従業員を削除
   */
  async deleteEmployeeInRoom(
    roomId: string,
    employeeId: string
  ): Promise<void> {
    const ref = doc(this.firestore, `rooms/${roomId}/employees/${employeeId}`);
    await deleteDoc(ref);
  }

  async deleteEmployee(id: string): Promise<void> {
    const roomId = this.roomIdService.requireRoomId();

    const ref = doc(this.firestore, `rooms/${roomId}/employees/${id}`);

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

    // 従業員削除時に紐づく徴収不能アラートも先に削除
    await this.uncollectedPremiumService.deleteByEmployee(roomId, id);

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

    const ref = doc(this.firestore, `rooms/${roomId}/employees/${employeeId}`);

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
    const roomId = this.roomIdService.requireRoomId();
    const colRef = collection(this.firestore, `rooms/${roomId}/employees`);
    return new Observable<void>((observer) => {
      const unsubscribe = onSnapshot(colRef, () => {
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

  /**
   * 特定の事業所番号に紐づく従業員の都道府県を一括更新
   * @param officeNumber 事業所番号
   * @param newPrefecture 新しい都道府県コード
   */
  async updateEmployeesPrefectureByOfficeNumber(
    officeNumber: string,
    newPrefecture: string
  ): Promise<number> {
    const roomId = this.roomIdService.requireRoomId();
    const colRef = collection(this.firestore, `rooms/${roomId}/employees`);

    // 特定のofficeNumberに紐づく従業員を検索
    const q = query(colRef, where('officeNumber', '==', officeNumber));
    const querySnapshot = await getDocs(q);

    let updateCount = 0;
    const updatePromises: Promise<void>[] = [];

    querySnapshot.forEach((docSnapshot) => {
      const employeeData = docSnapshot.data();
      const employeeId = docSnapshot.id;

      // 既に同じ都道府県の場合はスキップ
      if (employeeData['prefecture'] === newPrefecture) {
        return;
      }

      // 都道府県を更新
      const updatePromise = updateDoc(docSnapshot.ref, {
        prefecture: newPrefecture,
      }).then(() => {
        updateCount++;
      });

      updatePromises.push(updatePromise);
    });

    // すべての更新を実行
    await Promise.all(updatePromises);

    return updateCount;
  }
}
