import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const cardVariants = cva(
  "rounded-2xl border bg-card text-card-foreground transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-card shadow-xs",
        muted: "border-border bg-muted/50",
        success: "border-[#bfe8d2] bg-gradient-to-b from-[#f3fdf7] to-[#fbfefc]",
        info: "border-[#cfe0dd] bg-[#f7fbfa]",
        warning: "border-[#f2ddb0] bg-[#fffbeb] text-[#7a4b0a]",
        danger: "border-[#f6cfcb] bg-[#fef3f2] text-[#7a271a]",
      },
      padding: {
        none: "",
        padded: "p-4 min-[640px]:p-[22px]",
        stat: "p-[13px] min-[640px]:px-[16px] min-[640px]:py-[14px]",
        compact: "p-3.5 min-[640px]:p-4",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "none",
    },
  }
)

function Card({
  className,
  variant = "default",
  padding = "none",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      className={cn("card", cardVariants({ variant, padding }), className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "card-head flex flex-wrap items-center justify-between gap-3 border-b border-muted px-4 py-3.5 min-[640px]:px-5 min-[640px]:py-4",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="card-title"
      className={cn("text-[15.5px] font-bold tracking-[-0.01em] text-foreground", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-[13px] text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("p-4 min-[640px]:p-5", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "card-foot flex flex-wrap items-center justify-between gap-3 border-t border-muted px-4 py-3 min-[640px]:px-5",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  cardVariants,
}
