import type { EnquiryItem, EnquiryPayload, EnquiryStatus } from '../types/auth';
import { apiFetch, parseApiJson } from './apiClient';

export async function submitEnquiry(token: string, payload: EnquiryPayload): Promise<EnquiryItem> {
  const response = await apiFetch('/api/enquiries', {
    method: 'POST',
    token,
    extraHeaders: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await parseApiJson<{ enquiry: EnquiryItem }>(response);
  return data.enquiry;
}

export async function fetchEnquiries(token: string): Promise<{
  received: EnquiryItem[];
  sent: EnquiryItem[];
}> {
  const response = await apiFetch('/api/enquiries', { token });
  return parseApiJson<{ received: EnquiryItem[]; sent: EnquiryItem[] }>(response);
}

export async function updateEnquiryStatusRequest(
  token: string,
  enquiryId: string,
  status: EnquiryStatus
): Promise<EnquiryItem> {
  const response = await apiFetch(`/api/enquiries/${encodeURIComponent(enquiryId)}/status`, {
    method: 'PATCH',
    token,
    extraHeaders: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const data = await parseApiJson<{ enquiry: EnquiryItem }>(response);
  return data.enquiry;
}
