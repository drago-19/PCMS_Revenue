import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const tableVariants = cva("data w-full caption-bottom border-collapse text-[13.5px]", {
  variants: {
    variant: {
      default: "",
      stack: "stack",
      mapping: "mapping-table",
    },
  },
  defaultVariants: {
    variant: "stack",
  },
})

function Table({
  className,
  containerClassName,
  variant = "stack",
  ...props
}: React.ComponentProps<"table"> &
  VariantProps<typeof tableVariants> & {
    containerClassName?: string
  }) {
  return (
    <div
      data-slot="table-container"
      className={cn(
        "table-wrap relative w-full overflow-x-auto min-[861px]:max-h-[calc(100dvh-260px)] min-[861px]:overflow-y-auto",
        containerClassName
      )}
    >
      <table
        data-slot="table"
        className={cn(tableVariants({ variant }), className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b min-[861px]:sticky min-[861px]:top-0 min-[861px]:z-20", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-muted transition-colors even:bg-[#f8fafc]/80 hover:bg-[#eff6ff]/70 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "px-2.5 py-2.5 min-[1280px]:px-4 text-left [&.num]:text-right [&.num]:tabular-nums align-middle text-[12px] font-bold tracking-[0.02em] whitespace-nowrap text-muted-foreground bg-[#f8f9fb] border-b border-border shadow-[0_1px_0_var(--border)]",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-2.5 py-2.5 min-[1280px]:px-4 text-left [&.num]:text-right [&.num]:tabular-nums [&.num]:whitespace-nowrap align-middle border-b border-muted",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  tableVariants,
}
