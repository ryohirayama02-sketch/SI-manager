// CommonJS maintenance script for cleaning extra fields in employees collection.
// Run with: node scripts/cleanup-employee-extra-fields.cjs

const { initializeApp } = require("firebase/app");
const {
  collection,
  deleteField,
  doc,
  getDocs,
  getFirestore,
  updateDoc,
} = require("firebase/firestore");

// firebase config (same as src/app/app.config.ts)
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

const TARGET_FIELDS = [
  "employmentType",
  "sickPayApplicationRequestDate",
  "childcareEmployerCertificateRequestDate",
  "maternityAllowanceApplicationRequestDate",
];

async function cleanupExtraFields() {
  const snapshot = await getDocs(collection(db, "employees"));
  console.log(`[cleanup] fetched ${snapshot.size} employee docs`);

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() || {};
    const fieldsToDelete = {};

    for (const field of TARGET_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        fieldsToDelete[field] = deleteField();
      }
    }

    if (Object.keys(fieldsToDelete).length > 0) {
      const ref = doc(db, "employees", docSnap.id);
      await updateDoc(ref, fieldsToDelete);

      console.log(
        `[cleanup] ${docSnap.id}: deleted fields -> ${Object.keys(
          fieldsToDelete
        ).join(", ")}`
      );
    }
  }
}

cleanupExtraFields()
  .then(() => {
    console.log("cleanup completed");
  })
  .catch((err) => {
    console.error("cleanup failed", err);
    process.exit(1);
  });
