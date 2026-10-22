import { NavLink } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/cn';

const LINKS = [
  { to: '/guides', label: 'Library' },
  { to: '/generate', label: 'Generate' },
  { to: '/about', label: 'About' },
];

export function Navbar() {
  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <NavLink to="/" className="flex items-center gap-2 font-semibold text-slate-100">
          <ShieldCheck className="h-5 w-5 text-violet-300" aria-hidden="true" />
          <span>OAuth Guide Agent</span>
        </NavLink>
        <div className="flex items-center gap-1 text-sm">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-1.5 transition',
                  isActive ? 'bg-white/[0.08] text-slate-100' : 'text-slate-300 hover:text-slate-100',
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
