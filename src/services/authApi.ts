import type {
  AuthResponse,
  LoginPayload,
  RegisterPayload,
  SkillItem,
  UpdateSkillsPayload,
  UserProfile,
} from '../types/auth';
import { apiFetch, parseApiJson } from './apiClient';

export async function fetchPredefinedSkills(): Promise<SkillItem[]> {
  const response = await apiFetch('/api/skills');
  const data = await parseApiJson<{ skills: SkillItem[] }>(response);
  return data.skills;
}

export async function registerAccount(payload: RegisterPayload): Promise<AuthResponse> {
  const response = await apiFetch('/api/auth/register', {
    method: 'POST',
    extraHeaders: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseApiJson<AuthResponse>(response);
}

export async function loginAccount(payload: LoginPayload): Promise<AuthResponse> {
  const response = await apiFetch('/api/auth/login', {
    method: 'POST',
    extraHeaders: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseApiJson<AuthResponse>(response);
}

export async function fetchRecoveryStatus(): Promise<{
  emailDeliveryConfigured: boolean;
  googleRecoveryEnabled: boolean;
}> {
  const response = await apiFetch('/api/auth/recovery-status');
  return parseApiJson<{ emailDeliveryConfigured: boolean; googleRecoveryEnabled: boolean }>(
    response
  );
}

export async function requestPasswordReset(
  email: string
): Promise<{ message: string; smtpConfigured?: boolean }> {
  const response = await apiFetch('/api/auth/forgot-password', {
    method: 'POST',
    extraHeaders: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return parseApiJson<{ message: string; smtpConfigured?: boolean }>(response);
}

export async function confirmPasswordReset(payload: {
  token: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ success: boolean; message: string }> {
  const response = await apiFetch('/api/auth/reset-password', {
    method: 'POST',
    extraHeaders: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseApiJson<{ success: boolean; message: string }>(response);
}

export async function signInWithGoogleToken(googleAccessToken: string): Promise<AuthResponse> {
  const response = await apiFetch('/api/auth/google-signin', {
    method: 'POST',
    token: googleAccessToken,
    extraHeaders: { 'Content-Type': 'application/json' },
  });
  return parseApiJson<AuthResponse>(response);
}

export async function resetPasswordWithGoogleToken(
  googleAccessToken: string,
  payload: { newPassword: string; confirmPassword: string }
): Promise<{ success: boolean; email: string; fullName: string; message: string }> {
  const response = await apiFetch('/api/auth/google-recovery-reset', {
    method: 'POST',
    token: googleAccessToken,
    extraHeaders: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseApiJson<{ success: boolean; email: string; fullName: string; message: string }>(
    response
  );
}

export async function verifyEmailToken(
  token: string
): Promise<{ success: boolean; message: string }> {
  const response = await apiFetch('/api/auth/verify-email', {
    method: 'POST',
    extraHeaders: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return parseApiJson<{ success: boolean; message: string }>(response);
}

export async function fetchCurrentUser(token?: string | null): Promise<UserProfile> {
  const response = await apiFetch('/api/auth/me', { token });
  const data = await parseApiJson<{ user: UserProfile }>(response);
  return data.user;
}

export async function updateProfileSkills(
  token: string,
  payload: UpdateSkillsPayload
): Promise<UserProfile> {
  const response = await apiFetch('/api/profile/skills', {
    method: 'PUT',
    token,
    extraHeaders: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await parseApiJson<{ user: UserProfile }>(response);
  return data.user;
}

export async function logoutAccount(token: string | null): Promise<void> {
  await apiFetch('/api/auth/logout', {
    method: 'POST',
    token,
  }).catch(() => undefined);
}
