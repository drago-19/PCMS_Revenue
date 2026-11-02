"use client";

import Link from "next/link";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BillShippingFilterKey, BillSortKey } from "@/lib/queries";
import { cn } from "@/lib/utils";

interface BillsShippingHeaderFilterProps {
  currentShipping: BillShippingFilterKey;
  currentSort: BillSortKey;
  hrefAll: string;
  hrefProfit: string;
  hrefEven: string;
  hrefLoss: string;
  hrefDiff: string;
  hrefSortDesc: string;
  hrefSortAsc: string;
}

export function BillsShippingHeaderFilter({
  currentShipping,
  currentSort,
  hrefAll,
  hrefProfit,
  hrefEven,
  hrefLoss,
  hrefDiff,
  hrefSortDesc,
  hrefSortAsc,
}: BillsShippingHeaderFilterProps) {
  const isFiltered = currentShipping !== "all";
  const isSorted =
    currentSort === "shipping_desc" || currentSort === "shipping_asc";

  const sortIcon =
    currentSort === "shipping_asc"
      ? "↑"
      : currentSort === "shipping_desc"
        ? "↓"
        : "↕";

  const getShippingBadge = () => {
    switch (currentShipping) {
      case "profit":
        return (
          <Badge
            variant="outline"
            className="h-4 px-1 text-[10px] font-bold border-emerald-300 text-emerald-700 bg-emerald-50"
          >
            กำไร
          </Badge>
        );
      case "even":
        return (
          <Badge
            variant="outline"
            className="h-4 px-1 text-[10px] font-bold border-slate-300 text-slate-700 bg-slate-100"
          >
            เท่าทุน
          </Badge>
        );
      case "loss":
        return (
          <Badge
            variant="outline"
            className="h-4 px-1 text-[10px] font-bold border-rose-300 text-rose-700 bg-rose-50"
          >
            ติดลบ
          </Badge>
        );
      case "diff":
        return (
          <Badge
            variant="outline"
            className="h-4 px-1 text-[10px] font-bold border-amber-300 text-amber-700 bg-amber-50"
          >
            ส่วนต่าง
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="กรองหรือเรียงลำดับค่าขนส่ง"
          className={cn(
            "group inline-flex items-center justify-end gap-1 font-bold cursor-pointer select-none transition-colors outline-none",
            isFiltered
              ? "text-primary hover:text-primary/80"
              : "text-[#0f172a] hover:text-primary",
          )}
        >
          <span>ค่าขนส่ง</span>
          {isFiltered ? (
            <span className="inline-flex items-center gap-0.5">
              {getShippingBadge()}
              <ChevronDownIcon className="size-3 text-slate-500 group-hover:text-primary transition-colors" />
            </span>
          ) : (
            <span className="text-[11px] text-[#64748b] group-hover:text-primary transition-colors">
              {sortIcon}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-60 p-1.5 bg-white border border-slate-200 shadow-xl rounded-xl z-50 text-slate-900"
      >
        <DropdownMenuLabel className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          กรองสถานะค่าขนส่ง
        </DropdownMenuLabel>

        <DropdownMenuItem asChild>
          <Link
            href={hrefAll}
            scroll={false}
            className={cn(
              "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors",
              currentShipping === "all"
                ? "bg-slate-100 font-bold text-slate-900"
                : "text-slate-700 hover:bg-slate-50",
            )}
          >
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-slate-300" />
              ทั้งหมด (ทุกสถานะ)
            </span>
            {currentShipping === "all" ? (
              <CheckIcon className="size-3.5 text-primary stroke-[2.5]" />
            ) : null}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link
            href={hrefProfit}
            scroll={false}
            className={cn(
              "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors",
              currentShipping === "profit"
                ? "bg-emerald-50 font-bold text-emerald-800"
                : "text-slate-700 hover:bg-emerald-50/50",
            )}
          >
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500" />
              ได้กำไรค่าส่ง (&gt; ฿0.00)
            </span>
            {currentShipping === "profit" ? (
              <CheckIcon className="size-3.5 text-emerald-600 stroke-[2.5]" />
            ) : null}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link
            href={hrefEven}
            scroll={false}
            className={cn(
              "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors",
              currentShipping === "even"
                ? "bg-slate-100 font-bold text-slate-900"
                : "text-slate-700 hover:bg-slate-50",
            )}
          >
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-slate-400" />
              เท่าทุน (= ฿0.00)
            </span>
            {currentShipping === "even" ? (
              <CheckIcon className="size-3.5 text-primary stroke-[2.5]" />
            ) : null}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link
            href={hrefLoss}
            scroll={false}
            className={cn(
              "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors",
              currentShipping === "loss"
                ? "bg-rose-50 font-bold text-rose-800"
                : "text-slate-700 hover:bg-rose-50/50",
            )}
          >
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-rose-500" />
              ส่วนต่างติดลบ / เข้าเนื้อ (&lt; ฿0.00)
            </span>
            {currentShipping === "loss" ? (
              <CheckIcon className="size-3.5 text-rose-600 stroke-[2.5]" />
            ) : null}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link
            href={hrefDiff}
            scroll={false}
            className={cn(
              "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors",
              currentShipping === "diff"
                ? "bg-amber-50 font-bold text-amber-800"
                : "text-slate-700 hover:bg-amber-50/50",
            )}
          >
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber-500" />
              มีส่วนต่างทั้งหมด (≠ ฿0.00)
            </span>
            {currentShipping === "diff" ? (
              <CheckIcon className="size-3.5 text-amber-600 stroke-[2.5]" />
            ) : null}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1 bg-slate-100" />

        <DropdownMenuLabel className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          เรียงลำดับ
        </DropdownMenuLabel>

        <DropdownMenuItem asChild>
          <Link
            href={hrefSortDesc}
            scroll={false}
            className={cn(
              "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors",
              currentSort === "shipping_desc"
                ? "bg-slate-100 font-bold text-slate-900"
                : "text-slate-700 hover:bg-slate-50",
            )}
          >
            <span>↓ เรียงจากกำไรมาก → น้อย</span>
            {currentSort === "shipping_desc" ? (
              <CheckIcon className="size-3.5 text-primary stroke-[2.5]" />
            ) : null}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link
            href={hrefSortAsc}
            scroll={false}
            className={cn(
              "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors",
              currentSort === "shipping_asc"
                ? "bg-slate-100 font-bold text-slate-900"
                : "text-slate-700 hover:bg-slate-50",
            )}
          >
            <span>↑ เรียงจากกำไรน้อย → มาก</span>
            {currentSort === "shipping_asc" ? (
              <CheckIcon className="size-3.5 text-primary stroke-[2.5]" />
            ) : null}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
