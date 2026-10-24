import { useEffect, useRef, useState } from 'react';
import {
  campaignResponseSchema,
  createCampaignSchema,
  itemTypeListResponseSchema,
} from '@agapay/shared';
import { ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
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
import { Textarea } from '../../components/ui/textarea';
import { NativeSelect } from '../../components/ui/native-select';
import {
  FieldGroup,
  FieldLayout as Field,
  FieldSet,
  FieldLegend,
  FieldDescription,
} from '../../components/ui/field';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Spinner } from '../../components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';

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
    )
      return 'Fill in every part of an area, or remove the row.';
  }
  const keys = state.areas
    .map((area) => `${area.barangay.trim().toLowerCase()}|${area.city.trim().toLowerCase()}`)
    .filter((key) => key !== '|');
  if (new Set(keys).size !== keys.length) return 'Each area row must be unique.';
  if (state.priorities.some((row) => row.itemTypeId === '' && row.targetQuantity !== ''))
    return 'Choose goods for each target quantity, or remove the row.';
  return null;
}

function uploadImage(id: string, file: File): Promise<void> {
  const form = new FormData();
  form.append('image', file);
  return apiFetch(`/api/v1/campaigns/${encodeURIComponent(id)}/image`, {
    method: 'POST',
    body: form,
  }).then(() => undefined);
}

