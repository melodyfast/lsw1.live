import { initializeApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/**
 * Firebase configuration loaded from environment variables
 * All values must be set in .env file or deployment environment
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Log configuration status (only in development or if there's an error)
if (import.meta.env.DEV || !firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.log("Firebase Config:", {
    hasApiKey: !!firebaseConfig.apiKey,
    hasProjectId: !!firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    currentDomain: window.location.hostname,
  });
}

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  const errorMsg = "Missing required Firebase configuration. Please check your environment variables.";
  console.error(errorMsg, firebaseConfig);
  throw new Error(errorMsg);
}

let app;
let auth: Auth;
let db;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (error) {
  console.error("Firebase initialization error:", error);
  console.error("Current domain:", window.location.hostname);
  console.error("Expected authDomain:", firebaseConfig.authDomain);
  throw error;
}

export { auth, db };
export default app;