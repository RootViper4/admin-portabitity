// src/firebaseConfig.ts

// --- Use 'import type' for types only ---
import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";

// --- Use regular 'import' for runtime code/functions ---
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyDGl9FT1MuumiwervsEkrqUVOgaPBNXrAI",
  authDomain: "portabilite-rdc.firebaseapp.com",
  projectId: "portabilite-rdc",
  storageBucket: "portabilite-rdc.firebasestorage.app",
  messagingSenderId: "547040634453",
  appId: "1:547040634453:web:707ac2e44f60d4021556dc",
  measurementId: "G-S084RSGTC3",
};

// Explicitly define the types for the initialized instances
const app: FirebaseApp = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

// Helper function to extract the 'appId' from the config's 'appId' string
export const APP_ID: string = firebaseConfig.appId.split(":")[2];
