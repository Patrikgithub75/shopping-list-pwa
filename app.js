// app.js – Familjens inköpslista: Firebase-synk, sortering, röstinmatning, "Allt klart"

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

// ---------- 1. Firebase-konfiguration ----------
const firebaseConfig = {
  apiKey: "AIzaSyCcQJzOzVcXBrRN9bXC3MYdiAfsnPVTvV4",
  authDomain: "cleaning-tracker-84c76.firebaseapp.com",
  projectId: "cleaning-tracker-84c76",
  storageBucket: "cleaning-tracker-84c76.firebasestorage.app",
  messagingSenderId: "689822891748",
  appId: "1:689822891748:web:45fcececf821ddfbdbf6f1",
  measurementId: "G-LEX27M7HMV"
};

// ---------- 2. Init Firebase ----------
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Samma hushåll som i städ-appen
const HOUSEHOLD_ID = "family1";

const householdDocRef = doc(db, "households", HOUSEHOLD_ID);
const shoppingCollectionRef = collection(householdDocRef, "shoppingList");

// ---------- DOM ----------
const inputEl = document.getElementById("item-input");
const addButtonEl = document.getElementById("add-button");
const voiceButtonEl = document.getElementById("voice-button");
const voiceStatusEl = document.getElementById("voice-status");
const activeListEl = document.getElementById("active-list");
const recentListEl = document.getElementById("recent-list");
const sortNameBtn = document.getElementById("sort-name-btn");
const sortUpdatedBtn = document.getElementById("sort-updated-btn");
const clearAllBtn = document.getElementById("clear-all-btn");

// ---------- Sorteringsläge ----------
let currentSortMode = "name"; // "name" eller "updated"
let latestItems = [];

// ---------- Röstinmatning ----------
let recognition = null;
let isListening = false;

function setupVoice() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
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
    voiceStatusEl.textContent =
      "Kunde inte lyssna (fel: " + event.error + ").";
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

// ---------- Hjälpfunktioner ----------
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
    .filter((i) => !
