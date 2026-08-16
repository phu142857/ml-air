"use client"

type CommandPaletteFooterProps = {
  scopeLabel?: string
}

function FooterHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="rounded border border-border/80 bg-background/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
        {keys}
      </kbd>
      <span>{label}</span>
    </span>
  )
}

export function CommandPaletteFooter({ scopeLabel }: CommandPaletteFooterProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <FooterHint keys="↑↓" label="Navigate" />
        <FooterHint keys="↵" label="Open" />
        <FooterHint keys="esc" label="Close" />
        <FooterHint keys="?" label="Shortcuts" />
      </div>
      {scopeLabel ? <span className="truncate font-mono">{scopeLabel}</span> : null}
    </div>
  )
}
