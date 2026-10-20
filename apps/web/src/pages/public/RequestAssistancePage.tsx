import { useEffect, useRef, useState } from 'react';
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
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';

const inputClass = 'w-full rounded-md border border-input bg-surface px-3 py-2 text-sm';

const STEP_LABELS = ['Your information', 'Assistance needs', 'Review & consent'] as const;

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

function focusFirstInvalid(): void {
  const invalid = document.querySelector('[aria-invalid="true"]');
  if (invalid instanceof HTMLElement) invalid.focus();
}

export function RequestAssistancePage() {
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [phoneDigits, setPhoneDigits] = useState('');
  const [success, setSuccess] = useState<{ referenceNumber: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [goodsFilter, setGoodsFilter] = useState('');
  const [summaryFields, setSummaryFields] = useState<string[]>([]);
  const [outsideArea, setOutsideArea] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

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
    trigger,
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
  const filterQuery = goodsFilter.trim().toLowerCase();
  const visibleCatalog =
    filterQuery.length === 0
      ? catalog
      : catalog.filter((item) => item.name.toLowerCase().includes(filterQuery));
  const householdRaw = watch('householdSize');
  const household = typeof householdRaw === 'number' ? householdRaw : undefined;
  const watchedCampaignId = watch('campaignId');
  const watchedBarangay = watch('barangay');
  const watchedCity = watch('city');

  const selectedCampaign = campaigns.find((campaign) => campaign.id === watchedCampaignId);
  // Location is collected before the campaign is chosen, so the selects offer
  // the areas served by any active campaign. A location outside them stays
  // submittable: the API flags it for staff review (BR-REQ-07).
  const allAreas = campaigns.flatMap((campaign) => campaign.areas);
  const areaBarangays = [...new Set(allAreas.map((area) => area.barangay))].sort((a, b) =>
    a.localeCompare(b),
  );
  const areaCities = [
    ...new Set(
      allAreas
        .filter((area) => watchedBarangay === '' || area.barangay === watchedBarangay)
        .map((area) => area.city),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const areaProvinces = [
    ...new Set(
      allAreas
        .filter(
          (area) =>
            (watchedBarangay === '' || area.barangay === watchedBarangay) &&
            (watchedCity === '' || area.city === watchedCity),
        )
        .map((area) => area.province),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const hasAreas = areaBarangays.length > 0;

  const noAreaCampaign = selectedCampaign !== undefined && selectedCampaign.areas.length === 0;
  const campaignsReady = !campaignsQuery.isPending && campaignsQuery.error === null;
  const noCampaigns = campaignsReady && campaigns.length === 0;

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

  // Moving between steps keeps the single form state, so entered values are
  // never lost; focus lands on the step heading for keyboard users.
  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [step, success]);

  // A failed Continue announces one summary and links each problem field, so
  // screen-reader users hear what to fix without hunting the form. The list is
  // compared before writing: a fresh array every render would loop forever.
  useEffect(() => {
    const labels = missingFields().map((field) => field.label);
    setSummaryFields((current) =>
      current.length === labels.length && current.every((label, index) => label === labels[index])
        ? current
        : labels,
    );
  }, [errors, step]);

  useEffect(() => {
    if (summaryFields.length > 0) errorSummaryRef.current?.focus();
  }, [summaryFields]);

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

  function continueFromInfo(): void {
    if (noCampaigns) return;
    void trigger(['fullName', 'email', 'contactNumber', 'barangay', 'city', 'province']).then(
      (valid) => {
        if (valid) {
          setSummaryFields([]);
          setStep(1);
          return;
        }
        focusFirstInvalid();
      },
    );
  }

  function continueFromNeeds(): void {
    void trigger(['campaignId', 'items']).then((valid) => {
      if (valid) {
        setSummaryFields([]);
        setStep(2);
        return;
      }
      focusFirstInvalid();
    });
  }

  // Field names whose messages the error summary links to, in visual order.
  const STEP_FIELDS: Record<number, { name: keyof SubmitRequestInput; label: string }[]> = {
    0: [
      { name: 'fullName', label: 'Full name' },
      { name: 'email', label: 'Email address' },
      { name: 'contactNumber', label: 'Mobile number' },
      { name: 'barangay', label: 'Barangay' },
      { name: 'city', label: 'City or municipality' },
      { name: 'province', label: 'Province' },
    ],
    1: [
      { name: 'campaignId', label: 'Relief campaign' },
      { name: 'items', label: 'Goods needed' },
    ],
  };

  function missingFields(): { name: keyof SubmitRequestInput; label: string }[] {
    const fields = STEP_FIELDS[step] ?? [];
    return fields.filter((field) => errors[field.name] !== undefined);
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

  function copyReference(): void {
    const text = success?.referenceNumber ?? '';
    try {
      const clipboard = navigator.clipboard;
      if (clipboard !== undefined) void clipboard.writeText(text).catch(() => undefined);
    } catch {
      // Clipboard unavailable; the reference stays visible and selectable.
    }
    setCopied(true);
  }

  const reviewItems = catalog.filter((item) => picks[item.id]?.checked === true);
  const stepLabel = STEP_LABELS[step] ?? '';

  return (
    <div className="min-h-screen bg-bg">
      <LandingHeader />
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        {success === null ? (
          <>
            <p className="text-lg font-semibold">Agapay</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
              Request relief assistance
            </h1>
            <p className="mt-2 text-sm text-text-muted">
              Tell us a little about yourself so we can help you access available relief goods.
            </p>

            <div className="mt-6" aria-label={`Step ${step + 1} of 3: ${stepLabel}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-subtle text-sm font-semibold text-surface"
                  >
                    {step + 1}
                  </span>
                  <span className="font-display text-lg font-semibold">{stepLabel}</span>
                </p>
                <p className="text-sm text-text-muted">Step {step + 1} of 3</p>
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-alt">
                <div
                  className="h-full rounded-full bg-primary-subtle"
                  style={{ width: `${((step + 1) / 3) * 100}%` }}
                />
              </div>
            </div>

            <section
              aria-label="Assistance request form"
              className="mt-6 rounded-xl border border-border bg-surface p-6 shadow-card sm:p-8"
            >
              <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
                <h2 ref={stepHeadingRef} tabIndex={-1} className="sr-only">
                  {stepLabel}
                </h2>

                {summaryFields.length === 0 ? null : (
                  <div
                    ref={errorSummaryRef}
                    tabIndex={-1}
                    role="alert"
                    aria-labelledby="error-summary-title"
                    className="mb-4 rounded-md border border-border-strong bg-surface-alt p-4"
                  >
                    <h3 id="error-summary-title" className="text-sm font-semibold">
                      There is a problem
                    </h3>
                    <ul className="mt-2 space-y-1 text-sm">
                      {summaryFields.map((label) => (
                        <li key={label}>
                          <a href="#main" className="underline">
                            {label}: check this field
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {noCampaigns ? (
                  <div role="status" className="mb-4 rounded-md bg-surface-alt p-4 text-sm">
                    <p className="font-semibold">No active relief campaigns right now</p>
                    <p className="mt-1 text-text-muted">
                      We cannot take assistance requests until a campaign opens. Please check back
                      later.
                    </p>
                  </div>
                ) : null}

                {step === 0 ? (
                  <div>
                    <h3 className="font-display text-base font-semibold">Personal details</h3>
                    <p className="mt-1 text-sm text-text-muted">Fields marked * are required.</p>

                    <Field control={control} name="fullName" label="Full name *" className="mt-4">
                      {(field) => (
                        <Input
                          id={field.id}
                          autoComplete="name"
                          placeholder="Enter your full name"
                          value={typeof field.value === 'string' ? field.value : ''}
                          onChange={(event) => field.onChange(event.target.value)}
                          onBlur={field.onBlur}
                          aria-invalid={field.invalid}
                          aria-describedby={field.describedBy}
                        />
                      )}
                    </Field>

                    <Field control={control} name="email" label="Email address *" className="mt-4">
                      {(field) => (
                        <Input
                          id={field.id}
                          type="email"
                          autoComplete="email"
                          placeholder="you@example.com"
                          value={typeof field.value === 'string' ? field.value : ''}
                          onChange={(event) => field.onChange(event.target.value)}
                          onBlur={field.onBlur}
                          aria-invalid={field.invalid}
                          aria-describedby={field.describedBy}
                        />
                      )}
                    </Field>
                    <p className="mt-1 text-xs text-text-muted">
                      Used for request updates and status tracking.
                    </p>

                    <div className="mt-4">
                      <label htmlFor="contactNumber" className="block text-sm font-medium">
                        Mobile number *
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
                          placeholder="09XX XXX XXXX"
                          value={phoneDigits}
                          onChange={(event) => onPhoneChange(event.target.value)}
                          aria-invalid={errors.contactNumber !== undefined}
                          className="w-full rounded-r-md border border-input bg-surface px-3 py-2 text-sm"
                        />
                      </div>
                      <FieldError message={errors.contactNumber?.message} />
                    </div>

                    <h3 className="mt-6 font-display text-base font-semibold">
                      Where do you live?
                    </h3>
                    {!hasAreas && !campaignsQuery.isPending ? (
                      <p role="status" className="mt-2 text-sm text-text-muted">
                        No relief areas are open right now, so we cannot take a location-based
                        request yet. Please check back later.
                      </p>
                    ) : null}
                    <div className="mt-3">
                      <label className="flex cursor-pointer items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={outsideArea}
                          onChange={(event) => {
                            const next = event.target.checked;
                            setOutsideArea(next);
                            // Switching modes clears the other mode's values so a
                            // stale dropdown pick can never mix with typed text.
                            setValue('barangay', '');
                            setValue('city', '');
                            setValue('province', '');
                          }}
                          className="mt-1 h-4 w-4 accent-primary-subtle"
                        />
                        <span>My barangay isn&apos;t in the list — I&apos;ll type my location</span>
                      </label>
                      {outsideArea ? (
                        <p role="status" className="mt-1 text-xs text-text-muted">
                          We will check whether Agapay can reach your area. Requests outside a
                          campaign&apos;s affected areas are reviewed by staff.
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <Field control={control} name="barangay" label="Barangay *">
                        {(field) =>
                          outsideArea ? (
                            <Input
                              id={field.id}
                              autoComplete="address-level3"
                              placeholder="Enter your barangay"
                              value={typeof field.value === 'string' ? field.value : ''}
                              onChange={(event) => field.onChange(event.target.value)}
                              onBlur={field.onBlur}
                              aria-invalid={field.invalid}
                              aria-describedby={field.describedBy}
                            />
                          ) : (
                            <select
                              id={field.id}
                              value={typeof field.value === 'string' ? field.value : ''}
                              onChange={(event) => {
                                field.onChange(event.target.value);
                                setValue('city', '');
                                setValue('province', '');
                              }}
                              onBlur={field.onBlur}
                              aria-invalid={field.invalid}
                              aria-describedby={field.describedBy}
                              className={inputClass}
                            >
                              <option value="">Select your barangay</option>
                              {areaBarangays.map((barangay) => (
                                <option key={barangay} value={barangay}>
                                  {barangay}
                                </option>
                              ))}
                            </select>
                          )
                        }
                      </Field>
                      <Field control={control} name="city" label="City or municipality *">
                        {(field) =>
                          outsideArea ? (
                            <Input
                              id={field.id}
                              autoComplete="address-level2"
                              placeholder="Enter your city or municipality"
                              value={typeof field.value === 'string' ? field.value : ''}
                              onChange={(event) => field.onChange(event.target.value)}
                              onBlur={field.onBlur}
                              aria-invalid={field.invalid}
                              aria-describedby={field.describedBy}
                            />
                          ) : (
                            <select
                              id={field.id}
                              value={typeof field.value === 'string' ? field.value : ''}
                              onChange={(event) => {
                                field.onChange(event.target.value);
                                setValue('province', '');
                              }}
                              onBlur={field.onBlur}
                              aria-invalid={field.invalid}
                              aria-describedby={field.describedBy}
                              className={inputClass}
                            >
                              <option value="">Select your city or municipality</option>
                              {areaCities.map((city) => (
                                <option key={city} value={city}>
                                  {city}
                                </option>
                              ))}
                            </select>
                          )
                        }
                      </Field>
                    </div>
                    <Field control={control} name="province" label="Province *" className="mt-4">
                      {(field) =>
                        outsideArea ? (
                          <Input
                            id={field.id}
                            autoComplete="address-level1"
                            placeholder="Enter your province"
                            value={typeof field.value === 'string' ? field.value : ''}
                            onChange={(event) => field.onChange(event.target.value)}
                            onBlur={field.onBlur}
                            aria-invalid={field.invalid}
                            aria-describedby={field.describedBy}
                          />
                        ) : (
                          <select
                            id={field.id}
                            value={typeof field.value === 'string' ? field.value : ''}
                            onChange={(event) => field.onChange(event.target.value)}
                            onBlur={field.onBlur}
                            aria-invalid={field.invalid}
                            aria-describedby={field.describedBy}
                            className={inputClass}
                          >
                            <option value="">Select your province</option>
                            {areaProvinces.map((province) => (
                              <option key={province} value={province}>
                                {province}
                              </option>
                            ))}
                          </select>
                        )
                      }
                    </Field>
                    <p className="mt-1 text-xs text-text-muted">
                      Only request location details necessary to determine campaign eligibility.
                    </p>

                    <div className="mt-4 rounded-md bg-surface-alt p-3 text-sm">
                      <p className="font-semibold">Your information matters</p>
                      <p className="mt-1 text-text-muted">
                        Your information will be used to process your assistance request. Read the{' '}
                        <Link to="/privacy" className="underline">
                          Privacy Notice
                        </Link>{' '}
                        before submitting.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={continueFromInfo}
                      disabled={noCampaigns}
                      className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-surface hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      Continue to assistance needs →
                    </button>
                    <p className="mt-2 text-center text-xs text-text-muted">
                      No account required · Your progress is kept while you complete the form
                    </p>
                  </div>
                ) : null}

                {step === 1 ? (
                  <div>
                    <h3 className="font-display text-base font-semibold">What do you need?</h3>
                    <p className="mt-1 text-sm text-text-muted">
                      Choose a campaign and the goods your household needs.
                    </p>

                    <Field
                      control={control}
                      name="campaignId"
                      label="Relief campaign *"
                      className="mt-4"
                    >
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
                    {noAreaCampaign ? (
                      <p role="status" className="mt-1 text-sm text-text-muted">
                        This campaign has no affected areas yet, so it cannot take location-based
                        requests. Choose another campaign.
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-text-muted">
                      Household details help us check eligibility. Limits on goods are shown next to
                      each item.
                    </p>

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
                      <legend className="text-sm font-medium">Goods needed *</legend>
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
                      {visibleCatalog.length === 0 && !itemsQuery.isPending ? (
                        <p role="status" className="mt-2 text-sm text-text-muted">
                          {catalog.length === 0
                            ? 'No goods are available to request right now. Please check back later.'
                            : 'No goods match that filter.'}
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
                              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
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
                                      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
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

                    <Field
                      control={control}
                      name="notes"
                      label="Note"
                      hint="Optional"
                      className="mt-4"
                    >
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

                    <div className="mt-6 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => setStep(0)}
                        className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        ← Back
                      </button>
                      <button
                        type="button"
                        onClick={continueFromNeeds}
                        className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-surface hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        Continue to review →
                      </button>
                    </div>
                  </div>
                ) : null}

                {step === 2 ? (
                  <div>
                    <h3 className="font-display text-base font-semibold">Check your details</h3>
                    <p className="mt-1 text-sm text-text-muted">
                      Review everything before submitting. Submitting a request does not guarantee
                      approval or immediate distribution.
                    </p>

                    <div className="mt-4 rounded-md border border-border p-4 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-semibold">Personal information</h4>
                        <button
                          type="button"
                          onClick={() => setStep(0)}
                          className="font-medium text-primary underline underline-offset-4"
                        >
                          Edit
                        </button>
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-1">
                        <dt className="text-text-muted">Name</dt>
                        <dd>{watch('fullName')}</dd>
                        <dt className="text-text-muted">Email</dt>
                        <dd className="break-all">{watch('email')}</dd>
                        <dt className="text-text-muted">Mobile</dt>
                        <dd>{watch('contactNumber')}</dd>
                        <dt className="text-text-muted">Location</dt>
                        <dd>
                          {watch('barangay')}, {watch('city')}, {watch('province')}
                        </dd>
                      </dl>
                    </div>

                    <div className="mt-3 rounded-md border border-border p-4 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-semibold">Assistance needs</h4>
                        <button
                          type="button"
                          onClick={() => setStep(1)}
                          className="font-medium text-primary underline underline-offset-4"
                        >
                          Edit
                        </button>
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-1">
                        <dt className="text-text-muted">Campaign</dt>
                        <dd>{selectedCampaign?.name ?? '—'}</dd>
                        <dt className="text-text-muted">Household</dt>
                        <dd>{household ?? '—'}</dd>
                      </dl>
                      <ul className="mt-2 space-y-1">
                        {reviewItems.map((item) => (
                          <li key={item.id} className="flex justify-between gap-2">
                            <span>{item.name}</span>
                            <span className="text-text-muted">
                              × {picks[item.id]?.quantity ?? 1}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {watch('notes') !== '' ? (
                        <p className="mt-2 text-text-muted">{watch('notes')}</p>
                      ) : null}
                    </div>

                    <div className="mt-4">
                      <label className="flex cursor-pointer items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          {...register('consent')}
                          className="mt-1 h-4 w-4 accent-primary-subtle"
                        />
                        <span>
                          I consent to Agapay collecting my name, contact details, and location to
                          process this relief request. Read the{' '}
                          <Link to="/privacy" className="underline">
                            Privacy Notice
                          </Link>{' '}
                          before submitting.
                        </span>
                      </label>
                      <FieldError message={errors.consent?.message} />
                    </div>

                    <div className="mt-4">
                      <TurnstileWidget
                        onToken={(token) => setValue('turnstileToken', token ?? '')}
                      />
                      <FieldError message={errors.turnstileToken?.message} />
                    </div>

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
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        ← Back
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-surface hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        {isSubmitting ? 'Submitting…' : 'Submit assistance request'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </form>

              <p className="mt-6 text-center text-sm text-text-muted">
                Are you a donor?{' '}
                <Link
                  to="/register"
                  className="font-medium text-primary underline underline-offset-4"
                >
                  Register to donate goods
                </Link>
              </p>
            </section>
          </>
        ) : (
          <section
            aria-label="Request submitted"
            className="rounded-xl border border-border bg-surface p-6 shadow-card sm:p-8"
          >
            <h1 className="font-display text-2xl font-bold tracking-tight">Request submitted</h1>
            <p className="mt-1 text-sm text-text-muted">
              Thank you. Your request has been received and is awaiting review — it is not yet
              approved. A confirmation email is on its way.
            </p>
            <div className="mt-4 rounded-md bg-surface-alt p-4">
              <p className="text-sm text-text-muted">Your reference number</p>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                <p aria-label="Reference number" className="text-xl font-bold tracking-wide">
                  {success.referenceNumber}
                </p>
                <button
                  type="button"
                  onClick={copyReference}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {copied ? 'Copied' : 'Copy reference'}
                </button>
              </div>
            </div>
            <p className="mt-4 text-sm text-text-muted">
              To check your status, open the tracking page and enter this reference number together
              with the email address you registered with.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/track"
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-surface hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Track my request
              </Link>
              <Link
                to="/"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Back home
              </Link>
            </div>
          </section>
        )}
      </main>
      <LandingFooter />
    </div>
  );
}
