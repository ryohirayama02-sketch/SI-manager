import {
  collection,
  collectionGroup,
  deleteDoc,
  getDocs,
  query,
  where,
  Firestore,
} from '@angular/fire/firestore';

/**
 * roomId が欠損しているドキュメントのみを削除するメンテナンススクリプト。
 * 必要なときだけ一時的に呼び出してください（AppComponent などから）。
 */
export async function cleanupMissingRoomId(firestore: Firestore): Promise<void> {
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
  const historyNoRoom = query(
    collectionGroup(firestore, 'employeeChangeHistory'),
    where('roomId', '==', null)
  );
  const historyEmptyRoom = query(
    collectionGroup(firestore, 'employeeChangeHistory'),
    where('roomId', '==', '')
  );
  await deleteByQuery('employeeChangeHistory (roomId == null)', historyNoRoom);
  await deleteByQuery('employeeChangeHistory (roomId == empty)', historyEmptyRoom);

  // 2) suiji/{year}/alerts for 2023-2026
  const years = [2023, 2024, 2025, 2026];
  for (const year of years) {
    const base = collection(firestore, `suiji/${year}/alerts`);
    const suijiNull = query(base, where('roomId', '==', null));
    const suijiEmpty = query(base, where('roomId', '==', ''));
    await deleteByQuery(`suiji/${year}/alerts (roomId == null)`, suijiNull);
    await deleteByQuery(`suiji/${year}/alerts (roomId == empty)`, suijiEmpty);
  }

  // 3) uncollected-premiums (collection; include missing roomId field)
  const uncollectedRef = collection(firestore, 'uncollected-premiums');
  const uncollectedNull = query(uncollectedRef, where('roomId', '==', null));
  const uncollectedEmpty = query(uncollectedRef, where('roomId', '==', ''));
  await deleteByQuery('uncollected-premiums (roomId == null)', uncollectedNull);
  await deleteByQuery('uncollected-premiums (roomId == empty)', uncollectedEmpty);

  // missing roomId field: fetch all and filter client-side
  const allUncollectedSnap = await getDocs(uncollectedRef);
  const missingRoomId = allUncollectedSnap.docs.filter(
    (d) => d.data()['roomId'] === undefined
  );
  if (missingRoomId.length === 0) {
    console.log(
      '[cleanupMissingRoomId] uncollected-premiums (roomId missing): no targets'
    );
  } else {
    console.log(
      `[cleanupMissingRoomId] uncollected-premiums (roomId missing): deleting ${missingRoomId.length} documents...`
    );
    for (const docSnap of missingRoomId) {
      await deleteDoc(docSnap.ref);
      console.log(
        `[cleanupMissingRoomId] deleted uncollected-premiums (roomId missing): ${docSnap.id}`
      );
    }
  }

  console.log('[cleanupMissingRoomId] completed.');
}

