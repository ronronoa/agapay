import { useState } from 'react';
import { campaignResponseSchema, itemTypeListResponseSchema } from '@agapay/shared';
import { ApiClientError, apiFetch } from '../../lib/api-client';
import { useApiQuery } from '../../lib/use-api-query';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

const MAX_IMAGE_MB = 5;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const CALAMITY_TYPES = [
  'TYPHOON',
  'FLOOD',
  'EARTHQUAKE',
  'FIRE',
  'VOLCANIC_ERUPTION',
  'LANDSLIDE',
  'OTHER',
] as const;

const CALAMITY_LABELS: Record<string, string> = {
  TYPHOON: 'Typhoon',
  FLOOD: 'Flood',
  EARTHQUAKE: 'Earthquake',
  FIRE: 'Fire',
  VOLCANIC_ERUPTION: 'Volcanic eruption',
  LANDSLIDE: 'Landslide',
  OTHER: 'Other',
};

export interface AreaRow {
  barangay: string;
  city: string;
  province: string;
}

export interface PriorityRow {
  itemTypeId: string;
  targetQuantity: string;
}

export interface CreateFormState {
  name: string;
  description: string;
  calamityType: string;
  startDate: string;
  endDate: string;
  areas: AreaRow[];
  priorities: PriorityRow[];
  image: File | null;
}

export const EMPTY_STATE: CreateFormState = {
  name: '',
  description: '',
  calamityType: 'TYPHOON',
  startDate: '',
  endDate: '',
  areas: [{ barangay: '', city: '', province: '' }],
  priorities: [{ itemTypeId: '', targetQuantity: '' }],
  image: null,
};

// Client-side pre-check only; the server re-validates type and size.
function validateImage(file: File): string | null {
  if (!IMAGE_TYPES.has(file.type)) return 'Images must be PNG, JPG, or WEBP.';
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) return `Images must be ${MAX_IMAGE_MB}MB or smaller.`;
  return null;
}

function validateForm(state: CreateFormState): string | null {
  if (state.name.trim().length < 3) return 'Enter a campaign name of at least 3 characters.';
  if (state.description.trim().length === 0) return 'Describe what this campaign is for.';
  if (state.startDate === '') return 'Choose a start date.';
  if (state.endDate === '') return 'Choose an end date.';
  if (state.endDate <= state.startDate) return 'End date must be after the start date.';
  for (const area of state.areas) {
    const filled = area.barangay.trim() + area.city.trim() + area.province.trim() !== '';
    if (
      filled &&
      (area.barangay.trim() === '' || area.city.trim() === '' || area.province.trim() === '')
    ) {
      return 'Fill in every part of an area, or remove the row.';
    }
  }
  const keys = state.areas
    .map((area) => `${area.barangay.trim().toLowerCase()}|${area.city.trim().toLowerCase()}`)
    .filter((key) => key !== '|');
  if (new Set(keys).size !== keys.length) return 'Each area row must be unique.';
  for (const priority of state.priorities) {
    const filled = priority.itemTypeId !== '' || priority.targetQuantity !== '';
    if (filled && (priority.itemTypeId === '' || priority.targetQuantity === '')) {
      return 'Choose goods and a target quantity for each priority item, or remove the row.';
    }
  }
  return null;
}

function uploadImage(id: string, file: File): Promise<void> {
  const form = new FormData();
  form.append('image', file);
  return apiFetch<unknown>(`/api/v1/campaigns/${encodeURIComponent(id)}/image`, {
    method: 'POST',
    body: form,
  }).then(() => undefined);
}

