import React from "react"

type Props = {
  children: React.ReactNode
}

export default function Badge({ children }: Props) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-neutral-100 text-neutral-700 ring-1 ring-black/5">
      {children}
    </span>
  )
}
