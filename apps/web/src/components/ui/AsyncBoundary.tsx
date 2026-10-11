import type { ReactNode } from 'react';

export interface AsyncBoundaryProps<T> {
  data: T | null;
  error: string | null;
  isPending: boolean;
  onRetry: () => void;
  children: (data: T) => ReactNode;
  isEmpty?: (data: T) => boolean;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
  loadingLabel?: string;
}

/**
 * The one loading / error / empty / success treatment every admin screen uses,
 * so no page grows its own spinner or message wording (design.md sections 21-23).
 */
export function AsyncBoundary<T>({
  data,
  error,
  isPending,
  onRetry,
  children,
  isEmpty,
  emptyTitle,
  emptyDescription,
  emptyAction,
  loadingLabel = 'Loading…',
}: AsyncBoundaryProps<T>) {
  if (isPending) {
    return (
      <p role="status" className="text-sm text-text-muted">
        {loadingLabel}
      </p>
    );
  }

  if (error !== null) {
    return (
      <div
        role="alert"
        className="rounded-md border border-border bg-surface px-6 py-10 text-center"
      >
        <p className="font-medium">Something went wrong</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center justify-center rounded-md border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-alt"
        >
          Try again
        </button>
      </div>
    );
  }

  if (data === null) return null;

  if (isEmpty !== undefined && isEmpty(data)) {
    return (
      <div className="rounded-md border border-border bg-surface px-6 py-12 text-center">
        <p className="font-medium">{emptyTitle}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">{emptyDescription}</p>
        {emptyAction === undefined ? null : (
          <div className="mt-4 flex justify-center">{emptyAction}</div>
        )}
      </div>
    );
  }

  return <>{children(data)}</>;
}
