"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Progress as ProgressPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

const progressVariants = cva(
  "relative w-full overflow-hidden rounded-full bg-primary/15",
  {
    variants: {
      size: {
        default: "h-2.5",
        sm: "h-1.5",
        lg: "h-3.5",
      },
      tone: {
        default: "bg-primary/15",
        success: "bg-[#ecfdf3]",
        danger: "bg-[#fef3f2]",
      },
    },
    defaultVariants: {
      size: "default",
      tone: "default",
    },
  }
)

const indicatorVariants = cva(
  "h-full w-full flex-1 rounded-full transition-transform duration-200 ease-out motion-reduce:transition-none",
  {
    variants: {
      tone: {
        default: "bg-gradient-to-r from-[#0f766e] to-[#14b8a6]",
        success: "bg-[#15803d]",
        danger: "bg-destructive",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  }
)

function Progress({
  className,
  value,
  size = "default",
  tone = "default",
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> &
  VariantProps<typeof progressVariants>) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value ?? 0) ? (value ?? 0) : 0))

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={clamped}
      className={cn(progressVariants({ size, tone }), className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(indicatorVariants({ tone }))}
        style={{ transform: `translateX(-${100 - clamped}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress, progressVariants }
