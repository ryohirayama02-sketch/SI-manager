/**
 * migrate-to-room-namespace.js
 *
 * 目的:
 *   グローバルコレクションのデータを rooms/{roomId}/... 配下にコピーする。
 *   roomId 欠落データはスキップしログ出力のみ。
 *
 * 実行:
 *   node scripts/migrate-to-room-namespace.js
 *   node scripts/migrate-to-room-namespace.js --dry-run  // 書き込みなしでログ確認
 *
 * 注意:
 *   - コピーのみ。旧データ削除は検証後に別途。
 *   - 事前に Firestore export でバックアップを取得:
 *     gcloud firestore export gs://YOUR_BUCKET/backup-$(date +%Y%m%d-%H%M%S)
 */

const admin = require('firebase-admin');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

admin.initializeApp({
  credential: admin.credential.cert(
    path.resolve(__dirname, '../serviceAccountKey.json')
  ),
});

const db = admin.firestore();

if (DRY_RUN) {
  console.log('[DRY-RUN MODE] Firestore への書き込みは行われません');
}

async function migrateCollection({ sourceColPath, targetPathBuilder }) {
  const snap = await db.collection(sourceColPath).get();
  console.log(`[migrate] ${sourceColPath}: ${snap.size} docs`);
  let copied = 0;
  let simulated = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const roomId = data.roomId || null;
    if (!roomId) {
      console.warn(`[migrate][skip:no roomId] ${sourceColPath}/${doc.id}`);
      continue;
    }
    const targetPath = targetPathBuilder(roomId, doc);
    if (!targetPath) {
      console.warn(`[migrate][skip:no target path] ${sourceColPath}/${doc.id}`);
      continue;
    }
    if (DRY_RUN) {
      simulated++;
      console.log(
        `[DRY-RUN] would copy -> ${targetPath} (from ${sourceColPath}/${doc.id})`
      );
    } else {
      await db.doc(targetPath).set({ ...data }, { merge: true });
      copied++;
      if (copied % 200 === 0) {
        console.log(`[migrate] copied ${copied}/${snap.size} from ${sourceColPath}`);
      }
    }
  }
  if (DRY_RUN) {
    console.log(`[migrate][DRY-RUN] ${sourceColPath}: simulated ${simulated}/${snap.size}`);
  } else {
    console.log(`[migrate] done ${sourceColPath}: copied ${copied}/${snap.size}`);
  }
}

// employees
async function migrateEmployees() {
  await migrateCollection({
    sourceColPath: 'employees',
    targetPathBuilder: (roomId, doc) => `rooms/${roomId}/employees/${doc.id}`,
  });
}

// monthlySalaries/{employeeId}/years/{year} (月サブコレクションなし想定)
async function migrateMonthlySalaries() {
  const top = await db.collection('monthlySalaries').get();
  console.log(`[migrate] monthlySalaries top-level employees: ${top.size}`);
  for (const empDoc of top.docs) {
    const yearsSnap = await empDoc.ref.collection('years').get();
    for (const yearDoc of yearsSnap.docs) {
      const data = yearDoc.data();
      const roomId = data.roomId || null;
      if (!roomId) {
        console.warn(
          `[migrate][skip:no roomId] monthlySalaries/${empDoc.id}/years/${yearDoc.id}`
        );
        continue;
      }
      const target = `rooms/${roomId}/monthlySalaries/${empDoc.id}/years/${yearDoc.id}`;
      if (DRY_RUN) {
        console.log(
          `[DRY-RUN] would copy -> ${target} (from monthlySalaries/${empDoc.id}/years/${yearDoc.id})`
        );
      } else {
        await db.doc(target).set({ ...data }, { merge: true });
      }
    }
  }
  console.log('[migrate] monthlySalaries done');
}

// bonus/{year}/employees/{employeeId}/items/{bonusId}
async function migrateBonus() {
  const yearsSnap = await db.collection('bonus').get();
  console.log(`[migrate] bonus years: ${yearsSnap.size}`);
  for (const yearDoc of yearsSnap.docs) {
    const empSnap = await yearDoc.ref.collection('employees').get();
    for (const empDoc of empSnap.docs) {
      const itemsSnap = await empDoc.ref.collection('items').get();
      for (const itemDoc of itemsSnap.docs) {
        const data = itemDoc.data();
        const roomId = data.roomId || null;
        if (!roomId) {
          console.warn(
            `[migrate][skip:no roomId] bonus/${yearDoc.id}/employees/${empDoc.id}/items/${itemDoc.id}`
          );
          continue;
        }
        const target = `rooms/${roomId}/bonus/${yearDoc.id}/employees/${empDoc.id}/items/${itemDoc.id}`;
        if (DRY_RUN) {
          console.log(
            `[DRY-RUN] would copy -> ${target} (from bonus/${yearDoc.id}/employees/${empDoc.id}/items/${itemDoc.id})`
          );
        } else {
          await db.doc(target).set({ ...data }, { merge: true });
        }
      }
    }
  }
  console.log('[migrate] bonus done');
}

