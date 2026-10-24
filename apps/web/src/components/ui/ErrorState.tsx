import { RefreshCcw } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from './alert';
import { Button } from './Button';
import { Spinner } from './spinner';

export interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  isRetrying?: boolean;
}

export function ErrorState({ message, onRetry, isRetrying = false }: ErrorStateProps) {
  return (
    <Alert className="items-center px-6 py-10 text-center">
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription className="max-w-md">{message}</AlertDescription>
      <Button
        variant="outline"
        onClick={onRetry}
        disabled={isRetrying}
        aria-busy={isRetrying}
        className="mt-3"
      >
        {isRetrying ? (
          <Spinner aria-hidden="true" data-icon="inline-start" />
        ) : (
          <RefreshCcw aria-hidden="true" data-icon="inline-start" />
        )}
        {isRetrying ? 'Retrying…' : 'Try again'}
      </Button>
    </Alert>
  );
}
