import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export type SortDirection = 'asc' | 'desc';

interface SortableHeaderProps<K extends string> {
  label: string;
  field: K;
  activeField: K;
  direction: SortDirection;
  onSort: (field: K) => void;
  align?: 'left' | 'right' | 'center';
}

export function SortableHeader<K extends string>({
  label,
  field,
  activeField,
  direction,
  onSort,
  align = 'left'
}: SortableHeaderProps<K>) {
  const active = activeField === field;
  const Icon = !active ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <th
      className={`px-3 py-2 ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 uppercase tracking-wider transition-colors ${
          active ? 'text-eve-accent' : 'text-eve-muted hover:text-eve-text'
        }`}
      >
        <span>{label}</span>
        <Icon className="h-3 w-3 shrink-0" />
      </button>
    </th>
  );
}

