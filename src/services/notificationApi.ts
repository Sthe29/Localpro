import type { NotificationItem } from '../types/auth';
import { apiFetch, parseApiJson } from './apiClient';

export async function fetchNotifications(token: string): Promise<{
  notifications: NotificationItem[];
  unreadCount: number;
}> {
  const response = await apiFetch('/api/notifications', { token });
  return parseApiJson<{ notifications: NotificationItem[]; unreadCount: number }>(response);
}

export async function fetchUnreadNotificationCount(token: string): Promise<number> {
  const response = await apiFetch('/api/notifications/unread-count', { token });
  const data = await parseApiJson<{ unreadCount: number }>(response);
  return data.unreadCount;
}

export async function markNotificationRead(
  token: string,
  notificationId: string
): Promise<number> {
  const response = await apiFetch(
    `/api/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: 'PATCH',
      token,
    }
  );
  const data = await parseApiJson<{ success: boolean; unreadCount: number }>(response);
  return data.unreadCount;
}

export async function markAllNotificationsRead(token: string): Promise<number> {
  const response = await apiFetch('/api/notifications/read-all', {
    method: 'PATCH',
    token,
  });
  const data = await parseApiJson<{ updatedCount: number; unreadCount: number }>(response);
  return data.unreadCount;
}

export async function deleteNotificationRequest(
  token: string,
  notificationId: string
): Promise<number> {
  const response = await apiFetch(`/api/notifications/${encodeURIComponent(notificationId)}`, {
    method: 'DELETE',
    token,
  });
  const data = await parseApiJson<{ success: boolean; unreadCount: number }>(response);
  return data.unreadCount;
}
