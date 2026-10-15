import { useState, useSyncExternalStore } from 'react';
import {
  campaignListResponseSchema,
  inventoryListResponseSchema,
  inventoryMovementListResponseSchema,
  itemTypeListResponseSchema,
  type InventoryDto,
} from '@agapay/shared';
import { ApiClientError, apiFetch } from '../../lib/api-client';
import { getUser, subscribe } from '../../lib/session';
import { useApiQuery } from '../../lib/use-api-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/Button';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

const PAGE_SIZE = 20;
const MOVEMENT_PAGE_SIZE = 10;

interface SupplyDraft {
  direction: 'IN' | 'OUT';
  rowId: string | null;
  itemTypeId: string;
  campaignId: string;
  quantity: string;
  reason: string;
}

interface TransferDraft {
  itemTypeId: string;
  fromCampaignId: string;
  toCampaignId: string;
  quantity: string;
  reason: string;
}

const MOVEMENT_LABEL: Record<string, string> = {
  DONATION_IN: 'Donation received',
  RESERVE: 'Reserved',
  RELEASE: 'Released',
  DISTRIBUTE: 'Distributed',
  ADJUSTMENT_IN: 'Adjustment in',
  ADJUSTMENT_OUT: 'Adjustment out',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

function buildQuery(
  campaignId: string,
  itemTypeId: string,
  lowStock: boolean,
  page: number,
): string {
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (campaignId !== '') params.set('campaignId', campaignId);
  if (itemTypeId !== '') params.set('itemTypeId', itemTypeId);
  // z.coerce.boolean() treats every non-empty string as true, so only send the flag when on.
  if (lowStock) params.set('lowStock', 'true');
  return `/api/v1/inventory?${params.toString()}`;
}

function actionFailureMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Action failed. Please try again.';
}