// offices
async function migrateOffices() {
  await migrateCollection({
    sourceColPath: 'offices',
    targetPathBuilder: (roomId, doc) => `rooms/${roomId}/offices/${doc.id}`,
  });
}

// settings（ドキュメントをそのままコピー）
async function migrateSettings() {
  await migrateCollection({
    sourceColPath: 'settings',
    targetPathBuilder: (roomId, doc) => `rooms/${roomId}/settings/${doc.id}`,
  });
}

// employeeChangeHistory
async function migrateEmployeeChangeHistory() {
  await migrateCollection({
    sourceColPath: 'employeeChangeHistory',
    targetPathBuilder: (roomId, doc) =>
      `rooms/${roomId}/employeeChangeHistory/${doc.id}`,
  });
}

// suiji/{year}/alerts（year を自動検出）
async function migrateSuijiAlerts() {
  const suijiRoot = await db.collection('suiji').get();
  console.log(`[migrate] suiji root years: ${suijiRoot.size}`);
  for (const yearDoc of suijiRoot.docs) {
    const alertsSnap = await yearDoc.ref.collection('alerts').get();
    console.log(`[migrate] suiji/${yearDoc.id}/alerts: ${alertsSnap.size} docs`);
    for (const alertDoc of alertsSnap.docs) {
      const data = alertDoc.data();
      const roomId = data.roomId || null;
      if (!roomId) {
        console.warn(
          `[migrate][skip:no roomId] suiji/${yearDoc.id}/alerts/${alertDoc.id}`
        );
        continue;
      }
      const target = `rooms/${roomId}/suiji/${yearDoc.id}/alerts/${alertDoc.id}`;
      if (DRY_RUN) {
        console.log(
          `[DRY-RUN] would copy -> ${target} (from suiji/${yearDoc.id}/alerts/${alertDoc.id})`
        );
      } else {
        await db.doc(target).set({ ...data }, { merge: true });
      }
    }
  }
  console.log('[migrate] suiji alerts done');
}

// uncollected-premiums
async function migrateUncollectedPremiums() {
  await migrateCollection({
    sourceColPath: 'uncollected-premiums',
    targetPathBuilder: (roomId, doc) =>
      `rooms/${roomId}/uncollected-premiums/${doc.id}`,
  });
}

// uncollected-premiums-resolved（存在する場合）
async function migrateUncollectedPremiumsResolved() {
  const snap = await db.collection('uncollected-premiums-resolved').get();
  if (snap.empty) {
    console.log('[migrate] uncollected-premiums-resolved: no docs, skip');
    return;
  }
  console.log(`[migrate] uncollected-premiums-resolved: ${snap.size} docs`);
  for (const doc of snap.docs) {
    const data = doc.data();
    const roomId = data.roomId || null;
    if (!roomId) {
      console.warn(
        `[migrate][skip:no roomId] uncollected-premiums-resolved/${doc.id}`
      );
      continue;
    }
    const target = `rooms/${roomId}/uncollected-premiums-resolved/${doc.id}`;
    if (DRY_RUN) {
      console.log(
        `[DRY-RUN] would copy -> ${target} (from uncollected-premiums-resolved/${doc.id})`
      );
    } else {
      await db.doc(target).set({ ...data }, { merge: true });
    }
  }
  console.log('[migrate] uncollected-premiums-resolved done');
}

// editLogs
async function migrateEditLogs() {
  await migrateCollection({
    sourceColPath: 'editLogs',
    targetPathBuilder: (roomId, doc) => `rooms/${roomId}/editLogs/${doc.id}`,
  });
}

// qualificationChangeAlertDeletions
async function migrateQualificationChangeAlertDeletions() {
  await migrateCollection({
    sourceColPath: 'qualificationChangeAlertDeletions',
    targetPathBuilder: (roomId, doc) =>
      `rooms/${roomId}/qualificationChangeAlertDeletions/${doc.id}`,
  });
}

// エントリポイント
(async () => {
  try {
    await migrateEmployees();
    await migrateMonthlySalaries();
    await migrateBonus();
    await migrateOffices();
    await migrateSettings();
    await migrateEmployeeChangeHistory();
    await migrateSuijiAlerts();
    await migrateUncollectedPremiums();
    await migrateUncollectedPremiumsResolved();
    await migrateEditLogs();
    await migrateQualificationChangeAlertDeletions();

    console.log(
      '[migrate] all done. Verify new paths, then delete old data only after backup.'
    );
  } catch (err) {
    console.error('[migrate] error', err);
    process.exit(1);
  }
})();

