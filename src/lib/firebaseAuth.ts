import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, type UserCredential } from 'firebase/auth';
import { auth } from './firebase';

export type GoogleSignInOutcome =
  | { method: 'popup'; credential: UserCredential }
  | { method: 'redirect' };

function getAuthErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  if (!('code' in err)) return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function signInWithGoogle(): Promise<GoogleSignInOutcome> {
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    return { method: 'popup', credential };
  } catch (err) {
    const code = getAuthErrorCode(err);
    const shouldFallbackToRedirect =
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment';

    if (shouldFallbackToRedirect) {
      await signInWithRedirect(auth, googleProvider);
      return { method: 'redirect' };
    }

    throw err;
  }
}

export async function signOutFromFirebase(): Promise<void> {
  await signOut(auth);
}

