"use client";

import React, { useMemo, useState } from "react";
import {
  CheckCircle2Icon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  Edit2Icon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderPlusIcon,
  ImageIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PlusIcon,
  PrinterIcon,
  SearchIcon,
  Trash2Icon,
  XCircleIcon,
  XIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  ExpenseCategory,
  ExpensePaymentStatus,
  ExpenseRecord,
} from "@/lib/expenses";
import { formatTHB } from "@/lib/format";
import { cn } from "@/lib/utils";

function formatThaiDateDMY(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

const CATEGORY_BADGE_STYLES: Record<string, string> = {
  rose: "bg-rose-50 text-rose-900 border-rose-200",
  amber: "bg-amber-50 text-amber-950 border-amber-200",
  blue: "bg-sky-50 text-sky-950 border-sky-200",
  emerald: "bg-emerald-50 text-emerald-950 border-emerald-200",
  cyan: "bg-cyan-50 text-cyan-950 border-cyan-200",
  purple: "bg-purple-50 text-purple-950 border-purple-200",
  slate: "bg-slate-100 text-slate-800 border-slate-200",
};

interface ExpenseLedgerTabProps {
  records: ExpenseRecord[];
  categories: ExpenseCategory[];
  availableMonths: string[];
  formatThaiYearMonth: (ym: string) => string;
  initialStatusFilter?: string;
  onCreateNew: () => void;
  onEditRecord: (rec: ExpenseRecord) => void;
  onDuplicateRecord: (rec: ExpenseRecord) => void;
  onDeleteRecord: (id: number) => void;
  onStatusChange: (id: number, status: ExpensePaymentStatus) => void;
  onPreviewReceipt: (rec: ExpenseRecord) => void;
  onPrintVoucher: (rec: ExpenseRecord) => void;
  onAddCategory: () => void;
  deletingRecordId: number | null;
  updatingStatusId: number | null;
}

export function ExpenseLedgerTab({
  records,
  categories,
  availableMonths,
  formatThaiYearMonth,
  initialStatusFilter = "all",
  onCreateNew,
  onEditRecord,
  onDuplicateRecord,
  onDeleteRecord,
  onStatusChange,
  onPreviewReceipt,
  onPrintVoucher,
  onAddCategory,
  deletingRecordId,
  updatingStatusId,
}: ExpenseLedgerTabProps) {
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  React.useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter);
    }
  }, [initialStatusFilter]);

  // Compute counts across all records (top-down filter hierarchy)
  const filterCounts = useMemo(() => {
    const base = records.filter((r) => {
      if (monthFilter !== "all" && r.yearMonth !== monthFilter) return false;
      if (categoryFilter !== "all" && String(r.categoryId) !== categoryFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const match =
          r.documentNo.toLowerCase().includes(q) ||
          r.vendorName.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.categoryName.toLowerCase().includes(q) ||
          r.categoryAccountCode.toLowerCase().includes(q) ||
          r.taxInvoiceNo.toLowerCase().includes(q) ||
          (r.note || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    let allActive = 0;
    let paid = 0;
    let pending = 0;
    let vat = 0;
    let wht = 0;
    let voided = 0;

    for (const r of base) {
      if (r.paymentStatus === "void") {
        voided++;
        continue;
      }
      allActive++;
      if (r.paymentStatus === "pending") pending++;
      else paid++;
      if (r.vatAmount > 0) vat++;
      if (r.whtAmount > 0) wht++;
    }

    return {
      all: base.length,
      allActive,
      paid,
      pending,
      vat,
      wht,
      voided,
    };
  }, [records, monthFilter, categoryFilter, searchQuery]);

  // Filtered records for display
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (monthFilter !== "all" && r.yearMonth !== monthFilter) return false;
      if (categoryFilter !== "all" && String(r.categoryId) !== categoryFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const match =
          r.documentNo.toLowerCase().includes(q) ||
          r.vendorName.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.categoryName.toLowerCase().includes(q) ||
          r.categoryAccountCode.toLowerCase().includes(q) ||
          r.taxInvoiceNo.toLowerCase().includes(q) ||
          (r.note || "").toLowerCase().includes(q);
        if (!match) return false;
      }

      if (statusFilter === "paid") return r.paymentStatus === "paid";
      if (statusFilter === "pending") return r.paymentStatus === "pending";
      if (statusFilter === "vat")
        return r.paymentStatus !== "void" && r.vatAmount > 0;
      if (statusFilter === "wht")
        return r.paymentStatus !== "void" && r.whtAmount > 0;
      if (statusFilter === "void") return r.paymentStatus === "void";
      return true;
    });
  }, [records, monthFilter, categoryFilter, searchQuery, statusFilter]);

  // Summary totals for the currently filtered active records
  const summary = useMemo(() => {
    let subtotal = 0;
    let vat = 0;
    let total = 0;
    let wht = 0;
    let netPaid = 0;
    let activeCount = 0;

    for (const r of filteredRecords) {
      if (r.paymentStatus === "void") continue;
      activeCount++;
      subtotal += r.subtotalAmount;
      vat += r.vatAmount;
      total += r.amount;
      wht += r.whtAmount;
      netPaid += r.netPaidAmount;
    }

    return {
      activeCount,
      subtotal,
      vat,
      total,
      wht,
      netPaid,
    };
  }, [filteredRecords]);

  // CSV / Excel Export Function (UTF-8 BOM for Thai compatibility in Excel)
  const handleExportCsv = (mode: "all" | "vat" | "wht") => {
    const targetRows = filteredRecords.filter((r) => {
      if (r.paymentStatus === "void") return false;
      if (mode === "vat") return r.vatAmount > 0;
      if (mode === "wht") return r.whtAmount > 0;
      return true;
    });

    const headers = [
      "วันที่เอกสาร",
      "เลขที่เอกสาร",
      "ชื่อผู้จำหน่าย/ผู้รับเงิน",
      "เลขประจำตัวผู้เสียภาษี",
      "เลขที่ใบกำกับภาษีซื้อ",
      "รหัสผังบัญชี",
      "หมวดหมู่รายจ่าย",
      "รายละเอียดรายการ",
      "ยอดก่อนภาษี (บาท)",
      "ภาษีซื้อ VAT 7% (บาท)",
      "ยอดรวมสุทธิ (บาท)",
      "อัตราหัก ณ ที่จ่าย (%)",
      "ภาษีหัก ณ ที่จ่าย (บาท)",
      "ยอดจ่ายจริงสุทธิ (บาท)",
      "สถานะการชำระ",
      "ช่องทางชำระ",
      "หมายเหตุ",
    ];

    const escapeCsv = (val: string | number | null | undefined) => {
      const s = String(val ?? "");
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const lines = [
      headers.join(","),
      ...targetRows.map((r) =>
        [
          formatThaiDateDMY(r.entryDate),
          r.documentNo,
          r.vendorName || r.title,
          r.vendorTaxId ? `'${r.vendorTaxId}` : "",
          r.taxInvoiceNo,
          r.categoryAccountCode,
          r.categoryName,
          r.title,
          r.subtotalAmount.toFixed(2),
          r.vatAmount.toFixed(2),
          r.amount.toFixed(2),
          r.whtRate,
          r.whtAmount.toFixed(2),
          r.netPaidAmount.toFixed(2),
          r.paymentStatus === "paid" ? "ชำระเงินแล้ว" : "รอชำระ",
          r.paymentMethod,
          r.note || "",
        ]
          .map(escapeCsv)
          .join(","),
      ),
    ];

    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const suffix =
      mode === "vat"
        ? "รายงานภาษีซื้อ_VAT"
        : mode === "wht"
          ? "รายงานหัก_ณ_ที่จ่าย_WHT"
          : "สมุดรายจ่าย_EXP";
    link.href = url;
    link.download = `PCMS_${suffix}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const hasActiveFilter =
    statusFilter !== "all" ||
    monthFilter !== "all" ||
    categoryFilter !== "all" ||
    searchQuery.trim() !== "";

  // Clean Empty State when there are 0 expense records in the entire system
  if (records.length === 0) {
    return (
      <Card className="overflow-hidden border border-slate-200 bg-white shadow-2xs rounded-xl">
        <div className="flex flex-col items-center justify-center gap-4 px-6 py-14 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-rose-50 text-[#fe2c55] shadow-2xs">
            <FileTextIcon className="size-7 stroke-[1.75]" />
          </div>
          <div className="flex flex-col gap-1.5 max-w-md">
            <h3 className="text-base font-bold text-slate-900">
              ยังไม่มีรายการบิลค่าใช้จ่ายในระบบ
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              เริ่มบันทึกบิลค่าใช้จ่ายใบแรกเพื่อออกเลขที่เอกสาร{" "}
              <span className="font-mono font-semibold text-slate-700">
                EXP...
              </span>{" "}
              อัตโนมัติ พร้อมบันทึกชื่อผู้จำหน่าย ภาษีซื้อ VAT 7% หัก ณ ที่จ่าย
              และแนบรูปใบเสร็จรับเงิน
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 mt-1">
            <Button
              type="button"
              size="sm"
              onClick={onCreateNew}
              className="h-9.5 gap-1.5 px-5 text-xs font-bold bg-[#fe2c55] hover:bg-[#e0264b] text-white shadow-xs rounded-lg"
            >
              <PlusIcon className="size-4" />
              สร้างบิลรายจ่ายใบแรก
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddCategory}
              className="h-9.5 gap-1.5 px-4 text-xs font-semibold bg-white border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg"
            >
              <FolderPlusIcon className="size-4 text-slate-500" />
              เพิ่มหมวดหมู่บัญชี ({categories.length})
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border border-slate-200 bg-white shadow-2xs rounded-xl">
      {/* Unified Single-Card Toolbar (FlowAccount Style) */}
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-white p-3.5 sm:px-4">
        {/* Top Row: Status Pills on Left + Filters & Search & Export on Right */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Status Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              onClick={() => setStatusFilter("all")}
              className={cn(
                "h-8 gap-1.5 px-3 text-xs font-bold rounded-full transition-all",
                statusFilter === "all"
                  ? "bg-slate-900 text-white hover:bg-slate-800 shadow-2xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200/80",
              )}
            >
              แสดงทั้งหมด
              <span className="font-mono text-[11px] opacity-80">
                ({filterCounts.all})
              </span>
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => setStatusFilter("paid")}
              className={cn(
                "h-8 gap-1.5 px-3 text-xs font-bold rounded-full transition-all",
                statusFilter === "paid"
                  ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs"
                  : "bg-emerald-50/80 text-emerald-900 hover:bg-emerald-100/80",
              )}
            >
              <span className="size-1.5 rounded-full bg-current" />
              ชำระเงินแล้ว ({filterCounts.paid})
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => setStatusFilter("pending")}
              className={cn(
                "h-8 gap-1.5 px-3 text-xs font-bold rounded-full transition-all",
                statusFilter === "pending"
                  ? "bg-amber-600 text-white hover:bg-amber-700 shadow-2xs"
                  : "bg-amber-50/80 text-amber-900 hover:bg-amber-100/80",
              )}
            >
              <span className="size-1.5 rounded-full bg-current" />
              รอชำระ ({filterCounts.pending})
            </Button>

            {filterCounts.vat > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={() => setStatusFilter("vat")}
                className={cn(
                  "h-8 gap-1.5 px-3 text-xs font-bold rounded-full transition-all",
                  statusFilter === "vat"
                    ? "bg-sky-600 text-white hover:bg-sky-700 shadow-2xs"
                    : "bg-sky-50/80 text-sky-900 hover:bg-sky-100/80",
                )}
              >
                VAT 7% ({filterCounts.vat})
              </Button>
            )}

            {filterCounts.wht > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={() => setStatusFilter("wht")}
                className={cn(
                  "h-8 gap-1.5 px-3 text-xs font-bold rounded-full transition-all",
                  statusFilter === "wht"
                    ? "bg-purple-600 text-white hover:bg-purple-700 shadow-2xs"
                    : "bg-purple-50/80 text-purple-900 hover:bg-purple-100/80",
                )}
              >
                หัก ณ ที่จ่าย ({filterCounts.wht})
              </Button>
            )}

            {filterCounts.voided > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={() => setStatusFilter("void")}
                className={cn(
                  "h-8 gap-1.5 px-3 text-xs font-bold rounded-full transition-all",
                  statusFilter === "void"
                    ? "bg-slate-600 text-white hover:bg-slate-700"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                ยกเลิก ({filterCounts.voided})
              </Button>
            )}
          </div>

          {/* Right Controls: Month, Category, Search, Export */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Month Filter */}
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger
                aria-label="กรองตามเดือน"
                className="h-8.5 w-full sm:w-[165px] rounded-lg border-slate-200 bg-white px-2.5 text-xs font-semibold shadow-2xs"
              >
                <SelectValue placeholder="ทุกเดือน" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-800 shadow-xl rounded-lg z-50">
                <SelectItem value="all" className="text-xs font-semibold">
                  ทุกเดือน ({records.length} บิล)
                </SelectItem>
                {availableMonths.map((ym) => (
                  <SelectItem
                    key={ym}
                    value={ym}
                    className="text-xs font-medium"
                  >
                    {formatThaiYearMonth(ym)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Category Filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger
                aria-label="กรองตามหมวดหมู่บัญชี"
                className="h-8.5 w-full sm:w-[185px] rounded-lg border-slate-200 bg-white px-2.5 text-xs font-semibold shadow-2xs"
              >
                <SelectValue placeholder="ทุกหมวดหมู่" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-800 shadow-xl rounded-lg z-50">
                <SelectItem value="all" className="text-xs font-semibold">
                  ทุกหมวดหมู่ ({categories.length})
                </SelectItem>
                {categories.map((cat) => (
                  <SelectItem
                    key={cat.id}
                    value={String(cat.id)}
                    className="text-xs font-medium"
                  >
                    {cat.accountCode
                      ? `${cat.accountCode} / ${cat.name}`
                      : cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Search Input */}
            <div className="relative w-full sm:w-[220px]">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาเลข EXP, ผู้จำหน่าย..."
                className="h-8.5 pl-8 pr-7 text-xs border-slate-200 bg-white rounded-lg"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="ล้างคำค้นหา"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>

            {hasActiveFilter && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter("all");
                  setMonthFilter("all");
                  setCategoryFilter("all");
                  setSearchQuery("");
                }}
                className="h-8.5 px-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg"
              >
                ล้างตัวกรอง
              </Button>
            )}

            {/* Export Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8.5 gap-1.5 px-3 text-xs font-semibold bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs rounded-lg"
                >
                  <DownloadIcon className="size-3.5 text-emerald-600" />
                  ส่งออก Excel
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-64 bg-white border border-slate-200 shadow-xl rounded-xl p-1"
              >
                <DropdownMenuItem
                  onClick={() => handleExportCsv("all")}
                  className="text-xs font-medium cursor-pointer rounded-lg py-2"
                >
                  <FileSpreadsheetIcon className="mr-2 size-4 text-emerald-600" />
                  1. รายงานบิลค่าใช้จ่ายทั้งหมด
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExportCsv("vat")}
                  className="text-xs font-medium cursor-pointer rounded-lg py-2"
                >
                  <FileTextIcon className="mr-2 size-4 text-sky-600" />
                  2. รายงานภาษีซื้อ 7% (ยื่น ภ.พ.30)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExportCsv("wht")}
                  className="text-xs font-medium cursor-pointer rounded-lg py-2"
                >
                  <FileTextIcon className="mr-2 size-4 text-purple-600" />
                  3. รายงานหัก ณ ที่จ่าย (ภ.ง.ด.3/53)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Table Content */}
      {filteredRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2.5 p-10 text-center">
          <p className="text-sm font-bold text-slate-800">
            ไม่พบรายการบิลรายจ่ายที่ตรงกับตัวกรอง
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setStatusFilter("all");
              setMonthFilter("all");
              setCategoryFilter("all");
              setSearchQuery("");
            }}
            className="h-8.5 px-3.5 text-xs font-semibold rounded-lg"
          >
            แสดงบิลทั้งหมด
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[900px] text-xs">
            <TableHeader
              sticky={false}
              className="bg-[#f8fafc] border-b border-slate-200"
            >
              <TableRow className="border-b border-slate-200">
                <TableHead
                  sticky={false}
                  className="w-[62px] text-center font-bold text-slate-700"
                >
                  ใบเสร็จ
                </TableHead>
                <TableHead
                  sticky={false}
                  className="w-[105px] font-bold text-slate-800"
                >
                  วันที่
                </TableHead>
                <TableHead
                  sticky={false}
                  className="w-[165px] font-bold text-slate-800"
                >
                  เลขที่เอกสาร
                </TableHead>
                <TableHead sticky={false} className="font-bold text-slate-800">
                  ชื่อผู้จำหน่าย / รายการค่าใช้จ่าย
                </TableHead>
                <TableHead
                  sticky={false}
                  className="w-[215px] font-bold text-slate-800"
                >
                  หมวดหมู่
                </TableHead>
                <TableHead
                  sticky={false}
                  className="w-[140px] text-right font-bold text-slate-800"
                >
                  ยอดรวมสุทธิ
                </TableHead>
                <TableHead
                  sticky={false}
                  className="w-[138px] text-center font-bold text-slate-800"
                >
                  สถานะ
                </TableHead>
                <TableHead
                  sticky={false}
                  className="w-[56px] text-center font-bold text-slate-700"
                >
                  จัดการ
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredRecords.map((rec) => {
                const isVoid = rec.paymentStatus === "void";
                const badgeStyle =
                  CATEGORY_BADGE_STYLES[rec.categoryColor] ||
                  CATEGORY_BADGE_STYLES.slate;

                return (
                  <TableRow
                    key={rec.id}
                    className={cn(
                      "border-b border-slate-200/80 transition-colors",
                      isVoid
                        ? "bg-slate-50/70 opacity-60"
                        : "bg-white hover:bg-slate-50/80",
                    )}
                  >
                    {/* Col 1: Receipt Thumbnail */}
                    <TableCell className="text-center py-2.5">
                      <button
                        type="button"
                        onClick={() => onPreviewReceipt(rec)}
                        title={
                          rec.attachmentUrl
                            ? "คลิกเพื่อดูรูปใบเสร็จแนบ"
                            : "คลิกเพื่อดูรายละเอียด / แนบรูปใบเสร็จ"
                        }
                        aria-label={`ดูใบเสร็จ ${rec.documentNo}`}
                        className={cn(
                          "mx-auto flex size-10 items-center justify-center rounded-lg border transition-all overflow-hidden",
                          rec.attachmentUrl
                            ? "border-emerald-300 bg-emerald-50/40 hover:ring-2 hover:ring-emerald-400 shadow-2xs"
                            : "border-slate-200 bg-slate-100/80 text-slate-400 hover:border-slate-300 hover:text-slate-600",
                        )}
                      >
                        {rec.attachmentUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={rec.attachmentUrl}
                            alt={rec.documentNo}
                            className="size-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="size-4" />
                        )}
                      </button>
                    </TableCell>

                    {/* Col 2: Date (DD-MM-YYYY like FlowAccount) */}
                    <TableCell className="font-mono font-semibold text-slate-700 whitespace-nowrap">
                      {formatThaiDateDMY(rec.entryDate)}
                    </TableCell>

                    {/* Col 3: Document No (Green dot + EXP... + file icon) */}
                    <TableCell className="whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onPrintVoucher(rec)}
                        className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-slate-900 hover:text-[#fe2c55] transition-colors group"
                        title="คลิกเพื่อดู / พิมพ์ใบสำคัญจ่าย"
                      >
                        <span
                          className={cn(
                            "size-2 rounded-full shrink-0",
                            rec.paymentStatus === "paid"
                              ? "bg-emerald-500"
                              : rec.paymentStatus === "pending"
                                ? "bg-amber-500"
                                : "bg-slate-400",
                          )}
                        />
                        <span
                          className={cn(
                            isVoid && "line-through text-slate-400",
                          )}
                        >
                          {rec.documentNo}
                        </span>
                        <FileTextIcon className="size-3.5 text-sky-600 group-hover:text-[#fe2c55] shrink-0" />
                      </button>
                    </TableCell>

                    {/* Col 4: Vendor Name & Item Title */}
                    <TableCell className="py-2.5">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-slate-900 text-xs">
                            {rec.vendorName || rec.title}
                          </span>
                          {rec.taxInvoiceNo && (
                            <Badge
                              variant="outline"
                              className="px-1.5 py-0 text-[10px] font-mono bg-slate-50 text-slate-600 border-slate-200"
                            >
                              ใบกำกับฯ: {rec.taxInvoiceNo}
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5">
                          {rec.vendorName && rec.title !== rec.vendorName && (
                            <span>{rec.title}</span>
                          )}
                          {rec.vendorTaxId && (
                            <span className="font-mono text-[10.5px] text-slate-400">
                              (เลขผู้เสียภาษี {rec.vendorTaxId})
                            </span>
                          )}
                          {rec.note && (
                            <span className="text-slate-400">· {rec.note}</span>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Col 5: Account Code & Category Badge */}
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-semibold text-[11px] px-2 py-0.5 max-w-[205px] truncate",
                          badgeStyle,
                        )}
                        title={
                          rec.categoryAccountCode
                            ? `${rec.categoryAccountCode} / ${rec.categoryName}`
                            : rec.categoryName
                        }
                      >
                        {rec.categoryAccountCode ? (
                          <span>
                            <strong className="font-mono">
                              {rec.categoryAccountCode}
                            </strong>{" "}
                            / {rec.categoryName}
                          </span>
                        ) : (
                          rec.categoryName
                        )}
                      </Badge>
                    </TableCell>

                    {/* Col 6: Net Total + Tax Breakdown Info Icon */}
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1">
                        <span
                          className={cn(
                            "font-mono text-[13px] font-bold",
                            isVoid
                              ? "line-through text-slate-400"
                              : "text-slate-900",
                          )}
                        >
                          {formatTHB(rec.amount)}
                        </span>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={`ดูรายละเอียดภาษี ${rec.documentNo}`}
                              className="text-sky-600 hover:text-sky-700 p-0.5 rounded"
                            >
                              <InfoIcon className="size-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="left"
                            className="bg-slate-900 text-white border-slate-800 p-2.5 text-xs shadow-xl rounded-lg"
                          >
                            <div className="flex flex-col gap-1 min-w-[180px]">
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-300">ก่อนภาษี:</span>
                                <span className="font-mono font-semibold">
                                  {formatTHB(rec.subtotalAmount)}
                                </span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-300">
                                  ภาษีมูลค่าเพิ่ม 7%:
                                </span>
                                <span className="font-mono text-sky-300">
                                  {formatTHB(rec.vatAmount)}
                                </span>
                              </div>
                              <div className="flex justify-between gap-4 border-t border-slate-700 pt-1">
                                <span className="font-bold">รวมค่าใช้จ่าย:</span>
                                <span className="font-mono font-bold">
                                  {formatTHB(rec.amount)}
                                </span>
                              </div>
                              {rec.whtAmount > 0 && (
                                <div className="flex justify-between gap-4 text-purple-300">
                                  <span>หัก ณ ที่จ่าย ({rec.whtRate}%):</span>
                                  <span className="font-mono">
                                    -{formatTHB(rec.whtAmount)}
                                  </span>
                                </div>
                              )}
                              <div className="flex justify-between gap-4 border-t border-slate-700 pt-1 text-emerald-300 font-bold">
                                <span>จ่ายสุทธิจริง:</span>
                                <span className="font-mono">
                                  {formatTHB(rec.netPaidAmount)}
                                </span>
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>

                    {/* Col 7: Status Dropdown Pill (like FlowAccount) */}
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            disabled={updatingStatusId === rec.id}
                            aria-label={`เปลี่ยนสถานะ ${rec.documentNo}`}
                            className={cn(
                              "inline-flex h-7 items-center justify-between gap-1.5 rounded-md border px-2.5 text-[11px] font-bold transition-all min-w-[108px]",
                              rec.paymentStatus === "paid"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                                : rec.paymentStatus === "pending"
                                  ? "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                                  : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200",
                            )}
                          >
                            <span>
                              {rec.paymentStatus === "paid"
                                ? "ชำระเงินแล้ว"
                                : rec.paymentStatus === "pending"
                                  ? "รอชำระ"
                                  : "ยกเลิกแล้ว"}
                            </span>
                            <span className="text-[10px] opacity-70">▾</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="center"
                          className="w-40 bg-white border border-slate-200 shadow-lg rounded-lg p-1"
                        >
                          <DropdownMenuItem
                            onClick={() => onStatusChange(rec.id, "paid")}
                            className="text-xs font-semibold text-emerald-700 cursor-pointer"
                          >
                            <CheckCircle2Icon className="mr-2 size-3.5 text-emerald-600" />
                            ชำระเงินแล้ว
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onStatusChange(rec.id, "pending")}
                            className="text-xs font-semibold text-amber-700 cursor-pointer"
                          >
                            <ClockIcon className="mr-2 size-3.5 text-amber-600" />
                            เตรียมจ่าย (รอชำระ)
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onStatusChange(rec.id, "void")}
                            className="text-xs font-semibold text-slate-500 cursor-pointer"
                          >
                            <XCircleIcon className="mr-2 size-3.5 text-slate-400" />
                            ยกเลิกเอกสาร
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>

                    {/* Col 8: 3-Dot Action Menu */}
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`จัดการเอกสาร ${rec.documentNo}`}
                            className="size-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                          >
                            <MoreHorizontalIcon className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-48 bg-white border border-slate-200 shadow-xl rounded-xl p-1"
                        >
                          <DropdownMenuItem
                            onClick={() => onPrintVoucher(rec)}
                            className="text-xs font-medium cursor-pointer rounded-lg py-1.5"
                          >
                            <PrinterIcon className="mr-2 size-3.5 text-[#fe2c55]" />
                            ดู / พิมพ์ใบสำคัญจ่าย
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onPreviewReceipt(rec)}
                            className="text-xs font-medium cursor-pointer rounded-lg py-1.5"
                          >
                            <ImageIcon className="mr-2 size-3.5 text-emerald-600" />
                            ดูรูปใบเสร็จแนบ
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onEditRecord(rec)}
                            className="text-xs font-medium cursor-pointer rounded-lg py-1.5"
                          >
                            <Edit2Icon className="mr-2 size-3.5 text-slate-600" />
                            แก้ไขเอกสาร
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onDuplicateRecord(rec)}
                            className="text-xs font-medium cursor-pointer rounded-lg py-1.5"
                          >
                            <CopyIcon className="mr-2 size-3.5 text-sky-600" />
                            คัดลอกสร้างบิลซ้ำ
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={deletingRecordId === rec.id}
                            onClick={() => onDeleteRecord(rec.id)}
                            className="text-xs font-semibold text-rose-600 focus:text-rose-600 cursor-pointer rounded-lg py-1.5"
                          >
                            <Trash2Icon className="mr-2 size-3.5 text-rose-600" />
                            ลบเอกสารนี้ถาวร
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>

            {/* Footer Totals Row */}
            <TableFooter className="border-t-2 border-slate-300 bg-[#f8fafc] font-bold text-slate-900">
              <TableRow>
                <TableCell colSpan={4} className="text-xs font-bold">
                  รวมเอกสารที่ใช้งาน ({summary.activeCount} ใบ)
                </TableCell>
                <TableCell className="text-right font-mono text-[11px] text-slate-600">
                  VAT: {formatTHB(summary.vat)} · WHT: {formatTHB(summary.wht)}
                </TableCell>
                <TableCell className="text-right font-mono text-[13px] font-black text-rose-700">
                  {formatTHB(summary.total)}
                </TableCell>
                <TableCell
                  colSpan={2}
                  className="text-center font-mono text-[11px] text-emerald-700"
                >
                  จ่ายจริง: {formatTHB(summary.netPaid)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </Card>
  );
}
