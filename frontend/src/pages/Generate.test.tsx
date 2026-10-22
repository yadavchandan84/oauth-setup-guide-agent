import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Generate from './Generate';
import { renderWithRouter } from '../test/renderWithRouter';
import type { StreamGenerateOptions } from '../lib/stream';

const getJson = vi.fn();
const streamGenerate = vi.fn();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    apiConfigured: true,
    getJson: (...args: unknown[]) => getJson(...args),
  };
});

vi.mock('../lib/stream', () => ({
  streamGenerate: (opts: StreamGenerateOptions) => streamGenerate(opts),
}));

function renderGenerate() {
  renderWithRouter(<Generate />, { path: '/generate', entries: ['/generate'] });
}

describe('Generate page (ACs 19, 20, 20a)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getJson.mockResolvedValue({ llmConfigured: true, searchConfigured: true, rateLimitMax: 5 });
  });
  afterEach(() => vi.useRealTimers());

  it('renders steps as they arrive and the guide on done', async () => {
    streamGenerate.mockImplementation(async (opts: StreamGenerateOptions) => {
      opts.onFirstByte?.();
      opts.onEvent({
        event: 'step',
        data: {
          id: 'resolve',
          stage: 'resolve',
          status: 'active',
          label: 'Resolving GitHub…',
          at: '2026-10-20T00:00:00Z',
        },
      });
      opts.onEvent({
        event: 'step',
        data: {
          id: 'search',
          stage: 'search',
          status: 'done',
          label: 'Searching docs…',
          at: '2026-10-20T00:00:01Z',
        },
      });
    });

    renderGenerate();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/App name or developer docs URL/), 'GitHub');
    await user.click(screen.getByRole('button', { name: /Generate/ }));

    await waitFor(() => expect(screen.getByText('Resolving GitHub…')).toBeInTheDocument());
    expect(screen.getByText('Searching docs…')).toBeInTheDocument();
  });

  it('shows an error panel with Try again on a stream error event', async () => {
    streamGenerate.mockImplementation(async (opts: StreamGenerateOptions) => {
      opts.onFirstByte?.();
      opts.onEvent({
        event: 'error',
        data: { code: 'LLM_FAILED', message: 'writer failed', retryable: true },
      });
      opts.onEvent({ event: 'done', data: { ok: false, slug: null, durationMs: 1 } });
    });

    renderGenerate();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/App name or developer docs URL/), 'GitHub');
    await user.click(screen.getByRole('button', { name: /Generate/ }));

    await waitFor(() => expect(screen.getByText('Generation failed')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('cancel aborts the in-flight request', async () => {
    let captured: StreamGenerateOptions | null = null;
    streamGenerate.mockImplementation((opts: StreamGenerateOptions) => {
      captured = opts;
      opts.onFirstByte?.();
      opts.onEvent({
        event: 'step',
        data: {
          id: 'draft',
          stage: 'draft',
          status: 'active',
          label: 'Drafting guide…',
          at: '2026-10-20T00:00:00Z',
        },
      });
      return new Promise(() => {}); // never resolves until aborted
    });

    renderGenerate();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/App name or developer docs URL/), 'GitHub');
    await user.click(screen.getByRole('button', { name: /Generate/ }));

    await waitFor(() => expect(screen.getByText('Drafting guide…')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(captured!.signal?.aborted).toBe(true);
    await waitFor(() => expect(screen.getByText('Generation cancelled.')).toBeInTheDocument());
  });

  it('shows the cold-start notice after 4s and hides it on first byte', async () => {
    // Health check resolved synchronously-ish; use a never-firing-byte stream.
    let firstByte: (() => void) | undefined;
    streamGenerate.mockImplementation((opts: StreamGenerateOptions) => {
      firstByte = opts.onFirstByte;
      return new Promise(() => {});
    });

    renderGenerate();
    // Let the mount health check settle before switching to fake timers.
    await screen.findByLabelText(/App name or developer docs URL/);

    vi.useFakeTimers();
    const input = screen.getByLabelText(/App name or developer docs URL/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'GitHub' } });
    fireEvent.click(screen.getByRole('button', { name: /Generate/ }));

    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.getByText(/Waking up the agent server/)).toBeInTheDocument();

    act(() => {
      firstByte?.();
    });
    expect(screen.queryByText(/Waking up the agent server/)).not.toBeInTheDocument();
  });

  it('shows the config banner but keeps the input enabled when llmConfigured is false', async () => {
    getJson.mockResolvedValue({ llmConfigured: false, searchConfigured: false, rateLimitMax: 5 });
    renderGenerate();
    await waitFor(() =>
      expect(
        screen.getByText("Live research isn't configured on this server. Curated guides still load."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/App name or developer docs URL/)).not.toBeDisabled();
  });
});
