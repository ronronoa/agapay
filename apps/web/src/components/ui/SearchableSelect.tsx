import { useId, useState } from 'react';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Button } from './Button';
import { Popover, PopoverTrigger, PopoverContent } from './popover';
import { cn } from '../../lib/utils';

export function SearchableSelect({
  id,
  label,
  value,
  options,
  disabled,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          variant="outline"
          className="w-full min-w-0 justify-between"
          disabled={disabled}
        >
          <span className="truncate">
            {value
              ? (options.find((option) => option.value === value)?.label ?? value)
              : placeholder}
          </span>
          <ChevronsUpDown aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[var(--radix-popover-content-available-height)] w-[var(--radix-popover-trigger-width)] overflow-hidden p-0"
      >
        <Command className="flex max-h-[inherit] flex-col" label={label}>
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 focus-within:ring-2 focus-within:ring-inset focus-within:ring-primary">
            <Search aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
            <Command.Input
              aria-label={`Search ${label}`}
              placeholder="Search areas…"
              className="min-h-11 w-full min-w-0 bg-transparent text-sm outline-none"
            />
          </div>
          <Command.List
            id={listId}
            className="min-h-0 max-h-64 overflow-y-auto overscroll-contain p-1"
          >
            <Command.Empty className="p-3 text-sm text-text-muted">No areas found.</Command.Empty>
            <Command.Group>
              {options.map((option) => (
                <Command.Item
                  key={option.value}
                  value={option.value}
                  keywords={[option.label]}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none data-[selected=true]:bg-surface-alt"
                >
                  <Check
                    aria-hidden="true"
                    className={cn('size-4 shrink-0', value !== option.value && 'invisible')}
                  />
                  <span className="break-words">{option.label}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
