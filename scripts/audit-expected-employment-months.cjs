// CommonJS script to audit expectedEmploymentMonths in employees collection.
// Read-only: does not perform any writes.
// Run with: node scripts/audit-expected-employment-months.cjs

const { initializeApp } = require("firebase/app");
const { collection, getDocs, getFirestore } = require("firebase/firestore");

// Firebase config (same as app.config.ts)
const firebaseConfig = {
  apiKey: "AIzaSyDLqLcEdEZgD3Q98x1nWH21ib_wO1zN6tI",
  authDomain: "si-manager-13eb4.firebaseapp.com",
  projectId: "si-manager-13eb4",
  storageBucket: "si-manager-13eb4.appspot.com",
  messagingSenderId: "418747360580",
  appId: "1:418747360580:web:77028b37a5aba65da72311",
  measurementId: "G-D7H9LGEN31",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function auditExpectedEmploymentMonths() {
  console.log("[audit] start");
  const snapshot = await getDocs(collection(db, "employees"));
  console.log(`[audit] fetched ${snapshot.size} employee docs`);

  const counts = {};

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() || {};
    const value = data.expectedEmploymentMonths;
    const type = value === null ? "null" : typeof value;

    counts[type] = (counts[type] || 0) + 1;
    console.log(
      `[audit] ${docSnap.id}: expectedEmploymentMonths=${JSON.stringify(
        value
      )} (type=${type})`
    );
  }

  console.log("[audit] summary (type -> count)");
  for (const [type, count] of Object.entries(counts)) {
    console.log(`  ${type}: ${count}`);
  }
  console.log("[audit] completed");
}

auditExpectedEmploymentMonths().catch((err) => {
  console.error("[audit] failed", err);
  process.exit(1);
});

