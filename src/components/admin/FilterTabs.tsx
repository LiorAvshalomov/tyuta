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
      <div className="flex items-center gap-0.5 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-900 min-w-max">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={
              'rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ' +
              (value === opt.value
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100'
                : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300')
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
