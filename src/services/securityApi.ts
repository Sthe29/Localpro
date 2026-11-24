import type {
  PendingEmailChange,
  ReportPayload,
  SecurityLogItem,
  SessionInfo,
  UserProfile,
} from '../types/auth';
import { apiFetch, parseApiJson } from './apiClient';

export async function changePasswordRequest(
  token: string,
  payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
    logoutOtherDevices: boolean;
  }
): Promise<{ success: boolean; revokedOtherSessions: number; message: string }> {
  const response = await apiFetch('/api/account/change-password', {
    method: 'POST',
    token,
    extraHeaders: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseApiJson<{ success: boolean; revokedOtherSessions: number; message: string }>(
    response
  );
}

export async function fetchPendingEmailChange(token: string): Promise<{
  pending: PendingEmailChange | null;
  smtpConfigured: boolean;
}> {
  const response = await apiFetch('/api/account/email-change', { token });
  return parseApiJson<{ pending: PendingEmailChange | null; smtpConfigured: boolean }>(response);
}

export async function requestEmailChange(
  token: string,
  payload: { currentPassword: string; newEmail: string }
): Promise<{
  pending: PendingEmailChange;
  smtpConfigured: boolean;
  delivered: boolean;
  message: string;
}> {
  const response = await apiFetch('/api/account/email-change/request', {
    method: 'POST',
    token,
    extraHeaders: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseApiJson<{
    pending: PendingEmailChange;
    smtpConfigured: boolean;
    delivered: boolean;
    message: string;
  }>(response);
}

export async function confirmEmailChange(
  token: string,
  code: string
): Promise<{ user: UserProfile; message: string }> {
  const response = await apiFetch('/api/account/email-change/confirm', {
    method: 'POST',
    token,
    extraHeaders: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  return parseApiJson<{ user: UserProfile; message: string }>(response);
}

export async function cancelEmailChange(token: string): Promise<void> {
  const response = await apiFetch('/api/account/email-change', {
    method: 'DELETE',
    token,
  });
  await parseApiJson<{ success: boolean }>(response);
}

export async function fetchActiveSessions(token: string): Promise<SessionInfo[]> {
  const response = await apiFetch('/api/account/sessions', { token });
  const data = await parseApiJson<{ sessions: SessionInfo[] }>(response);
  return data.sessions;
}

export async function logoutOtherSessionsRequest(
  token: string
): Promise<{ revokedCount: number; sessions: SessionInfo[] }> {
  const response = await apiFetch('/api/account/sessions/logout-others', {
    method: 'POST',
    token,
  });
  return parseApiJson<{ revokedCount: number; sessions: SessionInfo[] }>(response);
}

export async function revokeSingleSessionRequest(
  token: string,
  sessionId: string
): Promise<{ success: boolean; loggedOutCurrent: boolean }> {
  const response = await apiFetch(`/api/account/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    token,
  });
  return parseApiJson<{ success: boolean; loggedOutCurrent: boolean }>(response);
}

export async function fetchSecurityLogs(token: string): Promise<SecurityLogItem[]> {
  const response = await apiFetch('/api/account/security-logs', { token });
  const data = await parseApiJson<{ logs: SecurityLogItem[] }>(response);
  return data.logs;
}

export async function deleteAccountRequest(
  token: string,
  currentPassword: string
): Promise<{ success: boolean }> {
  const response = await apiFetch('/api/account/delete', {
    method: 'POST',
    token,
    extraHeaders: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword }),
  });
  return parseApiJson<{ success: boolean }>(response);
}

export async function submitReportRequest(
  token: string,
  payload: ReportPayload
): Promise<{ message: string }> {
  const response = await apiFetch('/api/reports', {
    method: 'POST',
    token,
    extraHeaders: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseApiJson<{ message: string }>(response);
}
