export interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="rounded-md border border-border bg-surface px-6 py-10 text-center">
      <p className="font-medium">Something went wrong</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">{message}</p>
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
