import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const tableVariants = cva("data w-full caption-bottom border-collapse text-[12.5px] min-[1280px]:text-[13.5px]", {
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
        "table-wrap relative w-full bg-white",
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
      className={cn(
        "[&_tr]:border-b [&_tr]:border-[#cbd5e1] min-[768px]:sticky min-[768px]:top-[61px] min-[1100px]:top-0 min-[768px]:z-20",
        className
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("divide-y divide-[#e2e8f0]/80 [&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t-2 border-[#cbd5e1] bg-[#f8fafc] font-bold text-[#0f172a] shadow-[0_-1px_0_#cbd5e1] [&>tr]:last:border-b-0",
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
        "group border-b border-[#e2e8f0]/90 bg-white transition-colors duration-150 hover:bg-[#f8fafc] data-[state=selected]:bg-[#f1f5f9]",
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
        "px-2 py-2.5 min-[1280px]:px-2.5 min-[1440px]:px-3.5 text-left [&.num]:text-right [&.num]:tabular-nums align-middle text-[12px] font-bold tracking-[0.01em] whitespace-nowrap text-[#334155] bg-[#f1f5f9] border-b border-[#cbd5e1] shadow-[0_1px_0_#cbd5e1] min-[768px]:sticky min-[768px]:top-[61px] min-[1100px]:top-0 min-[768px]:z-20",
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
        "px-2 py-3 min-[1280px]:px-2.5 min-[1440px]:px-3.5 text-left [&.num]:text-right [&.num]:tabular-nums [&.num]:whitespace-nowrap align-middle border-b border-[#e2e8f0]/80",
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
