// CommonJS maintenance script to delete weeklyHours from all employees.
// Run with: node scripts/cleanup-weekly-hours.cjs

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const serviceAccount = require("../serviceAccountKey.json");

// Initialize Firebase Admin using serviceAccountKey.json
initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function cleanupWeeklyHours() {
  console.log("[cleanup-weeklyHours] start");

  const snapshot = await db.collection("employees").get();
  console.log(`[cleanup-weeklyHours] fetched ${snapshot.size} employee docs`);

  let deletedCount = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() || {};
    if (!Object.prototype.hasOwnProperty.call(data, "weeklyHours")) {
      continue;
    }

    const oldValue = data.weeklyHours;
    await db.collection("employees").doc(docSnap.id).update({
      weeklyHours: FieldValue.delete(),
    });
    deletedCount++;
    console.log(
      `[cleanup-weeklyHours] ${
        docSnap.id
      }: deleted weeklyHours (old value=${JSON.stringify(oldValue)})`
    );
  }

  console.log(
    `[cleanup-weeklyHours] completed. deleted ${deletedCount} documents.`
  );
}

cleanupWeeklyHours().catch((err) => {
  console.error("[cleanup-weeklyHours] failed", err);
  process.exit(1);
});
