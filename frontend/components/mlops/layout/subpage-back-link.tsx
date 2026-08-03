import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SubpageBackLinkProps {
  href: string
  label: string
  className?: string
}

/** Replaces SubpageBreadcrumb on resource detail pages. */
export function SubpageBackLink({ href, label, className }: SubpageBackLinkProps) {
  return (
    <div className={cn("px-4 pt-2.5 sm:px-6", className)}>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
        asChild
      >
        <Link href={href}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {label}
        </Link>
      </Button>
    </div>
  )
}
