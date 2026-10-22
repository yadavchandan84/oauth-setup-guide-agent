import { lazy } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { PageShell } from './components/layout/PageShell';

const Landing = lazy(() => import('./pages/Landing'));
const Library = lazy(() => import('./pages/Library'));
const GuideDetail = lazy(() => import('./pages/GuideDetail'));
const Generate = lazy(() => import('./pages/Generate'));
const About = lazy(() => import('./pages/About'));
const NotFound = lazy(() => import('./pages/NotFound'));

const router = createBrowserRouter([
  {
    element: <PageShell />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/guides', element: <Library /> },
      { path: '/guides/:slug', element: <GuideDetail /> },
      { path: '/generate', element: <Generate /> },
      { path: '/about', element: <About /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
