import type { PublicProfile, UpdateProfilePayload, UserProfile } from '../types/auth';
import { apiFetch, parseApiJson } from './apiClient';

export async function fetchPublicProfiles(token: string): Promise<PublicProfile[]> {
  const response = await apiFetch('/api/profiles', { token });
  const data = await parseApiJson<{ profiles: PublicProfile[] }>(response);
  return data.profiles;
}

export async function fetchPublicProfileById(
  token: string,
  profileId: string
): Promise<PublicProfile> {
  const response = await apiFetch(`/api/profiles/${encodeURIComponent(profileId)}`, { token });
  const data = await parseApiJson<{ profile: PublicProfile }>(response);
  return data.profile;
}

export async function updateUserProfileDetails(
  token: string,
  payload: UpdateProfilePayload
): Promise<UserProfile> {
  const response = await apiFetch('/api/profile', {
    method: 'PUT',
    token,
    extraHeaders: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await parseApiJson<{ user: UserProfile }>(response);
  return data.user;
}

export async function uploadProfileAvatar(token: string, file: File): Promise<UserProfile> {
  const response = await apiFetch('/api/profile/avatar', {
    method: 'POST',
    token,
    extraHeaders: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });
  const data = await parseApiJson<{ user: UserProfile }>(response);
  return data.user;
}

export async function removeProfileAvatar(token: string): Promise<UserProfile> {
  const response = await apiFetch('/api/profile/avatar', {
    method: 'DELETE',
    token,
  });
  const data = await parseApiJson<{ user: UserProfile }>(response);
  return data.user;
}
