import * as React from "react"
import { Search, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type SearchInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  containerClassName?: string
  clearLabel?: string
  onClear?: () => void
}

/**
 * Shared search control used across workspace toolbars, sidebars, and pickers.
 * Keeping the icon, spacing, focus treatment, and clear affordance here prevents
 * individual feature surfaces from drifting visually over time.
 */
function SearchInput({
  className,
  containerClassName,
  clearLabel = "清空搜索",
  onClear,
  value,
  ...props
}: SearchInputProps) {
  const hasValue = value !== undefined && String(value).length > 0

  return (
    <div
      data-slot="search-input"
      className={cn("relative w-full", containerClassName)}
    >
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        {...props}
        type="search"
        value={value}
        className={cn(
          "h-9 bg-card pr-9 pl-9 shadow-xs [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
          className,
        )}
      />
      {onClear && hasValue ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute top-1/2 right-1.5 -translate-y-1/2"
          onClick={onClear}
          aria-label={clearLabel}
        >
          <X />
        </Button>
      ) : null}
    </div>
  )
}

export { SearchInput }
export type { SearchInputProps }
