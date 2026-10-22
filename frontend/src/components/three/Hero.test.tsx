import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Hero } from './Hero';

describe('Hero capability gate (AC 18)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the SVG fallback and no canvas when WebGL is unavailable', () => {
    // setup.ts stubs getContext -> null, so canUseWebGL() is false.
    const { container } = render(<Hero />);
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders the fallback and no canvas under prefers-reduced-motion', () => {
    // WebGL available, but reduced-motion is on -> still fallback.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never);
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;

    const { container } = render(<Hero />);
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
