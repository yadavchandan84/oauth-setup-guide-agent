import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-sm font-semibold text-violet-300">404</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-100">Page not found</h1>
      <p className="mt-2 text-slate-400">
        The page you're looking for doesn't exist or has moved.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link to="/">
          <Button>Go home</Button>
        </Link>
        <Link to="/guides">
          <Button variant="secondary">Browse the library</Button>
        </Link>
      </div>
    </div>
  );
}
