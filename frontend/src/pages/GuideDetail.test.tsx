import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import GuideDetail from './GuideDetail';
import { renderWithRouter } from '../test/renderWithRouter';
import { ApiError } from '../lib/api';

const getJson = vi.fn();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    apiConfigured: true,
    getJson: (...args: unknown[]) => getJson(...args),
  };
});

function renderDetail(slug: string) {
  renderWithRouter(<GuideDetail />, { path: '/guides/:slug', entries: [`/guides/${slug}`] });
}

describe('GuideDetail not-found handling (AC 20b)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a 404 NOT_FOUND renders "Guide not found" with no Retry', async () => {
    getJson.mockRejectedValue(
      new ApiError({ status: 404, code: 'NOT_FOUND', message: 'nope', retryable: false }),
    );
    renderDetail('made-up-app');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Guide not found' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Try again/ })).not.toBeInTheDocument();
  });

  it('a 400 INVALID_SLUG renders "Guide not found" with no Retry', async () => {
    // Use a slug that passes the client regex so the request is actually made.
    getJson.mockRejectedValue(
      new ApiError({ status: 400, code: 'INVALID_SLUG', message: 'bad', retryable: false }),
    );
    renderDetail('weird-slug');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Guide not found' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Try again/ })).not.toBeInTheDocument();
  });

  it('renders a curated guide without touching the API', async () => {
    renderDetail('github');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'GitHub', level: 1 })).toBeInTheDocument(),
    );
    expect(getJson).not.toHaveBeenCalled();
  });
});
