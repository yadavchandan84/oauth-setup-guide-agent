import { Bot, HandHelping, User } from 'lucide-react';
import type { ComponentType } from 'react';
import { Badge } from './Badge';

type Actor = 'agent' | 'human' | 'assist';

const STYLES: Record<
  Actor,
  { label: string; className: string; Icon: ComponentType<{ className?: string }> }
> = {
  agent: { label: 'Agent can do', className: 'border-cyan-400/40 text-cyan-300', Icon: Bot },
  assist: {
    label: 'Agent can assist',
    className: 'border-violet-400/40 text-violet-300',
    Icon: HandHelping,
  },
  human: { label: 'You must do', className: 'border-amber-300/40 text-amber-200', Icon: User },
};

export function ActorBadge({ actor }: { actor: Actor }) {
  const { label, className, Icon } = STYLES[actor];
  return (
    <Badge className={className}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Badge>
  );
}
