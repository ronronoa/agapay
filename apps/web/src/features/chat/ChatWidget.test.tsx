import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiClient from '../../lib/api-client';
import { apiFetch, apiResponse } from '../../lib/api-client';
import { ChatWidget } from './ChatWidget';
import { toast } from 'sonner';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../lib/api-client', async () => ({
  ...(await vi.importActual<typeof ApiClient>('../../lib/api-client')),
  apiFetch: vi.fn(),
  apiResponse: vi.fn(),
}));

function stream(parts: unknown[]) {
  return new Response(
    [...parts.map((part) => `data: ${JSON.stringify(part)}\n\n`), 'data: [DONE]\n\n'].join(''),
    { headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } },
  );
}
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <input
        id="field-email"
        aria-label="Background email"
        defaultValue="unchanged@example.invalid"
      />
      <ChatWidget />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open Agapay AI assistant' }));
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(apiFetch).mockResolvedValue({ data: { available: true, remainingToday: 12 } });
  vi.mocked(apiResponse).mockImplementation(() =>
    Promise.resolve(
      stream([
        { type: 'start', messageId: 'answer' },
        { type: 'text-start', id: 'text' },
        { type: 'text-delta', id: 'text', delta: 'Use the assistance form.' },
        { type: 'text-end', id: 'text' },
        { type: 'finish', finishReason: 'stop' },
      ]),
    ),
  );
});
async function send(text: string) {
  await screen.findByText(/12 model calls/);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('Message to AI assistant'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}
describe('Agapay assistant', () => {
  it('opens without locking the page and preserves a draft while expanding', async () => {
    show();
    await screen.findByText(/12 model calls/);
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-modal', 'true');
    expect(document.body).not.toHaveAttribute('data-scroll-locked');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('Message to AI assistant'), {
      target: { value: 'Draft question' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Expand AI assistant' }));
    expect(screen.getByLabelText('Message to AI assistant')).toHaveValue('Draft question');
    fireEvent.click(screen.getByRole('button', { name: 'Restore AI assistant size' }));
    expect(screen.getByRole('button', { name: 'Expand AI assistant' })).toBeInTheDocument();
    expect(apiResponse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close AI assistant' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open Agapay AI assistant' })).toHaveFocus(),
    );
  });

  it('uses Enter to send while preserving Shift+Enter and composition input', async () => {
    show();
    await screen.findByText(/12 model calls/);
    fireEvent.click(screen.getByRole('checkbox'));
    const input = screen.getByLabelText('Message to AI assistant');
    fireEvent.change(input, { target: { value: 'How can I help?' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(apiResponse).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('Use the assistance form.')).toBeInTheDocument();
  });

  it('keeps FAQ and private tracking usable when AI is unavailable', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: { available: false, remainingToday: 0 } });
    show();
    expect(await screen.findByText(/AI unavailable/)).toBeInTheDocument();
    expect(screen.getByText('How do I request assistance?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Track privately' }));
    expect(screen.getByLabelText('Request email')).toBeInTheDocument();
    expect(apiResponse).not.toHaveBeenCalled();
  });
  it('requires consent and streams a safely rendered answer', async () => {
    show();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await send('How can I help?');
    expect(await screen.findByText('Use the assistance form.')).toBeInTheDocument();
    expect(apiResponse).toHaveBeenCalledWith(
      '/api/v1/chat',
      expect.objectContaining({
        body: { messages: [{ role: 'user', content: 'How can I help?' }] },
      }),
    );
  });
  it('allows drafting before Gemini consent but blocks sending', async () => {
    show();
    await screen.findByText(/12 model calls/);
    const input = screen.getByLabelText('Message to AI assistant');
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: 'How can I help?' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveValue('How can I help?');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(apiResponse).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox')).toHaveAccessibleName(
      'I understand that AI chat text goes to Google Gemini.',
    );
    expect(screen.queryByText(/OpenRouter/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(input).toHaveValue('How can I help?');
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });
  it('blocks obvious contacts before transmission', async () => {
    show();
    await send('Track person@example.invalid');
    expect(toast.error).toHaveBeenCalled();
    expect(apiResponse).not.toHaveBeenCalled();
  });
  it('keeps private tracking details and results outside the AI request', async () => {
    vi.mocked(apiFetch).mockImplementation((path) =>
      Promise.resolve(
        path === '/api/v1/public/track'
          ? {
              data: {
                code: 'REQ-2026-1',
                campaign: { name: 'Relief' },
                status: 'PENDING',
                statusMessage: 'Under review soon.',
                submittedAt: '2026-10-26T00:00:00Z',
                timeline: [],
                distribution: null,
                rejectionReason: null,
              },
            }
          : { data: { available: true, remainingToday: 12 } },
      ),
    );
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Track privately' }));
    fireEvent.change(screen.getByLabelText('Request or tracking code'), {
      target: { value: 'REQ-2026-1' },
    });
    fireEvent.change(screen.getByLabelText('Request email'), {
      target: { value: 'private@example.invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check request' }));
    expect(await screen.findByText('Under review soon.')).toBeInTheDocument();
    expect(screen.getByLabelText('Background email')).toHaveValue('unchanged@example.invalid');
    expect(apiResponse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Hide private tracking' }));
    await send('How can I help?');
    await screen.findByText('Use the assistance form.');
    expect(JSON.stringify(vi.mocked(apiResponse).mock.calls)).not.toMatch(
      /private@example|REQ-2026|Under review soon/,
    );
  });
  it('retains failed drafts and clears them when the panel closes', async () => {
    vi.mocked(apiResponse).mockRejectedValue(new Error('Offline'));
    show();
    await send('How can I help?');
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByLabelText('Message to AI assistant')).toHaveValue('How can I help?');
    fireEvent.click(screen.getByRole('button', { name: 'Close AI assistant' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Open Agapay AI assistant' }));
    expect(screen.getByLabelText('Message to AI assistant')).toHaveValue('');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});
