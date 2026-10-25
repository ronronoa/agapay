import { hasRole } from '@agapay/shared';
import { toast } from 'sonner';
import {
  itemTypeListResponseSchema,
  itemTypeResponseSchema,
  createItemTypeSchema,
  updateItemTypeSchema,
  type ItemTypeDto,
} from '@agapay/shared';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '../../lib/api-client';
import { getUser } from '../../lib/session';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { useApiQuery } from '../../lib/use-api-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';

function describeLimit(value: number | null, unit: string): string {
  // D-06: a null limit means "no cap", which must read as such rather than blank.
  return value === null ? 'No cap' : `${value} ${unit}`;
}

export function ItemTypesPage() {
  const [editing, setEditing] = useState<ItemTypeDto | 'new' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const params = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (search.trim()) params.set('q', search.trim());
  const current = editing === 'new' ? null : editing;
  const admin = hasRole(getUser()?.role, ['ADMIN']);
  const query = useApiQuery(
    ['itemTypes', params.toString()],
    `/api/v1/item-types?${params}`,
    itemTypeListResponseSchema,
  );
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = {
      name: form.get('name'),
      category: form.get('category'),
      unit: form.get('unit'),
      ...(form.get('lowStockThreshold')
        ? { lowStockThreshold: Number(form.get('lowStockThreshold')) }
        : {}),
      maxPerRequest: form.get('maxPerRequest') ? Number(form.get('maxPerRequest')) : null,
      perHouseholdMember: form.get('perHouseholdMember')
        ? Number(form.get('perHouseholdMember'))
        : null,
      ...(current ? { isActive: form.get('isActive') === 'true' } : {}),
    };
    const parsed = current
      ? updateItemTypeSchema.safeParse(raw)
      : createItemTypeSchema.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      itemTypeResponseSchema.parse(
        await apiFetch(current ? `/api/v1/item-types/${current.id}` : '/api/v1/item-types', {
          method: current ? 'PATCH' : 'POST',
          body: parsed.data,
        }),
      );
      setEditing(null);
      toast.success('Item type saved.');
      query.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save item type.');
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<ItemTypeDto>[] = [
    {
      key: 'name',
      header: 'Item',
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => <span className="capitalize">{row.category.toLowerCase()}</span>,
    },
    { key: 'unit', header: 'Unit', render: (row) => row.unit },
    {
      key: 'lowStock',
      header: 'Low stock at',
      render: (row) => `${row.lowStockThreshold} ${row.unit}`,
    },
    {
      key: 'max',
      header: 'Max per request',
      render: (row) => describeLimit(row.maxPerRequest, row.unit),
    },
    {
      key: 'perHousehold',
      header: 'Per household member',
      render: (row) => describeLimit(row.perHouseholdMember, row.unit),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge label={row.isActive ? 'Active' : 'Inactive'} muted={!row.isActive} />
      ),
    },
  ];
  if (admin)
    columns.push({
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <Button
          variant="accent"
          onClick={() => {
            setError('');
            setEditing(row);
          }}
        >
          Edit {row.name}
        </Button>
      ),
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Item Types"
        description="The goods catalogue used by donations, assistance requests, and inventory."
        actions={
          admin ? (
            <Button
              onClick={() => {
                setError('');
                setEditing('new');
              }}
            >
              Add item type
            </Button>
          ) : undefined
        }
      />
      <label className="block max-w-md">
        Search item types
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </label>

      <AsyncBoundary
        data={query.data?.data.items ?? null}
        error={query.error}
        isPending={query.isPending}
        onRetry={query.refetch}
        loadingLabel="Loading item types…"
        isEmpty={(items) => items.length === 0}
        emptyTitle="No item types yet"
        emptyDescription="Add the goods this organisation distributes, such as food packs or drinking water."
      >
        {(items) => (
          <DataTable
            caption="Item type catalogue"
            columns={columns}
            rows={items}
            rowKey={(row) => row.id}
          />
        )}
      </AsyncBoundary>
      <nav aria-label="Item type pages" className="flex flex-wrap items-center gap-3">
        <Button
          variant="accent"
          disabled={page === 1 || query.isPending}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <span>Page {page}</span>
        <Button
          variant="accent"
          disabled={query.isPending || page * 25 >= (query.data?.data.total ?? 0)}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </nav>
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogTitle>{current ? 'Edit item type' : 'Add item type'}</DialogTitle>
        <DialogDescription>
          Blank request limits mean no cap. Inactive items retain their history.
        </DialogDescription>
        <form key={current?.id ?? 'new'} onSubmit={(e) => void save(e)} className="mt-4 space-y-3">
          <label className="block">
            Name
            <Input
              name="name"
              required
              minLength={2}
              maxLength={80}
              defaultValue={current?.name ?? ''}
            />
          </label>
          <label className="block">
            Category
            <select
              name="category"
              defaultValue={current?.category ?? 'FOOD'}
              className="rounded-md border border-input p-2"
            >
              {['FOOD', 'WATER', 'CLOTHING', 'HYGIENE', 'BEDDING', 'SCHOOL', 'OTHER'].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </label>
          <label className="block">
            Unit
            <Input name="unit" required maxLength={24} defaultValue={current?.unit ?? ''} />
          </label>
          <label className="block">
            Low stock threshold (blank uses system default)
            <Input
              name="lowStockThreshold"
              type="number"
              min={0}
              max={1000000}
              required={current !== null}
              defaultValue={current?.lowStockThreshold ?? ''}
            />
          </label>
          <label className="block">
            Maximum per request
            <Input
              name="maxPerRequest"
              type="number"
              min={1}
              max={1000000}
              defaultValue={current?.maxPerRequest ?? ''}
            />
          </label>
          <label className="block">
            Per household member
            <Input
              name="perHouseholdMember"
              type="number"
              min={1}
              max={1000000}
              defaultValue={current?.perHouseholdMember ?? ''}
            />
          </label>
          {current && (
            <label className="block">
              Status
              <select name="isActive" defaultValue={String(current.isActive)}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
          )}
          {error && <p role="alert">{error}</p>}
          <DialogFooter>
            <Button variant="accent" disabled={busy} onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save item type'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
