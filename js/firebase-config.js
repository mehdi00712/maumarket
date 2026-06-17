import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyA50aqQzbzWKMrLRTmh0g3oazpAI5QzeCU",
  authDomain: "maumarket-674dc.firebaseapp.com",
  projectId: "maumarket-674dc",
  storageBucket: "maumarket-674dc.firebasestorage.app",
  messagingSenderId: "305063413832",
  appId: "1:305063413832:web:69a652b49fbe8058f7f07d",
  measurementId: "G-X48Y77B9N7"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

getAnalytics(app);
