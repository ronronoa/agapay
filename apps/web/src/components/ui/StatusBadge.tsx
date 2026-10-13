import { Badge } from './badge';

export interface StatusBadgeProps {
  label: string;
  muted?: boolean;
}

export function StatusBadge({ label, muted = false }: StatusBadgeProps) {
  return <Badge tone={muted ? 'muted' : 'strong'}>{label}</Badge>;
}
