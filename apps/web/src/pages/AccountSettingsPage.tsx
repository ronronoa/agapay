import { useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  authUserResponseSchema,
  changePasswordSchema,
  updateProfileSchema,
  type UpdateProfileInput,
} from '@agapay/shared';
import { ApiClientError, apiFetch } from '../lib/api-client';
import { clearSession, getUser, setUser, subscribe } from '../lib/session';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Field, FieldGroup } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

const passwordFormSchema = changePasswordSchema
  .extend({ confirmPassword: z.string() })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });
type PasswordFormInput = z.infer<typeof passwordFormSchema>;

export function AccountSettingsPage() {
  const user = useSyncExternalStore(subscribe, getUser, getUser);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showPasswords, setShowPasswords] = useState(false);
  const profile = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: user?.name ?? '', phone: user?.phone ?? undefined },
  });
  const password = useForm<PasswordFormInput>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  async function saveProfile(values: UpdateProfileInput) {
    try {
      const response = authUserResponseSchema.parse(
        await apiFetch('/api/v1/auth/me', { method: 'PATCH', body: values }),
      );
      setUser(response.data);
      profile.reset({ name: response.data.name, phone: response.data.phone ?? undefined });
      toast.success('Profile saved.');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save your profile.');
    }
  }

  async function savePassword(values: PasswordFormInput) {
    try {
      await apiFetch('/api/v1/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        body: { currentPassword: values.currentPassword, newPassword: values.newPassword },
      });
      password.reset();
      clearSession();
      queryClient.clear();
      toast.success('Password changed. Sign in with your new password.');
      void navigate('/login', { replace: true });
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not change your password.',
      );
    }
  }

  const busy = profile.formState.isSubmitting || password.formState.isSubmitting;
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader title="Profile settings" description="Manage your own profile and password." />
      <Card aria-label="Account profile">
        <CardHeader>
          <CardTitle>Account profile</CardTitle>
          <CardDescription>Your email address and role are managed separately.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void profile.handleSubmit(saveProfile)(event)} noValidate>
            <fieldset disabled={busy} className="min-w-0">
              <FieldGroup>
                <Field control={profile.control} name="name" label="Full Name">
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
                <Field
                  control={profile.control}
                  name="phone"
                  label="Contact Number"
                  hint="Optional. Use an 11-digit Philippine mobile number."
                >
                  {(field) => (
                    <Input
                      id={field.id}
                      type="tel"
                      autoComplete="tel"
                      value={typeof field.value === 'string' ? field.value : ''}
                      onChange={(event) => field.onChange(event.target.value || undefined)}
                      onBlur={field.onBlur}
                      aria-invalid={field.invalid}
                      aria-describedby={field.describedBy}
                    />
                  )}
                </Field>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="account-email">Email address</Label>
                  <Input id="account-email" type="email" value={user?.email ?? ''} readOnly />
                </div>
                <Button
                  type="submit"
                  className="self-start"
                  aria-busy={profile.formState.isSubmitting}
                >
                  {profile.formState.isSubmitting ? 'Saving…' : 'Save profile'}
                </Button>
              </FieldGroup>
            </fieldset>
          </form>
        </CardContent>
      </Card>
      <Card aria-label="Account security">
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Use at least 10 characters. After saving, sign in again with your new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void password.handleSubmit(savePassword)(event)} noValidate>
            <fieldset disabled={busy} className="min-w-0">
              <FieldGroup>
                {(
                  [
                    ['currentPassword', 'Current password', 'current-password'],
                    ['newPassword', 'New password', 'new-password'],
                    ['confirmPassword', 'Confirm new password', 'new-password'],
                  ] as const
                ).map(([name, label, autoComplete]) => (
                  <Field key={name} control={password.control} name={name} label={label}>
                    {(field) => (
                      <Input
                        id={field.id}
                        type={showPasswords ? 'text' : 'password'}
                        autoComplete={autoComplete}
                        value={typeof field.value === 'string' ? field.value : ''}
                        onChange={(event) => field.onChange(event.target.value)}
                        onBlur={field.onBlur}
                        aria-invalid={field.invalid}
                        aria-describedby={field.describedBy}
                      />
                    )}
                  </Field>
                ))}
                <Button
                  variant="outline"
                  className="self-start"
                  aria-pressed={showPasswords}
                  onClick={() => setShowPasswords(!showPasswords)}
                >
                  {showPasswords ? 'Hide passwords' : 'Show passwords'}
                </Button>
                <Button
                  type="submit"
                  className="self-start"
                  aria-busy={password.formState.isSubmitting}
                >
                  {password.formState.isSubmitting ? 'Saving…' : 'Change Password'}
                </Button>
              </FieldGroup>
            </fieldset>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
