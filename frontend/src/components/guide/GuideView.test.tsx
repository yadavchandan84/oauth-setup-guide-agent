import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuideView } from './GuideView';
import { curatedGuides } from '../../generated/curatedGuides';
import { SECTION_KEYS } from '../../generated/schema';

const github = curatedGuides.find((g) => g.slug === 'github')!;

describe('GuideView (AC 17)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders all the major sections for the github guide', () => {
    render(<GuideView guide={github} />);
    expect(screen.getByRole('heading', { name: 'GitHub', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Time estimate' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Approval timeline' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Prerequisites' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Setup steps' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Scopes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Redirect URIs' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Common blockers' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Agent handoff' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sources' })).toBeInTheDocument();
  });

  it('renders exactly nine confidence tags, one per SECTION_KEYS', () => {
    render(<GuideView guide={github} />);
    for (const key of SECTION_KEYS) {
      expect(screen.getByTestId(`confidence-${key}`)).toBeInTheDocument();
    }
    const tags = document.querySelectorAll('[data-testid^="confidence-"]');
    expect(tags.length).toBe(9);
    expect(SECTION_KEYS.length).toBe(9);
  });

  it('shows "Last verified {date}" in the sources panel', () => {
    render(<GuideView guide={github} />);
    expect(screen.getByText(`Last verified ${github.verification.lastVerified}`)).toBeInTheDocument();
  });

  it('copy link writes to the clipboard and shows a toast', async () => {
    render(<GuideView guide={github} />);
    // Set up userEvent first (it installs its own clipboard), then override with our spy so
    // the component's navigator.clipboard.writeText call is observable.
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await user.click(screen.getByRole('button', { name: /Copy link/ }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/guides/github'));
    await waitFor(() => expect(screen.getByText('Link copied')).toBeInTheDocument());
  });
});
