import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

// True only when the keys from .env.local (or Vercel) are present.
export const firebaseReady = Boolean(config.apiKey && config.projectId && config.appId)

// Placeholder values keep the app from crashing before keys are added;
// the app shows a setup screen instead of calling Firebase.
const app = initializeApp({
  ...config,
  apiKey: config.apiKey || 'missing',
  projectId: config.projectId || 'missing',
  appId: config.appId || 'missing',
})

export const auth = getAuth(app)
export const db = getFirestore(app)
