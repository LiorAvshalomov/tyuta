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
    <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors ' +
            (value === opt.value
              ? 'bg-neutral-900 text-white'
              : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900')
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
