import Link from 'next/link'
import type { ComponentProps } from 'react'

type ContentLinkProps = ComponentProps<typeof Link>

export default function ContentLink({ scroll = true, ...props }: ContentLinkProps) {
  return <Link {...props} scroll={scroll} />
}
