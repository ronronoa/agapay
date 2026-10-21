import { useState, type FormEvent } from 'react';
import { settingsResponseSchema, updateSettingsSchema } from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { apiFetch } from '../../lib/api-client';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/input';

export function SettingsPage() {
  const query = useApiQuery(['settings'], '/api/v1/settings', settingsResponseSchema);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function save(event: FormEvent<HTMLFormElement>, revision: number) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = updateSettingsSchema.safeParse({
      revision,
      emailDailyLimit: Number(form.get('emailDailyLimit')),
      emailHourlyLimit: Number(form.get('emailHourlyLimit')),
      lowStockDefault: Number(form.get('lowStockDefault')),
      retentionMonths: Number(form.get('retentionMonths')),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check settings.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      settingsResponseSchema.parse(
        await apiFetch('/api/v1/settings', { method: 'PATCH', body: parsed.data }),
      );
      setNotice('Settings saved.');
      query.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Administrator controls for email budgets and operational defaults."
      />
      <p>
        Retention is a recorded policy only. Automatic anonymisation is not enabled. Credentials are
        configured outside this screen.
      </p>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error} Reload to review current values before retrying.</p>}
      <Button variant="accent" disabled={busy} onClick={() => void query.refetch()}>
        Reload settings
      </Button>
      <AsyncBoundary
        data={query.data?.data ?? null}
        error={query.error}
        isPending={query.isPending}
        onRetry={query.refetch}
        loadingLabel="Loading settings…"
        isEmpty={() => false}
        emptyTitle="Settings unavailable"
        emptyDescription="Retry loading settings."
      >
        {(settings) => (
          <form
            key={settings.revision}
            onSubmit={(e) => void save(e, settings.revision)}
            className="max-w-xl space-y-4 rounded-md border border-border bg-surface p-6"
          >
            <label className="block">
              Daily email limit
              <Input
                name="emailDailyLimit"
                type="number"
                required
                min={1}
                max={100000}
                defaultValue={settings.emailDailyLimit}
              />
            </label>
            <label className="block">
              Rolling hourly email limit
              <Input
                name="emailHourlyLimit"
                type="number"
                required
                min={1}
                max={100000}
                defaultValue={settings.emailHourlyLimit}
              />
            </label>
            <p className="text-sm text-text-muted">
              Existing critical-notification exceptions still apply. Provider limits remain in
              force.
            </p>
            <label className="block">
              Low stock default for new item types
              <Input
                name="lowStockDefault"
                type="number"
                required
                min={0}
                max={1000000}
                defaultValue={settings.lowStockDefault}
              />
            </label>
            <label className="block">
              Retention policy (months)
              <Input
                name="retentionMonths"
                type="number"
                required
                min={1}
                max={120}
                defaultValue={settings.retentionMonths}
              />
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save settings'}
            </Button>
          </form>
        )}
      </AsyncBoundary>
    </div>
  );
}
