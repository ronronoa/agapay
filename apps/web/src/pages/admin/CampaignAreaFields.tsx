import { useState } from 'react';
import type { CreateCampaignInput } from '@agapay/shared';
import { Trash2 } from 'lucide-react';
import { usePsgcList } from '../../lib/psgc';
import { Button } from '../../components/ui/Button';
import { FieldGroup, FieldLayout } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { SearchableSelect } from '../../components/ui/SearchableSelect';

type Area = CreateCampaignInput['areas'][number];
const NCR = { code: '1300000000', name: 'Metro Manila' };

export function CampaignAreaFields({
  area,
  index,
  onChange,
  onRemove,
}: {
  area: Area;
  index: number;
  onChange: (area: Area) => void;
  onRemove: () => void;
}) {
  const [manual, setManual] = useState(Boolean(area.province || area.city || area.barangay));
  const provinces = usePsgcList(manual ? null : '/provinces');
  const provinceOptions = [...(provinces.data ?? []), NCR];
  const province = provinceOptions.find((place) => place.name === area.province);
  const cities = usePsgcList(
    manual || !province
      ? null
      : `/${province.code === NCR.code ? 'regions' : 'provinces'}/${province.code}/cities-municipalities`,
  );
  const city = cities.data?.find((place) => place.name === area.city);
  const barangays = usePsgcList(
    manual || !city ? null : `/cities-municipalities/${city.code}/barangays`,
  );
  const failed = [provinces, cities, barangays].find((query) => query.isError);
  const fields = [
    {
      key: 'province',
      label: 'Province / NCR',
      query: provinces,
      options: provinceOptions,
      enabled: true,
    },
    {
      key: 'city',
      label: 'City or municipality',
      query: cities,
      options: cities.data ?? [],
      enabled: Boolean(province),
    },
    {
      key: 'barangay',
      label: 'Barangay',
      query: barangays,
      options: barangays.data ?? [],
      enabled: Boolean(city),
    },
  ] as const;
  return (
    <div className="flex flex-col gap-3 border-b border-border py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Area {index + 1}</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setManual((value) => !value)}>
            {manual ? 'Use PSGC lists' : 'Enter manually'}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Remove area ${index + 1}`}
            onClick={onRemove}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
      <FieldGroup className="grid gap-3 sm:grid-cols-3">
        {fields.map(({ key, label, query, options, enabled }) => (
          <FieldLayout key={key}>
            <Label htmlFor={`campaign-${key}-${index}`}>{label}</Label>
            {manual ? (
              <Input
                id={`campaign-${key}-${index}`}
                aria-label={`Area ${index + 1} ${key}`}
                value={area[key]}
                maxLength={120}
                onChange={(event) => onChange({ ...area, [key]: event.target.value })}
              />
            ) : (
              <SearchableSelect
                id={`campaign-${key}-${index}`}
                label={`Area ${index + 1} ${key}`}
                value={area[key]}
                disabled={!enabled || query.isFetching}
                placeholder={query.isFetching ? 'Loading…' : `Choose ${key}`}
                options={[
                  { value: '', label: `Clear ${key}` },
                  ...(area[key] && !options.some((place) => place.name === area[key])
                    ? [{ value: area[key], label: area[key] }]
                    : []),
                  ...options.map((place) => ({ value: place.name, label: place.name })),
                ]}
                onChange={(value) =>
                  onChange(
                    key === 'province'
                      ? { province: value, city: '', barangay: '' }
                      : key === 'city'
                        ? { ...area, city: value, barangay: '' }
                        : { ...area, barangay: value },
                  )
                }
              />
            )}
          </FieldLayout>
        ))}
      </FieldGroup>
      {!manual && failed && (
        <p className="text-sm text-text-muted">
          Address lists are unavailable.{' '}
          <Button size="sm" variant="ghost" onClick={() => void failed.refetch()}>
            Retry lookup
          </Button>{' '}
          or enter the area manually.
        </p>
      )}
      {manual && (
        <p className="text-xs text-text-muted">
          Check all three names before saving. Existing area names are preserved.
        </p>
      )}
    </div>
  );
}
