import { classNames as cn } from '../../lib/format.js';

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div
      className={cn('flex gap-1 border-b border-border', className)}
      role="tablist"
    >
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'min-h-[2.75rem] cursor-pointer border-b-2 px-4 py-2 text-sm font-medium transition-colors',
            value === t.value
              ? 'border-accent text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