export function CreateCampaignDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [state, setState] = useState<CreateFormState>(EMPTY_STATE);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const itemTypes = useApiQuery(
    ['admin-campaign-item-types'],
    '/api/v1/item-types?pageSize=100',
    itemTypeListResponseSchema,
    { enabled: open },
  );
  const types = itemTypes.data?.data.items ?? [];

  function patchArea(index: number, key: keyof AreaRow, value: string): void {
    setState((current) => ({
      ...current,
      areas: current.areas.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    }));
  }

  function patchPriority(index: number, key: keyof PriorityRow, value: string): void {
    setState((current) => ({
      ...current,
      priorities: current.priorities.map((row, i) =>
        i === index ? { ...row, [key]: value } : row,
      ),
    }));
  }

  function close(): void {
    setState(EMPTY_STATE);
    setFormError(null);
    setSubmitting(false);
    onClose();
  }

  function submit(): void {
    const invalid = validateForm(state);
    if (invalid !== null) {
      setFormError(invalid);
      return;
    }
    const image = state.image;
    if (image !== null) {
      const imageError = validateImage(image);
      if (imageError !== null) {
        setFormError(imageError);
        return;
      }
    }
    const areas = state.areas
      .filter((row) => row.barangay.trim() + row.city.trim() + row.province.trim() !== '')
      .map((row) => ({
        barangay: row.barangay.trim(),
        city: row.city.trim(),
        province: row.province.trim(),
      }));
    const priorities = state.priorities
      .filter((row) => row.itemTypeId !== '' || row.targetQuantity !== '')
      .map((row) => ({ itemTypeId: row.itemTypeId, targetQuantity: Number(row.targetQuantity) }));
    setSubmitting(true);
    setFormError(null);
    // Create first so the image has a campaign to attach to; a failed upload
    // never rolls back the campaign (same retry-safe pattern as inventory).
    void apiFetch<unknown>('/api/v1/campaigns', {
      method: 'POST',
      body: {
        name: state.name.trim(),
        description: state.description.trim(),
        calamityType: state.calamityType,
        startDate: state.startDate,
        endDate: state.endDate,
        areas,
        priorityItems: priorities,
      },
    })
      .then((res) => {
        const parsed = campaignResponseSchema.safeParse(res);
        if (!parsed.success) {
          onCreated('Campaign created.');
          close();
          return;
        }
        const campaign = parsed.data.data;
        if (image === null) {
          onCreated(`Campaign "${campaign.name}" created.`);
          close();
          return;
        }
        void uploadImage(campaign.id, image)
          .then(() => {
            onCreated(`Campaign "${campaign.name}" created with image.`);
            close();
          })
          .catch((err: unknown) => {
            setSubmitting(false);
            setFormError(
              `The campaign was created, but the image failed: ${
                err instanceof ApiClientError ? err.message : 'please try again.'
              } You can retry later.`,
            );
            onCreated(`Campaign "${campaign.name}" created.`);
          });
      })
      .catch((err: unknown) => {
        setSubmitting(false);
        setFormError(
          err instanceof ApiClientError ? err.message : 'Create failed. Please try again.',
        );
      });
  }

  const inputClass = 'w-full rounded-md border border-input bg-surface px-3 py-2 text-sm';

  return (
    <Dialog
      open={open}
      size="xl"
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogTitle>Create New Campaign</DialogTitle>
      <DialogDescription>
        Set up a relief campaign with its covered areas and priority goods.
      </DialogDescription>
      {formError === null ? null : (
        <p role="alert" className="mt-3 text-sm font-medium">
          {formError}
        </p>
      )}
      <div className="mt-4 max-h-[70dvh] overflow-y-auto pr-1">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <Label htmlFor="campaign-name">Campaign name *</Label>
              <Input
                id="campaign-name"
                placeholder="e.g. Flood Relief"
                value={state.name}
                onChange={(event) => setState((c) => ({ ...c, name: event.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="campaign-calamity">Calamity type *</Label>
                <select
                  id="campaign-calamity"
                  value={state.calamityType}
                  onChange={(event) =>
                    setState((c) => ({ ...c, calamityType: event.target.value }))
                  }
                  className={`mt-1 ${inputClass}`}
                >
                  {CALAMITY_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {CALAMITY_LABELS[value] ?? value}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="campaign-status-draft">Status *</Label>
                <Input
                  id="campaign-status-draft"
                  value="Draft"
                  disabled
                  aria-describedby="campaign-status-hint"
                />
                <p id="campaign-status-hint" className="mt-1 text-xs text-text-muted">
                  New campaigns start as drafts; activate from the list when ready.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="campaign-start">Start date *</Label>
                <Input
                  id="campaign-start"
                  type="date"
                  value={state.startDate}
                  onChange={(event) => setState((c) => ({ ...c, startDate: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="campaign-end">End date *</Label>
                <Input
                  id="campaign-end"
                  type="date"
                  value={state.endDate}
                  onChange={(event) => setState((c) => ({ ...c, endDate: event.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="campaign-description">Description *</Label>
              <textarea
                id="campaign-description"
                rows={3}
                maxLength={5000}
                placeholder="Describe the campaign, its purpose, and the communities it will help"
                value={state.description}
                onChange={(event) => setState((c) => ({ ...c, description: event.target.value }))}
                className={`mt-1 ${inputClass}`}
              />
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <Label htmlFor="campaign-image">Campaign image, optional</Label>
              <Input
                id="campaign-image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) =>
                  setState((c) => ({ ...c, image: event.target.files?.[0] ?? null }))
                }
              />
              <p className="mt-1 text-xs text-text-muted">
                PNG, JPG, or WEBP up to {MAX_IMAGE_MB}MB. Uploaded after the campaign is created.
              </p>
              {state.image === null ? null : (
                <p className="mt-1 text-xs text-text-muted">Selected: {state.image.name}</p>
              )}
            </div>
            <fieldset className="rounded-md border border-border p-3">
              <legend className="px-1 text-sm font-medium">Affected areas</legend>
              <p className="text-xs text-text-muted">
                Barangay, city, and province rows define who can request aid. The beneficiary form
                reads its location choices from these.
              </p>
              {state.areas.map((area, index) => (
                <div key={index} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <input
                    aria-label={`Area ${index + 1} barangay`}
                    placeholder="Barangay"
                    value={area.barangay}
                    onChange={(event) => patchArea(index, 'barangay', event.target.value)}
                    className={inputClass}
                  />
                  <input
                    aria-label={`Area ${index + 1} city`}
                    placeholder="City or municipality"
                    value={area.city}
                    onChange={(event) => patchArea(index, 'city', event.target.value)}
                    className={inputClass}
                  />
                  <input
                    aria-label={`Area ${index + 1} province`}
                    placeholder="Province"
                    value={area.province}
                    onChange={(event) => patchArea(index, 'province', event.target.value)}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setState((c) => ({ ...c, areas: c.areas.filter((_, i) => i !== index) }))
                    }
                    aria-label={`Remove area ${index + 1}`}
                    className="rounded-md border border-border-strong px-3 text-sm font-medium hover:bg-surface-alt"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setState((c) => ({
                    ...c,
                    areas: [...c.areas, { barangay: '', city: '', province: '' }],
                  }))
                }
                className="mt-2 text-sm font-medium text-primary underline underline-offset-4"
              >
                + Add area
              </button>
            </fieldset>
          </div>
          <fieldset className="rounded-md border border-border p-3 md:col-span-2">
            <legend className="px-1 text-sm font-medium">Relief needs</legend>
            <p className="text-xs text-text-muted">
              Priority goods shown to donors for this campaign, with optional target quantities.
            </p>
            {state.priorities.map((priority, index) => (
              <div key={index} className="mt-2 grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
                <select
                  aria-label={`Priority item ${index + 1}`}
                  value={priority.itemTypeId}
                  onChange={(event) => patchPriority(index, 'itemTypeId', event.target.value)}
                  className={inputClass}
                >
                  <option value="">Choose goods…</option>
                  {types.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`Priority item ${index + 1} target quantity`}
                  type="number"
                  min={1}
                  placeholder="Target qty"
                  value={priority.targetQuantity}
                  onChange={(event) => patchPriority(index, 'targetQuantity', event.target.value)}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() =>
                    setState((c) => ({
                      ...c,
                      priorities: c.priorities.filter((_, i) => i !== index),
                    }))
                  }
                  aria-label={`Remove priority item ${index + 1}`}
                  className="rounded-md border border-border-strong px-3 text-sm font-medium hover:bg-surface-alt"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setState((c) => ({
                  ...c,
                  priorities: [...c.priorities, { itemTypeId: '', targetQuantity: '' }],
                }))
              }
              className="mt-2 text-sm font-medium text-primary underline underline-offset-4"
            >
              + Add item
            </button>
          </fieldset>
        </div>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="accent">
            Cancel
          </Button>
        </DialogClose>
        <Button type="button" onClick={submit} disabled={submitting}>
          {submitting ? 'Creating…' : 'Create Campaign'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