export function InventoryPage() {
  const user = useSyncExternalStore(subscribe, getUser, getUser);
  const isAdmin = user?.role === 'ADMIN';
  const [campaignId, setCampaignId] = useState('');
  const [itemTypeId, setItemTypeId] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const [movementsId, setMovementsId] = useState<string | null>(null);
  const [movementPage, setMovementPage] = useState(1);
  const [supply, setSupply] = useState<SupplyDraft | null>(null);
  const [transfer, setTransfer] = useState<TransferDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const query = useApiQuery(
    ['admin-inventory', campaignId, itemTypeId, lowStock, page],
    buildQuery(campaignId, itemTypeId, lowStock, page),
    inventoryListResponseSchema,
  );
  const campaignsQuery = useApiQuery(
    ['admin-inventory-campaigns'],
    '/api/v1/campaigns?pageSize=100',
    campaignListResponseSchema,
  );
  const itemTypesQuery = useApiQuery(
    ['admin-inventory-item-types'],
    '/api/v1/item-types?pageSize=100',
    itemTypeListResponseSchema,
  );
  const movementsQuery = useApiQuery(
    ['admin-inventory-movements', movementsId, movementPage],
    `/api/v1/inventory/${encodeURIComponent(movementsId ?? '')}/movements?page=${movementPage}&pageSize=${MOVEMENT_PAGE_SIZE}`,
    inventoryMovementListResponseSchema,
    { enabled: movementsId !== null },
  );

  const items = query.data?.data.items ?? [];
  const movementRow = items.find((row) => row.id === movementsId) ?? null;
  const movements = movementsQuery.data?.data.items ?? [];
  const movementTotal = movementsQuery.data?.data.total ?? 0;
  const movementPages = Math.max(1, Math.ceil(movementTotal / MOVEMENT_PAGE_SIZE));
  const total = query.data?.data.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const campaignOptions = campaignsQuery.data?.data.items ?? [];
  const itemTypeOptions = itemTypesQuery.data?.data.items ?? [];

  function resetPage(): void {
    setPage(1);
  }

  function openMovements(row: InventoryDto): void {
    setMovementsId(row.id);
    setMovementPage(1);
    setActionError(null);
  }

  function openSupply(direction: 'IN' | 'OUT', row: InventoryDto | null): void {
    setFormError(null);
    setActionError(null);
    setSupply({
      direction,
      rowId: row?.id ?? null,
      itemTypeId: row?.itemTypeId ?? '',
      campaignId: row?.campaignId ?? '',
      quantity: '',
      reason: '',
    });
  }

  function openTransfer(row: InventoryDto | null): void {
    if (!isAdmin) return;
    setFormError(null);
    setActionError(null);
    setTransfer({
      itemTypeId: row?.itemTypeId ?? '',
      fromCampaignId: row?.campaignId ?? '',
      toCampaignId: '',
      quantity: '',
      reason: '',
    });
  }

  function submitSupply(): void {
    if (supply === null) return;
    const quantity = Number(supply.quantity);
    if (supply.itemTypeId === '' || supply.campaignId === '') {
      setFormError('Select both the goods and the campaign.');
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setFormError('Enter a whole quantity of one or more.');
      return;
    }
    if (supply.reason.trim().length === 0) {
      setFormError('Enter the reason for this stock change. Adjustments require a reason.');
      return;
    }
    const targetRowId = supply.rowId;
    setActionError(null);
    void apiFetch('/api/v1/inventory/adjustments', {
      method: 'POST',
      body: {
        itemTypeId: supply.itemTypeId,
        campaignId: supply.campaignId,
        direction: supply.direction,
        quantity,
        reason: supply.reason.trim(),
      },
    })
      .then(() => {
        setMessage(supply.direction === 'IN' ? 'Stock added.' : 'Stock corrected.');
        setSupply(null);
        query.refetch();
        if (targetRowId !== null && targetRowId === movementsId) movementsQuery.refetch();
      })
      .catch((err: unknown) => {
        setActionError(actionFailureMessage(err));
      });
  }

  function submitTransfer(): void {
    if (transfer === null) return;
    const quantity = Number(transfer.quantity);
    if (transfer.itemTypeId === '') {
      setFormError('Select the goods to transfer.');
      return;
    }
    if (transfer.fromCampaignId === '' || transfer.toCampaignId === '') {
      setFormError('Select both the source and destination campaigns.');
      return;
    }
    if (transfer.fromCampaignId === transfer.toCampaignId) {
      setFormError('Source and destination campaigns must differ.');
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setFormError('Enter a whole quantity of one or more.');
      return;
    }
    if (transfer.reason.trim().length === 0) {
      setFormError('Enter the reason for this transfer.');
      return;
    }
    const affectedIds = items
      .filter(
        (row) =>
          row.itemTypeId === transfer.itemTypeId &&
          (row.campaignId === transfer.fromCampaignId || row.campaignId === transfer.toCampaignId),
      )
      .map((row) => row.id);
    setActionError(null);
    void apiFetch('/api/v1/inventory/transfer', {
      method: 'POST',
      body: {
        itemTypeId: transfer.itemTypeId,
        fromCampaignId: transfer.fromCampaignId,
        toCampaignId: transfer.toCampaignId,
        quantity,
        reason: transfer.reason.trim(),
      },
    })
      .then(() => {
        setMessage('Stock transferred.');
        setTransfer(null);
        query.refetch();
        if (movementsId !== null && affectedIds.includes(movementsId)) movementsQuery.refetch();
      })
      .catch((err: unknown) => {
        setActionError(actionFailureMessage(err));
      });
  }

  const columns: Column<InventoryDto>[] = [
    {
      key: 'item',
      header: 'Goods',
      render: (row) => <span className="font-medium">{row.itemTypeName}</span>,
    },
    { key: 'campaign', header: 'Campaign', render: (row) => row.campaignName },
    { key: 'available', header: 'Available', render: (row) => String(row.available) },
    { key: 'reserved', header: 'Reserved', render: (row) => String(row.reserved) },
    { key: 'distributed', header: 'Distributed', render: (row) => String(row.distributed) },
    { key: 'total', header: 'Total', render: (row) => String(row.total) },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge label={row.lowStock ? 'Low stock' : 'In stock'} muted={!row.lowStock} />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openMovements(row)}
            className="font-medium text-primary underline underline-offset-4"
          >
            Movements
          </button>
          <button
            type="button"
            onClick={() => openSupply('IN', row)}
            className="font-medium text-primary underline underline-offset-4"
          >
            Restock
          </button>
          <button
            type="button"
            onClick={() => openSupply('OUT', row)}
            className="font-medium text-primary underline underline-offset-4"
          >
            Correct
          </button>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => openTransfer(row)}
              className="font-medium text-primary underline underline-offset-4"
            >
              Transfer
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Track stock by goods and campaign, review every movement, adjust quantities with a reason, or transfer stock between campaigns."
        actions={
          <Button type="button" onClick={() => openSupply('IN', null)}>
            Add supply
          </Button>
        }
      />

      {message === null ? null : (
        <p role="status" className="text-sm font-medium">
          {message}
        </p>
      )}

      <form
        aria-label="Inventory filters"
        className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => event.preventDefault()}
      >
        <div>
          <Label htmlFor="inventory-campaign">Campaign</Label>
          <select
            id="inventory-campaign"
            value={campaignId}
            onChange={(event) => {
              setCampaignId(event.target.value);
              resetPage();
            }}
            className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
          >
            <option value="">All campaigns</option>
            {campaignOptions.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="inventory-item">Goods</Label>
          <select
            id="inventory-item"
            value={itemTypeId}
            onChange={(event) => {
              setItemTypeId(event.target.value);
              resetPage();
            }}
            className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
          >
            <option value="">All goods</option>
            {itemTypeOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2 pb-1">
          <input
            id="inventory-low-stock"
            type="checkbox"
            checked={lowStock}
            onChange={(event) => {
              setLowStock(event.target.checked);
              resetPage();
            }}
            className="h-4 w-4"
          />
          <Label htmlFor="inventory-low-stock">Low stock only</Label>
        </div>
      </form>

      <AsyncBoundary
        data={items}
        error={query.error}
        isPending={query.isPending}
        onRetry={query.refetch}
        loadingLabel="Loading inventory…"
        isEmpty={(rows) => rows.length === 0}
        emptyTitle="No stock rows match"
        emptyDescription="Adjust the filters or add supply for the selected goods and campaign."
      >
        {(rows) => (
          <div>
            <DataTable
              caption="Inventory by goods and campaign"
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-text-muted">
                Showing {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, total)} of {total} rows
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="rounded-md border border-border-strong px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Previous
                </button>
                <span className="text-sm text-text-muted">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="rounded-md border border-border-strong px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </AsyncBoundary>

      <Dialog
        open={movementsId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMovementsId(null);
            setActionError(null);
          }
        }}
      >
        <DialogTitle>
          {movementRow === null
            ? 'Stock movements'
            : `${movementRow.itemTypeName} · ${movementRow.campaignName}`}
        </DialogTitle>
        <DialogDescription>
          Every stock change keeps a movement row with its balances afterward.
        </DialogDescription>
        {actionError === null ? null : (
          <p role="alert" className="mt-3 text-sm font-medium">
            {actionError}
          </p>
        )}
        {movementsQuery.isPending ? (
          <p role="status" className="mt-3 text-sm text-text-muted">
            Loading movements…
          </p>
        ) : movementsQuery.error !== null ? (
          <div className="mt-3 text-sm">
            <p role="alert">{movementsQuery.error}</p>
            <Button
              type="button"
              variant="accent"
              className="mt-2"
              onClick={movementsQuery.refetch}
            >
              Retry movements
            </Button>
          </div>
        ) : movements.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">
            No movements recorded for this stock row yet.
          </p>
        ) : (
          <div className="mt-3">
            <ul className="space-y-2 text-sm">
              {movements.map((movement) => (
                <li
                  key={movement.id}
                  className="flex justify-between gap-2 border-b border-border pb-2 last:border-b-0"
                >
                  <span className="font-medium">
                    {MOVEMENT_LABEL[movement.type] ?? movement.type}
                  </span>
                  <span className="text-text-muted">
                    {movement.quantity} · available {movement.availableAfter} ·{' '}
                    {formatDateTime(movement.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between gap-2 text-sm">
              <Button
                type="button"
                variant="accent"
                disabled={movementPage <= 1}
                onClick={() => setMovementPage(movementPage - 1)}
              >
                Previous
              </Button>
              <span className="text-text-muted">
                Page {movementPage} of {movementPages}
              </span>
              <Button
                type="button"
                variant="accent"
                disabled={movementPage >= movementPages}
                onClick={() => setMovementPage(movementPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={supply !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSupply(null);
            setFormError(null);
            setActionError(null);
          }
        }}
      >
        <DialogTitle>{supply?.direction === 'OUT' ? 'Correct stock' : 'Add supply'}</DialogTitle>
        <DialogDescription>
          {supply?.direction === 'OUT'
            ? 'Reduce available stock for a correction. There must be enough available stock.'
            : 'Increase available stock. An adjustment row can create the stock row for a new goods-and-campaign pair.'}
        </DialogDescription>
        {actionError === null ? null : (
          <p role="alert" className="mt-3 text-sm font-medium">
            {actionError}
          </p>
        )}
        {formError === null ? null : (
          <p role="alert" className="mt-3 text-sm font-medium">
            {formError}
          </p>
        )}
        {supply === null ? null : (
          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="supply-item">Goods</Label>
              <select
                id="supply-item"
                value={supply.itemTypeId}
                onChange={(event) => setSupply({ ...supply, itemTypeId: event.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              >
                <option value="">Select goods</option>
                {itemTypeOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="supply-campaign">Campaign</Label>
              <select
                id="supply-campaign"
                value={supply.campaignId}
                onChange={(event) => setSupply({ ...supply, campaignId: event.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              >
                <option value="">Select campaign</option>
                {campaignOptions.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="supply-quantity">Quantity</Label>
              <Input
                id="supply-quantity"
                type="number"
                min={1}
                step={1}
                value={supply.quantity}
                onChange={(event) => setSupply({ ...supply, quantity: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="supply-reason">Reason</Label>
              <textarea
                id="supply-reason"
                rows={3}
                value={supply.reason}
                onChange={(event) => setSupply({ ...supply, reason: event.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="accent">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="button" onClick={submitSupply}>
                {supply.direction === 'OUT' ? 'Confirm correction' : 'Confirm supply'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </Dialog>

      <Dialog
        open={transfer !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTransfer(null);
            setFormError(null);
            setActionError(null);
          }
        }}
      >
        <DialogTitle>Transfer stock</DialogTitle>
        <DialogDescription>
          Transfers are ADMIN-only and write paired out/in movement rows.
        </DialogDescription>
        {actionError === null ? null : (
          <p role="alert" className="mt-3 text-sm font-medium">
            {actionError}
          </p>
        )}
        {formError === null ? null : (
          <p role="alert" className="mt-3 text-sm font-medium">
            {formError}
          </p>
        )}
        {transfer === null ? null : (
          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="transfer-item">Goods</Label>
              <select
                id="transfer-item"
                value={transfer.itemTypeId}
                onChange={(event) => setTransfer({ ...transfer, itemTypeId: event.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              >
                <option value="">Select goods</option>
                {itemTypeOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="transfer-from">From campaign</Label>
                <select
                  id="transfer-from"
                  value={transfer.fromCampaignId}
                  onChange={(event) =>
                    setTransfer({ ...transfer, fromCampaignId: event.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
                >
                  <option value="">Select source</option>
                  {campaignOptions.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="transfer-to">To campaign</Label>
                <select
                  id="transfer-to"
                  value={transfer.toCampaignId}
                  onChange={(event) =>
                    setTransfer({ ...transfer, toCampaignId: event.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
                >
                  <option value="">Select destination</option>
                  {campaignOptions.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label htmlFor="transfer-quantity">Quantity</Label>
              <Input
                id="transfer-quantity"
                type="number"
                min={1}
                step={1}
                value={transfer.quantity}
                onChange={(event) => setTransfer({ ...transfer, quantity: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="transfer-reason">Reason</Label>
              <textarea
                id="transfer-reason"
                rows={3}
                value={transfer.reason}
                onChange={(event) => setTransfer({ ...transfer, reason: event.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="accent">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="button" onClick={submitTransfer}>
                Confirm transfer
              </Button>
            </DialogFooter>
          </div>
        )}
      </Dialog>
    </div>
  );
}
