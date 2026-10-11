import { itemTypeListResponseSchema, type ItemTypeDto } from '@agapay/shared';
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
  const query = useApiQuery(
    ['itemTypes'],
    '/api/v1/item-types?pageSize=100',
    itemTypeListResponseSchema,
  );

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Item Types"
        description="The goods catalogue used by donations, assistance requests, and inventory."
      />

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
    </div>
  );
}
