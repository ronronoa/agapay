import { toast } from 'sonner';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSyncExternalStore } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  authUserResponseSchema,
  changePasswordSchema,
  updateProfileSchema,
  type ChangePasswordInput,
  type UpdateProfileInput,
} from '@agapay/shared';
import { ApiClientError, apiFetch } from '../../lib/api-client';
import { getUser, subscribe, setUser } from '../../lib/session';
import { PageHeader } from '../../components/layout/PageHeader';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

export function DonorSettingsPage() {
  const user = useSyncExternalStore(subscribe, getUser, getUser);
  const [showPassword, setShowPassword] = useState(false);

  const profileForm = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: user?.name ?? '', phone: user?.phone ?? undefined },
  });
  const passwordForm = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  function onProfileSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void profileForm.handleSubmit((values) =>
      apiFetch<unknown>('/api/v1/auth/me', {
        method: 'PATCH',
        body: { name: values.name, phone: values.phone ?? null },
      })
        .then((res) => {
          const parsed = authUserResponseSchema.safeParse(res);
          if (!parsed.success) throw new Error('Unexpected profile response.');
          setUser(parsed.data.data);
          toast.success('Profile saved.');
        })
        .catch((err: unknown) => {
          toast.error(
            err instanceof ApiClientError ? err.message : 'Saving failed. Please try again.',
          );
        }),
    )(event);
  }

  function onPasswordSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void passwordForm.handleSubmit((values) =>
      apiFetch('/api/v1/auth/change-password', { method: 'POST', body: values })
        .then(() => {
          passwordForm.reset();
          toast.success('Password changed.');
        })
        .catch((err: unknown) => {
          toast.error(
            err instanceof ApiClientError ? err.message : 'Saving failed. Please try again.',
          );
        }),
    )(event);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="View and manage your profile information." />

      <section
        aria-label="Account profile"
        className="rounded-lg border border-border bg-surface p-5 shadow-card"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h2 className="font-display text-base font-semibold">Account Profile</h2>
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary-subtle/20 text-xl font-semibold text-primary-subtle"
            >
              {user === null ? '' : initialsOf(user.name)}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Photo upload arrives in a later release"
                className="rounded-md border border-border-strong px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
              >
                Edit Photo (soon)
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={onProfileSubmit} noValidate className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field control={profileForm.control} name="name" label="Full Name">
            {(field) => (
              <Input
                id={field.id}
                autoComplete="name"
                value={typeof field.value === 'string' ? field.value : ''}
                onChange={(event) => field.onChange(event.target.value)}
                onBlur={field.onBlur}
                aria-invalid={field.invalid}
                aria-describedby={field.describedBy}
              />
            )}
          </Field>
          <div>
            <span className="block text-sm font-medium">Email Address</span>
            <p className="mt-1 rounded-md border border-border bg-surface-alt px-3 py-2 text-sm text-text-muted">
              {user?.email ?? '—'}
            </p>
          </div>
          <Field control={profileForm.control} name="phone" label="Contact Number">
            {(field) => (
              <Input
                id={field.id}
                type="tel"
                autoComplete="tel"
                value={typeof field.value === 'string' ? field.value : ''}
                onChange={(event) => field.onChange(event.target.value)}
                onBlur={field.onBlur}
                aria-invalid={field.invalid}
                aria-describedby={field.describedBy}
              />
            )}
          </Field>
          <div>
            <span className="block text-sm font-medium">Birthday</span>
            <p className="mt-1 rounded-md border border-border bg-surface-alt px-3 py-2 text-sm text-text-muted">
              Coming soon
            </p>
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={profileForm.formState.isSubmitting}
              className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60"
            >
              {profileForm.formState.isSubmitting ? 'Saving…' : 'Edit Profile'}
            </button>
          </div>
        </form>
      </section>

      <section
        aria-label="Account security"
        className="rounded-lg border border-border bg-surface p-5 shadow-card"
      >
        <h2 className="font-display text-base font-semibold">Account Security</h2>
        <p className="text-sm text-text-muted">Keep your account safe and secure.</p>
        <form onSubmit={onPasswordSubmit} noValidate className="mt-4 max-w-sm space-y-4">
          <Field control={passwordForm.control} name="currentPassword" label="Current password">
            {(field) => (
              <Input
                id={field.id}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={typeof field.value === 'string' ? field.value : ''}
                onChange={(event) => field.onChange(event.target.value)}
                onBlur={field.onBlur}
                aria-invalid={field.invalid}
                aria-describedby={field.describedBy}
              />
            )}
          </Field>
          <Field control={passwordForm.control} name="newPassword" label="New password">
            {(field) => (
              <div className="flex gap-2">
                <Input
                  id={field.id}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={typeof field.value === 'string' ? field.value : ''}
                  onChange={(event) => field.onChange(event.target.value)}
                  onBlur={field.onBlur}
                  aria-invalid={field.invalid}
                  aria-describedby={field.describedBy}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                  className="rounded-md border border-border-strong px-3 py-2 text-sm font-medium"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            )}
          </Field>
          <button
            type="submit"
            disabled={passwordForm.formState.isSubmitting}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60"
          >
            {passwordForm.formState.isSubmitting ? 'Saving…' : 'Change Password'}
          </button>
        </form>
      </section>
    </div>
  );
}
