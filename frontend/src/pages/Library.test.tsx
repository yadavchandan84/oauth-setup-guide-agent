import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Library from './Library';
import { renderWithRouter } from '../test/renderWithRouter';

// Curated-only mode: no API base.
vi.mock('../lib/api', () => ({
  apiConfigured: false,
  getJson: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

async function renderLibrary(initial = '/guides') {
  renderWithRouter(<Library />, { path: '/guides', entries: [initial] });
  // Wait for curated summaries to load (GitHub always exists).
  await waitFor(() => expect(screen.getByText('GitHub')).toBeInTheDocument());
}

describe('Library', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders curated guides', async () => {
    await renderLibrary();
    expect(screen.getByText('Slack')).toBeInTheDocument();
    expect(screen.getByText('Shopify')).toBeInTheDocument();
  });

  it('filters by difficulty', async () => {
    await renderLibrary();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Very Hard' }));
    await waitFor(() => {
      expect(screen.getByText('Google Workspace / Gmail')).toBeInTheDocument();
      expect(screen.queryByText('GitHub')).not.toBeInTheDocument();
    });
  });

  it('combined text + difficulty search narrows results', async () => {
    await renderLibrary();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Search guides'), 'git');
    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
      expect(screen.queryByText('Slack')).not.toBeInTheDocument();
    });
  });

  it('shows an empty state with a generate CTA', async () => {
    await renderLibrary();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Search guides'), 'zzzznotanapp');
    await waitFor(() => {
      expect(screen.getByText('No guides match these filters')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /Generate a guide for/ })).toBeInTheDocument();
  });

  it('matches the alias "gmail" to Google Workspace (AC 16)', async () => {
    await renderLibrary();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Search guides'), 'gmail');
    await waitFor(() => {
      expect(screen.getByText('Google Workspace / Gmail')).toBeInTheDocument();
      expect(screen.queryByText('GitHub')).not.toBeInTheDocument();
    });
  });

  it('seeds the search from the URL query param', async () => {
    renderWithRouter(<Library />, { path: '/guides', entries: ['/guides?q=slack'] });
    await waitFor(() => expect(screen.getByText('Slack')).toBeInTheDocument());
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Search guides')).toHaveValue('slack');
  });
});
