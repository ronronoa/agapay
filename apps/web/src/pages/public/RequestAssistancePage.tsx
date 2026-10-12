import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  publicCampaignListResponseSchema,
  publicItemTypeListResponseSchema,
  submitRequestSchema,
  type PublicItemTypeDto,
  type SubmitRequestInput,
} from '@agapay/shared';
import { ApiClientError } from '../../lib/api-client';
import { submitAssistanceRequest } from '../../lib/public-api';
import { useApiQuery } from '../../lib/use-api-query';
import { LandingHeader } from '../../components/landing/LandingHeader';
import { LandingFooter } from '../../components/landing/LandingFooter';
import { TurnstileWidget, TURNSTILE_SITE_KEY } from '../../components/TurnstileWidget';

const inputClass = 'w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm';

function FieldError({ message }: { message: string | undefined }) {
  if (message === undefined) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-text-muted">
      {message}
    </p>
  );
}

interface Pick {
  checked: boolean;
  quantity: number;
  customName: string;
}

function capHint(item: PublicItemTypeDto, household: number | undefined): string | null {
  const parts: string[] = [];
  if (item.maxPerRequest !== null) parts.push(`Up to ${item.maxPerRequest} per request`);
  if (item.perHouseholdMember !== null) {
    parts.push(
      household === undefined
        ? `Up to ${item.perHouseholdMember} per person`
        : `Up to ${item.perHouseholdMember * household} for a household of ${household}`,
    );
  }
  return parts.length === 0 ? null : parts.join(' · ');
}

