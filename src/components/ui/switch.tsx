import * as React from "react"

import { cn } from "@/lib/utils"

interface SwitchProps extends Omit<React.ComponentProps<"button">, "onChange"> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

function Switch({
  checked = false,
  className,
  onCheckedChange,
  onClick,
  type = "button",
  ...props
}: SwitchProps) {
  return (
    <button
      data-slot="switch"
      role="switch"
      aria-checked={checked}
      type={type}
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-[var(--border-input)] transition-colors outline-none focus-visible:border-ring focus-visible:ring-ring/35 focus-visible:ring-[2px] disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-[var(--surface-input)]",
        className,
      )}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) onCheckedChange?.(!checked)
      }}
      {...props}
    >
      <span
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-foreground transition-transform",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  )
}

export { Switch }
