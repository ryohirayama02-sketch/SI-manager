// CommonJS maintenance script to fix expectedEmploymentMonths values.
// Converts numeric values to string categories per current spec.
// Run with: node scripts/fix-expected-employment-months.cjs

const { initializeApp } = require("firebase/app");
const {
  collection,
  doc,
  getDocs,
  getFirestore,
  updateDoc,
} = require("firebase/firestore");

// Firebase config (same as src/app/app.config.ts)
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

function convertValue(value) {
  if (typeof value !== "number") return value;
  if (value <= 2) return "within-2months";
  return "over-2months";
}

async function fixExpectedEmploymentMonths() {
  console.log("[fix] start");
  const snapshot = await getDocs(collection(db, "employees"));
  console.log(`[fix] fetched ${snapshot.size} employee docs`);

  for (const docSnap of snapshot.docs) {
    try {
      const data = docSnap.data() || {};
      const current = data.expectedEmploymentMonths;

      if (typeof current !== "number") {
        continue; // Only fix numeric values
      }

      const updated = convertValue(current);

      if (updated === current) {
        continue; // No change needed (unlikely, but for completeness)
      }

      const ref = doc(db, "employees", docSnap.id);
      await updateDoc(ref, { expectedEmploymentMonths: updated });
      console.log(
        `[fix] ${docSnap.id}: ${JSON.stringify(current)} -> ${JSON.stringify(
          updated
        )}`
      );
    } catch (err) {
      console.error(`[fix] ${docSnap.id}: failed`, err);
    }
  }

  console.log("[fix] completed");
}

fixExpectedEmploymentMonths().catch((err) => {
  console.error("[fix] fatal", err);
  process.exit(1);
});
