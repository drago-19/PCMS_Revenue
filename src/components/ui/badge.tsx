import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 py-0.5 text-[11.5px] leading-[1.5] font-bold whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-[#e6fbf9] text-[#007a76] border-[#b2f2ec] [a&]:hover:bg-[#d5f8f5]",
        destructive:
          "bg-[#fef3f2] text-[#d92d20] border-[#f7c9c4] [a&]:hover:bg-[#fee4e2]",
        success:
          "bg-[#ecfdf3] text-[#0d8a47] border-[#abefc6]",
        warning:
          "bg-[#fffbeb] text-[#b45309] border-[#f5dfae]",
        neutral:
          "bg-[#f2f4f7] text-muted-foreground border-border",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        glass:
          "bg-white/12 text-white border-white/18 font-semibold text-xs px-3 py-1",
      },
      size: {
        default: "px-2.5 py-0.5 text-[11.5px]",
        sm: "px-2 py-0.5 text-[10.5px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
