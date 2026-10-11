export interface StatusBadgeProps {
  label: string;
  muted?: boolean;
}

// Neutral treatment only. design.md section 7 marks status colours as still team
// TBD, so this renders the label without inventing a colour; every badge is
// re-skinned from this one component when those values arrive.
export function StatusBadge({ label, muted = false }: StatusBadgeProps) {
  return (
    <span
      className={
        muted
          ? 'inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-text-muted'
          : 'inline-flex items-center rounded-full border border-border-strong px-2 py-0.5 text-xs font-medium'
      }
    >
      {label}
    </span>
  );
}
