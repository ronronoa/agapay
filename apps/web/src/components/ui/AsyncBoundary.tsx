import type { ReactNode } from 'react';
import { Skeleton } from './skeleton';
import { ErrorState } from './ErrorState';
import { EmptyState } from './EmptyState';
import { Alert, AlertDescription } from './alert';
import { Button } from './Button';
import { Spinner } from './spinner';

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
  isRefreshing?: boolean;
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
  isRefreshing = false,
}: AsyncBoundaryProps<T>) {
  if (isPending) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-3 py-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-4 w-3/4 max-w-sm" />
        <p className="text-sm text-text-muted">{loadingLabel}</p>
      </div>
    );
  }

  if (error !== null && data === null) {
    return <ErrorState message={error} onRetry={onRetry} isRetrying={isRefreshing} />;
  }

  if (data === null) return null;

  return (
    <>
      {error !== null && (
        <Alert>
          <AlertDescription>{error} Showing the last loaded data.</AlertDescription>
          <Button
            variant="outline"
            disabled={isRefreshing}
            onClick={onRetry}
            className="self-start"
          >
            {isRefreshing && <Spinner aria-hidden="true" data-icon="inline-start" />}
            {isRefreshing ? 'Retrying…' : 'Try again'}
          </Button>
        </Alert>
      )}
      {isRefreshing && (
        <p role="status" className="flex items-center gap-2 text-sm text-text-muted">
          <Spinner aria-hidden="true" />
          Refreshing…
        </p>
      )}
      {isEmpty !== undefined && isEmpty(data) ? (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : (
        children(data)
      )}
    </>
  );
}
