// app.js – Familjens inköpslista med Firebase-synk, sortering och röstinmatning

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

// ----- 2. Init Firebase -----
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// hushålls-id, så alla enheter delar samma lista
const HOUSEHOLD_ID = "family1";

// Firestore: households/{HOUSEHOLD_ID}/shoppingList/{itemId}
const householdDocRef = doc(db, "households", HOUSEHOLD_ID);
const shoppingCollectionRef = collection(householdDocRef, "shoppingList");

// ----- DOM -----
const inputEl = document.getElementById("item-input");
const addButtonEl = document.getElementById("add-button");
const voiceButtonEl = document.getElementById("voice-button");
const voiceStatusEl = document.getElementById("voice-status");
const activeListEl = document.getElementById("active-list");
const recentListEl = document.getElementById("recent-list");
const sortNameBtn = document.getElementById("sort-name-btn");
const sortUpdatedBtn = document.getElementById("sort-updated-btn");

// ----- Sort state -----
let currentSortMode = "name"; // "name" eller "updated"
let latestItems = [];

// ----- Voice recognition -----
let recognition = null;
let isListening = false;

function setupVoice() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    // Web Speech API finns inte – låt användaren använda tangentbordets mic
    voiceStatusEl.textContent =
      "Tips: använd mikrofon-knappen på iPhone-tangentbordet för röstinmatning.";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "sv-SE";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    isListening = true;
    voiceButtonEl.textContent = "?";
    voiceStatusEl.textContent = "Lyssnar … prata nu.";
  };

  recognition.onend = () => {
    isListening = false;
    voiceButtonEl.textContent = "??";
    if (voiceStatusEl.textContent.startsWith("Lyssnar")) {
      voiceStatusEl.textContent = "";
    }
  };

  recognition.onerror = (event) => {
    console.error("Röstfel:", event.error);
    voiceStatusEl.textContent = "Kunde inte lyssna (fel: " + event.error + ").";
    isListening = false;
    voiceButtonEl.textContent = "??";
  };

  recognition.onresult = (event) => {
    if (!event.results || !event.results[0] || !event.results[0][0]) return;
    const transcript = event.results[0][0].transcript.trim();
    if (transcript) {
      inputEl.value = transcript;
      addItemFromInput();
    }
  };
}

// ----- Helpers -----
function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_åäö]/g, "");
}

function renderLists(items) {
  latestItems = items;

  const active = items.filter((i) => i.needed);
  const inactive = items
    .filter((i) => !i.needed)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 30);

  // sortera aktiva
  if (currentSortMode === "name") {
    active.sort((a, b) => a.name.localeCompare(b.name, "sv"));
  } else {
    active.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  // Behövs nu
  activeListEl.innerHTML = "";
  if (active.length === 0) {
    activeListEl.innerHTML =
      '<div style="font-size:0.85rem;color:#777;">Inget behövs just nu.</div>';
  } else {
    active.forEach((item) => {
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

  // Senast använda (inaktiva)
  recentListEl.innerHTML = "";
  if (inactive.length === 0) {
    recentListEl.innerHTML =
      '<div style="font-size:0.85rem;color:#777;">Här hamnar varor du bockat av, t.ex. kaffe, toalettpapper osv.</div>';
  } else {
    inactive.forEach((item) => {
      const pill = document.createElement("div");
      pill.className = "pill";
      pill.textContent = item.name;
      pill.addEventListener("click", () => {
        toggleNeeded(item.id, true); // aktivera igen
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
  return onSnapshot(shoppingCollectionRef, (snapshot) => {
    const items = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      let updatedAt = null;
      if (data.updatedAt && typeof data.updatedAt.toMillis === "function") {
        updatedAt = data.updatedAt.toMillis();
      }
      items.push({
        id: docSnap.id,
        name: data.name || "",
        needed: data.needed ?? true,
        updatedAt
      });
    });
    renderLists(items);
  });
}

// ----- Auth + startup -----
function startApp() {
  // anonym inloggning – samma som städ-appen
  signInAnonymously(auth).catch((err) => {
    console.error("Anonymous auth failed:", err);
  });

  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    subscribeShoppingList();
  });

  setupVoice();
}

// ----- UI handlers -----
addButtonEl.addEventListener("click", addItemFromInput);
inputEl.addEventListener("keyup", (e) => {
  if (e.key === "Enter") {
    addItemFromInput();
  }
});

voiceButtonEl.addEventListener("click", () => {
  if (!recognition) {
    // inget Web Speech – gör inget (tips-texten visar redan alternativ)
    return;
  }
  if (isListening) {
    recognition.stop();
  } else {
    recognition.start();
  }
});

function updateSortButtons() {
  if (currentSortMode === "name") {
    sortNameBtn.classList.add("sort-btn-active");
    sortUpdatedBtn.classList.remove("sort-btn-active");
  } else {
    sortUpdatedBtn.classList.add("sort-btn-active");
    sortNameBtn.classList.remove("sort-btn-active");
  }
  // rendera om med samma data
  if (latestItems.length) {
    renderLists(latestItems);
  }
}

sortNameBtn.addEventListener("click", () => {
  currentSortMode = "name";
  updateSortButtons();
});

sortUpdatedBtn.addEventListener("click", () => {
  currentSortMode = "updated";
  updateSortButtons();
});

// ----- Starta appen -----
startApp();
