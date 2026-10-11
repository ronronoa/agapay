import { Link } from 'react-router-dom';

export function ForbiddenPage() {
  return (
    <div className="mx-auto w-full max-w-md text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Access denied</h1>
      <p className="mt-2 text-sm text-text-muted">
        Your account does not have permission to view this page. Contact an administrator if you
        believe this is a mistake.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center justify-center rounded-md border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-alt"
      >
        Back to home
      </Link>
    </div>
  );
}
