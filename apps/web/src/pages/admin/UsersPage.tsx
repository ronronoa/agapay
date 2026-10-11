import { userListResponseSchema } from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt: string | null;
};

function formatDateTime(iso: string | null): string {
  if (iso === null) return 'Never';
  return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

export function UsersPage() {
  const query = useApiQuery(['users'], '/api/v1/users?pageSize=100', userListResponseSchema);

  const columns: Column<AdminUser>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    { key: 'email', header: 'Email', render: (row) => row.email },
    { key: 'phone', header: 'Phone', render: (row) => row.phone ?? '—' },
    {
      key: 'role',
      header: 'Role',
      render: (row) => (
        <span className="inline-flex items-center rounded-full border border-border-strong px-2 py-0.5 text-xs font-medium">
          {row.role.charAt(0) + row.role.slice(1).toLowerCase()}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge label={row.isActive ? 'Active' : 'Disabled'} muted={!row.isActive} />
      ),
    },
    {
      key: 'verified',
      header: 'Email',
      render: (row) => (row.emailVerified ? 'Verified' : 'Not verified'),
    },
    { key: 'lastLogin', header: 'Last sign-in', render: (row) => formatDateTime(row.lastLoginAt) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Staff and administrator accounts. Donor accounts are created during registration."
      />

      <AsyncBoundary
        data={(query.data?.data.items as AdminUser[] | undefined) ?? null}
        error={query.error}
        isPending={query.isPending}
        onRetry={query.refetch}
        loadingLabel="Loading users…"
        isEmpty={(items) => items.length === 0}
        emptyTitle="No users yet"
        emptyDescription="Create a staff or administrator account to give someone access to this system."
      >
        {(items) => (
          <DataTable
            caption="User accounts"
            columns={columns}
            rows={items}
            rowKey={(row) => row.id}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}
