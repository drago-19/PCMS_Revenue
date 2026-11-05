"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CalendarIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronDownIcon,
  Loader2Icon,
  PlusIcon,
  PrinterIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
  WalletIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACCOUNT_TYPE_META,
  JOURNAL_BOOK_META,
  validateJournalEntryLines,
  type AccountType,
  type GeneralLedgerAccountRow,
  type JournalEntryLine,
  type JournalVoucher,
} from "@/lib/accounting-types";
import { formatBaht, formatThaiDate } from "@/lib/format";
import type { SellerInfo } from "@/lib/seller";
import { cn } from "@/lib/utils";

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function SearchableAccountSelect({
  accounts,
  value,
  onValueChange,
  ariaLabel,
}: {
  accounts: GeneralLedgerAccountRow[];
  value: string;
  onValueChange: (nextCode: string) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<"all" | AccountType>("all");

  const selectedAcc = useMemo(
    () => accounts.find((a) => a.accountCode === value) || null,
    [accounts, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((acc) => {
      if (catFilter !== "all" && acc.accountType !== catFilter) return false;
      if (!q) return true;
      return (
        acc.accountCode.toLowerCase().includes(q) ||
        acc.accountName.toLowerCase().includes(q) ||
        acc.primaryGroup.toLowerCase().includes(q) ||
        acc.secondaryGroup.toLowerCase().includes(q)
      );
    });
  }, [accounts, query, catFilter]);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel || "เลือกผังบัญชี"}
          className="flex h-10 min-h-[40px] w-full items-center justify-between gap-1.5 rounded-[10px] border border-input bg-card px-2.5 text-left text-[12.5px] font-medium text-foreground shadow-xs transition-[color,box-shadow,border-color] outline-none hover:border-slate-400 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
        >
          <span className="truncate">
            {selectedAcc ? (
              <>
                <span className="font-mono font-bold text-sky-800">
                  {selectedAcc.accountCode}
                </span>
                <span className="ml-1 text-foreground">
                  · {selectedAcc.accountName}
                </span>
              </>
            ) : value ? (
              <span className="font-mono font-bold text-sky-800">{value}</span>
            ) : (
              <span className="text-muted-foreground">-- เลือกผังบัญชี --</span>
            )}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[340px] p-2 sm:w-[400px]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="relative mb-2">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="พิมพ์ค้นหา รหัสบัญชี หรือ ชื่อบัญชี..."
            aria-label="ค้นหาผังบัญชี"
            className="h-9 pr-8 pl-8 text-[12.5px]"
          />
          {query && (
            <button
              type="button"
              aria-label="ล้างคำค้นหาผังบัญชี"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <XIcon className="size-3" />
            </button>
          )}
        </div>

        <div className="mb-2 flex flex-wrap gap-1">
          {(
            [
              { key: "all", label: "ทั้งหมด" },
              { key: "asset", label: "1.สินทรัพย์" },
              { key: "liability", label: "2.หนี้สิน" },
              { key: "equity", label: "3.ทุน" },
              { key: "revenue", label: "4.รายได้" },
              { key: "expense", label: "5.ค่าใช้จ่าย" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setCatFilter(tab.key)}
              className={cn(
                "rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors",
                catFilter === tab.key
                  ? "bg-sky-600 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="max-h-[260px] overflow-y-auto divide-y divide-border/60 rounded-lg border border-border">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
              ไม่พบรหัสหรือชื่อบัญชีที่ค้นหา
            </div>
          ) : (
            filtered.map((acc) => {
              const isSelected = acc.accountCode === value;
              const meta = ACCOUNT_TYPE_META[acc.accountType];
              return (
                <button
                  key={acc.accountCode}
                  type="button"
                  onClick={() => {
                    onValueChange(acc.accountCode);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-[12px] transition-colors hover:bg-sky-50",
                    isSelected && "bg-sky-50/80 font-semibold",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-sky-800">
                        {acc.accountCode}
                      </span>
                      <span className="truncate text-foreground">
                        {acc.accountName}
                      </span>
                    </div>
                    <div className="truncate text-[10.5px] text-muted-foreground">
                      {meta.label} · {acc.secondaryGroup}
                    </div>
                  </div>
                  {isSelected && (
                    <CheckIcon className="size-4 shrink-0 text-sky-600" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 1. Modal ดูรายการเดินบัญชีแยกประเภท (General Ledger Account Drill-Down) */
export function AccountLedgerDetailDialog({
  open,
  onOpenChange,
  account,
  onSelectVoucher,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: GeneralLedgerAccountRow | null;
  onSelectVoucher?: (voucherId: string) => void;
}) {
  if (!account) return null;

  const meta = ACCOUNT_TYPE_META[account.accountType];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[920px]">
        <DialogHeader className="pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-slate-300 bg-slate-100 font-mono text-[12px] font-bold text-slate-900"
            >
              {account.accountCode}
            </Badge>
            <Badge
              variant="outline"
              className={cn("text-[11px] font-semibold", meta.badgeClass)}
            >
              {meta.label}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              หมวดธรรมชาติ: {account.normalBalance === "debit" ? "ฝั่งเดบิต" : "ฝั่งเครดิต"}
            </span>
          </div>
          <DialogTitle className="mt-1 text-[18px] font-bold text-foreground">
            {account.accountName}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            {account.primaryGroup} · {account.secondaryGroup}
            {account.description ? ` — ${account.description}` : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="text-[11px] font-medium text-muted-foreground">
              รวมฝั่งเดบิต
            </div>
            <div className="mt-0.5 font-mono text-[16px] font-bold text-sky-700">
              ฿{formatBaht(account.totalDebit)}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="text-[11px] font-medium text-muted-foreground">
              รวมฝั่งเครดิต
            </div>
            <div className="mt-0.5 font-mono text-[16px] font-bold text-amber-800">
              ฿{formatBaht(account.totalCredit)}
            </div>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
            <div className="text-[11px] font-semibold text-sky-900">
              ยอดคงเหลือสุทธิ
            </div>
            <div className="mt-0.5 font-mono text-[17px] font-bold text-sky-950">
              ฿{formatBaht(account.endingBalance)}
            </div>
          </div>
        </div>

        {/* Movements Table */}
        <div className="mt-2 overflow-hidden rounded-xl border border-border">
          {account.movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
              <div className="text-[13.5px] font-semibold text-foreground">
                ยังไม่มีรายการเคลื่อนไหวในบัญชีนี้สำหรับงวดที่เลือก
              </div>
              <p className="mt-1 max-w-[440px] text-[12px] text-muted-foreground">
                หากเป็นบัญชีเงินสดหรือธนาคาร คุณสามารถกดปุ่ม &ldquo;+ สร้างสมุดรายวันทั่วไป&rdquo; เพื่อตั้งยอดยกมาต้นงวดได้ทันที
              </p>
            </div>
          ) : (
            <div className="max-h-[420px] overflow-x-auto overflow-y-auto">
              <table className="w-full min-w-[680px] border-collapse text-left text-[12.5px]">
                <thead className="sticky top-0 z-10 bg-slate-800 text-white">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">วันที่</th>
                    <th className="px-3 py-2.5 font-semibold">เลขที่เอกสาร</th>
                    <th className="px-3 py-2.5 font-semibold">คำอธิบายรายการ</th>
                    <th className="px-3 py-2.5 text-right font-semibold">เดบิต</th>
                    <th className="px-3 py-2.5 text-right font-semibold">เครดิต</th>
                    <th className="px-3 py-2.5 text-right font-semibold">ยอดคงเหลือสะสม</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {account.movements.map((m, idx) => {
                    const bookMeta = JOURNAL_BOOK_META[m.journalType];
                    return (
                      <tr
                        key={`${m.voucherId}-${idx}`}
                        className="transition-colors hover:bg-muted/40"
                      >
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12px] text-muted-foreground">
                          {formatThaiDate(m.entryDate)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {onSelectVoucher ? (
                            <button
                              type="button"
                              onClick={() => {
                                onOpenChange(false);
                                onSelectVoucher(m.voucherId);
                              }}
                              className="inline-flex items-center gap-1.5 font-mono text-[12px] font-bold text-sky-700 underline-offset-2 hover:underline"
                            >
                              <span>{m.documentNo}</span>
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-[10px] font-semibold border",
                                  bookMeta.badgeClass,
                                )}
                              >
                                {m.journalType}
                              </span>
                            </button>
                          ) : (
                            <span className="font-mono text-[12px] font-bold text-foreground">
                              {m.documentNo}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-foreground">
                            {m.memo || m.description}
                          </div>
                          {m.contactName && (
                            <div className="text-[11px] text-muted-foreground">
                              ผู้ติดต่อ: {m.contactName}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-semibold text-sky-700">
                          {m.debit > 0 ? formatBaht(m.debit) : "-"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-semibold text-amber-800">
                          {m.credit > 0 ? formatBaht(m.credit) : "-"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-bold text-foreground">
                          {formatBaht(m.runningBalance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter className="no-print flex-wrap justify-between gap-2 sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {account.movements.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const headers = [
                    "วันที่",
                    "เลขที่เอกสาร",
                    "สมุดรายวัน",
                    "ผู้ติดต่อ",
                    "คำอธิบายรายการ",
                    "เดบิต",
                    "เครดิต",
                    "ยอดคงเหลือสะสม",
                  ];
                  const escapeCell = (v: string | number) => {
                    const s = String(v ?? "");
                    return s.includes(",") || s.includes('"') || s.includes("\n")
                      ? `"${s.replace(/"/g, '""')}"`
                      : s;
                  };
                  const rows = account.movements.map((m) => [
                    m.entryDate,
                    m.documentNo,
                    JOURNAL_BOOK_META[m.journalType].label,
                    m.contactName,
                    m.memo || m.description,
                    m.debit.toFixed(2),
                    m.credit.toFixed(2),
                    m.runningBalance.toFixed(2),
                  ]);
                  const csv = [
                    headers.map(escapeCell).join(","),
                    ...rows.map((r) => r.map(escapeCell).join(",")),
                  ].join("\n");
                  const blob = new Blob(["\uFEFF" + csv], {
                    type: "text/csv;charset=utf-8;",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `ledger-${account.accountCode}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  toast.success(
                    `ดาวน์โหลดรายการเดินบัญชี ${account.accountCode} เรียบร้อย`,
                  );
                }}
              >
                ดาวน์โหลด Excel
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5"
            >
              <PrinterIcon className="size-4" />
              พิมพ์รายการเดินบัญชี
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            ปิดหน้าต่าง
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 2. Modal ดูใบสำคัญสมุดรายวัน (Journal Voucher Detail & Print A4) */
export function JournalVoucherDetailDialog({
  open,
  onOpenChange,
  voucher,
  seller,
  onEdit,
  onDuplicate,
  onStatusChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucher: JournalVoucher | null;
  seller?: SellerInfo;
  onEdit?: (voucher: JournalVoucher) => void;
  onDuplicate?: (voucher: JournalVoucher) => void;
  onStatusChange?: (dbId: number, status: "approved" | "pending" | "void") => void;
}) {
  if (!voucher) return null;

  const bookMeta = JOURNAL_BOOK_META[voucher.journalType];

  const handleDownloadSingleCsv = () => {
    const headers = [
      "เลขที่เอกสาร",
      "วันที่",
      "สมุดรายวัน",
      "ผู้ติดต่อ",
      "อ้างอิง",
      "คำอธิบายหลัก",
      "รหัสบัญชี",
      "ชื่อบัญชี",
      "คำอธิบายย่อย",
      "เดบิต",
      "เครดิต",
    ];
    const rows = voucher.lines.map((l) => [
      voucher.documentNo,
      voucher.entryDate,
      bookMeta.label,
      voucher.contactName,
      voucher.referenceNo,
      voucher.description,
      l.accountCode,
      l.accountName,
      l.memo,
      l.debit.toFixed(2),
      l.credit.toFixed(2),
    ]);
    const esc = (v: string | number) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const csv = [
      headers.map(esc).join(","),
      ...rows.map((r) => r.map(esc).join(",")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${voucher.documentNo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`ดาวน์โหลดเอกสาร ${voucher.documentNo} เรียบร้อย`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[860px]">
        <DialogHeader className="no-print pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("text-[11.5px] font-semibold", bookMeta.badgeClass)}
            >
              {bookMeta.shortLabel}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "text-[11px] font-semibold",
                voucher.status === "approved"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : voucher.status === "pending"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-slate-100 text-slate-600",
              )}
            >
              {voucher.status === "approved"
                ? "อนุมัติแล้ว"
                : voucher.status === "pending"
                  ? "รอดำเนินการ"
                  : "ยกเลิก"}
            </Badge>
          </div>
          <DialogTitle className="mt-1 text-[18px] font-bold">
            ใบสำคัญสมุดรายวัน #{voucher.documentNo}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            ตรวจสอบรายการบันทึกบัญชีคู่ฝั่งเดบิตและเครดิต และสั่งพิมพ์ใบสำคัญบัญชีขนาดกระดาษมาตรฐาน
          </DialogDescription>
        </DialogHeader>

        {/* Printable Voucher Sheet */}
        <div className="rounded-xl border border-border bg-white p-4 text-slate-900 shadow-xs sm:p-6 print:border-0 print:p-0 print:shadow-none">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start print:flex-row print:items-start">
            <div>
              <div className="text-[15px] font-bold text-slate-900">
                {seller?.name || "บริษัท คู่ค้า จำกัด"}
              </div>
              {seller?.address && (
                <div className="mt-0.5 text-[11.5px] text-slate-600">
                  {seller.address}
                </div>
              )}
              {seller?.taxId && (
                <div className="mt-0.5 text-[11.5px] text-slate-600">
                  เลขประจำตัวผู้เสียภาษี: {seller.taxId}
                </div>
              )}
            </div>
            <div className="sm:text-right print:text-right">
              <div className="text-[16px] font-extrabold text-sky-900">
                {bookMeta.label}
              </div>
              <div className="mt-1 font-mono text-[13px] font-bold text-slate-900">
                เลขที่เอกสาร: {voucher.documentNo}
              </div>
              <div className="text-[12px] text-slate-600">
                วันที่: {formatThaiDate(voucher.entryDate)}
              </div>
            </div>
          </div>

          {/* Header Metadata */}
          <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 text-[12.5px] sm:grid-cols-2 print:grid-cols-2">
            <div>
              <span className="font-semibold text-slate-600">คำอธิบายรายการ: </span>
              <span className="font-semibold text-slate-900">
                {voucher.description}
              </span>
            </div>
            <div>
              <span className="font-semibold text-slate-600">ผู้ติดต่อ / อ้างอิง: </span>
              <span className="text-slate-900">
                {voucher.contactName || "-"}
                {voucher.referenceNo ? ` (${voucher.referenceNo})` : ""}
              </span>
            </div>
          </div>

          {/* Debit / Credit Table */}
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 print:overflow-visible">
            <table className="w-full min-w-[540px] border-collapse text-left text-[12.5px] print:min-w-0">
              <thead className="bg-sky-700 text-white">
                <tr>
                  <th className="w-[120px] px-3 py-2.5 font-semibold">รหัสบัญชี</th>
                  <th className="px-3 py-2.5 font-semibold">ชื่อบัญชี / คำอธิบายย่อย</th>
                  <th className="w-[135px] px-3 py-2.5 text-right font-semibold">
                    เดบิต
                  </th>
                  <th className="w-[135px] px-3 py-2.5 text-right font-semibold">
                    เครดิต
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {voucher.lines.map((line, idx) => (
                  <tr key={`${line.accountCode}-${idx}`}>
                    <td className="px-3 py-2.5 font-mono font-bold text-slate-900">
                      {line.accountCode}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-900">
                        {line.accountName}
                      </div>
                      {line.memo && (
                        <div className="text-[11.5px] text-slate-500">
                          {line.memo}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-900">
                      {line.debit > 0 ? formatBaht(line.debit) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-900">
                      {line.credit > 0 ? formatBaht(line.credit) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                <tr>
                  <td colSpan={2} className="px-3 py-2.5 text-right text-slate-800">
                    ยอดรวมสุทธิ (รวมเดบิต = รวมเครดิต)
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[13.5px] text-sky-800">
                    {formatBaht(voucher.totalDebit)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[13.5px] text-sky-800">
                    {formatBaht(voucher.totalCredit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {voucher.remarks && (
            <div className="mt-3 text-[11.5px] text-slate-600">
              <span className="font-semibold">หมายเหตุ:</span> {voucher.remarks}
            </div>
          )}

          {/* Signatures */}
          <div className="mt-6 grid grid-cols-3 gap-4 border-t border-slate-200 pt-4 text-center text-[11.5px] text-slate-600">
            <div>
              <div className="mt-6 border-b border-dashed border-slate-300" />
              <div className="mt-1 font-medium">ผู้จัดทำบัญชี</div>
            </div>
            <div>
              <div className="mt-6 border-b border-dashed border-slate-300" />
              <div className="mt-1 font-medium">ผู้ตรวจสอบ</div>
            </div>
            <div>
              <div className="mt-6 border-b border-dashed border-slate-300" />
              <div className="mt-1 font-medium">ผู้อนุมัติ</div>
            </div>
          </div>
        </div>

        <DialogFooter className="no-print flex-wrap justify-between gap-2 sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {voucher.sourceType === "manual" && voucher.dbId && onStatusChange && (
              <Select
                value={voucher.status}
                onValueChange={(val) =>
                  onStatusChange(
                    voucher.dbId!,
                    val as "approved" | "pending" | "void",
                  )
                }
              >
                <SelectTrigger
                  aria-label="เปลี่ยนสถานะเอกสาร"
                  className="h-9 min-h-[36px] min-w-[140px] rounded-lg text-[12px] font-bold"
                >
                  <SelectValue placeholder="สถานะเอกสาร" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">อนุมัติแล้ว</SelectItem>
                  <SelectItem value="pending">รอดำเนินการ</SelectItem>
                  <SelectItem value="void">ยกเลิก</SelectItem>
                </SelectContent>
              </Select>
            )}
            {voucher.sourceType === "manual" && onEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onEdit(voucher);
                }}
              >
                แก้ไขเอกสาร
              </Button>
            )}
            {onDuplicate && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onDuplicate(voucher);
                }}
              >
                สร้างซ้ำ
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadSingleCsv}
            >
              ดาวน์โหลด Excel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5"
            >
              <PrinterIcon className="size-4" />
              พิมพ์ใบสำคัญ
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              ปิดหน้าต่าง
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type JournalDocPrefix = "JV" | "OP" | "UV" | "SV" | "PV" | "RV";

export interface InitialJournalDraft {
  editId?: number;
  editDocumentNo?: string;
  documentPrefix?: JournalDocPrefix;
  entryDate?: string;
  description?: string;
  contactName?: string;
  referenceNo?: string;
  remarks?: string;
  lines?: JournalEntryLine[];
}

/** 3. Modal สร้าง/แก้ไขสมุดรายวัน (JV / OP / UV / SV / PV / RV) แบบบัญชีคู่ เดบิต = เครดิต */
export function CreateManualJournalDialog({
  open,
  onOpenChange,
  accounts,
  onCreated,
  initialDraft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: GeneralLedgerAccountRow[];
  onCreated: () => void;
  initialDraft?: InitialJournalDraft | null;
}) {
  const [entryDate, setEntryDate] = useState(
    () => initialDraft?.entryDate || todayIso(),
  );
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [documentPrefix, setDocumentPrefix] = useState<JournalDocPrefix>(
    () => initialDraft?.documentPrefix || "JV",
  );
  const [description, setDescription] = useState(
    () => initialDraft?.description || "",
  );
  const [contactName, setContactName] = useState(
    () => initialDraft?.contactName || "",
  );
  const [referenceNo, setReferenceNo] = useState(
    () => initialDraft?.referenceNo || "",
  );
  const [remarks, setRemarks] = useState(() => initialDraft?.remarks || "");
  const [lines, setLines] = useState<JournalEntryLine[]>(
    () =>
      initialDraft?.lines || [
        {
          accountCode: "11121.01",
          accountName: "กสิกรไทย · บัญชีกระแสรายวันและออมทรัพย์หลัก",
          debit: 0,
          credit: 0,
          memo: "",
        },
        {
          accountCode: "31000",
          accountName: "ทุนจดทะเบียนชำระแล้ว",
          debit: 0,
          credit: 0,
          memo: "",
        },
      ],
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && initialDraft) {
      setDocumentPrefix(initialDraft.documentPrefix || "JV");
      if (initialDraft.entryDate) setEntryDate(initialDraft.entryDate);
      setDescription(initialDraft.description || "");
      setContactName(initialDraft.contactName || "");
      setReferenceNo(initialDraft.referenceNo || "");
      setRemarks(initialDraft.remarks || "");
      if (initialDraft.lines && initialDraft.lines.length >= 2) {
        setLines(initialDraft.lines);
      } else {
        setLines([
          {
            accountCode: "11121.01",
            accountName: "กสิกรไทย · บัญชีกระแสรายวันและออมทรัพย์หลัก",
            debit: 0,
            credit: 0,
            memo: "",
          },
          {
            accountCode: "31000",
            accountName: "ทุนจดทะเบียนชำระแล้ว",
            debit: 0,
            credit: 0,
            memo: "",
          },
        ]);
      }
    }
  }, [open, initialDraft]);

  const validation = validateJournalEntryLines(lines);

  const applyQuickTemplate = (
    preset: "opening_bank" | "salary_accrual" | "vat_closing" | "closing_pl",
  ) => {
    if (preset === "opening_bank") {
      setDocumentPrefix("OP");
      setDescription("บันทึกยอดยกมาต้นงวด (เงินสดและเงินฝากธนาคาร)");
      setContactName("ยอดยกมาต้นงวด");
      setLines([
        {
          accountCode: "11112",
          accountName: "เงินสดคงเหลือ",
          debit: 0,
          credit: 0,
          memo: "เงินสดคงเหลือยกมาต้นงวด",
        },
        {
          accountCode: "11121.01",
          accountName: "กสิกรไทย (บัญชีกระแสรายวัน/ออมทรัพย์หลัก)",
          debit: 0,
          credit: 0,
          memo: "ยอดเงินฝากกสิกรไทยยกมาต้นงวด",
        },
        {
          accountCode: "32000",
          accountName: "กำไร (ขาดทุน) สะสมยังไม่ได้จัดสรร",
          debit: 0,
          credit: 0,
          memo: "ทุนและกำไรสะสมยกมาต้นงวด",
        },
      ]);
    } else if (preset === "salary_accrual") {
      setDocumentPrefix("JV");
      setDescription("บันทึกบัญชีเงินเดือนและประกันสังคมประจำเดือน");
      setContactName("พนักงานบริษัท");
      setLines([
        {
          accountCode: "53031.01",
          accountName: "เงินเดือนและค่าแรงพนักงาน",
          debit: 0,
          credit: 0,
          memo: "เงินเดือนพนักงานประจำเดือน",
        },
        {
          accountCode: "27140",
          accountName: "เงินสมทบประกันสังคมค้างจ่าย",
          debit: 0,
          credit: 0,
          memo: "หักประกันสังคมรอนำส่ง",
        },
        {
          accountCode: "11121.01",
          accountName: "กสิกรไทย (บัญชีกระแสรายวัน/ออมทรัพย์หลัก)",
          debit: 0,
          credit: 0,
          memo: "โอนจ่ายเงินเดือนสุทธิ",
        },
      ]);
    } else if (preset === "vat_closing") {
      setDocumentPrefix("JV");
      setDescription("ปิดบัญชีภาษีซื้อ-ภาษีขาย ประจำเดือน (ภ.พ.30)");
      setContactName("กรมสรรพากร");
      const outputVatAcc = accounts.find((a) => a.accountCode === "27111");
      const inputVatAcc = accounts.find((a) => a.accountCode === "17111");
      const totalRevenueEnding = accounts
        .filter((a) => a.accountType === "revenue" && a.endingBalance > 0)
        .reduce((s, a) => s + a.endingBalance, 0);
      const outputVat =
        outputVatAcc && outputVatAcc.endingBalance > 0
          ? Math.round(outputVatAcc.endingBalance * 100) / 100
          : totalRevenueEnding > 0
            ? Math.round((totalRevenueEnding - totalRevenueEnding / 1.07) * 100) / 100
            : 0;
      const inputVat =
        inputVatAcc && inputVatAcc.endingBalance > 0
          ? Math.round(inputVatAcc.endingBalance * 100) / 100
          : 0;
      const netVat = Math.round((outputVat - inputVat) * 100) / 100;

      const vatLines: JournalEntryLine[] = [];
      if (outputVat > 0 || inputVat === 0) {
        vatLines.push({
          accountCode: "27111",
          accountName: "ภาษีขาย 7%",
          debit: outputVat,
          credit: 0,
          memo: "ล้างบัญชีภาษีขายประจำงวดตามยอดขายจริงในระบบ",
        });
      }
      if (inputVat > 0 || outputVat === 0) {
        vatLines.push({
          accountCode: "17111",
          accountName: "ภาษีซื้อ 7%",
          debit: 0,
          credit: inputVat,
          memo: "ล้างบัญชีภาษีซื้อประจำงวดตามบิลรายจ่ายจริงในระบบ",
        });
      }
      if (netVat > 0) {
        vatLines.push({
          accountCode: "27115",
          accountName: "เจ้าหนี้กรมสรรพากร (ภ.พ.30 รอชำระ)",
          debit: 0,
          credit: netVat,
          memo: "ตั้งค้างจ่าย ภ.พ.30 รอนำส่งกรมสรรพากร",
        });
      } else if (netVat < 0) {
        vatLines.push({
          accountCode: "17115",
          accountName: "ลูกหนี้กรมสรรพากร (เครดิตภาษียกไป)",
          debit: Math.abs(netVat),
          credit: 0,
          memo: "เครดิตภาษีซื้อเกินภาษีขาย ยกไปใช้เดือนถัดไป",
        });
      } else if (vatLines.length < 2) {
        vatLines.push({
          accountCode: "27115",
          accountName: "เจ้าหนี้กรมสรรพากร (ภ.พ.30 รอชำระ)",
          debit: 0,
          credit: 0,
          memo: "ตั้งค้างจ่าย ภ.พ.30 รอนำส่งกรมสรรพากร",
        });
      }
      setLines(vatLines);
    } else if (preset === "closing_pl") {
      setDocumentPrefix("JV");
      setDescription("ปิดบัญชีรายได้และค่าใช้จ่ายสิ้นงวด เข้ากำไร (ขาดทุน) สะสม");
      setContactName("ปิดงบบัญชีประจำงวด");
      const closingLines: JournalEntryLine[] = [];
      let totalRevDr = 0;
      let totalExpCr = 0;
      for (const acc of accounts) {
        if (acc.accountType === "revenue" && acc.endingBalance > 0) {
          closingLines.push({
            accountCode: acc.accountCode,
            accountName: acc.accountName,
            debit: acc.endingBalance,
            credit: 0,
            memo: `ปิดบัญชีรายได้ ${acc.accountCode}`,
          });
          totalRevDr += acc.endingBalance;
        } else if (acc.accountType === "expense" && acc.endingBalance > 0) {
          closingLines.push({
            accountCode: acc.accountCode,
            accountName: acc.accountName,
            debit: 0,
            credit: acc.endingBalance,
            memo: `ปิดบัญชีค่าใช้จ่าย ${acc.accountCode}`,
          });
          totalExpCr += acc.endingBalance;
        }
      }
      const net = Math.round((totalRevDr - totalExpCr) * 100) / 100;
      if (closingLines.length > 0 && Math.abs(net) > 0) {
        closingLines.push({
          accountCode: "32000",
          accountName: "กำไร (ขาดทุน) สะสมยังไม่ได้จัดสรร",
          debit: net < 0 ? Math.abs(net) : 0,
          credit: net > 0 ? net : 0,
          memo: "โอนกำไร (ขาดทุน) สุทธิประจำงวดเข้ากำไรสะสม",
        });
        setLines(closingLines);
      } else {
        setLines([
          {
            accountCode: "41010.01",
            accountName: "รายได้จากการขาย - TikTok Shop",
            debit: 0,
            credit: 0,
            memo: "ปิดบัญชีรายได้สิ้นงวด",
          },
          {
            accountCode: "32000",
            accountName: "กำไร (ขาดทุน) สะสมยังไม่ได้จัดสรร",
            debit: 0,
            credit: 0,
            memo: "โอนกำไรสุทธิเข้ากำไรสะสม",
          },
        ]);
      }
    }
  };

  const updateLine = (idx: number, patch: Partial<JournalEntryLine>) => {
    setLines((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const next = { ...item, ...patch };
        if (patch.accountCode !== undefined) {
          const found = accounts.find((a) => a.accountCode === patch.accountCode);
          if (found) {
            next.accountName = found.accountName;
          }
        }
        return next;
      }),
    );
  };

  const saveWithStatus = async (targetStatus: "approved" | "pending") => {
    if (!validation.valid) {
      toast.error(validation.error || "ยอดรวมเดบิตและเครดิตต้องเท่ากัน");
      return;
    }

    setSaving(true);
    try {
      const isEdit = Boolean(initialDraft?.editId);
      const journalType = documentPrefix === "OP" ? "JV" : documentPrefix;
      const res = await fetch("/api/accounting/journals", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: initialDraft?.editId,
          entryDate,
          journalType,
          documentPrefix,
          description: description.trim() || "รายการสมุดรายวัน",
          contactName,
          referenceNo,
          remarks,
          status: targetStatus,
          lines,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "บันทึกสมุดรายวันไม่สำเร็จ");
      }
      toast.success(
        isEdit
          ? `แก้ไขเอกสาร ${initialDraft?.editDocumentNo || data.voucher?.documentNo || ""} สำเร็จ`
          : `บันทึกสมุดรายวัน ${data.voucher?.documentNo || ""} สำเร็จ`,
      );
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await saveWithStatus("approved");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[920px]">
        <DialogHeader className="pr-12">
          <DialogTitle className="text-[18px] font-bold">
            {initialDraft?.editId
              ? `แก้ไขใบสำคัญสมุดรายวัน #${initialDraft.editDocumentNo || ""}`
              : "สร้างใบสำคัญสมุดรายวัน"}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            บันทึกบัญชีคู่ฝั่งเดบิตและเครดิต เลือกสมุดรายวันทั้ง 5 เล่ม หรือบันทึกยอดยกมาต้นงวด ปรับปรุงบัญชี และปิดงบการเงิน
          </DialogDescription>
        </DialogHeader>

        {/* Quick Templates */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-200/80 bg-sky-50/50 p-2.5">
          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-sky-900">
            <SparklesIcon className="size-3.5 text-sky-600" />
            แม่แบบบันทึกบัญชีด่วน:
          </span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => applyQuickTemplate("opening_bank")}
            className="bg-white text-[11.5px]"
          >
            <WalletIcon className="size-3" />
            ตั้งยอดยกมา เงินสด/กสิกรไทย
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => applyQuickTemplate("salary_accrual")}
            className="bg-white text-[11.5px]"
          >
            บันทึกเงินเดือน & ประกันสังคม
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => applyQuickTemplate("vat_closing")}
            className="bg-white text-[11.5px]"
          >
            ปิดภาษีซื้อ-ภาษีขาย ภ.พ.30
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => applyQuickTemplate("closing_pl")}
            className="border-sky-200 bg-white text-[11.5px] font-semibold text-sky-900 hover:bg-sky-50"
          >
            ปิดงบรายได้-ค่าใช้จ่าย โอนเข้า 32000
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-foreground">
                วันที่เอกสาร *
              </label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="เลือกวันที่เอกสาร"
                    className="flex h-10 min-h-[40px] w-full items-center justify-between gap-2 rounded-[10px] border border-input bg-card px-3 py-1.5 text-[13.5px] font-medium text-foreground shadow-xs transition-[color,box-shadow,border-color] outline-none hover:border-slate-400 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
                  >
                    <span className="truncate font-mono text-[13px] font-semibold text-foreground">
                      {formatThaiDate(entryDate)}
                    </span>
                    <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-3">
                  <Calendar
                    selected={entryDate}
                    defaultMonthIso={entryDate}
                    showCounts={false}
                    onSelect={(iso) => {
                      setEntryDate(iso);
                      setDatePickerOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-foreground">
                ประเภทเลขเอกสาร
              </label>
              <Select
                value={documentPrefix}
                onValueChange={(val) =>
                  setDocumentPrefix(val as JournalDocPrefix)
                }
              >
                <SelectTrigger
                  aria-label="ประเภทเลขเอกสาร"
                  className="h-10 min-h-[40px] w-full rounded-[10px] border-input bg-card px-3 text-[13px] font-medium text-foreground shadow-xs"
                >
                  <SelectValue placeholder="เลือกสมุดรายวัน" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="JV">JV — สมุดรายวันทั่วไป</SelectItem>
                  <SelectItem value="OP">OP — บันทึกยอดยกมาต้นงวด</SelectItem>
                  <SelectItem value="UV">UV — สมุดรายวันซื้อ</SelectItem>
                  <SelectItem value="SV">SV — สมุดรายวันขาย</SelectItem>
                  <SelectItem value="PV">PV — สมุดรายวันจ่าย</SelectItem>
                  <SelectItem value="RV">RV — สมุดรายวันรับ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-foreground">
                ผู้ติดต่อ / หน่วยงาน
              </label>
              <Input
                placeholder="เช่น ธนาคารกสิกรไทย, กรมสรรพากร"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="h-10"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-foreground">
                เลขที่เอกสารอ้างอิง
              </label>
              <Input
                placeholder="เช่น เลขสเตทเมนต์ / เลขใบแจ้งหนี้"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                className="h-10"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-foreground">
              คำอธิบายรายการหลัก *
            </label>
            <Input
              placeholder="เช่น บันทึกยอดยกมาต้นปี 2026 หรือ ปรับปรุงรายการบัญชีประจำเดือน"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-10"
              required
            />
          </div>

          {/* Lines Table */}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[660px] border-collapse text-left text-[12.5px]">
              <thead className="bg-sky-700 text-white">
                <tr>
                  <th className="w-[270px] px-3 py-2.5 font-semibold">
                    รหัสบัญชี / ชื่อบัญชี *
                  </th>
                  <th className="px-3 py-2.5 font-semibold">คำอธิบายรายการย่อย</th>
                  <th className="w-[135px] px-3 py-2.5 text-right font-semibold">
                    เดบิต
                  </th>
                  <th className="w-[135px] px-3 py-2.5 text-right font-semibold">
                    เครดิต
                  </th>
                  <th className="w-[48px] px-2 py-2.5 text-center font-semibold">
                    ลบ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {lines.map((line, idx) => (
                  <tr key={idx}>
                    <td className="p-2 align-middle">
                      <SearchableAccountSelect
                        accounts={accounts}
                        value={line.accountCode}
                        onValueChange={(val) =>
                          updateLine(idx, { accountCode: val })
                        }
                        ariaLabel={`เลือกบัญชีบรรทัดที่ ${idx + 1}`}
                      />
                    </td>
                    <td className="p-2 align-middle">
                      <Input
                        placeholder="คำอธิบายย่อย"
                        value={line.memo}
                        onChange={(e) =>
                          updateLine(idx, { memo: e.target.value })
                        }
                        className="h-10"
                      />
                    </td>
                    <td className="p-2 align-middle">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.debit || ""}
                        placeholder="0.00"
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          updateLine(idx, {
                            debit: val,
                            credit: val > 0 ? 0 : line.credit,
                          });
                        }}
                        className="h-10 text-right font-mono"
                      />
                    </td>
                    <td className="p-2 align-middle">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.credit || ""}
                        placeholder="0.00"
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          updateLine(idx, {
                            credit: val,
                            debit: val > 0 ? 0 : line.debit,
                          });
                        }}
                        className="h-10 text-right font-mono"
                      />
                    </td>
                    <td className="p-2 text-center align-middle">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={lines.length <= 2}
                        aria-label={`ลบบรรทัดที่ ${idx + 1}`}
                        onClick={() =>
                          setLines((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        <Trash2Icon className="size-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border bg-muted/30">
                <tr>
                  <td colSpan={2} className="px-3 py-2.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        setLines((prev) => [
                          ...prev,
                          {
                            accountCode: accounts[0]?.accountCode || "11111",
                            accountName: accounts[0]?.accountName || "เงินสดในมือ",
                            debit: 0,
                            credit: 0,
                            memo: "",
                          },
                        ])
                      }
                    >
                      <PlusIcon className="size-3.5" />
                      เพิ่มบรรทัดรายการ
                    </Button>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[13.5px] font-bold text-sky-700">
                    ฿{formatBaht(validation.totalDebit)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[13.5px] font-bold text-amber-800">
                    ฿{formatBaht(validation.totalCredit)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Balance Indicator */}
          <div
            className={cn(
              "flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-[12.5px]",
              validation.valid
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-900",
            )}
          >
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2Icon
                className={cn(
                  "size-4",
                  validation.valid ? "text-emerald-600" : "text-amber-600",
                )}
              />
              <span>
                {validation.valid
                  ? "สมดุลบัญชีถูกต้อง (ยอดรวมเดบิต = ยอดรวมเครดิต พร้อมบันทึก)"
                  : validation.error || "กรุณาระบุยอดเดบิตและเครดิตให้สมดุลกัน"}
              </span>
            </div>
            <div className="font-mono font-bold">
              ผลต่าง: ฿{formatBaht(validation.diff)}
            </div>
          </div>

          {/* Remarks / Internal Notes */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-foreground">
              หมายเหตุ / โน้ตภายในบริษัท
            </label>
            <Input
              placeholder="ระบุหมายเหตุท้ายใบสำคัญ หรือโน้ตอ้างอิงภายในบริษัท"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="h-9 text-[12.5px]"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving || !validation.valid}
              onClick={() => saveWithStatus("pending")}
              className="border-amber-300 bg-amber-50/70 font-semibold text-amber-950 hover:bg-amber-100"
            >
              บันทึกร่าง รอดำเนินการ
            </Button>
            <Button
              type="submit"
              disabled={saving || !validation.valid}
              className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {saving && <Loader2Icon className="size-4 animate-spin" />}
              {initialDraft?.editId ? "บันทึกการแก้ไข" : "อนุมัติและบันทึกเอกสาร"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** 4. Modal บริหารผังบัญชี (Add / Edit / Delete Custom Chart of Accounts) */
export function ManageChartOfAccountDialog({
  open,
  onOpenChange,
  onSaved,
  accounts = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  accounts?: GeneralLedgerAccountRow[];
}) {
  const [accountType, setAccountType] = useState<AccountType>("asset");
  const [accountCode, setAccountCode] = useState("");
  const [accountName, setAccountName] = useState("");
  const [primaryGroup, setPrimaryGroup] = useState(
    ACCOUNT_TYPE_META.asset.defaultPrimaryGroup,
  );
  const [secondaryGroup, setSecondaryGroup] = useState(
    ACCOUNT_TYPE_META.asset.defaultSecondaryGroup,
  );
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const customAccounts = useMemo(
    () => accounts.filter((a) => !a.isSystem && a.id),
    [accounts],
  );

  const handleTypeChange = (nextType: AccountType) => {
    setAccountType(nextType);
    const meta = ACCOUNT_TYPE_META[nextType];
    setPrimaryGroup(meta.defaultPrimaryGroup);
    setSecondaryGroup(meta.defaultSecondaryGroup);
  };

  const handleEditSelect = (acc: GeneralLedgerAccountRow) => {
    setAccountType(acc.accountType);
    setAccountCode(acc.accountCode);
    setAccountName(acc.accountName);
    setPrimaryGroup(acc.primaryGroup);
    setSecondaryGroup(acc.secondaryGroup);
    setDescription(acc.description || "");
  };

  const handleDeleteCustomAccount = async (acc: GeneralLedgerAccountRow) => {
    if (!acc.id) return;
    try {
      const res = await fetch(`/api/accounting/accounts?id=${acc.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "ไม่สามารถลบผังบัญชีได้");
      }
      toast.success(`ลบผังบัญชี ${acc.accountCode} · ${acc.accountName} สำเร็จ`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!accountCode.trim() || !accountName.trim()) {
      toast.error("กรุณากรอกรหัสบัญชีและชื่อบัญชี");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/accounting/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountCode: accountCode.trim(),
          accountName: accountName.trim(),
          accountType,
          primaryGroup: primaryGroup.trim(),
          secondaryGroup: secondaryGroup.trim(),
          description: description.trim(),
          normalBalance: ACCOUNT_TYPE_META[accountType].normalBalance,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "ไม่สามารถบันทึกผังบัญชีได้");
      }
      toast.success(`บันทึกผังบัญชี ${accountCode.trim()} · ${accountName.trim()} สำเร็จ`);
      setAccountCode("");
      setAccountName("");
      setDescription("");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader className="pr-12">
          <DialogTitle className="text-[18px] font-bold">
            บริหารผังบัญชี (เพิ่ม / แก้ไขรหัสบัญชีใน 5 หมวดหลัก)
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            เพิ่มรหัสบัญชีใหม่ หรือคลิกเลือกบัญชีด้านล่างเพื่อแก้ไขชื่อ/กลุ่มบัญชีเข้าสู่ระบบบัญชีแยกประเภท
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-foreground">
              หมวดบัญชีหลัก (5 หมวดมาตรฐาน) *
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(
                ["asset", "liability", "equity", "revenue", "expense"] as AccountType[]
              ).map((t) => {
                const m = ACCOUNT_TYPE_META[t];
                const active = accountType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTypeChange(t)}
                    className={cn(
                      "flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-all",
                      active
                        ? "border-sky-600 bg-sky-50/80 ring-2 ring-sky-600/20"
                        : "border-border bg-card hover:bg-muted/50",
                    )}
                  >
                    <span className="text-[12px] font-bold text-foreground">
                      {m.label}
                    </span>
                    <span className="font-mono text-[10.5px] text-muted-foreground">
                      รหัส {m.codePrefix}xxxx ({m.normalBalance === "debit" ? "ฝั่งเดบิต" : "ฝั่งเครดิต"})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-foreground">
                รหัสบัญชี *
              </label>
              <Input
                placeholder={`เช่น ${ACCOUNT_TYPE_META[accountType].codePrefix}1123.01`}
                value={accountCode}
                onChange={(e) => setAccountCode(e.target.value)}
                className="font-mono"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[12px] font-semibold text-foreground">
                ชื่อบัญชี *
              </label>
              <Input
                placeholder="เช่น ธนาคารไทยพาณิชย์ 012-3-45678-9"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-foreground">
                กลุ่มบัญชีหลัก
              </label>
              <Input
                value={primaryGroup}
                onChange={(e) => setPrimaryGroup(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-foreground">
                ประเภทบัญชีย่อย
              </label>
              <Input
                value={secondaryGroup}
                onChange={(e) => setSecondaryGroup(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-semibold text-foreground">
              คำอธิบายเพิ่มเติม
            </label>
            <Input
              placeholder="อธิบายการใช้งานของบัญชีนี้"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {customAccounts.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="mb-2 text-[11.5px] font-bold text-foreground">
                รหัสบัญชีที่สร้างเพิ่มเอง ({customAccounts.length} บัญชี)
              </div>
              <div className="max-h-[140px] space-y-1.5 overflow-y-auto pr-1">
                {customAccounts.map((acc) => (
                  <div
                    key={acc.accountCode}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12px]"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-sky-900">
                        {acc.accountCode}
                      </span>{" "}
                      <span className="font-semibold text-foreground">
                        {acc.accountName}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => handleEditSelect(acc)}
                      >
                        แก้ไข
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`ลบผังบัญชี ${acc.accountCode}`}
                        onClick={() => handleDeleteCustomAccount(acc)}
                      >
                        <Trash2Icon className="size-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              ยกเลิก
            </Button>
            <Button type="submit" disabled={saving} className="gap-1.5">
              {saving && <Loader2Icon className="size-4 animate-spin" />}
              บันทึกผังบัญชี
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
