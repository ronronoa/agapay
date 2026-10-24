import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AsyncBoundary } from './AsyncBoundary';

afterEach(cleanup);
describe('AsyncBoundary recovery', () => {
  it('retains saved content alongside a background-refresh error and allows retry', () => {
    const retry = vi.fn();
    const { rerender } = render(
      <AsyncBoundary
        data="Saved content"
        error="Offline"
        isPending={false}
        onRetry={retry}
        emptyTitle="Empty"
        emptyDescription="Nothing here"
      >
        {(data) => <p>{data}</p>}
      </AsyncBoundary>,
    );
    expect(screen.getByText('Saved content')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Showing the last loaded data.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
    rerender(
      <AsyncBoundary
        data="Saved content"
        error="Offline"
        isPending={false}
        isRefreshing
        onRetry={retry}
        emptyTitle="Empty"
        emptyDescription="Nothing here"
      >
        {(data) => <p>{data}</p>}
      </AsyncBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Retrying…' })).toBeDisabled();
    expect(screen.getByText('Saved content')).toBeInTheDocument();
  });
});
