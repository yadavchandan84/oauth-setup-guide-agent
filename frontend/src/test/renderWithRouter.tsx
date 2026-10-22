import { type ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * Renders a component at a given route inside a MemoryRouter. The `path` lets route params
 * (e.g. /guides/:slug) resolve; `entries` sets the initial history.
 */
export function renderWithRouter(
  element: ReactElement,
  { path = '/', entries = ['/'] }: { path?: string; entries?: string[] } = {},
) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path={path} element={element} />
      </Routes>
    </MemoryRouter>,
  );
}
