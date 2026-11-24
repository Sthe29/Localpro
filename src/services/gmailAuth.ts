import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({ prompt: 'select_account' });

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token strictly in memory (never localStorage or sessionStorage).
let cachedAccessToken: string | null = null;
let cachedGoogleUser: User | null = null;

export function initGoogleAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
): () => void {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      cachedGoogleUser = user;
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.();
      }
    } else {
      cachedGoogleUser = null;
      cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
}

export async function googleSignIn(): Promise<{
  user: User;
  accessToken: string;
  email: string;
  displayName: string;
}> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Could not obtain Gmail permission token from Google Sign-In.');
    }

    cachedAccessToken = credential.accessToken;
    cachedGoogleUser = result.user;

    return {
      user: result.user,
      accessToken: cachedAccessToken,
      email: (result.user.email || '').trim().toLowerCase(),
      displayName: result.user.displayName || '',
    };
  } catch (err: unknown) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('Google sign-in window was closed before completing.');
    }
    if (code === 'auth/popup-blocked') {
      throw new Error('Sign-in popup was blocked by your browser. Please allow popups and try again.');
    }
    throw err instanceof Error ? err : new Error('Unable to sign in with Google right now.');
  } finally {
    isSigningIn = false;
  }
}

export function getGmailAccessToken(): string | null {
  return cachedAccessToken;
}

export function getConnectedGoogleUser(): User | null {
  return cachedGoogleUser;
}

export async function logoutGoogle(): Promise<void> {
  cachedAccessToken = null;
  cachedGoogleUser = null;
  await auth.signOut().catch(() => undefined);
}

function encodeBase64UrlUtf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export async function sendGmailMessage(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ id: string }> {
  const accessToken = cachedAccessToken;
  if (!accessToken) {
    throw new Error('Gmail session expired. Please sign in with Google again.');
  }

  const safeTo = sanitizeHeaderValue(params.to);
  const safeSubject = sanitizeHeaderValue(params.subject);
  const rawMime = [
    `To: ${safeTo}`,
    `Subject: ${safeSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    params.body,
  ].join('\r\n');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: encodeBase64UrlUtf8(rawMime),
    }),
  });

  const data = (await response.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      cachedAccessToken = null;
      throw new Error(
        'Gmail permission expired or was declined. Please sign in with Google again and allow email sending.'
      );
    }
    throw new Error(data.error?.message || 'Unable to send email through Gmail right now.');
  }

  return { id: data.id || 'sent' };
}
