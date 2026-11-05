"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderOpenIcon,
  GlobeIcon,
  PrinterIcon,
  ScaleIcon,
  SparklesIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AccountingOverviewData } from "@/lib/accounting-types";
import type { ExpenseRecord, ExpensesOverviewData } from "@/lib/expense-math";
import { formatBaht, formatThaiDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type VatReportSubView =
  | "input_docs"
  | "pp30_summary"
  | "pp36_report"
  | "input_vat"
  | "output_vat";

export interface MonthlyVatRow {
  yearMonth: string;
  outputGross: number;
  outputBase: number;
  outputVat: number;
  outputChannelCount: number;
  inputGross: number;
  inputBase: number;
  inputVat: number;
  inputBillCount: number;
  netVat: number; // > 0 = ภาษีต้องชำระ (ภ.พ.30), < 0 = เครดิตภาษียกไป
}

export interface OutputVatChannelRow {
  id: string;
  yearMonth: string;
  entryDate: string;
  documentNo: string;
  channel: string;
  referenceNo: string;
  grossAmount: number;
  baseAmount: number;
  vatAmount: number;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function downloadCsvFile(filename: string, csvContent: string) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCsvCell(val: string | number): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function AccountingVatTab({
  accountingData,
  expensesData,
  periodLabel,
  subView: controlledSubView,
  onSubViewChange,
  onOpenVatClosingJv,
  onGoToCreateExpense,
}: {
  accountingData: AccountingOverviewData;
  expensesData: ExpensesOverviewData;
  periodLabel: string;
  subView?: VatReportSubView;
  onSubViewChange?: (next: VatReportSubView) => void;
  onOpenVatClosingJv: (monthRow: {
    yearMonth: string;
    outputVat: number;
    inputVat: number;
  }) => void;
  onGoToCreateExpense?: () => void;
}) {
  const [internalSubView, setInternalSubView] = useState<VatReportSubView>(
    controlledSubView || "pp30_summary",
  );
  const subView = controlledSubView ?? internalSubView;
  const setSubView = (next: VatReportSubView) => {
    setInternalSubView(next);
    onSubViewChange?.(next);
  };
  useEffect(() => {
    if (controlledSubView) {
      setInternalSubView(controlledSubView);
    }
  }, [controlledSubView]);
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>("all");
  const [inputDocStatusFilter, setInputDocStatusFilter] = useState<
    "all" | "ready" | "missing_tax_info" | "no_vat"
  >("all");

  // บิลค่าใช้จ่ายทั้งหมดที่ยังไม่ยกเลิก (สำหรับเมนู "จัดการเอกสารภาษีซื้อ")
  const allActiveExpenseRecords = useMemo<ExpenseRecord[]>(() => {
    const list = expensesData.records.filter((r) => r.paymentStatus !== "void");
    if (selectedMonthFilter === "all") return list;
    return list.filter((r) => r.yearMonth === selectedMonthFilter);
  }, [expensesData.records, selectedMonthFilter]);

  const filteredInputDocRecords = useMemo<ExpenseRecord[]>(() => {
    if (inputDocStatusFilter === "all") return allActiveExpenseRecords;
    return allActiveExpenseRecords.filter((rec) => {
      const vat = round2(rec.vatAmount);
      const hasFullTaxDoc =
        vat > 0 &&
        Boolean(rec.taxInvoiceNo?.trim()) &&
        Boolean(rec.vendorTaxId?.trim());
      if (inputDocStatusFilter === "ready") return hasFullTaxDoc;
      if (inputDocStatusFilter === "missing_tax_info")
        return vat > 0 && !hasFullTaxDoc;
      return vat <= 0;
    });
  }, [allActiveExpenseRecords, inputDocStatusFilter]);

  // รายการภาษีซื้อ ภ.พ.36 (บริการจากต่างประเทศ / โฆษณาแพลตฟอร์มต่างประเทศ เช่น TikTok Ads / Facebook Ads)
  const pp36Records = useMemo<ExpenseRecord[]>(() => {
    return allActiveExpenseRecords.filter((r) => {
      const text = `${r.vendorName} ${r.title} ${r.categoryName} ${r.note || ""}`.toLowerCase();
      return (
        text.includes("ภ.พ.36") ||
        text.includes("ต่างประเทศ") ||
        text.includes("โฆษณา") ||
        text.includes("tiktok") ||
        text.includes("facebook") ||
        text.includes("meta") ||
        text.includes("google")
      );
    });
  }, [allActiveExpenseRecords]);

  // 1. รายการภาษีขาย (Output VAT 7%) แยกตามสมุดรายวันขาย (SV) แต่ละแพลตฟอร์ม/เดือน
  const outputVatRows = useMemo<OutputVatChannelRow[]>(() => {
    const svVouchers = accountingData.journals.filter(
      (j) => j.journalType === "SV" && j.status !== "void",
    );
    return svVouchers.map((v) => {
      const gross = round2(v.totalDebit);
      const vat = round2((gross * 7) / 107);
      const base = round2(gross - vat);
      return {
        id: v.id,
        yearMonth: v.yearMonth,
        entryDate: v.entryDate,
        documentNo: v.documentNo,
        channel: v.channel || v.contactName || "แพลตฟอร์ม",
        referenceNo: v.referenceNo,
        grossAmount: gross,
        baseAmount: base,
        vatAmount: vat,
      };
    });
  }, [accountingData.journals]);

  // 2. รายการภาษีซื้อ (Input VAT 7%) จากบิลค่าใช้จ่าย EXP... ที่มี VAT > 0 และไม่ถูกยกเลิก
  const inputVatRecords = useMemo<ExpenseRecord[]>(() => {
    return expensesData.records.filter(
      (r) => r.paymentStatus !== "void" && round2(r.vatAmount) > 0,
    );
  }, [expensesData.records]);

  // 3. ตารางสรุปภาษีมูลค่าเพิ่ม ภ.พ.30 รายเดือน
  const monthlyVatRows = useMemo<MonthlyVatRow[]>(() => {
    const map = new Map<string, MonthlyVatRow>();

    const ensureMonth = (ym: string): MonthlyVatRow => {
      const existing = map.get(ym);
      if (existing) return existing;
      const created: MonthlyVatRow = {
        yearMonth: ym,
        outputGross: 0,
        outputBase: 0,
        outputVat: 0,
        outputChannelCount: 0,
        inputGross: 0,
        inputBase: 0,
        inputVat: 0,
        inputBillCount: 0,
        netVat: 0,
      };
      map.set(ym, created);
      return created;
    };

    for (const outRow of outputVatRows) {
      if (!outRow.yearMonth) continue;
      const m = ensureMonth(outRow.yearMonth);
      m.outputGross = round2(m.outputGross + outRow.grossAmount);
      m.outputBase = round2(m.outputBase + outRow.baseAmount);
      m.outputVat = round2(m.outputVat + outRow.vatAmount);
      m.outputChannelCount += 1;
    }

    for (const inRec of inputVatRecords) {
      if (!inRec.yearMonth) continue;
      const m = ensureMonth(inRec.yearMonth);
      const base = round2(inRec.subtotalAmount || inRec.amount - inRec.vatAmount);
      const vat = round2(inRec.vatAmount);
      const gross = round2(base + vat);
      m.inputGross = round2(m.inputGross + gross);
      m.inputBase = round2(m.inputBase + base);
      m.inputVat = round2(m.inputVat + vat);
      m.inputBillCount += 1;
    }

    const list = Array.from(map.values()).map((row) => ({
      ...row,
      netVat: round2(row.outputVat - row.inputVat),
    }));

    list.sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
    return list;
  }, [outputVatRows, inputVatRecords]);

  const filteredMonthlyRows = useMemo(() => {
    if (selectedMonthFilter === "all") return monthlyVatRows;
    return monthlyVatRows.filter((r) => r.yearMonth === selectedMonthFilter);
  }, [monthlyVatRows, selectedMonthFilter]);

  const filteredOutputRows = useMemo(() => {
    if (selectedMonthFilter === "all") return outputVatRows;
    return outputVatRows.filter((r) => r.yearMonth === selectedMonthFilter);
  }, [outputVatRows, selectedMonthFilter]);

  const filteredInputRecords = useMemo(() => {
    if (selectedMonthFilter === "all") return inputVatRecords;
    return inputVatRecords.filter((r) => r.yearMonth === selectedMonthFilter);
  }, [inputVatRecords, selectedMonthFilter]);

  const totals = useMemo(() => {
    const totalOutputGross = round2(
      filteredMonthlyRows.reduce((s, r) => s + r.outputGross, 0),
    );
    const totalOutputBase = round2(
      filteredMonthlyRows.reduce((s, r) => s + r.outputBase, 0),
    );
    const totalOutputVat = round2(
      filteredMonthlyRows.reduce((s, r) => s + r.outputVat, 0),
    );
    const totalInputGross = round2(
      filteredMonthlyRows.reduce((s, r) => s + r.inputGross, 0),
    );
    const totalInputBase = round2(
      filteredMonthlyRows.reduce((s, r) => s + r.inputBase, 0),
    );
    const totalInputVat = round2(
      filteredMonthlyRows.reduce((s, r) => s + r.inputVat, 0),
    );
    const netVat = round2(totalOutputVat - totalInputVat);
    return {
      totalOutputGross,
      totalOutputBase,
      totalOutputVat,
      totalInputGross,
      totalInputBase,
      totalInputVat,
      netVat,
    };
  }, [filteredMonthlyRows]);

  const handleExportCsv = () => {
    if (subView === "pp30_summary") {
      const headers = [
        "งวดภาษี (เดือน)",
        "ยอดขายก่อนภาษี",
        "ภาษีขาย 7%",
        "ยอดขายรวมภาษี",
        "ยอดซื้อก่อนภาษี",
        "ภาษีซื้อ 7%",
        "ส่วนต่างภาษีสุทธิ (ภ.พ.30)",
        "สถานะการชำระ/เครดิตภาษี",
      ];
      const rows = filteredMonthlyRows.map((r) => [
        r.yearMonth,
        r.outputBase.toFixed(2),
        r.outputVat.toFixed(2),
        r.outputGross.toFixed(2),
        r.inputBase.toFixed(2),
        r.inputVat.toFixed(2),
        r.netVat.toFixed(2),
        r.netVat > 0
          ? "ชำระภาษีเพิ่ม (ภ.พ.30)"
          : r.netVat < 0
            ? "เครดิตภาษียกไป"
            : "พอดี 0.00",
      ]);
      const csv = [
        headers.map(escapeCsvCell).join(","),
        ...rows.map((r) => r.map(escapeCsvCell).join(",")),
      ].join("\n");
      downloadCsvFile(`vat-pp30-summary.csv`, csv);
      toast.success("ดาวน์โหลดสรุปแบบ ภ.พ.30 เรียบร้อย");
    } else if (subView === "output_vat") {
      const headers = [
        "งวดเดือน",
        "วันที่",
        "เลขที่เอกสาร",
        "ช่องทางแพลตฟอร์ม",
        "อ้างอิงจำนวนบิล",
        "มูลค่าสินค้า/บริการ (ก่อนภาษี)",
        "ภาษีขาย 7%",
        "ยอดรวมทั้งสิ้น (รวมภาษี)",
      ];
      const rows = filteredOutputRows.map((r) => [
        r.yearMonth,
        r.entryDate,
        r.documentNo,
        r.channel,
        r.referenceNo,
        r.baseAmount.toFixed(2),
        r.vatAmount.toFixed(2),
        r.grossAmount.toFixed(2),
      ]);
      const csv = [
        headers.map(escapeCsvCell).join(","),
        ...rows.map((r) => r.map(escapeCsvCell).join(",")),
      ].join("\n");
      downloadCsvFile(`output-vat-report-${selectedMonthFilter}.csv`, csv);
      toast.success("ดาวน์โหลดรายงานภาษีขายเรียบร้อย");
    } else {
      const headers = [
        "งวดเดือน",
        "วันที่ใบกำกับภาษี",
        "เลขที่ใบกำกับภาษีซื้อ",
        "เลขที่เอกสารระบบ",
        "ชื่อผู้ขาย / ร้านค้า",
        "เลขประจำตัวผู้เสียภาษี 13 หลัก",
        "หมวดค่าใช้จ่าย",
        "มูลค่าก่อนภาษี",
        "ภาษีซื้อ 7%",
        "ยอดรวมทั้งสิ้น",
      ];
      const rows = filteredInputRecords.map((r) => {
        const base = round2(r.subtotalAmount || r.amount - r.vatAmount);
        const vat = round2(r.vatAmount);
        return [
          r.yearMonth,
          r.entryDate,
          r.taxInvoiceNo || "-",
          r.documentNo,
          r.vendorName || r.title,
          r.vendorTaxId || "-",
          `${r.categoryAccountCode} ${r.categoryName}`,
          base.toFixed(2),
          vat.toFixed(2),
          round2(base + vat).toFixed(2),
        ];
      });
      const csv = [
        headers.map(escapeCsvCell).join(","),
        ...rows.map((r) => r.map(escapeCsvCell).join(",")),
      ].join("\n");
      downloadCsvFile(`input-vat-report-${selectedMonthFilter}.csv`, csv);
      toast.success("ดาวน์โหลดรายงานภาษีซื้อเรียบร้อย");
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      {/* Top 3 KPI Summary Cards */}
      <div className="no-print grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card className="flex flex-col justify-between gap-1.5 border-amber-200/80 bg-gradient-to-br from-amber-50/70 to-card p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-amber-900">
              <ArrowUpRightIcon className="size-4 text-amber-700" />
              1. ภาษีขายรวม 7%
            </span>
            <Badge
              variant="outline"
              className="border-amber-200 bg-white font-mono text-[11px] font-semibold text-amber-800"
            >
              27111 · {outputVatRows.length} งวดช่องทาง
            </Badge>
          </div>
          <div className="font-mono text-[20px] font-extrabold text-amber-950">
            ฿{formatBaht(totals.totalOutputVat)}
          </div>
          <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
            <span>ฐานภาษีขายก่อนภาษี: ฿{formatBaht(totals.totalOutputBase)}</span>
            <span className="font-mono">รวมภาษี ฿{formatBaht(totals.totalOutputGross)}</span>
          </div>
        </Card>

        <Card className="flex flex-col justify-between gap-1.5 border-sky-200/80 bg-gradient-to-br from-sky-50/70 to-card p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-sky-900">
              <ArrowDownRightIcon className="size-4 text-sky-700" />
              2. ภาษีซื้อรวม 7%
            </span>
            <Badge
              variant="outline"
              className="border-sky-200 bg-white font-mono text-[11px] font-semibold text-sky-800"
            >
              17111 · {inputVatRecords.length} ใบกำกับภาษี
            </Badge>
          </div>
          <div className="font-mono text-[20px] font-extrabold text-sky-950">
            ฿{formatBaht(totals.totalInputVat)}
          </div>
          <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
            <span>ฐานภาษีซื้อก่อนภาษี: ฿{formatBaht(totals.totalInputBase)}</span>
            <span className="font-mono">บิลรายจ่ายที่มีใบกำกับภาษี</span>
          </div>
        </Card>

        <Card
          className={cn(
            "flex flex-col justify-between gap-1.5 p-4",
            totals.netVat > 0
              ? "border-rose-200/80 bg-gradient-to-br from-rose-50/70 to-card"
              : "border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 to-card",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-[12.5px] font-bold",
                totals.netVat > 0 ? "text-rose-900" : "text-emerald-900",
              )}
            >
              <ScaleIcon className="size-4" />
              3. ยอดสุทธิแบบ ภ.พ.30 (ภาษีขาย - ภาษีซื้อ)
            </span>
            <Badge
              variant="outline"
              className={cn(
                "bg-white font-mono text-[11px] font-semibold",
                totals.netVat > 0
                  ? "border-rose-200 text-rose-700"
                  : "border-emerald-200 text-emerald-700",
              )}
            >
              {totals.netVat > 0 ? "ชำระภาษีเพิ่ม (27115)" : "เครดิตภาษียกไป"}
            </Badge>
          </div>
          <div
            className={cn(
              "font-mono text-[20px] font-extrabold",
              totals.netVat > 0 ? "text-rose-700" : "text-emerald-700",
            )}
          >
            ฿{formatBaht(totals.netVat)}
          </div>
          <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
            <span>งวดที่แสดง: {periodLabel}</span>
            <span>ยื่นภายในวันที่ 15 ของเดือนถัดไป</span>
          </div>
        </Card>
      </div>

      {/* Sub-navigation & Action Bar */}
      <Card className="no-print flex flex-col justify-between gap-1.5 p-2 lg:flex-row lg:items-center">
        <div
          role="tablist"
          aria-label="ประเภทรายงานภาษีมูลค่าเพิ่ม"
          className="flex flex-wrap items-center gap-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subView === "input_docs"}
            onClick={() => setSubView("input_docs")}
            className={cn(
              "inline-flex min-h-9 items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-bold whitespace-nowrap transition-all",
              subView === "input_docs"
                ? "bg-sky-600 text-white shadow-xs"
                : "bg-muted/60 text-foreground hover:bg-muted",
            )}
          >
            <FolderOpenIcon className="size-3.5 shrink-0" />
            <span>จัดการเอกสารภาษีซื้อ</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 font-mono text-[10px]",
                subView === "input_docs"
                  ? "bg-white/20 text-white"
                  : "bg-background text-muted-foreground",
              )}
            >
              {allActiveExpenseRecords.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={subView === "pp30_summary"}
            onClick={() => setSubView("pp30_summary")}
            className={cn(
              "inline-flex min-h-9 items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-bold whitespace-nowrap transition-all",
              subView === "pp30_summary"
                ? "bg-sky-600 text-white shadow-xs"
                : "bg-muted/60 text-foreground hover:bg-muted",
            )}
          >
            <ScaleIcon className="size-3.5 shrink-0" />
            <span>เตรียมแบบภาษีรายเดือน</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 font-mono text-[10px]",
                subView === "pp30_summary"
                  ? "bg-white/20 text-white"
                  : "bg-background text-muted-foreground",
              )}
            >
              {monthlyVatRows.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={subView === "pp36_report"}
            onClick={() => setSubView("pp36_report")}
            className={cn(
              "inline-flex min-h-9 items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-bold whitespace-nowrap transition-all",
              subView === "pp36_report"
                ? "bg-sky-600 text-white shadow-xs"
                : "bg-muted/60 text-foreground hover:bg-muted",
            )}
          >
            <GlobeIcon className="size-3.5 shrink-0" />
            <span>รายงานภาษีซื้อ ภ.พ.36</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 font-mono text-[10px]",
                subView === "pp36_report"
                  ? "bg-white/20 text-white"
                  : "bg-background text-muted-foreground",
              )}
            >
              {pp36Records.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={subView === "input_vat"}
            onClick={() => setSubView("input_vat")}
            className={cn(
              "inline-flex min-h-9 items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-bold whitespace-nowrap transition-all",
              subView === "input_vat"
                ? "bg-sky-600 text-white shadow-xs"
                : "bg-muted/60 text-foreground hover:bg-muted",
            )}
          >
            <FileTextIcon className="size-3.5 shrink-0" />
            <span>รายงานภาษีซื้อ ภ.พ.30</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 font-mono text-[10px]",
                subView === "input_vat"
                  ? "bg-white/20 text-white"
                  : "bg-background text-muted-foreground",
              )}
            >
              {inputVatRecords.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={subView === "output_vat"}
            onClick={() => setSubView("output_vat")}
            className={cn(
              "inline-flex min-h-9 items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-bold whitespace-nowrap transition-all",
              subView === "output_vat"
                ? "bg-sky-600 text-white shadow-xs"
                : "bg-muted/60 text-foreground hover:bg-muted",
            )}
          >
            <FileSpreadsheetIcon className="size-3.5 shrink-0" />
            <span>รายงานภาษีขาย ภ.พ.30</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 font-mono text-[10px]",
                subView === "output_vat"
                  ? "bg-white/20 text-white"
                  : "bg-background text-muted-foreground",
              )}
            >
              {outputVatRows.length}
            </span>
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <Select
            value={selectedMonthFilter}
            onValueChange={(val) => setSelectedMonthFilter(val)}
          >
            <SelectTrigger
              aria-label="กรองตามเดือนภาษี"
              className="h-9 min-h-[36px] min-w-[130px] rounded-[10px] border-input bg-card px-2 text-[11px] font-semibold"
            >
              <SelectValue placeholder="เลือกเดือนภาษี" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                ทุกเดือนภาษี ({monthlyVatRows.length})
              </SelectItem>
              {monthlyVatRows.map((m) => (
                <SelectItem key={m.yearMonth} value={m.yearMonth}>
                  งวดเดือน {m.yearMonth}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
            className="h-9 min-h-[36px] gap-1 px-2 text-[11px] font-semibold"
          >
            <PrinterIcon className="size-3.5 text-sky-700" />
            พิมพ์
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleExportCsv}
            className="h-9 min-h-[36px] gap-1 px-2 text-[11px] font-semibold"
          >
            <DownloadIcon className="size-3.5 text-emerald-700" />
            ดาวน์โหลด
          </Button>

          <Button
            type="button"
            onClick={() => {
              const latest = filteredMonthlyRows[0] || monthlyVatRows[0] || {
                yearMonth: new Date().toISOString().slice(0, 7),
                outputVat: totals.totalOutputVat,
                inputVat: totals.totalInputVat,
              };
              onOpenVatClosingJv({
                yearMonth: latest.yearMonth,
                outputVat: latest.outputVat,
                inputVat: latest.inputVat,
              });
            }}
            className="h-9 min-h-[36px] gap-1 bg-sky-600 px-2.5 text-[11px] font-bold text-white shadow-xs hover:bg-sky-700"
          >
            <SparklesIcon className="size-3.5" />
            ปิดภาษี ภ.พ.30
          </Button>
        </div>
      </Card>

      {/* Main Content Card */}
      {subView === "pp30_summary" ? (
        <Card className="overflow-hidden border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-3 text-[12.5px]">
            <div>
              <span className="font-bold text-foreground">
                ตารางสรุปการคำนวณภาษีมูลค่าเพิ่มรายเดือน (แบบ ภ.พ.30)
              </span>
              <span className="ml-2 text-muted-foreground">
                (คำนวณภาษีขาย 7% จากยอดขายรวมภาษีแพลตฟอร์ม หักด้วยภาษีซื้อจากบิลค่าใช้จ่าย)
              </span>
            </div>
            <Badge
              variant="outline"
              className="border-emerald-200 bg-emerald-50 font-semibold text-emerald-800"
            >
              <CheckCircle2Icon className="mr-1 size-3.5" />
              พร้อมปิดบัญชีเข้า 27115 เจ้าหนี้กรมสรรพากร
            </Badge>
          </div>

          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[880px] border-collapse text-left text-[12.5px] print:min-w-0">
              <thead className="bg-sky-700 text-white">
                <tr>
                  <th className="px-4 py-3 font-semibold">งวดภาษี (เดือน)</th>
                  <th className="px-3 py-3 text-right font-semibold">
                    ฐานภาษีขาย (ก่อนภาษี)
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    ภาษีขาย 7% (27111)
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    ฐานภาษีซื้อ (ก่อนภาษี)
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    ภาษีซื้อ 7% (17111)
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    ภาษีสุทธิ ภ.พ.30
                  </th>
                  <th className="px-3 py-3 font-semibold">สถานะแบบ ภ.พ.30</th>
                  <th className="no-print px-3 py-3 text-center font-semibold">
                    ปิดบัญชีภาษี
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {filteredMonthlyRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      ยังไม่มีรายการภาษีขายหรือภาษีซื้อในงวดที่เลือก
                    </td>
                  </tr>
                ) : (
                  filteredMonthlyRows.map((row) => {
                    const isPayable = row.netVat > 0;
                    return (
                      <tr
                        key={row.yearMonth}
                        className="transition-colors hover:bg-sky-50/40"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] font-bold text-foreground">
                          {row.yearMonth}
                          <div className="font-sans text-[11px] font-normal text-muted-foreground">
                            ขาย {row.outputChannelCount} ช่องทาง · ซื้อ {row.inputBillCount} บิล
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-foreground">
                          {formatBaht(row.outputBase)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold text-amber-800">
                          {formatBaht(row.outputVat)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-foreground">
                          {row.inputBase > 0 ? formatBaht(row.inputBase) : "-"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold text-sky-700">
                          {row.inputVat > 0 ? formatBaht(row.inputVat) : "-"}
                        </td>
                        <td
                          className={cn(
                            "whitespace-nowrap px-3 py-3 text-right font-mono text-[13.5px] font-extrabold",
                            isPayable ? "text-rose-700" : "text-emerald-700",
                          )}
                        >
                          {formatBaht(row.netVat)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[11px] font-semibold",
                              isPayable
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700",
                            )}
                          >
                            {isPayable
                              ? "ชำระภาษีเพิ่ม (ภ.พ.30)"
                              : "เครดิตภาษียกไป"}
                          </Badge>
                        </td>
                        <td className="no-print whitespace-nowrap px-3 py-3 text-center">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              onOpenVatClosingJv({
                                yearMonth: row.yearMonth,
                                outputVat: row.outputVat,
                                inputVat: row.inputVat,
                              })
                            }
                            className="h-8 gap-1 border-purple-200 bg-purple-50/70 text-[11.5px] font-semibold text-purple-800 hover:bg-purple-100"
                          >
                            <SparklesIcon className="size-3.5" />
                            ปิดภาษี {row.yearMonth}
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredMonthlyRows.length > 0 && (
                <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                  <tr>
                    <td className="px-4 py-3 text-slate-900">
                      รวมทั้งหมด ({filteredMonthlyRows.length} เดือน)
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-slate-900">
                      ฿{formatBaht(totals.totalOutputBase)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-amber-900">
                      ฿{formatBaht(totals.totalOutputVat)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-slate-900">
                      ฿{formatBaht(totals.totalInputBase)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-sky-900">
                      ฿{formatBaht(totals.totalInputVat)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-3 text-right font-mono text-[14px]",
                        totals.netVat > 0 ? "text-rose-700" : "text-emerald-700",
                      )}
                    >
                      ฿{formatBaht(totals.netVat)}
                    </td>
                    <td colSpan={2} className="px-3 py-3 text-[11.5px] text-slate-600">
                      {totals.netVat > 0
                        ? "ยอดรวมต้องนำส่งกรมสรรพากร"
                        : "ยอดรวมเครดิตภาษีซื้อ"}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      ) : subView === "output_vat" ? (
        <Card className="overflow-hidden border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-3 text-[12.5px]">
            <div className="font-bold text-foreground">
              รายงานภาษีขาย 7% (ผังบัญชี 27111) แยกตามช่องทางและเดือนภาษี
            </div>
            <div className="font-mono text-[12px] font-semibold text-amber-900">
              รวมภาษีขายที่แสดง: ฿
              {formatBaht(
                filteredOutputRows.reduce((s, r) => s + r.vatAmount, 0),
              )}
            </div>
          </div>

          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[780px] border-collapse text-left text-[12.5px] print:min-w-0">
              <thead className="bg-sky-700 text-white">
                <tr>
                  <th className="px-4 py-3 font-semibold">งวดเดือน</th>
                  <th className="px-3 py-3 font-semibold">วันที่สมุดรายวัน</th>
                  <th className="px-3 py-3 font-semibold">เลขที่ใบสำคัญขาย</th>
                  <th className="px-3 py-3 font-semibold">ช่องทางแพลตฟอร์ม</th>
                  <th className="px-3 py-3 text-right font-semibold">
                    มูลค่าก่อนภาษี (ฐานภาษี)
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    ภาษีขาย 7%
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    ยอดขายรวมภาษี
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {filteredOutputRows.map((row) => (
                  <tr key={row.id} className="hover:bg-sky-50/40">
                    <td className="whitespace-nowrap px-4 py-3 font-mono font-bold">
                      {row.yearMonth}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono">
                      {formatThaiDate(row.entryDate)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono font-bold text-sky-700">
                      {row.documentNo}
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-semibold text-foreground">
                        {row.channel}
                      </span>
                      <span className="ml-2 text-[11.5px] text-muted-foreground">
                        ({row.referenceNo})
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono">
                      {formatBaht(row.baseAmount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold text-amber-800">
                      {formatBaht(row.vatAmount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-bold">
                      {formatBaht(row.grossAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : subView === "input_vat" ? (
        <Card className="overflow-hidden border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-3 text-[12.5px]">
            <div className="font-bold text-foreground">
              รายงานภาษีซื้อ 7% (ผังบัญชี 17111) จากบิลค่าใช้จ่ายบริษัท
            </div>
            <div className="font-mono text-[12px] font-semibold text-sky-900">
              รวมภาษีซื้อที่แสดง: ฿
              {formatBaht(
                filteredInputRecords.reduce((s, r) => s + r.vatAmount, 0),
              )}
            </div>
          </div>

          {filteredInputRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <div className="text-[14px] font-bold text-foreground">
                ยังไม่มีใบกำกับภาษีซื้อ 7% ในงวดที่เลือก
              </div>
              <p className="mt-1 max-w-[520px] text-[12.5px] text-muted-foreground">
                เมื่อคุณบันทึกบิลค่าใช้จ่ายในแท็บ &ldquo;บิลรายจ่าย & กำไร&rdquo; และเลือกคำนวณภาษีมูลค่าเพิ่ม 7% (แยกนอกหรือรวมใน) รายการจะปรากฏในรายงานภาษีซื้อและนำไปหักภาษีขายในแบบ ภ.พ.30 อัตโนมัติ
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full min-w-[860px] border-collapse text-left text-[12.5px] print:min-w-0">
                <thead className="bg-sky-700 text-white">
                  <tr>
                    <th className="px-4 py-3 font-semibold">วันที่</th>
                    <th className="px-3 py-3 font-semibold">เลขที่ใบกำกับภาษีซื้อ</th>
                    <th className="px-3 py-3 font-semibold">เลขที่เอกสาร EXP</th>
                    <th className="px-3 py-3 font-semibold">
                      ชื่อผู้ขาย / เลขผู้เสียภาษี 13 หลัก
                    </th>
                    <th className="px-3 py-3 font-semibold">หมวดบัญชีค่าใช้จ่าย</th>
                    <th className="px-3 py-3 text-right font-semibold">
                      มูลค่าก่อนภาษี
                    </th>
                    <th className="px-3 py-3 text-right font-semibold">
                      ภาษีซื้อ 7%
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      ยอดรวมสุทธิ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {filteredInputRecords.map((rec) => {
                    const base = round2(
                      rec.subtotalAmount || rec.amount - rec.vatAmount,
                    );
                    const vat = round2(rec.vatAmount);
                    return (
                      <tr key={rec.id} className="hover:bg-sky-50/40">
                        <td className="whitespace-nowrap px-4 py-3 font-mono">
                          {formatThaiDate(rec.entryDate)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono font-bold text-foreground">
                          {rec.taxInvoiceNo || "-"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono font-bold text-sky-700">
                          {rec.documentNo}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-foreground">
                            {rec.vendorName || rec.title}
                          </div>
                          {rec.vendorTaxId && (
                            <div className="font-mono text-[11px] text-muted-foreground">
                              เลขผู้เสียภาษี: {rec.vendorTaxId}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-[12px]">
                          <span className="font-mono font-bold text-slate-700">
                            {rec.categoryAccountCode}
                          </span>{" "}
                          <span>{rec.categoryName}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-mono">
                          {formatBaht(base)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold text-sky-700">
                          {formatBaht(vat)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-bold">
                          {formatBaht(base + vat)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : subView === "input_docs" ? (
        <Card className="overflow-hidden border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-3 text-[12.5px]">
            <div>
              <span className="font-bold text-foreground">
                จัดการเอกสารภาษีซื้อ และตรวจสอบความครบถ้วนของใบกำกับภาษี
              </span>
              <span className="ml-2 text-muted-foreground">
                (ใช้สิทธิ์ขอคืนภาษีซื้อได้ภายใน 6 เดือนนับจากเดือนที่ออกใบกำกับภาษี)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    { key: "all", label: "ทั้งหมด" },
                    { key: "ready", label: "พร้อมใช้สิทธิ์" },
                    { key: "missing_tax_info", label: "รอกรอกเลขใบกำกับฯ" },
                    { key: "no_vat", label: "ไม่มีภาษีมูลค่าเพิ่ม" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setInputDocStatusFilter(item.key)}
                    className={cn(
                      "min-h-8 rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                      inputDocStatusFilter === item.key
                        ? "border-sky-600 bg-sky-600 text-white"
                        : "border-border bg-background text-foreground hover:bg-muted",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {onGoToCreateExpense && (
                <Button
                  type="button"
                  size="sm"
                  onClick={onGoToCreateExpense}
                  className="h-8 bg-sky-600 text-[12px] font-bold text-white hover:bg-sky-700"
                >
                  + บันทึกบิลภาษีซื้อใหม่
                </Button>
              )}
            </div>
          </div>

          {filteredInputDocRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <div className="text-[14px] font-bold text-foreground">
                ยังไม่มีเอกสารบิลรายจ่ายหรือใบกำกับภาษีซื้อในหมวดที่เลือก
              </div>
              <p className="mt-1 max-w-[520px] text-[12.5px] text-muted-foreground">
                คลิกปุ่ม &ldquo;+ บันทึกบิลภาษีซื้อใหม่&rdquo; หรือไปที่เมนู &ldquo;รายการบิลค่าใช้จ่าย&rdquo; เพื่อบันทึกใบกำกับภาษีซื้อพร้อมแนบรูปใบเสร็จและระบุเลขผู้เสียภาษี 13 หลัก
              </p>
              {onGoToCreateExpense && (
                <Button
                  type="button"
                  onClick={onGoToCreateExpense}
                  className="mt-3 bg-sky-600 font-bold text-white hover:bg-sky-700"
                >
                  ไปยังหน้าบันทึกบิลค่าใช้จ่าย
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full min-w-[880px] border-collapse text-left text-[12.5px] print:min-w-0">
                <thead className="bg-sky-700 text-white">
                  <tr>
                    <th className="px-4 py-3 font-semibold">วันที่เอกสาร</th>
                    <th className="px-3 py-3 font-semibold">เลขเอกสารระบบ</th>
                    <th className="px-3 py-3 font-semibold">เลขใบกำกับภาษีซื้อ</th>
                    <th className="px-3 py-3 font-semibold">ผู้จำหน่าย / เลขผู้เสียภาษี</th>
                    <th className="px-3 py-3 text-right font-semibold">มูลค่าก่อนภาษี</th>
                    <th className="px-3 py-3 text-right font-semibold">ภาษีซื้อ 7%</th>
                    <th className="px-3 py-3 font-semibold">กำหนดใช้สิทธิ์ 6 เดือน</th>
                    <th className="px-4 py-3 font-semibold">สถานะเอกสารภาษีซื้อ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {filteredInputDocRecords.map((rec) => {
                    const base = round2(
                      rec.subtotalAmount || rec.amount - rec.vatAmount,
                    );
                    const vat = round2(rec.vatAmount);
                    const hasFullTaxDoc =
                      vat > 0 &&
                      Boolean(rec.taxInvoiceNo?.trim()) &&
                      Boolean(rec.vendorTaxId?.trim());
                    // Calculate 6-month tax credit claim window from entryDate (YYYY-MM)
                    const [yrStr, moStr] = (rec.yearMonth || "2026-01").split("-");
                    const expDate = new Date(
                      Number(yrStr) || 2026,
                      (Number(moStr) || 1) - 1 + 5,
                      1,
                    );
                    const expYm = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, "0")}`;
                    return (
                      <tr key={rec.id} className="hover:bg-sky-50/40">
                        <td className="whitespace-nowrap px-4 py-3 font-mono">
                          {formatThaiDate(rec.entryDate)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono font-bold text-sky-700">
                          {rec.documentNo}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono font-bold">
                          {rec.taxInvoiceNo || "ยังไม่ระบุเลขใบกำกับฯ"}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-foreground">
                            {rec.vendorName || rec.title}
                          </div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {rec.vendorTaxId
                              ? `เลขผู้เสียภาษี: ${rec.vendorTaxId}`
                              : "ยังไม่ระบุเลขผู้เสียภาษี 13 หลัก"}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-mono">
                          {formatBaht(base)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold text-sky-700">
                          {vat > 0 ? formatBaht(vat) : "-"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-[11.5px] text-muted-foreground">
                          {vat > 0 ? `ภายในงวด ${expYm}` : "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[11px] font-semibold",
                              hasFullTaxDoc
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : vat > 0
                                  ? "border-amber-200 bg-amber-50 text-amber-800"
                                  : "border-slate-200 bg-slate-100 text-slate-700",
                            )}
                          >
                            {hasFullTaxDoc
                              ? "พร้อมใช้สิทธิ์ใบกำกับภาษี"
                              : vat > 0
                                ? "รอระบุเลขใบกำกับฯ / เลขผู้เสียภาษี"
                                : "บิลค่าใช้จ่ายไม่มีภาษีมูลค่าเพิ่ม"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-3 text-[12.5px]">
            <div>
              <span className="font-bold text-foreground">
                รายงานภาษีซื้อ ภ.พ.36 (นำส่งภาษีมูลค่าเพิ่ม 7% สำหรับค่าบริการและค่าโฆษณาต่างประเทศ)
              </span>
              <span className="ml-2 text-muted-foreground">
                (เช่น ค่าโฆษณาแพลตฟอร์มต่างประเทศที่ต้องยื่นแบบ ภ.พ.36 ภายในวันที่ 7 ของเดือนถัดไป)
              </span>
            </div>
            <Badge
              variant="outline"
              className="border-sky-200 bg-sky-50 font-semibold text-sky-800"
            >
              รวม {pp36Records.length} รายการ
            </Badge>
          </div>

          {pp36Records.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <div className="text-[14px] font-bold text-foreground">
                ยังไม่มีรายการค่าบริการหรือค่าโฆษณาต่างประเทศที่เข้าข่ายแบบ ภ.พ.36 ในงวดที่เลือก
              </div>
              <p className="mt-1 max-w-[540px] text-[12.5px] text-muted-foreground">
                เมื่อคุณบันทึกบิลค่าใช้จ่ายหมวดค่าโฆษณาออนไลน์ หรือระบุคำว่า &ldquo;ภ.พ.36&rdquo; / &ldquo;ต่างประเทศ&rdquo; ระบบจะดึงมาคำนวณภาษีมูลค่าเพิ่มนำส่ง 7% ตามแบบ ภ.พ.36 ในตารางนี้อัตโนมัติ
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full min-w-[820px] border-collapse text-left text-[12.5px] print:min-w-0">
                <thead className="bg-sky-700 text-white">
                  <tr>
                    <th className="px-4 py-3 font-semibold">วันที่จ่ายเงิน</th>
                    <th className="px-3 py-3 font-semibold">เลขที่เอกสาร</th>
                    <th className="px-3 py-3 font-semibold">ผู้ให้บริการต่างประเทศ / รายการ</th>
                    <th className="px-3 py-3 font-semibold">หมวดบัญชี</th>
                    <th className="px-3 py-3 text-right font-semibold">จำนวนเงินที่จ่าย</th>
                    <th className="px-4 py-3 text-right font-semibold">ภาษีนำส่ง ภ.พ.36 (7%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {pp36Records.map((rec) => {
                    const base = round2(
                      rec.subtotalAmount || rec.amount - rec.vatAmount,
                    );
                    const pp36Vat =
                      rec.vatAmount > 0
                        ? round2(rec.vatAmount)
                        : round2(base * 0.07);
                    return (
                      <tr key={rec.id} className="hover:bg-sky-50/40">
                        <td className="whitespace-nowrap px-4 py-3 font-mono">
                          {formatThaiDate(rec.entryDate)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono font-bold text-sky-700">
                          {rec.documentNo}
                        </td>
                        <td className="px-3 py-3 font-semibold text-foreground">
                          {rec.vendorName || rec.title}
                        </td>
                        <td className="px-3 py-3 text-[12px]">
                          <span className="font-mono font-bold">
                            {rec.categoryAccountCode}
                          </span>{" "}
                          <span>{rec.categoryName}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-mono">
                          {formatBaht(base)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-bold text-purple-800">
                          {formatBaht(pp36Vat)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
