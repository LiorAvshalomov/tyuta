type PageHeaderProps = {
  title: string
  description?: string
  actions?: React.ReactNode
}

export default function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200/70 pb-4 dark:border-neutral-800/70">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">{title}</h1>
        {description && (
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
