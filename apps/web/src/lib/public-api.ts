import {
  submitRequestResponseSchema,
  trackRequestResponseSchema,
  verifyRequestEmailResponseSchema,
  type SubmitRequestInput,
  type SubmitRequestResponse,
  type TrackRequestInput,
  type TrackRequestResponse,
  type VerifyRequestEmailResponse,
} from '@agapay/shared';
import { apiFetch } from './api-client';

export async function submitAssistanceRequest(
  input: SubmitRequestInput,
): Promise<SubmitRequestResponse['data']> {
  const res: unknown = await apiFetch('/api/v1/public/assistance-requests', {
    method: 'POST',
    body: input,
  });
  const parsed = submitRequestResponseSchema.safeParse(res);
  if (!parsed.success) throw new Error('The server response did not match the expected shape.');
  return parsed.data.data;
}

export async function trackAssistanceRequest(
  input: TrackRequestInput,
): Promise<TrackRequestResponse['data']> {
  const res: unknown = await apiFetch('/api/v1/public/track', { method: 'POST', body: input });
  const parsed = trackRequestResponseSchema.safeParse(res);
  if (!parsed.success) throw new Error('The server response did not match the expected shape.');
  return parsed.data.data;
}

export async function verifyRequestEmail(
  token: string,
): Promise<VerifyRequestEmailResponse['data']> {
  const res: unknown = await apiFetch('/api/v1/public/assistance-requests/verify-email', {
    method: 'POST',
    body: { token },
  });
  const parsed = verifyRequestEmailResponseSchema.safeParse(res);
  if (!parsed.success) throw new Error('The server response did not match the expected shape.');
  return parsed.data.data;
}
