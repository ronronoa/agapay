import { useId, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import type { PublicItemTypeDto } from '@agapay/shared';
import { Input } from './input';
import { Label } from './label';
import { NativeSelect } from './native-select';

const CATEGORIES = {
  FOOD: 'Food',
  WATER: 'Water',
  CLOTHING: 'Clothing',
  HYGIENE: 'Hygiene',
  BEDDING: 'Bedding',
  SCHOOL: 'School',
  OTHER: 'Other',
};

// Filtering only changes visibility. Each form owns its selections and validation.
export function GoodsPicker({
  items,
  isSelected,
  disabled = false,
  children,
}: {
  items: PublicItemTypeDto[];
  isSelected: (id: string) => boolean;
  disabled?: boolean;
  children: (item: PublicItemTypeDto) => ReactNode;
}) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const selectedCount = items.filter((item) => isSelected(item.id)).length;
  const visible = items.filter(
    (item) =>
      (!category || item.category === category) &&
      (!selectedOnly || isSelected(item.id)) &&
      item.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <div className="mt-3 flex min-w-0 flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={`${id}-search`}>Find a good</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
            />
            <Input
              id={`${id}-search`}
              type="search"
              placeholder="Search goods…"
              className="pl-9"
              value={search}
              disabled={disabled}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-category`}>Category</Label>
          <NativeSelect
            id={`${id}-category`}
            value={category}
            disabled={disabled}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All categories</option>
            {Object.entries(CATEGORIES)
              .filter(([value]) => items.some((item) => item.category === value))
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </NativeSelect>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p role="status" className="text-text-muted">
          {selectedCount} selected · {visible.length} shown
        </p>
        <label className="flex min-h-11 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={selectedOnly}
            disabled={disabled}
            onChange={(event) => setSelectedOnly(event.target.checked)}
            className="size-4 accent-primary"
          />
          Selected only
        </label>
      </div>
      {visible.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border px-3">
          {visible.map(children)}
        </ul>
      ) : (
        <p className="py-4 text-sm text-text-muted">
          {items.length
            ? 'No goods match these filters. Try another category or search.'
            : 'No goods are available right now. Please check back later.'}
        </p>
      )}
    </div>
  );
}
