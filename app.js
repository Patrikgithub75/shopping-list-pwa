// app.js – Family shopping list with Firebase sync
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// ----- 1. Firebase config (COPY from Firebase console) -----
const firebaseConfig = {
  apiKey: "AIzaSyCcQJzOzVcXBrRN9bXC3MYdiAfsnPVTvV4",
  authDomain: "cleaning-tracker-84c76.firebaseapp.com",
  projectId: "cleaning-tracker-84c76",
  storageBucket: "cleaning-tracker-84c76.firebasestorage.app",
  messagingSenderId: "689822891748",
  appId: "1:689822891748:web:45fcececf821ddfbdbf6f1",
  measurementId: "G-LEX27M7HMV"
};

// ----- 2. Initialize Firebase -----
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Use same household id so family shares data
const HOUSEHOLD_ID = "family1";

// Firestore paths: households/{HOUSEHOLD_ID}/shoppingList/{itemId}
const householdDocRef = doc(db, "households", HOUSEHOLD_ID);
const shoppingCollectionRef = collection(householdDocRef, "shoppingList");

// ----- DOM elements -----
const inputEl = document.getElementById("item-input");
const addButtonEl = document.getElementById("add-button");
const activeListEl = document.getElementById("active-list");
const recentListEl = document.getElementById("recent-list");

// ----- Helpers -----
function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_åäö]/g, "");
}

function renderLists(items) {
  const active = items.filter(i => i.needed);
  const inactive = items
    .filter(i => !i.needed)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 30); // latest 30

  // Active list
  activeListEl.innerHTML = "";
  if (active.length === 0) {
    activeListEl.innerHTML = '<div style="font-size:0.85rem;color:#777;">Tomt just nu.</div>';
  } else {
    active.forEach(item => {
      const row = document.createElement("div");
      row.className = "item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = item.needed;
      checkbox.addEventListener("change", () => {
        toggleNeeded(item.id, checkbox.checked);
      });

      const label = document.createElement("span");
      label.textContent = item.name;

      row.appendChild(checkbox);
      row.appendChild(label);
      activeListEl.appendChild(row);
    });
  }

  // Recent (inactive) list
  recentListEl.innerHTML = "";
  if (inactive.length === 0) {
    recentListEl.innerHTML =
      '<div style="font-size:0.85rem;color:#777;">Inga gamla varor ännu. De dyker upp här efter att du använt listan ett tag.</div>';
  } else {
    inactive.forEach(item => {
      const pill = document.createElement("div");
      pill.className = "pill";
      pill.textContent = item.name;
      pill.addEventListener("click", () => {
        // re-activate the item (needed = true)
        toggleNeeded(item.id, true);
      });
      recentListEl.appendChild(pill);
    });
  }
}

async function addItemFromInput() {
  const raw = inputEl.value.trim();
  if (!raw) return;
  await addOrActivateItem(raw);
  inputEl.value = "";
}

async function addOrActivateItem(name) {
  const id = slugify(name);
  if (!id) return;
  const itemRef = doc(shoppingCollectionRef, id);
  await setDoc(
    itemRef,
    {
      name,
      needed: true,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

async function toggleNeeded(id, needed) {
  const itemRef = doc(shoppingCollectionRef, id);
  await setDoc(
    itemRef,
    {
      needed,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

// ----- Firestore subscription -----
function subscribeShoppingList() {
  return onSnapshot(shoppingCollectionRef, snapshot => {
    const items = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      items.push({
        id: docSnap.id,
        name: data.name || "",
        needed: data.needed ?? true,
        updatedAt: data.updatedAt ? data.updatedAt.toMillis?.() ?? null : null
      });
    });
    // Sort active items by name
    items.sort((a, b) => a.name.localeCompare(b.name, "sv"));
    renderLists(items);
  });
}

// ----- Auth + startup -----
function startApp() {
  // anonymous auth (same as cleaning app)
  signInAnonymously(auth).catch(err => {
    console.error("Anonymous auth failed:", err);
  });

  onAuthStateChanged(auth, user => {
    if (!user) return;
    subscribeShoppingList();
  });
}

// ----- Event listeners -----
addButtonEl.addEventListener("click", addItemFromInput);
inputEl.addEventListener("keyup", e => {
  if (e.key === "Enter") {
    addItemFromInput();
  }
});

// Start
startApp();
