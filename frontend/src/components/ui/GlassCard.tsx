import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function GlassCard({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return (
    <Tag className={cn('glass rounded-2xl p-5 shadow-lg shadow-black/20', className)}>
      {children}
    </Tag>
  );
}
