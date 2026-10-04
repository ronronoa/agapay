import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-text-muted">
        That address does not match anything on this site. It may have moved, or the link may be
        incomplete.
      </p>
      <div className="flex flex-wrap gap-4">
        <Link to="/" className="text-sm font-medium text-primary underline underline-offset-4">
          Home
        </Link>
        <Link to="/track" className="text-sm font-medium text-primary underline underline-offset-4">
          Track assistance
        </Link>
        <Link
          to="/request-assistance"
          className="text-sm font-medium text-primary underline underline-offset-4"
        >
          Request assistance
        </Link>
      </div>
    </div>
  );
}
