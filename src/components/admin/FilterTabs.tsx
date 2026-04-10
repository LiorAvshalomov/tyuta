type FilterTabsProps<T extends string> = {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}

export default function FilterTabs<T extends string>({
  value,
  onChange,
  options,
}: FilterTabsProps<T>) {
  return (
    <div className="overflow-x-auto pb-0.5 -mb-0.5">
      <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-1 dark:border-neutral-700 dark:bg-neutral-800 min-w-max">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ' +
              (value === opt.value
                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100')
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
