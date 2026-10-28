import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2Icon } from "lucide-react"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] border border-transparent text-[13.5px] font-semibold whitespace-nowrap transition-all outline-none cursor-pointer focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:translate-y-[1px] disabled:pointer-events-none disabled:opacity-55 disabled:cursor-not-allowed aria-busy:opacity-75 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_2px_10px_rgba(254,44,85,0.22)] hover:bg-[#e01e45]",
        destructive:
          "border-[#f3c7c3] bg-card text-destructive hover:bg-[#fef3f2] focus-visible:ring-destructive/20",
        outline:
          "border-border bg-card text-foreground shadow-2xs hover:border-[#94a3b8] hover:bg-[#f1f5f9] hover:text-[#0f172a]",
        secondary:
          "border-border bg-[#f8fafc] text-foreground shadow-2xs hover:border-[#94a3b8] hover:bg-[#e2e8f0]/75 hover:text-[#0f172a]",
        ghost:
          "text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a]",
        link: "text-primary underline-offset-4 hover:underline",
        light:
          "bg-[#fe2c55] text-white shadow-[0_4px_14px_rgba(254,44,85,0.35)] hover:bg-[#e01e45]",
        "outline-light":
          "border-white/25 bg-white/8 text-white hover:bg-white/16 hover:border-white/40",
      },
      size: {
        default: "min-h-[40px] px-4 py-2 has-[>svg]:px-3.5",
        xs: "min-h-[40px] gap-1 rounded-lg px-2.5 text-xs",
        sm: "min-h-[40px] gap-1.5 rounded-lg px-3 text-[12.5px]",
        lg: "min-h-[44px] rounded-xl px-6 text-sm",
        icon: "size-10 min-h-[40px] min-w-[40px] p-0",
        "icon-xs": "size-10 min-h-[40px] min-w-[40px] rounded-lg p-0",
        "icon-sm": "size-10 min-h-[40px] min-w-[40px] rounded-lg p-0",
        "icon-lg": "size-11 min-h-[44px] min-w-[44px] rounded-xl p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    loading?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  if (asChild) {
    return (
      <Comp
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {children}
      </Comp>
    )
  }

  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading ? <Loader2Icon className="size-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

export { Button, buttonVariants }