export function RequestAssistancePage() {
  const [params] = useSearchParams();
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [phoneDigits, setPhoneDigits] = useState('');
  const [success, setSuccess] = useState<{ referenceNumber: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);

  const campaignsQuery = useApiQuery(
    ['public-campaigns'],
    '/api/v1/public/campaigns?pageSize=100',
    publicCampaignListResponseSchema,
  );
  const itemsQuery = useApiQuery(
    ['public-item-types'],
    '/api/v1/public/item-types',
    publicItemTypeListResponseSchema,
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SubmitRequestInput>({
    resolver: zodResolver(submitRequestSchema),
    defaultValues: {
      fullName: '',
      email: '',
      contactNumber: '',
      barangay: '',
      city: '',
      province: '',
      campaignId: '',
      items: [],
      notes: '',
      consent: false,
      turnstileToken: TURNSTILE_SITE_KEY.length === 0 ? 'dev-bypass' : '',
    },
  });

  const campaigns = campaignsQuery.data?.data.items ?? [];
  const catalog = itemsQuery.data?.data.items ?? [];
  const householdRaw = watch('householdSize');
  const household = typeof householdRaw === 'number' ? householdRaw : undefined;
  const watchedItems = watch('items');
  const watchedCampaignId = watch('campaignId');

  useEffect(() => {
    const preselected = params.get('campaign');
    if (preselected !== null && campaigns.some((campaign) => campaign.id === preselected)) {
      setValue('campaignId', preselected);
    }
  }, [params, campaigns, setValue]);

  useEffect(() => {
    setValue(
      'items',
      Object.entries(picks)
        .filter(([, pick]) => pick.checked)
        .map(([itemTypeId, pick]) => ({
          itemTypeId,
          quantity: pick.quantity,
          ...(pick.customName.trim().length === 0 ? {} : { customName: pick.customName.trim() }),
        })),
    );
  }, [picks, setValue]);

  function onPhoneChange(raw: string): void {
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('63')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = digits.slice(1);
    digits = digits.slice(0, 10);
    setPhoneDigits(digits);
    setValue('contactNumber', digits.length === 0 ? '' : `0${digits}`);
  }

  function toggleItem(itemTypeId: string): void {
    setPicks((prev) => {
      const current = prev[itemTypeId] ?? { checked: false, quantity: 1, customName: '' };
      return { ...prev, [itemTypeId]: { ...current, checked: !current.checked } };
    });
  }

  function setQuantity(itemTypeId: string, quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 1) return;
    setPicks((prev) => {
      const current = prev[itemTypeId] ?? { checked: true, quantity: 1, customName: '' };
      return { ...prev, [itemTypeId]: { ...current, quantity } };
    });
  }

  function onSubmit(values: SubmitRequestInput): void {
    setSubmitError(null);
    setIsDuplicate(false);
    void submitAssistanceRequest(values)
      .then((res) => setSuccess({ referenceNumber: res.referenceNumber }))
      .catch((err: unknown) => {
        if (err instanceof ApiClientError && err.code === 'DUPLICATE_ACTIVE_REQUEST') {
          setIsDuplicate(true);
          setSubmitError(
            'This email already has an active request for the campaign. Follow it on the tracking page instead.',
          );
          return;
        }
        setSubmitError(
          err instanceof ApiClientError ? err.message : 'Submission failed. Please try again.',
        );
      });
  }

  const selectedCampaign = campaigns.find((campaign) => campaign.id === watchedCampaignId);
  const reviewItems = catalog.filter((item) => picks[item.id]?.checked === true);

  return (
    <div className="min-h-screen bg-bg">
      <LandingHeader />
      <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-2 lg:px-8">
        <section
          aria-label="About requesting assistance"
          className="rounded-xl border border-border bg-surface p-8 shadow-card"
        >
          <p className="text-lg font-semibold">Agapay</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
            Agapay is always here!
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Create an account to start your impactful journey. Choose your role and get started in
            minutes.
          </p>
          <img
            src="/images/hero-child.png"
            alt="Children saying grace before a relief meal"
            className="mt-6 w-full rounded-lg object-cover"
          />
        </section>

        <section
          aria-label="Assistance request form"
          className="rounded-xl border border-border bg-surface p-8 shadow-card"
        >
          {success === null ? (
            <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
              <h2 className="font-display text-2xl font-bold tracking-tight">
                Register to request assistance
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                Register to request relief assistance and track the status of your requests.
              </p>

              <div
                role="group"
                aria-label="Choose a role"
                className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-border p-1"
              >
                <Link
                  to="/register"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-text-muted hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Donor
                </Link>
                <span
                  aria-current="true"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-surface px-4 py-2 text-sm font-semibold shadow-sm"
                >
                  Beneficiary
                </span>
              </div>

              <div className="mt-4">
                <label htmlFor="campaignId" className="block text-sm font-medium">
                  Relief campaign
                </label>
                <select
                  id="campaignId"
                  {...register('campaignId')}
                  className={`mt-1 ${inputClass}`}
                >
                  <option value="">Choose a campaign…</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.campaignId?.message} />
              </div>

              <div className="mt-4">
                <label htmlFor="fullName" className="block text-sm font-medium">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  autoComplete="name"
                  placeholder="Bernadette Lalata"
                  {...register('fullName')}
                  className={`mt-1 ${inputClass}`}
                />
                <FieldError message={errors.fullName?.message} />
              </div>

              <div className="mt-4">
                <label htmlFor="email" className="block text-sm font-medium">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  {...register('email')}
                  className={`mt-1 ${inputClass}`}
                />
                <FieldError message={errors.email?.message} />
              </div>

              <div className="mt-4">
                <label htmlFor="contactNumber" className="block text-sm font-medium">
                  Contact Number
                </label>
                <div className="mt-1 flex">
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center rounded-l-md border border-r-0 border-border-strong bg-surface-alt px-3 text-sm text-text-muted"
                  >
                    +63
                  </span>
                  <input
                    id="contactNumber"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="9171234567"
                    value={phoneDigits}
                    onChange={(event) => onPhoneChange(event.target.value)}
                    className="w-full rounded-r-md border border-border-strong bg-surface px-3 py-2 text-sm"
                  />
                </div>
                <FieldError message={errors.contactNumber?.message} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="barangay" className="block text-sm font-medium">
                    Barangay
                  </label>
                  <input
                    id="barangay"
                    type="text"
                    autoComplete="address-level3"
                    {...register('barangay')}
                    className={`mt-1 ${inputClass}`}
                  />
                  <FieldError message={errors.barangay?.message} />
                </div>
                <div>
                  <label htmlFor="city" className="block text-sm font-medium">
                    City
                  </label>
                  <input
                    id="city"
                    type="text"
                    autoComplete="address-level2"
                    {...register('city')}
                    className={`mt-1 ${inputClass}`}
                  />
                  <FieldError message={errors.city?.message} />
                </div>
              </div>

              <div className="mt-4">
                <label htmlFor="province" className="block text-sm font-medium">
                  Province
                </label>
                <input
                  id="province"
                  type="text"
                  autoComplete="address-level1"
                  {...register('province')}
                  className={`mt-1 ${inputClass}`}
                />
                <FieldError message={errors.province?.message} />
              </div>

              <div className="mt-4">
                <label htmlFor="householdSize" className="block text-sm font-medium">
                  Household size <span className="font-normal text-text-muted">(optional)</span>
                </label>
                <input
                  id="householdSize"
                  type="number"
                  min={1}
                  max={30}
                  {...register('householdSize', {
                    setValueAs: (value: unknown): number | undefined =>
                      value === '' ? undefined : Number(value),
                  })}
                  className={`mt-1 ${inputClass}`}
                />
                <FieldError message={errors.householdSize?.message} />
              </div>

              <fieldset className="mt-4">
                <legend className="text-sm font-medium">Goods needed</legend>
                {itemsQuery.isPending ? (
                  <p role="status" className="mt-1 text-sm text-text-muted">
                    Loading goods…
                  </p>
                ) : null}
                {itemsQuery.error !== null ? (
                  <p role="alert" className="mt-1 text-sm text-text-muted">
                    {itemsQuery.error}{' '}
                    <button type="button" onClick={itemsQuery.refetch} className="underline">
                      Try again
                    </button>
                  </p>
                ) : null}
                <ul className="mt-2 space-y-2">
                  {catalog.map((item) => {
                    const pick = picks[item.id] ?? { checked: false, quantity: 1, customName: '' };
                    const hint = capHint(item, household);
                    return (
                      <li key={item.id} className="rounded-md border border-border px-3 py-2">
                        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm">
                          <input
                            type="checkbox"
                            checked={pick.checked}
                            onChange={() => toggleItem(item.id)}
                            className="h-4 w-4 accent-primary-subtle"
                          />
                          <span className="font-medium">
                            {item.name}{' '}
                            <span className="font-normal text-text-muted">({item.unit})</span>
                          </span>
                        </label>
                        {hint === null ? null : (
                          <p className="mt-1 text-xs text-text-muted">{hint}</p>
                        )}
                        {pick.checked ? (
                          <div className="mt-2 flex items-center gap-2">
                            <label htmlFor={`qty-${item.id}`} className="text-xs text-text-muted">
                              Qty
                            </label>
                            <input
                              id={`qty-${item.id}`}
                              type="number"
                              min={1}
                              value={pick.quantity}
                              onChange={(event) => setQuantity(item.id, Number(event.target.value))}
                              className="w-20 rounded-md border border-border-strong bg-surface px-2 py-1 text-sm"
                            />
                            {item.name === 'Other' ? (
                              <input
                                type="text"
                                aria-label="Describe the item"
                                placeholder="Describe the item"
                                value={pick.customName}
                                onChange={(event) =>
                                  setPicks((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      checked: true,
                                      quantity: pick.quantity,
                                      customName: event.target.value,
                                    },
                                  }))
                                }
                                className="flex-1 rounded-md border border-border-strong bg-surface px-2 py-1 text-sm"
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                <FieldError message={errors.items?.message} />
              </fieldset>

              <div className="mt-4">
                <label htmlFor="notes" className="block text-sm font-medium">
                  Leave a Note
                </label>
                <textarea
                  id="notes"
                  rows={4}
                  {...register('notes')}
                  className={`mt-1 ${inputClass}`}
                />
                <FieldError message={errors.notes?.message} />
              </div>

              <div className="mt-4">
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    {...register('consent')}
                    className="mt-1 h-4 w-4 accent-primary-subtle"
                  />
                  <span>
                    I consent to Agapay collecting my name, contact details, and location to process
                    this relief request.
                  </span>
                </label>
                <FieldError message={errors.consent?.message} />
              </div>

              <div className="mt-4">
                <TurnstileWidget onToken={(token) => setValue('turnstileToken', token ?? '')} />
                <FieldError message={errors.turnstileToken?.message} />
              </div>

              {watchedItems.length > 0 || watchedCampaignId.length > 0 ? (
                <div className="mt-4 rounded-md bg-surface-alt p-3 text-sm">
                  <p className="font-semibold">Review before submitting</p>
                  <p className="mt-1 text-text-muted">
                    {selectedCampaign?.name ?? 'No campaign chosen'} · {reviewItems.length}{' '}
                    {reviewItems.length === 1 ? 'item' : 'items'}
                    {reviewItems.length === 0
                      ? ''
                      : `: ${reviewItems
                          .map((item) => `${item.name} × ${picks[item.id]?.quantity ?? 1}`)
                          .join(', ')}`}
                  </p>
                </div>
              ) : null}

              {submitError === null ? null : (
                <div role="alert" className="mt-4">
                  <p className="text-sm font-medium">{submitError}</p>
                  {isDuplicate ? (
                    <Link to="/track" className="mt-1 inline-block text-sm underline">
                      Go to the tracking page
                    </Link>
                  ) : null}
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/track"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Have Already Submitted
                </Link>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-surface hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {isSubmitting ? 'Submitting…' : 'Submit for Verification'}
                </button>
              </div>
            </form>
          ) : (
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">Request received</h2>
              <p className="mt-1 text-sm text-text-muted">
                Your reference number is below. A confirmation email is on its way.
              </p>
              <p
                aria-label="Reference number"
                className="mt-4 rounded-md bg-surface-alt p-4 text-center text-xl font-bold tracking-wide"
              >
                {success.referenceNumber}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/track"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-surface hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Track my request
                </Link>
                <Link
                  to="/"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Back home
                </Link>
              </div>
            </div>
          )}
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
