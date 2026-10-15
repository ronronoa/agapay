import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  publicItemTypeListResponseSchema,
  submitDonationSchema,
  type SubmitDonationInput,
} from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';

export interface DonateItemDraft {
  itemTypeId: string;
  quantity: number;
  description: string;
  customName: string;
  expiryDate: string;
  checked: boolean;
}

export interface DonateFormDefaults {
  campaignId: string;
  preferredDate: string;
  preferredNote: string;
  notes: string;
  items: DonateItemDraft[];
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

interface DonateFormProps {
  campaigns: { id: string; name: string }[];
  defaults: DonateFormDefaults;
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (input: SubmitDonationInput) => Promise<void>;
  submitError: string | null;
}

export function DonateForm({
  campaigns,
  defaults,
  submitLabel,
  pendingLabel,
  onSubmit,
  submitError,
}: DonateFormProps) {
  const [drafts, setDrafts] = useState<Record<string, DonateItemDraft>>({});
  const [seededFor, setSeededFor] = useState<string | null>(null);

  const itemsQuery = useApiQuery(
    ['public-item-types', 'donate'],
    '/api/v1/public/item-types?pageSize=100',
    publicItemTypeListResponseSchema,
  );
  const catalog = itemsQuery.data?.data.items ?? [];

  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting },
  } = useForm<SubmitDonationInput>({
    resolver: zodResolver(submitDonationSchema),
    defaultValues: {
      campaignId: defaults.campaignId,
      preferredNote: defaults.preferredNote,
      notes: defaults.notes,
      items: [],
    },
  });

  const catalogKey = catalog.map((item) => item.id).join(',');
  if (seededFor !== catalogKey && catalog.length > 0) {
    setSeededFor(catalogKey);
    const next: Record<string, DonateItemDraft> = {};
    for (const item of catalog) {
      const fromDefaults = defaults.items.find((entry) => entry.itemTypeId === item.id);
      next[item.id] = {
        itemTypeId: item.id,
        quantity: fromDefaults?.quantity ?? 1,
        description: fromDefaults?.description ?? '',
        customName: fromDefaults?.customName ?? '',
        expiryDate: fromDefaults?.expiryDate ?? '',
        checked: fromDefaults !== undefined,
      };
    }
    setDrafts(next);
  }

  useEffect(() => {
    setValue(
      'items',
      Object.values(drafts)
        .filter((draft) => draft.checked)
        .map((draft) => ({
          itemTypeId: draft.itemTypeId,
          quantityDeclared: draft.quantity,
          ...(draft.description.trim().length === 0
            ? {}
            : { description: draft.description.trim() }),
          ...(draft.customName.trim().length === 0 ? {} : { customName: draft.customName.trim() }),
          ...(draft.expiryDate.length === 0 ? {} : { expiryDate: new Date(draft.expiryDate) }),
        })),
    );
  }, [drafts, setValue]);

  function updateDraft(itemTypeId: string, patch: Partial<DonateItemDraft>): void {
    setDrafts((prev) => ({
      ...prev,
      [itemTypeId]: {
        itemTypeId,
        quantity: 1,
        description: '',
        customName: '',
        expiryDate: '',
        checked: false,
        ...prev[itemTypeId],
        ...patch,
      },
    }));
  }

  const selectedCount = Object.values(drafts).filter((draft) => draft.checked).length;

  return (
    <form onSubmit={(event) => void handleSubmit((values) => onSubmit(values))(event)} noValidate>
      <Field control={control} name="campaignId" label="Relief campaign" className="mt-4">
        {(field) => (
          <select
            id={field.id}
            value={typeof field.value === 'string' ? field.value : ''}
            onChange={(event) => field.onChange(event.target.value)}
            onBlur={field.onBlur}
            aria-invalid={field.invalid}
            aria-describedby={field.describedBy}
            className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
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

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field control={control} name="preferredDate" label="Preferred drop-off date">
          {(field) => (
            <Input
              id={field.id}
              type="date"
              value={
                field.value instanceof Date
                  ? field.value.toISOString().slice(0, 10)
                  : typeof field.value === 'string'
                    ? field.value
                    : ''
              }
              onChange={(event) =>
                field.onChange(event.target.value === '' ? undefined : event.target.value)
              }
              onBlur={field.onBlur}
              aria-invalid={field.invalid}
              aria-describedby={field.describedBy}
            />
          )}
        </Field>
        <Field control={control} name="preferredNote" label="Drop-off note">
          {(field) => (
            <Input
              id={field.id}
              placeholder="Afternoon drop-off"
              value={typeof field.value === 'string' ? field.value : ''}
              onChange={(event) => field.onChange(event.target.value)}
              onBlur={field.onBlur}
              aria-invalid={field.invalid}
              aria-describedby={field.describedBy}
            />
          )}
        </Field>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Goods to donate</legend>
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
        <div className="mt-2 space-y-2">
          {CATEGORY_ORDER.filter((category) =>
            catalog.some((item) => item.category === category),
          ).map((category, groupIndex) => {
            const group = catalog.filter((item) => item.category === category);
            const selected = group.filter((item) => drafts[item.id]?.checked === true).length;
            return (
              <details
                key={category}
                open={groupIndex === 0}
                className="rounded-md border border-border px-3 py-2"
              >
                <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  {CATEGORY_LABELS[category] ?? category}{' '}
                  <span className="font-normal text-text-muted">
                    {selected > 0
                      ? `${selected} selected`
                      : `${group.length} ${group.length === 1 ? 'good' : 'goods'}`}
                  </span>
                </summary>
                <ul className="mt-2 space-y-2">
                  {group.map((item) => {
                    const draft = drafts[item.id] ?? {
                      itemTypeId: item.id,
                      quantity: 1,
                      description: '',
                      customName: '',
                      expiryDate: '',
                      checked: false,
                    };
                    return (
                      <li
                        key={item.id}
                        className="border-t border-border px-1 py-2 first:border-t-0"
                      >
                        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm">
                          <input
                            type="checkbox"
                            checked={draft.checked}
                            onChange={() => updateDraft(item.id, { checked: !draft.checked })}
                            className="h-4 w-4 accent-primary-subtle"
                          />
                          <span className="font-medium">
                            {item.name}{' '}
                            <span className="font-normal text-text-muted">({item.unit})</span>
                          </span>
                        </label>
                        {draft.checked ? (
                          <div className="mt-2 space-y-2">
                            <div className="flex items-center gap-2">
                              <label
                                htmlFor={`dqty-${item.id}`}
                                className="text-xs text-text-muted"
                              >
                                Qty
                              </label>
                              <input
                                id={`dqty-${item.id}`}
                                type="number"
                                min={1}
                                value={draft.quantity}
                                onChange={(event) =>
                                  updateDraft(item.id, {
                                    quantity: Math.max(1, Number(event.target.value) || 1),
                                  })
                                }
                                className="w-20 rounded-md border border-input bg-surface px-2 py-1 text-sm"
                              />
                              <label
                                htmlFor={`dexp-${item.id}`}
                                className="text-xs text-text-muted"
                              >
                                Expiry
                              </label>
                              <input
                                id={`dexp-${item.id}`}
                                type="date"
                                value={draft.expiryDate}
                                onChange={(event) =>
                                  updateDraft(item.id, { expiryDate: event.target.value })
                                }
                                className="rounded-md border border-input bg-surface px-2 py-1 text-sm"
                              />
                            </div>
                            <input
                              type="text"
                              aria-label={`Description for ${item.name}`}
                              placeholder="Description (optional)"
                              value={draft.description}
                              onChange={(event) =>
                                updateDraft(item.id, { description: event.target.value })
                              }
                              className="w-full rounded-md border border-input bg-surface px-2 py-1 text-sm"
                            />
                            {item.name === 'Other' ? (
                              <input
                                type="text"
                                aria-label="Custom item name"
                                placeholder="Custom item name"
                                value={draft.customName}
                                onChange={(event) =>
                                  updateDraft(item.id, { customName: event.target.value })
                                }
                                className="w-full rounded-md border border-input bg-surface px-2 py-1 text-sm"
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
      </fieldset>

      <Field control={control} name="notes" label="Notes" hint="Optional" className="mt-4">
        {(field) => (
          <textarea
            id={field.id}
            rows={3}
            value={typeof field.value === 'string' ? field.value : ''}
            onChange={(event) => field.onChange(event.target.value)}
            onBlur={field.onBlur}
            aria-invalid={field.invalid}
            aria-describedby={field.describedBy}
            className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
          />
        )}
      </Field>

      {selectedCount === 0 ? (
        <p className="mt-2 text-sm text-text-muted">Select at least one good to donate.</p>
      ) : null}

      {submitError === null ? null : (
        <p role="alert" className="mt-4 text-sm font-medium">
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-surface hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
