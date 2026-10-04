import { Link } from 'react-router-dom';

// So navigation links resolve to an honest explanation instead of a dead 404
// (hard rule 11). TODO(owner): delete this file once the real page lands.
export function NotImplementedPage({ title }: { title: string }) {
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-text-muted">
        This page is planned but not built yet. Nothing here is interactive yet, and no part of it
        saves data.
      </p>
      <Link
        to="/"
        className="inline-block text-sm font-medium text-primary underline underline-offset-4"
      >
        Back to home
      </Link>
    </div>
  );
}
