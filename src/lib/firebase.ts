import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { initializeFirestore, type Firestore } from 'firebase/firestore';

type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
};

// Firebase Web config isn't secret; access must be enforced by Security Rules.
// Add API key restrictions + App Check to reduce abuse.
const DEFAULT_FIREBASE_CONFIG: FirebaseWebConfig = {
  apiKey: 'AIzaSyCL4L7qpoeumOP361r_gbSLLN5W3iFsLVE',
  authDomain: 'ring-todo.firebaseapp.com',
  projectId: 'ring-todo',
  storageBucket: 'ring-todo.firebasestorage.app',
  messagingSenderId: '300821319844',
  appId: '1:300821319844:web:3e1c14cf387f04a6d31631',
};

function readViteEnv(key: string): string | undefined {
  const value = (import.meta.env as Record<string, unknown>)[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const firebaseConfig: FirebaseWebConfig = {
  apiKey: readViteEnv('VITE_FIREBASE_API_KEY') ?? DEFAULT_FIREBASE_CONFIG.apiKey,
  authDomain: readViteEnv('VITE_FIREBASE_AUTH_DOMAIN') ?? DEFAULT_FIREBASE_CONFIG.authDomain,
  projectId: readViteEnv('VITE_FIREBASE_PROJECT_ID') ?? DEFAULT_FIREBASE_CONFIG.projectId,
  storageBucket: readViteEnv('VITE_FIREBASE_STORAGE_BUCKET') ?? DEFAULT_FIREBASE_CONFIG.storageBucket,
  messagingSenderId: readViteEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') ?? DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  appId: readViteEnv('VITE_FIREBASE_APP_ID') ?? DEFAULT_FIREBASE_CONFIG.appId,
};

export const firebaseApp: FirebaseApp = getApps().length > 0 ? getApps()[0]! : initializeApp(firebaseConfig);
export const auth: Auth = getAuth(firebaseApp);
export const db: Firestore = initializeFirestore(firebaseApp, { ignoreUndefinedProperties: true });

