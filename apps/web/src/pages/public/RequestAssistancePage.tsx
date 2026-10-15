import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'motion/react';
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
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';

const inputClass = 'w-full rounded-md border border-input bg-surface px-3 py-2 text-sm';

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

const CATEGORY_ORDER = [
  'FOOD',
  'WATER',
  'CLOTHING',
  'HYGIENE',
  'BEDDING',
  'SCHOOL',
  'OTHER',
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  FOOD: 'Food',
  WATER: 'Water',
  CLOTHING: 'Clothing',
  HYGIENE: 'Hygiene',
  BEDDING: 'Bedding',
  SCHOOL: 'School',
  OTHER: 'Other',
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
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
  const [goodsFilter, setGoodsFilter] = useState('');

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
    control,
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
  // shortcut: matches only the goods already loaded — the public endpoint caps
  // pageSize at 100 and takes no q= search, so a larger catalogue needs one.
  const filterQuery = goodsFilter.trim().toLowerCase();
  const visibleCatalog =
    filterQuery.length === 0
      ? catalog
      : catalog.filter((item) => item.name.toLowerCase().includes(filterQuery));
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
      <main className="mx-auto grid w-full max-w-6xl items-start gap-8 px-4 py-10 sm:px-6 md:grid-cols-2 lg:px-8">
        <section
          aria-label="About requesting assistance"
          className="rounded-xl border border-border bg-surface p-8 shadow-card md:sticky md:top-6"
        >
          <p className="text-lg font-semibold">Agapay</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
            Agapay is always here!
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Tell us what your family needs and we will review your request. Follow it from
            submission to distribution.
          </p>
          <div className="mt-6 aspect-[4/3] w-full overflow-hidden rounded-lg">
            <img
              src="/images/hero-child.png"
              alt="Children saying grace before a relief meal"
              className="h-full w-full object-cover"
            />
          </div>
        </section>

        <section
          aria-label="Assistance request form"
          className="rounded-xl border border-border bg-surface p-8 shadow-card"
        >
          <AnimatePresence mode="wait" initial={false}>
            {success === null ? (
              <motion.form
                key="request-form"
                onSubmit={(event) => void handleSubmit(onSubmit)(event)}
                noValidate
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
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

                <Field control={control} name="campaignId" label="Relief campaign" className="mt-4">
                  {(field) => (
                    <select
                      id={field.id}
                      value={typeof field.value === 'string' ? field.value : ''}
                      onChange={(event) => field.onChange(event.target.value)}
                      onBlur={field.onBlur}
                      aria-invalid={field.invalid}
                      aria-describedby={field.describedBy}
                      className={inputClass}
                    >
                      <option value="">Choose a campaign…</option>
                      {campaigns.map((campaign) => (
                        <option key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>

                <Field control={control} name="fullName" label="Full Name" className="mt-4">
                  {(field) => (
                    <Input
                      id={field.id}
                      autoComplete="name"
                      placeholder="Bernadette Lalata"
                      value={typeof field.value === 'string' ? field.value : ''}
                      onChange={(event) => field.onChange(event.target.value)}
                      onBlur={field.onBlur}
                      aria-invalid={field.invalid}
                      aria-describedby={field.describedBy}
                    />
                  )}
                </Field>

                <Field control={control} name="email" label="Email Address" className="mt-4">
                  {(field) => (
                    <Input
                      id={field.id}
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={typeof field.value === 'string' ? field.value : ''}
                      onChange={(event) => field.onChange(event.target.value)}
                      onBlur={field.onBlur}
                      aria-invalid={field.invalid}
                      aria-describedby={field.describedBy}
                    />
                  )}
                </Field>

                <div className="mt-4">
                  <label htmlFor="contactNumber" className="block text-sm font-medium">
                    Contact Number
                  </label>
                  <div className="mt-1 flex">
                    <span
                      aria-hidden="true"
                      className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-surface-alt px-3 text-sm text-text-muted"
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
                      className="w-full rounded-r-md border border-input bg-surface px-3 py-2 text-sm"
                    />
                  </div>
                  <FieldError message={errors.contactNumber?.message} />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Field control={control} name="barangay" label="Barangay">
                    {(field) => (
                      <Input
                        id={field.id}
                        autoComplete="address-level3"
                        value={typeof field.value === 'string' ? field.value : ''}
                        onChange={(event) => field.onChange(event.target.value)}
                        onBlur={field.onBlur}
                        aria-invalid={field.invalid}
                        aria-describedby={field.describedBy}
                      />
                    )}
                  </Field>
                  <Field control={control} name="city" label="City">
                    {(field) => (
                      <Input
                        id={field.id}
                        autoComplete="address-level2"
                        value={typeof field.value === 'string' ? field.value : ''}
                        onChange={(event) => field.onChange(event.target.value)}
                        onBlur={field.onBlur}
                        aria-invalid={field.invalid}
                        aria-describedby={field.describedBy}
                      />
                    )}
                  </Field>
                </div>

                <Field control={control} name="province" label="Province" className="mt-4">
                  {(field) => (
                    <Input
                      id={field.id}
                      autoComplete="address-level1"
                      value={typeof field.value === 'string' ? field.value : ''}
                      onChange={(event) => field.onChange(event.target.value)}
                      onBlur={field.onBlur}
                      aria-invalid={field.invalid}
                      aria-describedby={field.describedBy}
                    />
                  )}
                </Field>

                <Field
                  control={control}
                  name="householdSize"
                  label="Household size"
                  hint="Optional"
                  className="mt-4"
                >
                  {(field) => (
                    <Input
                      id={field.id}
                      type="number"
                      min={1}
                      max={30}
                      value={typeof field.value === 'number' ? field.value : ''}
                      onChange={(event) =>
                        field.onChange(
                          event.target.value === '' ? undefined : Number(event.target.value),
                        )
                      }
                      onBlur={field.onBlur}
                      aria-invalid={field.invalid}
                      aria-describedby={field.describedBy}
                    />
                  )}
                </Field>

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
                  <div className="mt-2">
                    <label htmlFor="goods-filter" className="block text-sm font-medium">
                      Find a good
                    </label>
                    <Input
                      id="goods-filter"
                      type="search"
                      placeholder="Filter by name…"
                      value={goodsFilter}
                      onChange={(event) => setGoodsFilter(event.target.value)}
                      className="mt-1"
                    />
                  </div>
                  {visibleCatalog.length === 0 ? (
                    <p role="status" className="mt-2 text-sm text-text-muted">
                      No goods match that filter.
                    </p>
                  ) : null}
                  <div className="mt-2 space-y-2">
                    {CATEGORY_ORDER.filter((category) =>
                      visibleCatalog.some((item) => item.category === category),
                    ).map((category) => {
                      const group = visibleCatalog.filter((item) => item.category === category);
                      const selected = group.filter(
                        (item) => picks[item.id]?.checked === true,
                      ).length;
                      return (
                        <details
                          key={category}
                          className="rounded-md border border-border px-3 py-2"
                        >
                          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                            {categoryLabel(category)}{' '}
                            <span className="font-normal text-text-muted">
                              {selected > 0
                                ? `${selected} selected`
                                : `${group.length} ${group.length === 1 ? 'good' : 'goods'}`}
                            </span>
                          </summary>
                          <ul className="mt-2 space-y-2">
                            {group.map((item) => {
                              const pick = picks[item.id] ?? {
                                checked: false,
                                quantity: 1,
                                customName: '',
                              };
                              const hint = capHint(item, household);
                              return (
                                <li
                                  key={item.id}
                                  className="border-t border-border px-1 py-2 first:border-t-0"
                                >
                                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={pick.checked}
                                      onChange={() => toggleItem(item.id)}
                                      className="h-4 w-4 accent-primary-subtle"
                                    />
                                    <span className="font-medium">
                                      {item.name}{' '}
                                      <span className="font-normal text-text-muted">
                                        ({item.unit})
                                      </span>
                                    </span>
                                  </label>
                                  {hint === null ? null : (
                                    <p className="mt-1 text-xs text-text-muted">{hint}</p>
                                  )}
                                  {pick.checked ? (
                                    <div className="mt-2 flex items-center gap-2">
                                      <label
                                        htmlFor={`qty-${item.id}`}
                                        className="text-xs text-text-muted"
                                      >
                                        Qty
                                      </label>
                                      <input
                                        id={`qty-${item.id}`}
                                        type="number"
                                        min={1}
                                        value={pick.quantity}
                                        onChange={(event) =>
                                          setQuantity(item.id, Number(event.target.value))
                                        }
                                        className="w-20 rounded-md border border-input bg-surface px-2 py-1 text-sm"
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
                                          className="flex-1 rounded-md border border-input bg-surface px-2 py-1 text-sm"
                                        />
                                      ) : null}
                                    </div>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      );
                    })}
                  </div>
                  <FieldError message={errors.items?.message} />
                </fieldset>

                <Field control={control} name="notes" label="Leave a Note" className="mt-4">
                  {(field) => (
                    <textarea
                      id={field.id}
                      rows={4}
                      value={typeof field.value === 'string' ? field.value : ''}
                      onChange={(event) => field.onChange(event.target.value)}
                      onBlur={field.onBlur}
                      aria-invalid={field.invalid}
                      aria-describedby={field.describedBy}
                      className={inputClass}
                    />
                  )}
                </Field>

                <div className="mt-4">
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      {...register('consent')}
                      className="mt-1 h-4 w-4 accent-primary-subtle"
                    />
                    <span>
                      I consent to Agapay collecting my name, contact details, and location to
                      process this relief request.
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
              </motion.form>
            ) : (
              <motion.div
                key="request-success"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
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
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
