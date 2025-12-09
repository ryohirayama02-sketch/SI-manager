import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  Firestore,
} from '@angular/fire/firestore';

/**
 * roomId が欠損しているドキュメントのみを削除するメンテナンススクリプト。
 * 必要なときだけ一時的に呼び出してください（AppComponent などから）。
 */
export async function cleanupMissingRoomId(
  firestore: Firestore,
  roomId: string
): Promise<void> {
  // helper: delete all docs in a query result
  const deleteByQuery = async (label: string, q: any) => {
    const snap = await getDocs(q);
    if (snap.empty) {
      console.log(`[cleanupMissingRoomId] ${label}: no targets`);
      return;
    }
    console.log(
      `[cleanupMissingRoomId] ${label}: deleting ${snap.size} documents...`
    );
    for (const docSnap of snap.docs) {
      await deleteDoc(docSnap.ref);
      console.log(`[cleanupMissingRoomId] deleted ${label}: ${docSnap.id}`);
    }
  };

  // 1) employeeChangeHistory (collectionGroup)
  // 資格変更アラートなどの元データになるため、通常は削除しない。
  // どうしても削除が必要な場合のみ、明示的に呼び出すこと。
  // const historyByRoom = query(
  //   collectionGroup(firestore, 'employeeChangeHistory'),
  //   where('roomId', '==', roomId)
  // );
  // await deleteByQuery(
  //   `employeeChangeHistory (roomId == ${roomId})`,
  //   historyByRoom
  // );

  // helper: migrate or delete a single doc from old path to new room path
  const migrateDoc = async (
    label: string,
    oldCollectionPath: string,
    newPathBuilder: (roomId: string, docId: string) => string
  ) => {
    const sourceCollection = collection(firestore, oldCollectionPath);
    const snap = await getDocs(sourceCollection);
    if (snap.empty) {
      console.log(`[cleanupMissingRoomId] ${label}: no documents found`);
      return;
    }
    console.log(
      `[cleanupMissingRoomId] ${label}: processing ${snap.size} documents...`
    );
    let migrated = 0;
    let skippedMissingRoom = 0;
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const roomId = (data as any)?.roomId;
      if (!roomId) {
        console.log(
          `[cleanupMissingRoomId] ${label}: missing roomId -> skip (no migration) ${docSnap.id}`
        );
        skippedMissingRoom++;
        continue;
      }
      const newPath = newPathBuilder(roomId, docSnap.id);
      const newRef = doc(firestore, newPath);
      await setDoc(newRef, data, { merge: true });
      await deleteDoc(docSnap.ref);
      console.log(
        `[cleanupMissingRoomId] ${label}: migrated ${docSnap.id} -> ${newPath}`
      );
      migrated++;
    }
    console.log(
      `[cleanupMissingRoomId] ${label}: migrated=${migrated}, skippedMissingRoomId=${skippedMissingRoom}`
    );
  };

  // 2) suiji/{year}/alerts for 2023-2026 (move to rooms/{roomId}/suiji/{year}/alerts)
  const years = [2023, 2024, 2025, 2026];
  for (const year of years) {
    await migrateDoc(
      `suiji/${year}/alerts`,
      `suiji/${year}/alerts`,
      (roomId, docId) => `rooms/${roomId}/suiji/${year}/alerts/${docId}`
    );
  }

  // 3) uncollected-premiums (move to rooms/{roomId}/uncollected-premiums)
  await migrateDoc(
    'uncollected-premiums',
    'uncollected-premiums',
    (roomId, docId) => `rooms/${roomId}/uncollected-premiums/${docId}`
  );

  // 4) editLogs (move to rooms/{roomId}/editLogs)
  await migrateDoc(
    'editLogs',
    'editLogs',
    (roomId, docId) => `rooms/${roomId}/editLogs/${docId}`
  );

  console.log(
    '[cleanupMissingRoomId] completed with migration stats logged above.'
  );
}
