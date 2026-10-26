import { toast } from 'sonner';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  campaignListResponseSchema,
  donationResponseSchema,
  readChatSuggestion,
} from '@agapay/shared';
import type { SubmitDonationInput } from '@agapay/shared';
import { ApiClientError, apiFetch } from '../../lib/api-client';
import { useApiQuery } from '../../lib/use-api-query';
import { getUser } from '../../lib/session';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { resendVerification } from '../../lib/auth-api';
import { DonateForm } from './DonateForm';

export function DonatePage() {
  const [params] = useSearchParams();
  const [reference, setReference] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const campaignsQuery = useApiQuery(
    ['donor-campaigns'],
    '/api/v1/campaigns?pageSize=100',
    campaignListResponseSchema,
  );
  const preselected = params.get('campaign') ?? '';
  const suggestion = readChatSuggestion(params.get('goods'));

  function onSubmit(input: SubmitDonationInput): Promise<void> {
    setSubmitError(null);
    return apiFetch<unknown>('/api/v1/donations', { method: 'POST', body: input })
      .then((res) => {
        const parsed = donationResponseSchema.safeParse(res);
        if (!parsed.success) throw new Error('Unexpected donation response.');
        setReference(parsed.data.data.referenceNumber);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiClientError && err.code === 'EMAIL_NOT_VERIFIED') {
          setSubmitError('Confirm your email before donating. A fresh link is one tap away.');
          toast.error('Confirm your email before donating. A fresh link is one tap away.');
          return;
        }
        toast.error(
          err instanceof ApiClientError ? err.message : 'Submission failed. Please try again.',
        );
      });
  }

  function onResend(): void {
    const email = getUser()?.email;
    if (email === undefined || email.length === 0) return;
    void resendVerification(email)
      .then(() => toast.success('Link sent. Check your inbox.'))
      .catch(() => toast.error('Could not send the confirmation email. Please try again.'));
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader
        title="Donate goods"
        description="Pledge relief goods to an active campaign. Staff verify every donation before collection."
      />

      {reference === null ? (
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
          <AsyncBoundary
            data={campaignsQuery.data?.data.items ?? null}
            error={campaignsQuery.error}
            isPending={campaignsQuery.isPending}
            onRetry={campaignsQuery.refetch}
            loadingLabel="Loading campaigns…"
            isEmpty={(items) => items.length === 0}
            emptyTitle="No active campaigns right now"
            emptyDescription="There are no drives accepting donations at the moment."
          >
            {(campaigns) => (
              <DonateForm
                campaigns={campaigns}
                defaults={{
                  campaignId:
                    campaigns.some((campaign) => campaign.id === preselected) &&
                    preselected.length > 0
                      ? preselected
                      : '',
                  preferredDate: '',
                  preferredNote: '',
                  pickupAddress: '',
                  notes: '',
                  items:
                    suggestion &&
                    campaigns.some((campaign) => campaign.id === suggestion.campaignId) &&
                    suggestion.campaignId === preselected
                      ? suggestion.items.map((item) => ({
                          itemTypeId: item.itemTypeId,
                          quantity: item.quantity,
                          description: '',
                          customName: '',
                          expiryDate: '',
                          checked: true,
                        }))
                      : [],
                }}
                submitLabel="Submit donation"
                pendingLabel="Submitting…"
                onSubmit={onSubmit}
              />
            )}
          </AsyncBoundary>
          {submitError !== null && submitError.startsWith('Confirm your email') ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={onResend}
                className="text-sm font-medium text-primary underline underline-offset-4"
              >
                Resend confirmation email
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
          <h2 className="font-display text-xl font-semibold">Donation received</h2>
          <p className="mt-1 text-sm text-text-muted">
            Your reference number is below. We will email you once our team verifies it.
          </p>
          <p
            aria-label="Reference number"
            className="mt-4 rounded-md bg-surface-alt p-4 text-center text-xl font-bold tracking-wide"
          >
            {reference}
          </p>
          <Link
            to="/donor/activity"
            className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-surface hover:bg-primary-dark"
          >
            View my donations
          </Link>
        </div>
      )}
    </div>
  );
}
