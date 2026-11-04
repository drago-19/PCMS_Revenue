"use client";

import { useState, type ReactNode } from "react";
import { AnimatedValueText } from "@/components/AnimatedValueText";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface StatBreakdownRow {
  label: string;
  subLabel?: string;
  countText?: string;
  valueText: string;
  tone?: "default" | "positive" | "negative" | "brand" | "muted";
  isSubtotal?: boolean;
  isTotal?: boolean;
  badgeText?: string;
  badgeVariant?: "neutral" | "success" | "warning" | "destructive" | "info";
}

export interface StatBreakdownSection {
  title: string;
  description?: string;
  rows: StatBreakdownRow[];
}

export interface StatBreakdownConfig {
  title: string;
  subtitle?: string;
  heroLabel: string;
  heroValue: string;
  heroTone?: "default" | "positive" | "negative" | "brand";
  formulaNote?: string;
  sections: StatBreakdownSection[];
}

export function StatBreakdownTrigger({
  config,
  children,
  triggerLabel = "คลิกดูที่มาของตัวเลข",
  className,
}: {
  config: StatBreakdownConfig;
  children: ReactNode;
  triggerLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        data-stat-breakdown-trigger="true"
        title={triggerLabel}
        aria-label={`${config.title} — ${triggerLabel}`}
        onClick={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest("[data-compact-toggle]")) {
            return;
          }
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            const target = e.target as HTMLElement | null;
            if (target?.closest("[data-compact-toggle]")) {
              return;
            }
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "group cursor-pointer text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden",
          className,
        )}
      >
        {children}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto p-4 sm:max-w-[580px] sm:p-6">
          <DialogHeader className="pr-12 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="info" className="text-[11px] font-bold">
                แจกแจงที่มาของตัวเลข
              </Badge>
            </div>
            <DialogTitle className="text-base font-extrabold text-slate-900 sm:text-lg">
              {config.title}
            </DialogTitle>
            {config.subtitle ? (
              <DialogDescription className="text-xs leading-relaxed text-slate-600">
                {config.subtitle}
              </DialogDescription>
            ) : null}
          </DialogHeader>

          {/* Hero Summary Box */}
          <div
            className={cn(
              "rounded-xl border p-3.5 sm:p-4",
              config.heroTone === "positive"
                ? "border-emerald-200 bg-emerald-50/70"
                : config.heroTone === "negative"
                  ? "border-rose-200 bg-rose-50/70"
                  : config.heroTone === "brand"
                    ? "border-pink-200 bg-pink-50/60"
                    : "border-slate-200 bg-slate-50/90",
            )}
          >
            <div className="text-xs font-semibold text-slate-600">
              {config.heroLabel}
            </div>
            <div
              className={cn(
                "mt-1 text-xl font-extrabold tracking-tight tabular-nums sm:text-2xl",
                config.heroTone === "positive"
                  ? "text-emerald-700"
                  : config.heroTone === "negative"
                    ? "text-rose-600"
                    : config.heroTone === "brand"
                      ? "text-[#e11d48]"
                      : "text-slate-900",
              )}
            >
              <AnimatedValueText value={config.heroValue} />
            </div>
            {config.formulaNote ? (
              <p className="mt-1.5 text-[11px] leading-relaxed font-medium text-slate-600">
                {config.formulaNote}
              </p>
            ) : null}
          </div>

          {/* Breakdown Sections */}
          <div className="flex flex-col gap-3.5">
            {config.sections.map((section, sIdx) => (
              <div
                key={sIdx}
                className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4"
              >
                <div className="mb-2.5 flex flex-col gap-0.5 border-b border-slate-100 pb-2">
                  <h4 className="text-xs font-extrabold tracking-wide text-slate-800 uppercase sm:text-[13px]">
                    {section.title}
                  </h4>
                  {section.description ? (
                    <p className="text-[11px] text-slate-500">
                      {section.description}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col divide-y divide-slate-100">
                  {section.rows.map((row, rIdx) => (
                    <div
                      key={rIdx}
                      className={cn(
                        "flex items-start justify-between gap-3 py-2 text-xs sm:text-[13px]",
                        row.isTotal &&
                          "mt-1 rounded-lg bg-slate-900 px-3 py-2.5 text-white",
                        row.isSubtotal &&
                          !row.isTotal &&
                          "bg-slate-50/90 px-2.5 font-bold",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "break-words",
                              row.isTotal
                                ? "font-extrabold text-white"
                                : row.isSubtotal
                                  ? "font-bold text-slate-900"
                                  : "font-semibold text-slate-800",
                            )}
                          >
                            {row.label}
                          </span>
                          {row.countText ? (
                            <span
                              className={cn(
                                "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                                row.isTotal
                                  ? "bg-white/15 text-white"
                                  : "bg-slate-100 text-slate-700",
                              )}
                            >
                              {row.countText}
                            </span>
                          ) : null}
                          {row.badgeText ? (
                            <Badge
                              variant={row.badgeVariant ?? "neutral"}
                              className="px-1.5 py-0 text-[10px]"
                            >
                              {row.badgeText}
                            </Badge>
                          ) : null}
                        </div>
                        {row.subLabel ? (
                          <p
                            className={cn(
                              "mt-0.5 text-[11px] leading-snug",
                              row.isTotal ? "text-slate-300" : "text-slate-500",
                            )}
                          >
                            {row.subLabel}
                          </p>
                        ) : null}
                      </div>

                      <div
                        className={cn(
                          "shrink-0 text-right font-mono font-bold tabular-nums",
                          row.isTotal
                            ? "text-sm font-extrabold text-emerald-300 sm:text-base"
                            : row.tone === "positive"
                              ? "text-emerald-700"
                              : row.tone === "negative"
                                ? "text-rose-600"
                                : row.tone === "brand"
                                  ? "text-[#e11d48]"
                                  : row.tone === "muted"
                                    ? "text-slate-500"
                                    : "text-slate-900",
                        )}
                      >
                        {row.isTotal || row.isSubtotal ? (
                          <AnimatedValueText value={row.valueText} />
                        ) : (
                          row.valueText
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              className="min-h-[40px]"
            >
              ปิดหน้าต่าง
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
