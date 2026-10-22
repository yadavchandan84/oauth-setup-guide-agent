import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

export function Accordion({
  title,
  children,
  defaultOpen = false,
  headerExtra,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  headerExtra?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const buttonId = useId();

  return (
    <div className="blocker-item overflow-hidden rounded-xl border border-white/10">
      <button
        id={buttonId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 bg-white/[0.03] px-4 py-3 text-left text-sm font-medium text-slate-100 hover:bg-white/[0.06]"
      >
        <span className="flex items-center gap-2">{title}</span>
        <span className="flex items-center gap-2">
          {headerExtra}
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        className={cn('px-4 py-3 text-sm text-slate-300', open ? 'block' : 'hidden print:block')}
      >
        {children}
      </div>
    </div>
  );
}
