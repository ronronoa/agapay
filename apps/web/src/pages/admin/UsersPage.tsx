import { toast } from 'sonner';
import { useRef, useState, type FormEvent } from 'react';
import { BadgeCheck, Mail } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  adminUserResponseSchema,
  createUserResponseSchema,
  personnelInvitationResponseSchema,
  type PersonnelInvitation,
  createUserSchema,
  updateUserSchema,
  userListResponseSchema,
  manualEmailVerificationSchema,
  type UserListResponse,
} from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { apiFetch } from '../../lib/api-client';
import { resendVerification } from '../../lib/auth-api';
import { getUser } from '../../lib/session';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { PersonnelInvitationDialog } from './PersonnelInvitationDialog';
import { FieldGroup, FieldLayout } from '../../components/ui/field';
import { Label } from '../../components/ui/label';
import { NativeSelect } from '../../components/ui/native-select';

type AdminUser = UserListResponse['data']['items'][number];
const selectClass = 'rounded-md border border-input bg-surface px-3 py-2 text-sm';

export function UsersPage() {
  const client = useQueryClient();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState<AdminUser | null>(null);
  const [verificationMethod, setVerificationMethod] = useState('');
  const verificationInFlight = useRef(false);
  const [error, setError] = useState('');
  const [invitation, setInvitation] = useState<{
    details: PersonnelInvitation;
    recipient: string;
  } | null>(null);
  const params = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (q.trim()) params.set('q', q.trim());
  if (role) params.set('role', role);
  if (active) params.set('isActive', active);
  const query = useApiQuery(
    ['users', params.toString()],
    `/api/v1/users?${params}`,
    userListResponseSchema,
  );
  const current = editing === 'new' ? null : editing;
  const superAdmin = getUser()?.role === 'SUPER_ADMIN';
  const canVerify = superAdmin || getUser()?.role === 'ADMIN';
  const self = current !== null && current.id === getUser()?.id;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get('name'),
      role: self ? current?.role : form.get('role'),
      phone: form.get('phone') || (current ? null : undefined),
      ...(current
        ? { isActive: self ? current.isActive : form.get('isActive') === 'true' }
        : { email: form.get('email') }),
    };
    const parsed = current
      ? updateUserSchema.safeParse(payload)
      : createUserSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(current ? `/api/v1/users/${current.id}` : '/api/v1/users', {
        method: current ? 'PATCH' : 'POST',
        body: parsed.data,
      });
      if (current) adminUserResponseSchema.parse(response);
      else {
        const created = createUserResponseSchema.parse(response);
        setInvitation({ details: created.invitation, recipient: created.data.email });
      }
      toast.success(
        current ? 'Account updated.' : 'Account created. A set-password invitation is queued.',
      );
      setEditing(null);
      await client.invalidateQueries({ queryKey: ['users'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save account.');
    } finally {
      setBusy(false);
    }
  }

  async function resend(user: AdminUser) {
    setBusy(true);
    setError('');
    try {
      const response = personnelInvitationResponseSchema.parse(
        await apiFetch(`/api/v1/users/${user.id}/invitation`, { method: 'POST' }),
      );
      setInvitation({ details: response.data, recipient: user.email });
      toast.success('A new invitation is queued. Earlier invitation links no longer work.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not resend invitation.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmail() {
    if (!verifying || verificationInFlight.current) return;
    const input = manualEmailVerificationSchema.safeParse({ method: verificationMethod });
    if (!input.success) return;
    verificationInFlight.current = true;
    setBusy(true);
    try {
      adminUserResponseSchema.parse(
        await apiFetch(`/api/v1/users/${verifying.id}/verify-email`, {
          method: 'POST',
          body: input.data,
        }),
      );
      setVerifying(null);
      toast.success('Donor email verified.');
      await client.invalidateQueries({ queryKey: ['users'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not verify donor email.');
    } finally {
      verificationInFlight.current = false;
      setBusy(false);
    }
  }

  async function resendDonorVerification(user: AdminUser) {
    if (verificationInFlight.current) return;
    verificationInFlight.current = true;
    setBusy(true);
    try {
      await resendVerification(user.email);
      toast.success('If the account still needs verification, a new email is queued.');
    } catch {
      toast.error(
        'Could not request another verification email. Wait and try again, or review Email operations.',
      );
    } finally {
      verificationInFlight.current = false;
      setBusy(false);
    }
  }

  const columns: Column<AdminUser>[] = [
    { key: 'name', header: 'Name', render: (row) => row.name },
    { key: 'email', header: 'Email', render: (row) => row.email },
    { key: 'role', header: 'Role', render: (row) => row.role },
    {
      key: 'emailVerified',
      header: 'Email verification',
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge
            label={row.emailVerified ? 'Verified' : 'Unverified'}
            muted={!row.emailVerified}
          />
          {row.emailVerified && (
            <span className="text-xs text-text-muted">
              {row.verificationSource === 'ADMIN'
                ? 'Confirmed by administrator'
                : row.verificationSource === 'EMAIL_LINK'
                  ? 'Confirmed by email link'
                  : row.verificationSource === 'PERSONNEL_LINK'
                    ? 'Confirmed by personnel link'
                    : 'Verification source unavailable'}
              {row.verificationMethod &&
                ` · ${row.verificationMethod === 'IN_PERSON' ? 'In person' : row.verificationMethod === 'PHONE_CALL' ? 'Phone call' : 'Trusted channel'}`}
              {row.emailVerifiedAt && (
                <time className="block" dateTime={row.emailVerifiedAt}>
                  {new Date(row.emailVerifiedAt).toLocaleString('en-PH', {
                    timeZone: 'Asia/Manila',
                  })}
                </time>
              )}
            </span>
          )}
        </div>
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
      key: 'lastLogin',
      header: 'Last sign-in',
      render: (row) =>
        row.lastLoginAt
          ? new Date(row.lastLoginAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
          : 'Never',
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {canVerify && row.role === 'DONOR' && row.isActive && !row.emailVerified && (
            <>
              <Button
                variant="accent"
                disabled={busy}
                onClick={() => void resendDonorVerification(row)}
              >
                <Mail data-icon="inline-start" />
                Resend verification
              </Button>
              <Button
                variant="accent"
                disabled={busy}
                onClick={() => {
                  setVerificationMethod('');
                  setVerifying(row);
                }}
              >
                <BadgeCheck data-icon="inline-start" />
                Verify email
              </Button>
            </>
          )}
          <Button
            variant="accent"
            disabled={busy || (row.role === 'SUPER_ADMIN' && !superAdmin)}
            onClick={() => {
              setError('');
              setEditing(row);
            }}
          >
            Edit {row.name}
          </Button>
          {(row.role !== 'SUPER_ADMIN' || superAdmin) &&
            row.role !== 'DONOR' &&
            row.isActive &&
            row.lastLoginAt === null && (
              <Button disabled={busy} variant="accent" onClick={() => void resend(row)}>
                Regenerate invitation
              </Button>
            )}
        </div>
      ),
    },
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Only administrators manage personnel. Donors register through the public form."
        actions={
          <Button
            disabled={busy}
            onClick={() => {
              setError('');
              setEditing('new');
            }}
          >
            Add personnel
          </Button>
        }
      />
      {error && editing === null && <p role="alert">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <label>
          Search users
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Role
          <select
            className={selectClass}
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            {['SUPER_ADMIN', 'ADMIN', 'STAFF', 'DONOR'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            className={selectClass}
            value={active}
            onChange={(e) => {
              setActive(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Disabled</option>
          </select>
        </label>
      </div>
      <AsyncBoundary
        data={query.data?.data.items ?? null}
        error={query.error}
        isPending={query.isPending}
        onRetry={query.refetch}
        loadingLabel="Loading users…"
        isEmpty={(rows) => rows.length === 0}
        emptyTitle="No users found"
        emptyDescription="Adjust the filters or add personnel."
      >
        {(rows) => (
          <DataTable
            caption="User accounts"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
          />
        )}
      </AsyncBoundary>
      <nav aria-label="User pages" className="flex items-center gap-3">
        <Button
          variant="accent"
          disabled={page === 1 || query.isPending}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <span>
          Page {page} · {query.data?.data.total ?? 0} users
        </span>
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
        <DialogTitle>{current ? 'Edit account' : 'Add personnel'}</DialogTitle>
        <DialogDescription>
          {current
            ? 'Role and access changes take effect on the next request. Review the status before saving; disabling preserves recorded work.'
            : 'The recipient receives an expiring link to choose their own password.'}
        </DialogDescription>
        <form key={current?.id ?? 'new'} onSubmit={(e) => void save(e)} className="mt-4 space-y-4">
          <label className="block">
            Name
            <Input
              name="name"
              required
              minLength={2}
              maxLength={120}
              defaultValue={current?.name ?? ''}
            />
          </label>
          {!current && (
            <label className="block">
              Email
              <Input name="email" type="email" required />
            </label>
          )}
          <label className="block">
            Phone (optional)
            <Input name="phone" pattern="09[0-9]{9}" defaultValue={current?.phone ?? ''} />
          </label>
          <label className="block">
            Role
            <select
              name="role"
              className={selectClass}
              defaultValue={current?.role ?? 'STAFF'}
              disabled={self}
            >
              {current?.role === 'DONOR' && <option>DONOR</option>}
              <option>STAFF</option>
              <option>ADMIN</option>
              {superAdmin && <option value="SUPER_ADMIN">Super Admin</option>}
            </select>
          </label>
          {current && (
            <label className="block">
              Status
              <select
                name="isActive"
                className={selectClass}
                defaultValue={String(current.isActive)}
                disabled={self}
              >
                <option value="true">Active</option>
                <option value="false">Disabled</option>
              </select>
            </label>
          )}
          {error && <p role="alert">{error}</p>}
          <DialogFooter>
            <Button variant="accent" disabled={busy} onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : current ? 'Save changes' : 'Send invitation'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
      <Dialog
        open={verifying !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setVerifying(null);
        }}
      >
        <DialogTitle>Verify donor email?</DialogTitle>
        <DialogDescription>
          Confirm you have checked that {verifying?.email ?? 'this address'} belongs to this donor
          through another trusted channel. Administrator confirmation allows donation submission; it
          does not prove email delivery.
        </DialogDescription>
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void verifyEmail();
          }}
        >
          <FieldGroup>
            <p className="text-sm text-text-muted">
              First check the address with the donor, ask them to check Spam, and try Resend
              verification.{' '}
              <a className="text-primary underline" href="/admin/emails">
                Review Email operations
              </a>{' '}
              for failed messages, retries, and sending limits. Use manual confirmation only after
              independently checking ownership.
            </p>
            <FieldLayout>
              <Label htmlFor="verification-method">How was ownership checked?</Label>
              <NativeSelect
                id="verification-method"
                required
                value={verificationMethod}
                disabled={busy}
                onChange={(event) => setVerificationMethod(event.target.value)}
              >
                <option value="">Choose a method</option>
                <option value="IN_PERSON">In person with the donor</option>
                <option value="PHONE_CALL">Phone call with the donor</option>
                <option value="TRUSTED_CHANNEL">Another trusted channel</option>
              </NativeSelect>
              <p className="text-xs text-text-muted">
                Record only the method. Do not upload identity documents or private evidence.
              </p>
            </FieldLayout>
          </FieldGroup>
          <DialogFooter>
            <Button variant="accent" disabled={busy} onClick={() => setVerifying(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !verificationMethod}>
              {busy ? 'Verifying…' : 'Verify email'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
      {invitation && (
        <PersonnelInvitationDialog
          invitation={invitation.details}
          recipient={invitation.recipient}
          onClose={() => setInvitation(null)}
        />
      )}
    </div>
  );
}