function RemoveRow({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} onClick={onRemove}>
          <Trash2 aria-hidden="true" data-icon="inline-start" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
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
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const inFlight = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (formError !== null) errorRef.current?.focus();
  }, [formError]);
  const itemTypes = useApiQuery(
    ['admin-campaign-item-types'],
    '/api/v1/item-types?pageSize=100',
    itemTypeListResponseSchema,
    { enabled: open },
  );
  const types = itemTypes.data?.data.items ?? [];
  const detailsLocked = submitting || created !== null;

  function patchArea(index: number, key: keyof AreaRow, value: string) {
    setState((current) => ({
      ...current,
      areas: current.areas.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    }));
  }
  function patchPriority(index: number, key: keyof PriorityRow, value: string) {
    setState((current) => ({
      ...current,
      priorities: current.priorities.map((row, i) =>
        i === index ? { ...row, [key]: value } : row,
      ),
    }));
  }
  function close() {
    setState(EMPTY_STATE);
    setFormError(null);
    setCreated(null);
    onClose();
  }

  async function submit() {
    if (inFlight.current) return;
    const invalid = created === null ? validateForm(state) : null;
    if (invalid !== null) {
      setFormError(invalid);
      return;
    }
    const image = state.image;
    if (image !== null) {
      const error = validateImage(image);
      if (error !== null) {
        setFormError(error);
        return;
      }
    } else if (created !== null) {
      setFormError('Choose an image to retry the upload, or select Done.');
      return;
    }
    const input = createCampaignSchema.safeParse({
      name: state.name.trim(),
      description: state.description.trim(),
      calamityType: state.calamityType,
      startDate: state.startDate,
      endDate: state.endDate,
      areas: state.areas
        .filter((row) => row.barangay.trim() + row.city.trim() + row.province.trim() !== '')
        .map((row) => ({
          barangay: row.barangay.trim(),
          city: row.city.trim(),
          province: row.province.trim(),
        })),
      priorityItems: state.priorities
        .filter((row) => row.itemTypeId !== '' || row.targetQuantity !== '')
        .map((row) => ({
          itemTypeId: row.itemTypeId,
          targetQuantity: row.targetQuantity === '' ? null : Number(row.targetQuantity),
        })),
    });
    if (!input.success) {
      setFormError(input.error.issues[0]?.message ?? 'Review the campaign fields.');
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setFormError(null);
    let saved = created;
    try {
      if (saved === null) {
        const response = campaignResponseSchema.safeParse(
          await apiFetch('/api/v1/campaigns', { method: 'POST', body: input.data }),
        );
        if (!response.success) {
          onCreated('Campaign created.');
          toast.warning(
            'Campaign created, but its details could not be loaded. Refresh the list to confirm.',
          );
          close();
          return;
        }
        saved = { id: response.data.data.id, name: response.data.data.name };
        setCreated(saved);
      }
      if (image !== null) await uploadImage(saved.id, image);
      onCreated(`Campaign "${saved.name}" created${image === null ? '' : ' with image'}.`);
      toast.success(created === null ? 'Campaign created.' : 'Campaign image uploaded.');
      close();
    } catch (err) {
      if (saved !== null) {
        setFormError(
          'The campaign was created, but the image could not be uploaded. Retry the image upload or select Done.',
        );
        onCreated(`Campaign "${saved.name}" created.`);
        toast.warning('Campaign created; image upload failed.');
      } else {
        setFormError(
          err instanceof ApiClientError ? err.message : 'Create failed. Please try again.',
        );
        toast.error('Could not create the campaign. Please review the form and retry.');
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      size="wide"
      className="flex flex-col overflow-hidden p-0"
      onOpenChange={(next) => {
        if (!next && !submitting) close();
      }}
    >
      <form
        noValidate
        className="flex min-h-0 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="relative shrink-0 border-b border-border px-6 py-5 pr-16">
          <DialogTitle>Create New Campaign</DialogTitle>
          <DialogDescription>
            Set up a relief campaign with its covered areas and priority goods.
          </DialogDescription>
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3"
              aria-label="Close campaign form"
              disabled={submitting}
            >
              <X aria-hidden="true" data-icon="inline-start" />
            </Button>
          </DialogClose>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-6 py-5">
          <FieldGroup>
            {formError !== null && (
              <Alert
                ref={errorRef}
                tabIndex={-1}
                variant={created === null ? 'destructive' : 'default'}
              >
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <FieldGroup className="grid items-start gap-6 md:grid-cols-2">
              <FieldSet
                aria-label="Campaign details"
                disabled={detailsLocked}
                className="border-0 p-0"
              >
                <Field>
                  <Label htmlFor="campaign-name">Campaign name *</Label>
                  <Input
                    id="campaign-name"
                    required
                    maxLength={120}
                    placeholder="e.g. Flood Relief"
                    value={state.name}
                    onChange={(event) => setState((c) => ({ ...c, name: event.target.value }))}
                  />
                </Field>
                <FieldGroup className="grid sm:grid-cols-2">
                  <Field>
                    <Label htmlFor="campaign-calamity">Calamity type *</Label>
                    <NativeSelect
                      id="campaign-calamity"
                      value={state.calamityType}
                      onChange={(event) =>
                        setState((c) => ({ ...c, calamityType: event.target.value }))
                      }
                    >
                      {CALAMITY_TYPES.map((value) => (
                        <option key={value} value={value}>
                          {CALAMITY_LABELS[value] ?? value}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <Label>Status</Label>
                    <Badge className="self-start">Draft</Badge>
                    <FieldDescription>Activate from the campaign list when ready.</FieldDescription>
                  </Field>
                </FieldGroup>
                <FieldGroup className="grid sm:grid-cols-2">
                  <Field>
                    <Label htmlFor="campaign-start">Start date *</Label>
                    <Input
                      id="campaign-start"
                      type="date"
                      required
                      value={state.startDate}
                      onChange={(event) =>
                        setState((c) => ({ ...c, startDate: event.target.value }))
                      }
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="campaign-end">End date *</Label>
                    <Input
                      id="campaign-end"
                      type="date"
                      required
                      min={state.startDate || undefined}
                      value={state.endDate}
                      onChange={(event) => setState((c) => ({ ...c, endDate: event.target.value }))}
                    />
                  </Field>
                </FieldGroup>
                <Field>
                  <Label htmlFor="campaign-description">Description *</Label>
                  <Textarea
                    id="campaign-description"
                    required
                    rows={5}
                    maxLength={5000}
                    placeholder="Describe the campaign, its purpose, and the communities it will help"
                    value={state.description}
                    onChange={(event) =>
                      setState((c) => ({ ...c, description: event.target.value }))
                    }
                  />
                  <FieldDescription>{state.description.length}/5000 characters</FieldDescription>
                </Field>
              </FieldSet>
              <FieldGroup>
                <Field>
                  <Label htmlFor="campaign-image">Campaign image, optional</Label>
                  <div className="flex min-w-0 flex-col gap-3 rounded-md border border-dashed border-border-strong p-4">
                    <ImagePlus className="size-8 self-center text-primary" aria-hidden="true" />
                    <Input
                      id="campaign-image"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={submitting}
                      aria-describedby="campaign-image-hint"
                      onChange={(event) =>
                        setState((c) => ({ ...c, image: event.target.files?.[0] ?? null }))
                      }
                    />
                    <FieldDescription id="campaign-image-hint">
                      PNG, JPG, or WEBP up to {MAX_IMAGE_MB}MB. Uploaded after the campaign is
                      created.
                    </FieldDescription>
                    {state.image !== null && (
                      <p className="break-words text-xs text-text-muted [overflow-wrap:anywhere]">
                        Selected: {state.image.name}
                      </p>
                    )}
                  </div>
                </Field>
                <FieldSet disabled={detailsLocked}>
                  <FieldLegend>Relief needs</FieldLegend>
                  <FieldDescription>
                    Priority goods shown to donors. Target quantities are optional.
                  </FieldDescription>
                  {itemTypes.isPending && (
                    <p role="status" className="flex items-center gap-2 text-sm">
                      <Spinner aria-hidden="true" />
                      Loading goods…
                    </p>
                  )}
                  {itemTypes.error !== null && (
                    <Alert>
                      <AlertDescription>Could not load goods.</AlertDescription>
                      <Button
                        variant="outline"
                        disabled={itemTypes.isFetching}
                        onClick={itemTypes.refetch}
                      >
                        Retry goods
                      </Button>
                    </Alert>
                  )}
                  {state.priorities.map((priority, index) => (
                    <FieldGroup
                      key={index}
                      className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto]"
                    >
                      <Field>
                        <Label htmlFor={`campaign-priority-${index}`}>Goods</Label>
                        <NativeSelect
                          id={`campaign-priority-${index}`}
                          aria-label={`Priority item ${index + 1}`}
                          value={priority.itemTypeId}
                          disabled={itemTypes.isPending || itemTypes.error !== null}
                          onChange={(event) =>
                            patchPriority(index, 'itemTypeId', event.target.value)
                          }
                        >
                          <option value="">Choose goods…</option>
                          {types.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ({item.unit})
                            </option>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field>
                        <Label htmlFor={`campaign-target-${index}`}>Target qty</Label>
                        <Input
                          id={`campaign-target-${index}`}
                          aria-label={`Priority item ${index + 1} target quantity`}
                          type="number"
                          min={1}
                          max={10_000_000}
                          step={1}
                          placeholder="Optional"
                          value={priority.targetQuantity}
                          onChange={(event) =>
                            patchPriority(index, 'targetQuantity', event.target.value)
                          }
                        />
                      </Field>
                      <div className="self-end">
                        <RemoveRow
                          label={`Remove priority item ${index + 1}`}
                          onRemove={() =>
                            setState((c) => ({
                              ...c,
                              priorities: c.priorities.filter((_, i) => i !== index),
                            }))
                          }
                        />
                      </div>
                    </FieldGroup>
                  ))}
                  <Button
                    variant="outline"
                    className="self-start"
                    disabled={state.priorities.length >= 200}
                    onClick={() =>
                      setState((c) => ({
                        ...c,
                        priorities: [...c.priorities, { itemTypeId: '', targetQuantity: '' }],
                      }))
                    }
                  >
                    <Plus data-icon="inline-start" aria-hidden="true" />
                    Add item
                  </Button>
                </FieldSet>
              </FieldGroup>
              <FieldSet disabled={detailsLocked} className="md:col-span-2">
                <FieldLegend>Affected areas</FieldLegend>
                <FieldDescription>
                  Enter complete barangay, city or municipality, and province rows. These determine
                  who can request aid.
                </FieldDescription>
                {state.areas.map((area, index) => (
                  <FieldGroup
                    key={index}
                    className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                  >
                    <Field>
                      <Label htmlFor={`campaign-barangay-${index}`}>Barangay</Label>
                      <Input
                        id={`campaign-barangay-${index}`}
                        aria-label={`Area ${index + 1} barangay`}
                        placeholder="Barangay"
                        maxLength={120}
                        value={area.barangay}
                        onChange={(event) => patchArea(index, 'barangay', event.target.value)}
                      />
                    </Field>
                    <Field>
                      <Label htmlFor={`campaign-city-${index}`}>City or municipality</Label>
                      <Input
                        id={`campaign-city-${index}`}
                        aria-label={`Area ${index + 1} city`}
                        placeholder="City or municipality"
                        maxLength={120}
                        value={area.city}
                        onChange={(event) => patchArea(index, 'city', event.target.value)}
                      />
                    </Field>
                    <Field>
                      <Label htmlFor={`campaign-province-${index}`}>Province</Label>
                      <Input
                        id={`campaign-province-${index}`}
                        aria-label={`Area ${index + 1} province`}
                        placeholder="Province"
                        maxLength={120}
                        value={area.province}
                        onChange={(event) => patchArea(index, 'province', event.target.value)}
                      />
                    </Field>
                    <RemoveRow
                      label={`Remove area ${index + 1}`}
                      onRemove={() =>
                        setState((c) => ({ ...c, areas: c.areas.filter((_, i) => i !== index) }))
                      }
                    />
                  </FieldGroup>
                ))}
                <Button
                  variant="outline"
                  className="self-start"
                  disabled={state.areas.length >= 200}
                  onClick={() =>
                    setState((c) => ({
                      ...c,
                      areas: [...c.areas, { barangay: '', city: '', province: '' }],
                    }))
                  }
                >
                  <Plus data-icon="inline-start" aria-hidden="true" />
                  Add area
                </Button>
              </FieldSet>
            </FieldGroup>
          </FieldGroup>
        </div>
        <DialogFooter className="mt-0 shrink-0 flex-wrap border-t border-border px-6 py-4">
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>
              {created === null ? 'Cancel' : 'Done'}
            </Button>
          </DialogClose>
          <Button type="submit" disabled={submitting} aria-busy={submitting}>
            {submitting && <Spinner aria-hidden="true" data-icon="inline-start" />}
            {submitting
              ? created === null
                ? 'Creating…'
                : 'Uploading image…'
              : created === null
                ? 'Create Campaign'
                : 'Retry image upload'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
