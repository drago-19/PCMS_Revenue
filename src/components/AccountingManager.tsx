"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BookOpenTextIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FileBarChart2Icon,
  FolderKanbanIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  ReceiptIcon,
  ScaleIcon,
  SearchIcon,
  Settings2Icon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  AccountLedgerDetailDialog,
  CreateManualJournalDialog,
  JournalVoucherDetailDialog,
  ManageChartOfAccountDialog,
  type InitialJournalDraft,
} from "@/components/AccountingDialogs";
import {
  AccountingReportsTab,
  type ReportSubTab,
} from "@/components/AccountingReportsTab";
import {
  AccountingVatTab,
  type VatReportSubView,
} from "@/components/AccountingVatTab";
import { ExpensesManager } from "@/components/ExpensesManager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  type AccountType,
  type AccountingOverviewData,
  type GeneralLedgerAccountRow,
  type JournalBookType,
  type JournalVoucher,
} from "@/lib/accounting-types";
import type { ExpensesOverviewData } from "@/lib/expense-math";
import { formatBaht, formatThaiDate } from "@/lib/format";
import type { SellerInfo } from "@/lib/seller";
import { cn } from "@/lib/utils";

export type MainAccountingTab =
  | "ledger"
  | "journals"
  | "reports"
  | "vat"
  | "expenses";
type AccountCategoryFilter = "all" | AccountType;
type JournalBookFilter = "all" | JournalBookType;

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

const THAI_SHORT_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

function formatThaiYearMonth(ym: string): string {
  const [yr, mo] = ym.split("-");
  const mIdx = (Number(mo) || 1) - 1;
  return `${THAI_SHORT_MONTHS[mIdx] || mo} ${yr}`;
}

function formatAccountingPeriodLabel(period: string): string {
  if (!period || period === "all") return "ทุกช่วงเวลา";
  if (/^\d{4}$/.test(period)) return `ปี ${period}`;
  if (/^\d{4}-\d{2}$/.test(period)) return formatThaiYearMonth(period);
  const mRange = /^(\d{4}-\d{2})_(\d{4}-\d{2})$/.exec(period);
  if (mRange) {
    return `${formatThaiYearMonth(mRange[1])} - ${formatThaiYearMonth(mRange[2])}`;
  }
  const dRange = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(period);
  if (dRange) {
    return `${formatThaiDate(dRange[1])} - ${formatThaiDate(dRange[2])}`;
  }
  return period;
}

function FlowAccountPeriodPopover({
  selectedPeriod,
  availableYears,
  availableMonths,
  isPending,
  onSelectPeriod,
}: {
  selectedPeriod: string;
  availableYears: string[];
  availableMonths: string[];
  isPending: boolean;
  onSelectPeriod: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<
    "main" | "month" | "year" | "fiscal" | "range"
  >("main");
  const [pickerYear, setPickerYear] = useState<number>(() => {
    if (/^\d{4}/.test(selectedPeriod)) {
      return Number(selectedPeriod.slice(0, 4));
    }
    const latestYm = availableMonths[0];
    return latestYm ? Number(latestYm.slice(0, 4)) : new Date().getFullYear();
  });
  const [rangeStart, setRangeStart] = useState<string>(() => {
    const m = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(selectedPeriod);
    return m ? m[1] : `${new Date().getFullYear()}-01-01`;
  });
  const [rangeEnd, setRangeEnd] = useState<string>(() => {
    const m = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(selectedPeriod);
    return m ? m[2] : new Date().toISOString().slice(0, 10);
  });

  const applyPeriod = (val: string) => {
    onSelectPeriod(val);
    setOpen(false);
    setView("main");
  };

  // Reference anchor based on latest available data month or current date
  const anchorYm =
    availableMonths[0] || new Date().toISOString().slice(0, 7);
  const [anchorYrNum, anchorMoNum] = anchorYm.split("-").map(Number);

  const shiftYearMonth = (yr: number, mo: number, deltaMonths: number) => {
    const d = new Date(yr, mo - 1 + deltaMonths, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const thisMonthYm = shiftYearMonth(anchorYrNum, anchorMoNum, 0);
  const prevMonthYm = shiftYearMonth(anchorYrNum, anchorMoNum, -1);
  const last3StartYm = shiftYearMonth(anchorYrNum, anchorMoNum, -2);
  const last12StartYm = shiftYearMonth(anchorYrNum, anchorMoNum, -11);
  const thisYearStr = String(anchorYrNum);
  const prevYearStr = String(anchorYrNum - 1);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setView("main");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={isPending}
          aria-label="เลือกช่วงเวลาวันที่"
          className="inline-flex h-10 min-h-[40px] items-center gap-2 rounded-[10px] border border-sky-300 bg-sky-50/70 px-3.5 text-[13px] font-bold text-sky-700 shadow-xs transition-colors hover:bg-sky-100/70 disabled:opacity-60"
        >
          {isPending ? (
            <Loader2Icon className="size-4 animate-spin text-sky-600" />
          ) : (
            <CalendarIcon className="size-4 text-sky-600" />
          )}
          <span>วันที่: {formatAccountingPeriodLabel(selectedPeriod)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[330px] p-0">
        {view === "main" ? (
          <div className="flex flex-col">
            {/* ทางลัด (Shortcuts) */}
            <div className="p-3.5">
              <div className="mb-2.5 text-[12px] font-semibold text-muted-foreground">
                ทางลัด
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => applyPeriod(thisMonthYm)}
                  className={cn(
                    "min-h-9 rounded-lg border px-2 py-1.5 text-[12px] font-semibold transition-colors",
                    selectedPeriod === thisMonthYm
                      ? "border-sky-600 bg-sky-50 text-sky-700"
                      : "border-border bg-background text-foreground hover:bg-muted/60",
                  )}
                >
                  เดือนนี้
                </button>
                <button
                  type="button"
                  onClick={() => applyPeriod(prevMonthYm)}
                  className={cn(
                    "min-h-9 rounded-lg border px-2 py-1.5 text-[12px] font-semibold transition-colors",
                    selectedPeriod === prevMonthYm
                      ? "border-sky-600 bg-sky-50 text-sky-700"
                      : "border-border bg-background text-foreground hover:bg-muted/60",
                  )}
                >
                  เดือนที่แล้ว
                </button>
                <button
                  type="button"
                  onClick={() => applyPeriod(`${last3StartYm}_${thisMonthYm}`)}
                  className={cn(
                    "min-h-9 rounded-lg border px-2 py-1.5 text-[12px] font-semibold transition-colors",
                    selectedPeriod === `${last3StartYm}_${thisMonthYm}`
                      ? "border-sky-600 bg-sky-50 text-sky-700"
                      : "border-border bg-background text-foreground hover:bg-muted/60",
                  )}
                >
                  3 เดือนล่าสุด
                </button>
                <button
                  type="button"
                  onClick={() => applyPeriod(`${last12StartYm}_${thisMonthYm}`)}
                  className={cn(
                    "min-h-9 rounded-lg border px-2 py-1.5 text-[12px] font-semibold transition-colors",
                    selectedPeriod === `${last12StartYm}_${thisMonthYm}`
                      ? "border-sky-600 bg-sky-50 text-sky-700"
                      : "border-border bg-background text-foreground hover:bg-muted/60",
                  )}
                >
                  12 เดือนล่าสุด
                </button>
                <button
                  type="button"
                  onClick={() => applyPeriod(thisYearStr)}
                  className={cn(
                    "min-h-9 rounded-lg border px-2 py-1.5 text-[12px] font-semibold transition-colors",
                    selectedPeriod === thisYearStr
                      ? "border-sky-600 bg-sky-50 text-sky-700"
                      : "border-border bg-background text-foreground hover:bg-muted/60",
                  )}
                >
                  ปีนี้
                </button>
                <button
                  type="button"
                  onClick={() => applyPeriod(prevYearStr)}
                  className={cn(
                    "min-h-9 rounded-lg border px-2 py-1.5 text-[12px] font-semibold transition-colors",
                    selectedPeriod === prevYearStr
                      ? "border-sky-600 bg-sky-50 text-sky-700"
                      : "border-border bg-background text-foreground hover:bg-muted/60",
                  )}
                >
                  ปีที่แล้ว
                </button>
              </div>
            </div>

            {/* กำหนดเอง (Custom) */}
            <div className="border-t border-border px-3.5 py-2.5">
              <div className="mb-1.5 text-[12px] font-semibold text-muted-foreground">
                กำหนดเอง
              </div>
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => setView("month")}
                  className="flex min-h-10 items-center justify-between rounded-lg px-2 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/60"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <CalendarIcon className="size-4 text-muted-foreground" />
                    เลือกเดือน
                  </span>
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  onClick={() => setView("year")}
                  className="flex min-h-10 items-center justify-between rounded-lg px-2 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/60"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <CalendarIcon className="size-4 text-muted-foreground" />
                    เลือกปี
                  </span>
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  onClick={() => setView("fiscal")}
                  className="flex min-h-10 items-center justify-between rounded-lg px-2 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/60"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <CalendarIcon className="size-4 text-muted-foreground" />
                    เลือกปีงบประมาณ
                  </span>
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  onClick={() => setView("range")}
                  className="flex min-h-10 items-center justify-between rounded-lg px-2 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/60"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <CalendarIcon className="size-4 text-muted-foreground" />
                    กำหนดช่วงวันที่
                  </span>
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* ล้าง (Clear) */}
            <div className="border-t border-border px-3.5 py-2.5">
              <button
                type="button"
                onClick={() => applyPeriod("all")}
                className="text-[13px] font-bold text-sky-600 hover:text-sky-700 hover:underline"
              >
                ล้าง
              </button>
            </div>
          </div>
        ) : view === "month" ? (
          <div className="p-3.5">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setView("main")}
                className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-sky-700 hover:underline"
              >
                <ChevronLeftIcon className="size-4" />
                กลับ
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="ปีก่อนหน้า"
                  onClick={() => setPickerYear((y) => y - 1)}
                  className="rounded p-1 hover:bg-muted"
                >
                  <ChevronLeftIcon className="size-4" />
                </button>
                <span className="font-mono text-[13.5px] font-bold">
                  {pickerYear}
                </span>
                <button
                  type="button"
                  aria-label="ปีถัดไป"
                  onClick={() => setPickerYear((y) => y + 1)}
                  className="rounded p-1 hover:bg-muted"
                >
                  <ChevronRightIcon className="size-4" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {THAI_SHORT_MONTHS.map((mLabel, idx) => {
                const ym = `${pickerYear}-${String(idx + 1).padStart(2, "0")}`;
                const hasData = availableMonths.includes(ym);
                const isSelected = selectedPeriod === ym;
                return (
                  <button
                    key={ym}
                    type="button"
                    onClick={() => applyPeriod(ym)}
                    className={cn(
                      "flex min-h-9 flex-col items-center justify-center rounded-lg border px-2 py-1.5 text-[12px] font-semibold transition-colors",
                      isSelected
                        ? "border-sky-600 bg-sky-600 text-white"
                        : hasData
                          ? "border-sky-200 bg-sky-50/50 text-foreground hover:bg-sky-100/60"
                          : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    <span>{mLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : view === "year" || view === "fiscal" ? (
          <div className="p-3.5">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setView("main")}
                className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-sky-700 hover:underline"
              >
                <ChevronLeftIcon className="size-4" />
                กลับ
              </button>
              <span className="text-[12.5px] font-bold text-foreground">
                {view === "fiscal" ? "เลือกปีงบประมาณ" : "เลือกปี"}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {Array.from(
                new Set([
                  ...availableYears,
                  String(new Date().getFullYear()),
                  String(new Date().getFullYear() - 1),
                ]),
              )
                .sort((a, b) => b.localeCompare(a))
                .map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => applyPeriod(yr)}
                    className={cn(
                      "flex min-h-9 items-center justify-between rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors",
                      selectedPeriod === yr
                        ? "border-sky-600 bg-sky-600 text-white"
                        : "border-border bg-background text-foreground hover:bg-muted/60",
                    )}
                  >
                    <span>
                      {view === "fiscal"
                        ? `ปีงบประมาณ ${yr} (1 ม.ค. - 31 ธ.ค. ${yr})`
                        : `ปี ${yr}`}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        ) : (
          <div className="p-3.5">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setView("main")}
                className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-sky-700 hover:underline"
              >
                <ChevronLeftIcon className="size-4" />
                กลับ
              </button>
              <span className="text-[12.5px] font-bold text-foreground">
                กำหนดช่วงวันที่
              </span>
            </div>
            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-[11.5px] font-semibold text-muted-foreground">
                  ตั้งแต่วันที่
                </label>
                <Input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="h-9 font-mono text-[12.5px]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11.5px] font-semibold text-muted-foreground">
                  ถึงวันที่
                </label>
                <Input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className="h-9 font-mono text-[12.5px]"
                />
              </div>
              <Button
                type="button"
                onClick={() => {
                  if (rangeStart && rangeEnd) {
                    applyPeriod(`${rangeStart}_${rangeEnd}`);
                  }
                }}
                className="w-full bg-sky-600 text-[12.5px] font-bold text-white hover:bg-sky-700"
              >
                ตกลง
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

const EMPTY_EXPENSES_DATA: ExpensesOverviewData = {
  categories: [],
  rows: [],
  records: [],
  ledgerStats: {
    totalRecordsCount: 0,
    paidCount: 0,
    paidAmount: 0,
    pendingCount: 0,
    pendingAmount: 0,
    voidCount: 0,
    vatRecordCount: 0,
    vatInputTotal: 0,
    whtRecordCount: 0,
    whtTotal: 0,
  },
  totalStats: {
    totalPlatformPayout: 0,
    totalExpenses: 0,
    netRemaining: 0,
    profitMarginPercent: null,
    monthsCount: 0,
  },
  availableYears: [],
};

export function AccountingManager({
  initialData,
  expensesData = EMPTY_EXPENSES_DATA,
  initialPeriod,
  initialTab = "ledger",
  initialBook = "all",
  initialReport = "trial_balance",
  initialVat = "pp30_summary",
  initialExp = "ledger",
  seller,
}: {
  initialData: AccountingOverviewData;
  expensesData?: ExpensesOverviewData;
  initialPeriod: string;
  initialTab?: MainAccountingTab;
  initialBook?: JournalBookFilter;
  initialReport?: ReportSubTab;
  initialVat?: VatReportSubView;
  initialExp?: "ledger" | "wht" | "table";
  seller?: SellerInfo;
}) {
  const safeExpensesData = expensesData ?? EMPTY_EXPENSES_DATA;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<MainAccountingTab>(initialTab);
  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    initialPeriod || "all",
  );
  const [categoryFilter, setCategoryFilter] =
    useState<AccountCategoryFilter>("all");
  const [journalBookFilter, setJournalBookFilter] =
    useState<JournalBookFilter>(initialBook);
  const [reportSubTab, setReportSubTab] = useState<ReportSubTab>(initialReport);
  const [vatSubView, setVatSubView] = useState<VatReportSubView>(initialVat);
  const [expSubView, setExpSubView] = useState<"ledger" | "wht" | "table">(
    initialExp,
  );
  const [searchQuery, setSearchQuery] = useState("");

  // Sorting, status filter, selection & pagination states (FlowAccount parity)
  const [ledgerSortField, setLedgerSortField] = useState<"code" | "balance">("code");
  const [ledgerSortDir, setLedgerSortDir] = useState<"asc" | "desc">("asc");
  const [selectedAccountCodes, setSelectedAccountCodes] = useState<Set<string>>(
    () => new Set(),
  );
  const [ledgerPageSize, setLedgerPageSize] = useState<number>(50);
  const [ledgerPage, setLedgerPage] = useState<number>(1);

  const [journalStatusFilter, setJournalStatusFilter] = useState<
    "all" | "approved" | "pending" | "void"
  >("all");
  const [journalSortField, setJournalSortField] = useState<"date" | "amount">(
    "date",
  );
  const [journalSortDir, setJournalSortDir] = useState<"asc" | "desc">("desc");
  const [selectedJournalIds, setSelectedJournalIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [journalPageSize, setJournalPageSize] = useState<number>(20);
  const [journalPage, setJournalPage] = useState<number>(1);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setJournalBookFilter(initialBook);
  }, [initialBook]);

  useEffect(() => {
    setReportSubTab(initialReport);
  }, [initialReport]);

  useEffect(() => {
    setVatSubView(initialVat);
  }, [initialVat]);

  useEffect(() => {
    setExpSubView(initialExp);
  }, [initialExp]);

  useEffect(() => {
    function handleAccountingNav(event: Event) {
      const custom = event as CustomEvent<{
        tab?: MainAccountingTab;
        book?: JournalBookFilter;
        report?: ReportSubTab;
        vat?: VatReportSubView;
        exp?: "ledger" | "wht" | "table";
      }>;
      const detail = custom.detail;
      if (!detail) return;
      if (detail.tab) setActiveTab(detail.tab);
      if (detail.book) setJournalBookFilter(detail.book);
      if (detail.report) setReportSubTab(detail.report);
      if (detail.vat) setVatSubView(detail.vat);
      if (detail.exp) setExpSubView(detail.exp);
    }
    window.addEventListener("pcms:accounting-nav", handleAccountingNav);
    return () => {
      window.removeEventListener("pcms:accounting-nav", handleAccountingNav);
    };
  }, []);

  // Dialog states
  const [selectedAccount, setSelectedAccount] =
    useState<GeneralLedgerAccountRow | null>(null);
  const [editingCoaAccount, setEditingCoaAccount] =
    useState<GeneralLedgerAccountRow | null>(null);
  const [selectedVoucher, setSelectedVoucher] =
    useState<JournalVoucher | null>(null);
  const [createJvOpen, setCreateJvOpen] = useState(false);
  const [initialJvDraft, setInitialJvDraft] =
    useState<InitialJournalDraft | null>(null);
  const [manageCoaOpen, setManageCoaOpen] = useState(false);

  const handleOpenEditAccount = (acc: GeneralLedgerAccountRow) => {
    setEditingCoaAccount(acc);
    setManageCoaOpen(true);
  };

  const handleOpenRecordEntryForAccount = (acc: GeneralLedgerAccountRow) => {
    const contraAccount =
      acc.accountCode === "31000"
        ? { code: "11121.01", name: "กสิกรไทย (บัญชีกระแสรายวัน/ออมทรัพย์หลัก)" }
        : { code: "31000", name: "ทุนจดทะเบียนชำระแล้ว" };
    setInitialJvDraft({
      documentPrefix: acc.accountType === "asset" ? "OP" : "JV",
      entryDate: new Date().toISOString().slice(0, 10),
      description: `ตั้งยอดยกมา / บันทึกรายการ ${acc.accountCode} ${acc.accountName}`,
      lines: [
        {
          accountCode: acc.accountCode,
          accountName: acc.accountName,
          debit: 0,
          credit: 0,
          memo: `รายการบัญชี ${acc.accountName}`,
        },
        {
          accountCode: contraAccount.code,
          accountName: contraAccount.name,
          debit: 0,
          credit: 0,
          memo: "บัญชีคู่ตรงข้าม",
        },
      ],
    });
    setCreateJvOpen(true);
  };

  const handlePeriodChange = (nextPeriod: string) => {
    setSelectedPeriod(nextPeriod);
    startTransition(() => {
      const sp = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : "",
      );
      if (nextPeriod === "all") {
        sp.delete("period");
      } else {
        sp.set("period", nextPeriod);
      }
      const qs = sp.toString();
      router.push(qs ? `/accounting?${qs}` : "/accounting", { scroll: false });
    });
  };

  const refreshData = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  // Filtered Chart of Accounts / General Ledger rows
  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = initialData.accounts.filter((acc) => {
      if (categoryFilter !== "all" && acc.accountType !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        acc.accountCode.toLowerCase().includes(q) ||
        acc.accountName.toLowerCase().includes(q) ||
        acc.description.toLowerCase().includes(q) ||
        acc.primaryGroup.toLowerCase().includes(q) ||
        acc.secondaryGroup.toLowerCase().includes(q) ||
        ACCOUNT_TYPE_META[acc.accountType].label.toLowerCase().includes(q)
      );
    });
    return [...list].sort((a, b) => {
      const mul = ledgerSortDir === "asc" ? 1 : -1;
      if (ledgerSortField === "balance") {
        return (a.endingBalance - b.endingBalance) * mul;
      }
      return a.accountCode.localeCompare(b.accountCode) * mul;
    });
  }, [
    initialData.accounts,
    categoryFilter,
    searchQuery,
    ledgerSortField,
    ledgerSortDir,
  ]);

  const totalLedgerPages = Math.max(
    1,
    ledgerPageSize > 0
      ? Math.ceil(filteredAccounts.length / ledgerPageSize)
      : 1,
  );
  const safeLedgerPage = Math.min(ledgerPage, totalLedgerPages);
  const pagedAccounts = useMemo(() => {
    if (ledgerPageSize <= 0) return filteredAccounts;
    const start = (safeLedgerPage - 1) * ledgerPageSize;
    return filteredAccounts.slice(start, start + ledgerPageSize);
  }, [filteredAccounts, safeLedgerPage, ledgerPageSize]);

  // Filtered Journal Vouchers
  const filteredJournals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = initialData.journals.filter((v) => {
      if (journalBookFilter !== "all" && v.journalType !== journalBookFilter) {
        return false;
      }
      if (journalStatusFilter !== "all" && v.status !== journalStatusFilter) {
        return false;
      }
      if (!q) return true;
      const inHeader =
        v.documentNo.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        v.contactName.toLowerCase().includes(q) ||
        v.referenceNo.toLowerCase().includes(q);
      if (inHeader) return true;
      return v.lines.some(
        (l) =>
          l.accountCode.toLowerCase().includes(q) ||
          l.accountName.toLowerCase().includes(q) ||
          l.memo.toLowerCase().includes(q),
      );
    });
    return [...list].sort((a, b) => {
      const mul = journalSortDir === "asc" ? 1 : -1;
      if (journalSortField === "amount") {
        return (a.totalDebit - b.totalDebit) * mul;
      }
      const cmp = a.entryDate.localeCompare(b.entryDate);
      if (cmp !== 0) return cmp * mul;
      return a.documentNo.localeCompare(b.documentNo) * mul;
    });
  }, [
    initialData.journals,
    journalBookFilter,
    journalStatusFilter,
    searchQuery,
    journalSortField,
    journalSortDir,
  ]);

  const totalJournalPages = Math.max(
    1,
    journalPageSize > 0
      ? Math.ceil(filteredJournals.length / journalPageSize)
      : 1,
  );
  const safeJournalPage = Math.min(journalPage, totalJournalPages);
  const pagedJournals = useMemo(() => {
    if (journalPageSize <= 0) return filteredJournals;
    const start = (safeJournalPage - 1) * journalPageSize;
    return filteredJournals.slice(start, start + journalPageSize);
  }, [filteredJournals, safeJournalPage, journalPageSize]);

  const handleExportGeneralLedgerCsv = () => {
    const headers = [
      "รหัสบัญชี",
      "ชื่อบัญชี",
      "รายละเอียด",
      "กลุ่มบัญชีหลัก",
      "ประเภทบัญชีย่อย",
      "หมวดบัญชี",
      "รวมเดบิต",
      "รวมเครดิต",
      "ยอดคงเหลือสุทธิ",
      "จำนวนรายการเดินบัญชี",
    ];
    const sourceRows =
      selectedAccountCodes.size > 0
        ? filteredAccounts.filter((acc) =>
            selectedAccountCodes.has(acc.accountCode),
          )
        : filteredAccounts;
    const rows = sourceRows.map((acc) => [
      acc.accountCode,
      acc.accountName,
      acc.description,
      acc.primaryGroup,
      acc.secondaryGroup,
      ACCOUNT_TYPE_META[acc.accountType].label,
      acc.totalDebit.toFixed(2),
      acc.totalCredit.toFixed(2),
      acc.endingBalance.toFixed(2),
      acc.movementCount,
    ]);
    const csv = [
      headers.map(escapeCsvCell).join(","),
      ...rows.map((r) => r.map(escapeCsvCell).join(",")),
    ].join("\n");
    downloadCsvFile(
      `general-ledger-${selectedPeriod || "all"}.csv`,
      csv,
    );
    toast.success(
      selectedAccountCodes.size > 0
        ? `ดาวน์โหลดบัญชีแยกประเภทที่เลือก ${sourceRows.length} รายการเรียบร้อย`
        : "ดาวน์โหลดไฟล์ตารางบัญชีแยกประเภทเรียบร้อย",
    );
  };

  const handleExportJournalsCsv = () => {
    const headers = [
      "วันที่",
      "เลขที่เอกสาร",
      "สมุดรายวัน",
      "ผู้ติดต่อ",
      "คำอธิบายหลัก",
      "รหัสบัญชี",
      "ชื่อบัญชี",
      "คำอธิบายย่อย",
      "เดบิต",
      "เครดิต",
      "สถานะ",
    ];
    const sourceJournals =
      selectedJournalIds.size > 0
        ? filteredJournals.filter((v) => selectedJournalIds.has(v.id))
        : filteredJournals;
    const rows: (string | number)[][] = [];
    for (const v of sourceJournals) {
      for (const l of v.lines) {
        rows.push([
          v.entryDate,
          v.documentNo,
          JOURNAL_BOOK_META[v.journalType].label,
          v.contactName,
          v.description,
          l.accountCode,
          l.accountName,
          l.memo,
          l.debit.toFixed(2),
          l.credit.toFixed(2),
          v.status === "approved"
            ? "อนุมัติแล้ว"
            : v.status === "pending"
              ? "รอดำเนินการ"
              : "ยกเลิก",
        ]);
      }
    }
    const csv = [
      headers.map(escapeCsvCell).join(","),
      ...rows.map((r) => r.map(escapeCsvCell).join(",")),
    ].join("\n");
    downloadCsvFile(
      `journal-vouchers-${journalBookFilter}-${selectedPeriod || "all"}.csv`,
      csv,
    );
    toast.success(
      selectedJournalIds.size > 0
        ? `ดาวน์โหลดสมุดรายวันที่เลือก ${sourceJournals.length} ใบสำคัญเรียบร้อย`
        : "ดาวน์โหลดไฟล์ตารางสมุดรายวันเรียบร้อย",
    );
  };

  const handleDeleteManualJournal = async (dbId: number, docNo: string) => {
    try {
      const res = await fetch(`/api/accounting/journals?id=${dbId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "ไม่สามารถลบสมุดรายวันได้");
      }
      toast.success(`ลบสมุดรายวัน ${docNo} เรียบร้อย`);
      refreshData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleUpdateJournalStatus = async (
    dbId: number,
    nextStatus: "approved" | "pending" | "void",
  ) => {
    try {
      const res = await fetch("/api/accounting/journals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: dbId, status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "ไม่สามารถเปลี่ยนสถานะเอกสารได้");
      }
      const statusLabel =
        nextStatus === "approved"
          ? "อนุมัติแล้ว"
          : nextStatus === "pending"
            ? "รอดำเนินการ"
            : "ยกเลิก";
      toast.success(`อัปเดตสถานะเป็น "${statusLabel}" เรียบร้อย`);
      if (selectedVoucher && selectedVoucher.dbId === dbId) {
        setSelectedVoucher({ ...selectedVoucher, status: nextStatus });
      }
      refreshData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleEditVoucher = (voucher: JournalVoucher) => {
    const prefix = voucher.documentNo.startsWith("OP")
      ? "OP"
      : voucher.journalType;
    setInitialJvDraft({
      editId: voucher.dbId,
      editDocumentNo: voucher.documentNo,
      documentPrefix: prefix,
      entryDate: voucher.entryDate,
      description: voucher.description,
      contactName: voucher.contactName,
      referenceNo: voucher.referenceNo,
      remarks: voucher.remarks,
      lines: voucher.lines.map((l) => ({ ...l })),
    });
    setCreateJvOpen(true);
  };

  const handleDuplicateVoucher = (voucher: JournalVoucher) => {
    const prefix = voucher.documentNo.startsWith("OP")
      ? "OP"
      : voucher.journalType;
    setInitialJvDraft({
      documentPrefix: prefix,
      entryDate: new Date().toISOString().slice(0, 10),
      description: `${voucher.description} · สำเนา`,
      contactName: voucher.contactName,
      referenceNo: voucher.referenceNo,
      remarks: voucher.remarks,
      lines: voucher.lines.map((l) => ({ ...l })),
    });
    setCreateJvOpen(true);
    toast.info(`คัดลอกรายการจาก ${voucher.documentNo} มาสร้างใบใหม่แล้ว`);
  };

  const periodDisplayLabel = formatAccountingPeriodLabel(selectedPeriod);

  return (
    <div
      className={cn(
        "flex flex-col gap-3.5 transition-opacity duration-150",
        isPending && "opacity-80",
      )}
      aria-busy={isPending || undefined}
    >
      {/* Top Summary Strip across the 5 Accounting Groups */}
      <div className="no-print grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <Card className="flex flex-col justify-between gap-1 border-sky-200/70 bg-gradient-to-br from-sky-50/70 to-card p-3.5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11.5px] font-semibold text-sky-900">
              1. สินทรัพย์
            </span>
            <Badge
              variant="outline"
              className="border-sky-200 bg-white font-mono text-[10.5px] text-sky-700"
            >
              {initialData.categoryCounts.asset} บัญชี
            </Badge>
          </div>
          <div className="font-mono text-[16px] font-bold text-sky-950 sm:text-[18px]">
            ฿{formatBaht(initialData.summary.totalAssets)}
          </div>
          <div className="text-[11px] text-muted-foreground">
            เงินสด ธนาคาร ลูกหนี้ ภาษีซื้อ
          </div>
        </Card>

        <Card className="flex flex-col justify-between gap-1 border-amber-200/70 bg-gradient-to-br from-amber-50/60 to-card p-3.5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11.5px] font-semibold text-amber-900">
              2. หนี้สิน
            </span>
            <Badge
              variant="outline"
              className="border-amber-200 bg-white font-mono text-[10.5px] text-amber-800"
            >
              {initialData.categoryCounts.liability} บัญชี
            </Badge>
          </div>
          <div className="font-mono text-[16px] font-bold text-amber-950 sm:text-[18px]">
            ฿{formatBaht(initialData.summary.totalLiabilities)}
          </div>
          <div className="text-[11px] text-muted-foreground">
            เจ้าหนี้การค้า ภาษีขาย หัก ณ ที่จ่าย
          </div>
        </Card>

        <Card className="flex flex-col justify-between gap-1 border-purple-200/70 bg-gradient-to-br from-purple-50/60 to-card p-3.5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11.5px] font-semibold text-purple-900">
              3. ส่วนของผู้ถือหุ้น
            </span>
            <Badge
              variant="outline"
              className="border-purple-200 bg-white font-mono text-[10.5px] text-purple-700"
            >
              {initialData.categoryCounts.equity} บัญชี
            </Badge>
          </div>
          <div className="font-mono text-[16px] font-bold text-purple-950 sm:text-[18px]">
            ฿{formatBaht(initialData.summary.totalEquity)}
          </div>
          <div className="text-[11px] text-muted-foreground">
            ทุนจดทะเบียน และกำไรสะสม
          </div>
        </Card>

        <Card className="flex flex-col justify-between gap-1 border-emerald-200/70 bg-gradient-to-br from-emerald-50/60 to-card p-3.5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11.5px] font-semibold text-emerald-900">
              4. รายได้รวม
            </span>
            <Badge
              variant="outline"
              className="border-emerald-200 bg-white font-mono text-[10.5px] text-emerald-700"
            >
              {initialData.categoryCounts.revenue} บัญชี
            </Badge>
          </div>
          <div className="font-mono text-[16px] font-bold text-emerald-950 sm:text-[18px]">
            ฿{formatBaht(initialData.summary.totalRevenue)}
          </div>
          <div className="text-[11px] text-muted-foreground">
            ยอดขายทุกแพลตฟอร์ม + เงินชดเชย
          </div>
        </Card>

        <Card className="col-span-2 flex flex-col justify-between gap-1 border-rose-200/70 bg-gradient-to-br from-rose-50/60 to-card p-3.5 sm:col-span-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11.5px] font-semibold text-rose-900">
              5. ค่าใช้จ่าย
            </span>
            <Badge
              variant="outline"
              className="border-rose-200 bg-white font-mono text-[10.5px] text-rose-700"
            >
              {initialData.categoryCounts.expense} บัญชี
            </Badge>
          </div>
          <div className="font-mono text-[16px] font-bold text-rose-950 sm:text-[18px]">
            ฿{formatBaht(initialData.summary.totalExpense)}
          </div>
          <div className="text-[11px] text-muted-foreground">
            ค่าธรรมเนียมแพลตฟอร์ม + บิลรายจ่าย
          </div>
        </Card>
      </div>

      {/* Main Navigation Bar: הבัญชีแยกประเภท vs สมุดรายวัน 5 เล่ม + Action Buttons */}
      <div className="no-print flex flex-col justify-between gap-1.5 rounded-2xl border border-border bg-card p-2 lg:flex-row lg:items-center">
        <div
          role="tablist"
          aria-label="มุมมองระบบบริหารบัญชี"
          className="flex flex-wrap items-center gap-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "ledger"}
            onClick={() => setActiveTab("ledger")}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-bold whitespace-nowrap transition-all",
              activeTab === "ledger"
                ? "bg-sky-600 text-white shadow-xs"
                : "bg-muted/50 text-foreground hover:bg-muted",
            )}
          >
            <FolderKanbanIcon className="size-3.5 shrink-0" />
            <span>บัญชีแยกประเภท</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 font-mono text-[10.5px]",
                activeTab === "ledger"
                  ? "bg-white/20 text-white"
                  : "bg-background text-muted-foreground",
              )}
            >
              {initialData.categoryCounts.all}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "journals"}
            onClick={() => setActiveTab("journals")}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-bold whitespace-nowrap transition-all",
              activeTab === "journals"
                ? "bg-sky-600 text-white shadow-xs"
                : "bg-muted/50 text-foreground hover:bg-muted",
            )}
          >
            <BookOpenTextIcon className="size-3.5 shrink-0" />
            <span>สมุดรายวัน 5 เล่ม</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 font-mono text-[10.5px]",
                activeTab === "journals"
                  ? "bg-white/20 text-white"
                  : "bg-background text-muted-foreground",
              )}
            >
              {initialData.journalCounts.all}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "reports"}
            onClick={() => setActiveTab("reports")}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-bold whitespace-nowrap transition-all",
              activeTab === "reports"
                ? "bg-sky-600 text-white shadow-xs"
                : "bg-muted/50 text-foreground hover:bg-muted",
            )}
          >
            <FileBarChart2Icon className="size-3.5 shrink-0" />
            <span>รายงาน & ปิดงบ</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "vat"}
            onClick={() => setActiveTab("vat")}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-bold whitespace-nowrap transition-all",
              activeTab === "vat"
                ? "bg-sky-600 text-white shadow-xs"
                : "bg-muted/50 text-foreground hover:bg-muted",
            )}
          >
            <ScaleIcon className="size-3.5 shrink-0" />
            <span>ภาษี ภ.พ.30</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "expenses"}
            onClick={() => setActiveTab("expenses")}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-bold whitespace-nowrap transition-all",
              activeTab === "expenses"
                ? "bg-sky-600 text-white shadow-xs"
                : "bg-muted/50 text-foreground hover:bg-muted",
            )}
          >
            <ReceiptIcon className="size-3.5 shrink-0" />
            <span>บิลรายจ่าย</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 font-mono text-[10.5px]",
                activeTab === "expenses"
                  ? "bg-white/20 text-white"
                  : "bg-background text-muted-foreground",
              )}
            >
              {safeExpensesData.records?.length ?? 0}
            </span>
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {activeTab === "reports" && (
            <FlowAccountPeriodPopover
              selectedPeriod={selectedPeriod}
              availableYears={initialData.availableYears}
              availableMonths={initialData.availableMonths}
              isPending={isPending}
              onSelectPeriod={(val) => handlePeriodChange(val)}
            />
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEditingCoaAccount(null);
              setManageCoaOpen(true);
            }}
            className="min-h-10 gap-1.5 px-2.5 text-[12px] font-semibold"
          >
            <Settings2Icon className="size-3.5 text-sky-700" />
            บริหารผังบัญชี
          </Button>
          <Button
            type="button"
            onClick={() => {
              const activeBookPrefix =
                activeTab === "journals" && journalBookFilter !== "all"
                  ? journalBookFilter
                  : "JV";
              setInitialJvDraft({
                documentPrefix: activeBookPrefix,
              });
              setCreateJvOpen(true);
            }}
            className="min-h-10 gap-1.5 bg-sky-600 px-2.5 text-[12px] font-bold text-white hover:bg-sky-700"
          >
            <PlusIcon className="size-3.5" />
            {activeTab === "journals" && journalBookFilter !== "all"
              ? `สร้าง${JOURNAL_BOOK_META[journalBookFilter].label}`
              : "สร้างสมุดรายวันทั่วไป"}
          </Button>
        </div>
      </div>

      {/* Filter & Search Toolbar (Matching FlowAccount Screenshot 2) */}
      {(activeTab === "ledger" || activeTab === "journals") && (
      <Card className="no-print flex flex-col gap-3 p-3.5">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setLedgerPage(1);
                setJournalPage(1);
              }}
              placeholder={
                activeTab === "ledger"
                  ? "ค้นหา รหัสบัญชี, ชื่อ, รายละเอียด, กลุ่มบัญชี, ประเภท..."
                  : "ค้นหา เลขที่เอกสาร, คำอธิบายรายการ, รหัสบัญชี..."
              }
              aria-label="ค้นหาข้อมูลทางบัญชี"
              className="h-10 pr-9 pl-9 text-[13px]"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="ล้างคำค้นหา"
                onClick={() => {
                  setSearchQuery("");
                  setLedgerPage(1);
                  setJournalPage(1);
                }}
                className="absolute top-1/2 right-2.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>

          {/* Date / Fiscal Year Filter + Status Filter + Download Excel */}
          <div className="flex flex-wrap items-center gap-2">
            {activeTab === "journals" && (
              <Select
                value={journalStatusFilter}
                onValueChange={(val) => {
                  setJournalStatusFilter(
                    val as "all" | "approved" | "pending" | "void",
                  );
                  setJournalPage(1);
                }}
              >
                <SelectTrigger
                  aria-label="กรองสถานะเอกสารสมุดรายวัน"
                  className="h-10 min-h-[40px] min-w-[165px] rounded-[10px] border-border bg-background px-3 text-[12.5px] font-semibold"
                >
                  <SelectValue placeholder="สถานะเอกสาร" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">แสดงทุกสถานะ</SelectItem>
                  <SelectItem value="approved">อนุมัติแล้ว</SelectItem>
                  <SelectItem value="pending">รอดำเนินการ</SelectItem>
                  <SelectItem value="void">ยกเลิก</SelectItem>
                </SelectContent>
              </Select>
            )}

            <FlowAccountPeriodPopover
              selectedPeriod={selectedPeriod}
              availableYears={initialData.availableYears}
              availableMonths={initialData.availableMonths}
              isPending={isPending}
              onSelectPeriod={(val) => handlePeriodChange(val)}
            />

            <Button
              type="button"
              variant="outline"
              onClick={
                activeTab === "ledger"
                  ? handleExportGeneralLedgerCsv
                  : handleExportJournalsCsv
              }
              className="min-h-10 gap-1.5 text-[12.5px] font-semibold"
            >
              <DownloadIcon className="size-4 text-emerald-700" />
              {activeTab === "ledger" && selectedAccountCodes.size > 0
                ? `ดาวน์โหลดที่เลือก (${selectedAccountCodes.size})`
                : activeTab === "journals" && selectedJournalIds.size > 0
                  ? `ดาวน์โหลดที่เลือก (${selectedJournalIds.size})`
                  : "ดาวน์โหลด Excel"}
            </Button>
          </div>
        </div>

        {/* Sub-Filter Bar: หมวดบัญชี 5 หมวด (for Ledger) OR สมุดรายวัน 5 เล่ม (for Journals) */}
        {activeTab === "ledger" ? (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
            <span className="mr-1 inline-flex items-center gap-1.5 text-[12px] font-bold text-foreground">
              <FolderKanbanIcon className="size-3.5 text-sky-700" />
              หมวดบัญชี:
            </span>
            {(
              [
                { key: "all", label: "หมวดหมู่ทั้งหมด", count: initialData.categoryCounts.all },
                { key: "asset", label: "1. สินทรัพย์", count: initialData.categoryCounts.asset },
                { key: "liability", label: "2. หนี้สิน", count: initialData.categoryCounts.liability },
                { key: "equity", label: "3. ส่วนของผู้ถือหุ้น", count: initialData.categoryCounts.equity },
                { key: "revenue", label: "4. รายได้", count: initialData.categoryCounts.revenue },
                { key: "expense", label: "5. ค่าใช้จ่าย", count: initialData.categoryCounts.expense },
              ] as { key: AccountCategoryFilter; label: string; count: number }[]
            ).map((item) => {
              const active = categoryFilter === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setCategoryFilter(item.key)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1 text-[12px] font-semibold transition-all",
                    active
                      ? "border-sky-600 bg-sky-600 text-white shadow-xs"
                      : "border-border bg-background text-foreground hover:bg-muted/60",
                  )}
                >
                  <span>{item.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.2 font-mono text-[10.5px]",
                      active
                        ? "bg-white/20 text-white"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {item.count}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
            <span className="mr-1 inline-flex items-center gap-1.5 text-[12px] font-bold text-foreground">
              <BookOpenTextIcon className="size-3.5 text-sky-700" />
              สมุดรายวัน:
            </span>
            {(
              [
                { key: "all", label: "สมุดรายวันทั้งหมด", count: initialData.journalCounts.all },
                { key: "JV", label: "สมุดรายวันทั่วไป", count: initialData.journalCounts.JV },
                { key: "UV", label: "สมุดรายวันซื้อ", count: initialData.journalCounts.UV },
                { key: "SV", label: "สมุดรายวันขาย", count: initialData.journalCounts.SV },
                { key: "PV", label: "สมุดรายวันจ่าย", count: initialData.journalCounts.PV },
                { key: "RV", label: "สมุดรายวันรับ", count: initialData.journalCounts.RV },
              ] as { key: JournalBookFilter; label: string; count: number }[]
            ).map((item) => {
              const active = journalBookFilter === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setJournalBookFilter(item.key)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1 text-[12px] font-semibold transition-all",
                    active
                      ? "border-sky-600 bg-sky-600 text-white shadow-xs"
                      : "border-border bg-background text-foreground hover:bg-muted/60",
                  )}
                >
                  <span>{item.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.2 font-mono text-[10.5px]",
                      active
                        ? "bg-white/20 text-white"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {item.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>
      )}

      {/* Main Content Table */}
      {activeTab === "expenses" ? (
        <ExpensesManager
          initialData={safeExpensesData}
          initialYear={
            /^\d{4}$/.test(selectedPeriod) ? selectedPeriod : "all"
          }
          initialExpSubView={expSubView}
          seller={seller}
        />
      ) : activeTab === "vat" ? (
        <AccountingVatTab
          accountingData={initialData}
          expensesData={safeExpensesData}
          periodLabel={periodDisplayLabel}
          subView={vatSubView}
          onSubViewChange={setVatSubView}
          onGoToCreateExpense={() => {
            setActiveTab("expenses");
            setExpSubView("ledger");
          }}
          onOpenVatClosingJv={({ yearMonth, outputVat, inputVat }) => {
            const outAmt = Math.round((outputVat || 0) * 100) / 100;
            const inAmt = Math.round((inputVat || 0) * 100) / 100;
            const netAmt = Math.round((outAmt - inAmt) * 100) / 100;
            const draftLines = [];
            if (outAmt > 0) {
              draftLines.push({
                accountCode: "27111",
                accountName: "ภาษีขาย 7%",
                debit: outAmt,
                credit: 0,
                memo: `ปิดบัญชีภาษีขายประจำเดือน ${yearMonth}`,
              });
            }
            if (inAmt > 0) {
              draftLines.push({
                accountCode: "17111",
                accountName: "ภาษีซื้อ 7%",
                debit: 0,
                credit: inAmt,
                memo: `ปิดบัญชีภาษีซื้อประจำเดือน ${yearMonth}`,
              });
            }
            if (netAmt > 0) {
              draftLines.push({
                accountCode: "27115",
                accountName: "เจ้าหนี้กรมสรรพากร (ภ.พ.30 รอชำระ)",
                debit: 0,
                credit: netAmt,
                memo: `ตั้งค้างจ่ายภาษีมูลค่าเพิ่ม ภ.พ.30 งวด ${yearMonth}`,
              });
            } else if (netAmt < 0) {
              draftLines.push({
                accountCode: "17111",
                accountName: "ภาษีซื้อ 7%",
                debit: Math.abs(netAmt),
                credit: 0,
                memo: `เครดิตภาษีซื้อยกไปเดือนถัดไป งวด ${yearMonth}`,
              });
            }
            setInitialJvDraft({
              documentPrefix: "JV",
              entryDate: `${yearMonth}-28`,
              description: `ปิดบัญชีภาษีมูลค่าเพิ่ม ภ.พ.30 ประจำงวดเดือน ${formatThaiDate(`${yearMonth}-01`).split(" ").slice(1).join(" ")}`,
              contactName: "กรมสรรพากร",
              referenceNo: `ภ.พ.30 งวด ${formatThaiDate(`${yearMonth}-01`).split(" ").slice(1).join(" ")}`,
              lines:
                draftLines.length >= 2
                  ? draftLines
                  : [
                      {
                        accountCode: "27111",
                        accountName: "ภาษีขาย 7%",
                        debit: 0,
                        credit: 0,
                        memo: `ปิดบัญชีภาษีขายประจำเดือน ${yearMonth}`,
                      },
                      {
                        accountCode: "27115",
                        accountName: "เจ้าหนี้กรมสรรพากร (ภ.พ.30 รอชำระ)",
                        debit: 0,
                        credit: 0,
                        memo: `ตั้งค้างจ่าย ภ.พ.30 งวด ${yearMonth}`,
                      },
                    ],
            });
            setCreateJvOpen(true);
          }}
        />
      ) : activeTab === "reports" ? (
        <AccountingReportsTab
          data={initialData}
          periodLabel={periodDisplayLabel}
          subTab={reportSubTab}
          onSubTabChange={setReportSubTab}
          onSelectAccount={(acc) => setSelectedAccount(acc)}
          onSelectVoucher={(v) => setSelectedVoucher(v)}
          onOpenClosingEntry={() => {
            const revLines = initialData.accounts
              .filter(
                (a) =>
                  a.accountType === "revenue" && Math.abs(a.endingBalance) >= 0.005,
              )
              .map((a) => ({
                accountCode: a.accountCode,
                accountName: a.accountName,
                debit: a.endingBalance > 0 ? a.endingBalance : 0,
                credit: a.endingBalance < 0 ? Math.abs(a.endingBalance) : 0,
                memo: `โอนปิดหมวดรายได้ ${a.accountName}`,
              }));
            const expLines = initialData.accounts
              .filter(
                (a) =>
                  a.accountType === "expense" && Math.abs(a.endingBalance) >= 0.005,
              )
              .map((a) => ({
                accountCode: a.accountCode,
                accountName: a.accountName,
                debit: a.endingBalance < 0 ? Math.abs(a.endingBalance) : 0,
                credit: a.endingBalance > 0 ? a.endingBalance : 0,
                memo: `โอนปิดหมวดค่าใช้จ่าย ${a.accountName}`,
              }));
            const net = initialData.summary.netProfit;
            const retainedLine = {
              accountCode: "32000",
              accountName: "กำไร (ขาดทุน) สะสมยังไม่ได้จัดสรร",
              debit: net < 0 ? Math.abs(net) : 0,
              credit: net >= 0 ? net : 0,
              memo: "รับโอนกำไร (ขาดทุน) สุทธิจากการปิดงบบัญชี",
            };
            const allLines = [...revLines, ...expLines, retainedLine];
            setInitialJvDraft({
              documentPrefix: "JV",
              entryDate: new Date().toISOString().slice(0, 10),
              description: `ปิดงบบัญชีรายได้และค่าใช้จ่าย โอนเข้ากำไรสะสม (${periodDisplayLabel})`,
              contactName: "ปิดงบบัญชีประจำงวด",
              referenceNo: `ปิดงบ ${periodDisplayLabel}`,
              lines:
                allLines.length >= 2
                  ? allLines
                  : [
                      {
                        accountCode: "41010",
                        accountName: "รายได้จากการขายสินค้าและบริการ",
                        debit: 0,
                        credit: 0,
                        memo: "โอนปิดหมวดรายได้",
                      },
                      retainedLine,
                    ],
            });
            setCreateJvOpen(true);
          }}
        />
      ) : activeTab === "ledger" ? (
        <Card className="overflow-hidden border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-2.5 text-[12.5px]">
            <div className="font-semibold text-foreground">
              ทั้งหมด{" "}
              <span className="font-mono font-bold text-sky-700">
                {filteredAccounts.length}
              </span>{" "}
              รายการผังบัญชี
              {selectedAccountCodes.size > 0 && (
                <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 font-mono text-[11px] font-bold text-sky-800">
                  เลือกไว้ {selectedAccountCodes.size} บัญชี
                </span>
              )}
              <span className="ml-2 text-muted-foreground">
                ({periodDisplayLabel} · คลิกที่แถวบัญชีเพื่อดูรายการเดินบัญชีแยกประเภท เดบิต/เครดิต)
              </span>
            </div>
            <div className="font-mono text-[12px] text-muted-foreground">
              รวมเดบิต ฿{formatBaht(initialData.summary.totalJournalDebit)} = เครดิต ฿{formatBaht(initialData.summary.totalJournalCredit)}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-[13px]">
              <thead className="bg-sky-600 text-white">
                <tr>
                  <th className="w-[44px] px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label="เลือกผังบัญชีทั้งหมดในหน้านี้"
                      checked={
                        pagedAccounts.length > 0 &&
                        pagedAccounts.every((a) =>
                          selectedAccountCodes.has(a.accountCode),
                        )
                      }
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelectedAccountCodes((prev) => {
                          const next = new Set(prev);
                          for (const acc of pagedAccounts) {
                            if (checked) next.add(acc.accountCode);
                            else next.delete(acc.accountCode);
                          }
                          return next;
                        });
                      }}
                      className="size-4 cursor-pointer rounded border-white/60 accent-sky-800"
                    />
                  </th>
                  <th className="w-[140px] px-4 py-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        if (ledgerSortField === "code") {
                          setLedgerSortDir((d) => (d === "asc" ? "desc" : "asc"));
                        } else {
                          setLedgerSortField("code");
                          setLedgerSortDir("asc");
                        }
                      }}
                      className="inline-flex items-center gap-1 font-semibold text-white hover:underline"
                    >
                      <span>รหัสบัญชี</span>
                      {ledgerSortField === "code" &&
                        (ledgerSortDir === "asc" ? (
                          <ArrowUpIcon className="size-3.5" />
                        ) : (
                          <ArrowDownIcon className="size-3.5" />
                        ))}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    ชื่อ / รายละเอียด
                  </th>
                  <th className="w-[240px] px-4 py-3 font-semibold">
                    กลุ่มบัญชี / ประเภท
                  </th>
                  <th className="w-[140px] px-4 py-3 font-semibold">
                    หมวดบัญชี
                  </th>
                  <th className="w-[175px] px-4 py-3 text-right font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        if (ledgerSortField === "balance") {
                          setLedgerSortDir((d) => (d === "asc" ? "desc" : "asc"));
                        } else {
                          setLedgerSortField("balance");
                          setLedgerSortDir("desc");
                        }
                      }}
                      className="inline-flex items-center justify-end gap-1 font-semibold text-white hover:underline"
                    >
                      <span>ยอดคงเหลือ</span>
                      {ledgerSortField === "balance" &&
                        (ledgerSortDir === "asc" ? (
                          <ArrowUpIcon className="size-3.5" />
                        ) : (
                          <ArrowDownIcon className="size-3.5" />
                        ))}
                    </button>
                  </th>
                  <th className="w-[100px] px-3 py-3 text-center font-semibold">
                    จัดการ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {pagedAccounts.map((acc) => {
                  const meta = ACCOUNT_TYPE_META[acc.accountType];
                  const hasBalance = Math.abs(acc.endingBalance) >= 0.005;
                  const isChecked = selectedAccountCodes.has(acc.accountCode);
                  return (
                    <tr
                      key={acc.accountCode}
                      onClick={() => setSelectedAccount(acc)}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-sky-50/50",
                        isChecked && "bg-sky-50/40",
                      )}
                    >
                      <td
                        className="w-[44px] px-3 py-3.5 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          aria-label={`เลือกบัญชี ${acc.accountCode} ${acc.accountName}`}
                          checked={isChecked}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setSelectedAccountCodes((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(acc.accountCode);
                              else next.delete(acc.accountCode);
                              return next;
                            });
                          }}
                          className="size-4 cursor-pointer rounded border-border accent-sky-600"
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[13px] font-bold text-foreground">
                        {acc.accountCode}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {acc.accountName}
                          </span>
                          {acc.movementCount > 0 && (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-sky-800">
                              {acc.movementCount} รายการ
                            </span>
                          )}
                        </div>
                        {acc.description && (
                          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                            {acc.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-[12.5px] font-bold text-foreground">
                          {acc.primaryGroup}
                        </div>
                        <div className="text-[11.5px] text-muted-foreground">
                          {acc.secondaryGroup}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11.5px] font-semibold",
                            meta.badgeClass,
                          )}
                        >
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono text-[13.5px] font-bold">
                        {hasBalance ? (
                          <span
                            className={cn(
                              acc.endingBalance < 0
                                ? "text-rose-600"
                                : "text-foreground",
                            )}
                          >
                            {formatBaht(acc.endingBalance)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-3.5 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`ดูรายการเดินบัญชี ${acc.accountCode}`}
                            onClick={() => setSelectedAccount(acc)}
                          >
                            <EyeIcon className="size-4 text-sky-700" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`แก้ไขผังบัญชี ${acc.accountCode}`}
                            onClick={() => handleOpenEditAccount(acc)}
                          >
                            <PencilIcon className="size-4 text-amber-700" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer (Matching FlowAccount) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/15 px-4 py-2.5 text-[12px]">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">รายการต่อหน้า:</span>
              {(
                [
                  { label: "20", val: 20 },
                  { label: "50", val: 50 },
                  { label: "100", val: 100 },
                  { label: "ทั้งหมด", val: 0 },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => {
                    setLedgerPageSize(opt.val);
                    setLedgerPage(1);
                  }}
                  className={cn(
                    "min-h-8 rounded-md px-2.5 py-1 font-mono text-[11.5px] font-semibold transition-colors",
                    ledgerPageSize === opt.val
                      ? "bg-sky-600 text-white"
                      : "bg-background text-foreground hover:bg-muted",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-muted-foreground">
                หน้า {safeLedgerPage} / {totalLedgerPages} (รวม{" "}
                {filteredAccounts.length} บัญชี)
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="หน้าก่อนหน้า"
                  disabled={safeLedgerPage <= 1}
                  onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeftIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="หน้าถัดไป"
                  disabled={safeLedgerPage >= totalLedgerPages}
                  onClick={() =>
                    setLedgerPage((p) => Math.min(totalLedgerPages, p + 1))
                  }
                >
                  <ChevronRightIcon className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        /* Tab 2: สมุดรายวัน 5 เล่ม (Journals Table matching FlowAccount Screenshot 1) */
        <Card className="overflow-hidden border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-2.5 text-[12.5px]">
            <div className="font-semibold text-foreground">
              รายการสมุดรายวันทั้งหมด{" "}
              <span className="font-mono font-bold text-sky-700">
                {filteredJournals.length}
              </span>{" "}
              ใบสำคัญ
              {selectedJournalIds.size > 0 && (
                <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 font-mono text-[11px] font-bold text-sky-800">
                  เลือกไว้ {selectedJournalIds.size} ใบ
                </span>
              )}
              <span className="ml-2 text-muted-foreground">
                (คลิกที่แถวเอกสารเพื่อดูไส้ใน เดบิต/เครดิต แก้ไข สร้างซ้ำ และพิมพ์ใบสำคัญ)
              </span>
            </div>
            <div className="font-mono text-[12px] font-semibold text-sky-900">
              ยอดรวมสมุดรายวันที่แสดง: ฿
              {formatBaht(
                filteredJournals
                  .filter((j) => j.status !== "void")
                  .reduce((s, j) => s + j.totalDebit, 0),
              )}
            </div>
          </div>

          {filteredJournals.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <div className="text-[14px] font-bold text-foreground">
                ไม่พบรายการสมุดรายวันตามตัวกรองที่เลือก
              </div>
              <p className="mt-1 max-w-[460px] text-[12.5px] text-muted-foreground">
                คุณสามารถกดปุ่มด้านล่างเพื่อสร้างใบสำคัญในสมุดรายวันเล่มนี้ บันทึกยอดยกมาต้นงวด หรือปรับปรุงบัญชีได้ทันที
              </p>
              <Button
                type="button"
                onClick={() => {
                  const activeBookPrefix =
                    journalBookFilter !== "all" ? journalBookFilter : "JV";
                  setInitialJvDraft({
                    documentPrefix: activeBookPrefix,
                  });
                  setCreateJvOpen(true);
                }}
                className="mt-3 gap-1.5 bg-sky-600 text-white hover:bg-sky-700"
              >
                <PlusIcon className="size-4" />
                {journalBookFilter !== "all"
                  ? `สร้าง${JOURNAL_BOOK_META[journalBookFilter].label}`
                  : "สร้างสมุดรายวันทั่วไป"}
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] border-collapse text-left text-[13px]">
                  <thead className="bg-sky-600 text-white">
                    <tr>
                      <th className="w-[44px] px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          aria-label="เลือกใบสำคัญทั้งหมดในหน้านี้"
                          checked={
                            pagedJournals.length > 0 &&
                            pagedJournals.every((v) =>
                              selectedJournalIds.has(v.id),
                            )
                          }
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setSelectedJournalIds((prev) => {
                              const next = new Set(prev);
                              for (const v of pagedJournals) {
                                if (checked) next.add(v.id);
                                else next.delete(v.id);
                              }
                              return next;
                            });
                          }}
                          className="size-4 cursor-pointer rounded border-white/60 accent-sky-800"
                        />
                      </th>
                      <th className="w-[130px] px-4 py-3 font-semibold">
                        <button
                          type="button"
                          onClick={() => {
                            if (journalSortField === "date") {
                              setJournalSortDir((d) =>
                                d === "asc" ? "desc" : "asc",
                              );
                            } else {
                              setJournalSortField("date");
                              setJournalSortDir("desc");
                            }
                          }}
                          className="inline-flex items-center gap-1 font-semibold text-white hover:underline"
                        >
                          <span>วันที่</span>
                          {journalSortField === "date" &&
                            (journalSortDir === "asc" ? (
                              <ArrowUpIcon className="size-3.5" />
                            ) : (
                              <ArrowDownIcon className="size-3.5" />
                            ))}
                        </button>
                      </th>
                      <th className="w-[190px] px-4 py-3 font-semibold">
                        เลขที่เอกสาร
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        คำอธิบายรายการย่อย / คู่บัญชี
                      </th>
                      <th className="w-[155px] px-4 py-3 text-right font-semibold">
                        <button
                          type="button"
                          onClick={() => {
                            if (journalSortField === "amount") {
                              setJournalSortDir((d) =>
                                d === "asc" ? "desc" : "asc",
                              );
                            } else {
                              setJournalSortField("amount");
                              setJournalSortDir("desc");
                            }
                          }}
                          className="inline-flex items-center justify-end gap-1 font-semibold text-white hover:underline"
                        >
                          <span>ยอดรวมสุทธิ</span>
                          {journalSortField === "amount" &&
                            (journalSortDir === "asc" ? (
                              <ArrowUpIcon className="size-3.5" />
                            ) : (
                              <ArrowDownIcon className="size-3.5" />
                            ))}
                        </button>
                      </th>
                      <th className="w-[155px] px-4 py-3 font-semibold">
                        สถานะ
                      </th>
                      <th className="w-[135px] px-3 py-3 text-center font-semibold">
                        จัดการ
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {pagedJournals.map((voucher) => {
                      const bookMeta = JOURNAL_BOOK_META[voucher.journalType];
                      const isChecked = selectedJournalIds.has(voucher.id);
                      const isManualEditable =
                        voucher.sourceType === "manual" && Boolean(voucher.dbId);
                      return (
                        <tr
                          key={voucher.id}
                          onClick={() => setSelectedVoucher(voucher)}
                          className={cn(
                            "cursor-pointer transition-colors hover:bg-sky-50/50",
                            isChecked && "bg-sky-50/40",
                          )}
                        >
                          <td
                            className="w-[44px] px-3 py-3.5 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              aria-label={`เลือกใบสำคัญ ${voucher.documentNo}`}
                              checked={isChecked}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setSelectedJournalIds((prev) => {
                                  const next = new Set(prev);
                                  if (checked) next.add(voucher.id);
                                  else next.delete(voucher.id);
                                  return next;
                                });
                              }}
                              className="size-4 cursor-pointer rounded border-border accent-sky-600"
                            />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[12.5px] text-foreground">
                            {formatThaiDate(voucher.entryDate)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[13px] font-bold text-sky-700">
                                {voucher.documentNo}
                              </span>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "px-1.5 py-0 text-[10px] font-bold",
                                  bookMeta.badgeClass,
                                )}
                              >
                                {voucher.journalType}
                              </Badge>
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              {bookMeta.label}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-foreground">
                              {voucher.description}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {voucher.lines.slice(0, 3).map((l, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                                >
                                  <strong className="text-foreground">
                                    {l.accountCode}
                                  </strong>
                                  <span>{l.accountName}</span>
                                  <span
                                    className={
                                      l.debit > 0
                                        ? "font-semibold text-sky-700"
                                        : "font-semibold text-amber-800"
                                    }
                                  >
                                    (
                                    {l.debit > 0
                                      ? `เดบิต ${formatBaht(l.debit)}`
                                      : `เครดิต ${formatBaht(l.credit)}`}
                                    )
                                  </span>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono text-[13.5px] font-bold text-foreground">
                            {formatBaht(voucher.totalDebit)}
                          </td>
                          <td
                            className="whitespace-nowrap px-4 py-3.5"
                            onClick={(e) => {
                              if (isManualEditable) e.stopPropagation();
                            }}
                          >
                            {isManualEditable && voucher.dbId ? (
                              <Select
                                value={voucher.status}
                                onValueChange={(val) =>
                                  handleUpdateJournalStatus(
                                    voucher.dbId!,
                                    val as "approved" | "pending" | "void",
                                  )
                                }
                              >
                                <SelectTrigger
                                  aria-label={`เปลี่ยนสถานะเอกสาร ${voucher.documentNo}`}
                                  className={cn(
                                    "h-8 min-h-8 w-[132px] rounded-full border px-2.5 text-[11.5px] font-bold",
                                    voucher.status === "approved"
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : voucher.status === "pending"
                                        ? "border-amber-200 bg-amber-50 text-amber-800"
                                        : "border-slate-200 bg-slate-100 text-slate-600",
                                  )}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="approved">
                                    อนุมัติแล้ว
                                  </SelectItem>
                                  <SelectItem value="pending">
                                    รอดำเนินการ
                                  </SelectItem>
                                  <SelectItem value="void">ยกเลิก</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
                                  voucher.status === "approved"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : voucher.status === "pending"
                                      ? "bg-amber-50 text-amber-800"
                                      : "bg-slate-100 text-slate-600",
                                )}
                                title={
                                  voucher.sourceType === "sales" ||
                                  voucher.sourceType === "receipt"
                                    ? "ซิงก์อัตโนมัติจากไฟล์รายได้ที่อัปโหลดในระบบ"
                                    : "ซิงก์อัตโนมัติจากบิลรายจ่ายในระบบ"
                                }
                              >
                                <span
                                  className={cn(
                                    "size-2 rounded-full",
                                    voucher.status === "approved"
                                      ? "bg-emerald-500"
                                      : voucher.status === "pending"
                                        ? "bg-amber-500"
                                        : "bg-slate-400",
                                  )}
                                />
                                {voucher.status === "approved"
                                  ? voucher.sourceType === "sales" ||
                                    voucher.sourceType === "receipt"
                                    ? "ผูกจากไฟล์รายได้แล้ว"
                                    : "อนุมัติแล้ว"
                                  : voucher.status === "pending"
                                    ? "รอดำเนินการ"
                                    : "ยกเลิก"}
                              </span>
                            )}
                          </td>
                          <td
                            className="whitespace-nowrap px-3 py-3.5 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`ดูใบสำคัญ ${voucher.documentNo}`}
                                onClick={() => setSelectedVoucher(voucher)}
                              >
                                <EyeIcon className="size-4 text-sky-700" />
                              </Button>
                              {isManualEditable && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`แก้ไขใบสำคัญ ${voucher.documentNo}`}
                                  onClick={() => handleEditVoucher(voucher)}
                                >
                                  <PencilIcon className="size-4 text-amber-700" />
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`สร้างซ้ำใบสำคัญ ${voucher.documentNo}`}
                                onClick={() => handleDuplicateVoucher(voucher)}
                              >
                                <CopyIcon className="size-4 text-emerald-700" />
                              </Button>
                              {isManualEditable && voucher.dbId && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`ลบสมุดรายวัน ${voucher.documentNo}`}
                                  onClick={() =>
                                    handleDeleteManualJournal(
                                      voucher.dbId!,
                                      voucher.documentNo,
                                    )
                                  }
                                >
                                  <Trash2Icon className="size-4 text-muted-foreground hover:text-destructive" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer (Matching FlowAccount) */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/15 px-4 py-2.5 text-[12px]">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">รายการต่อหน้า:</span>
                  {(
                    [
                      { label: "20", val: 20 },
                      { label: "50", val: 50 },
                      { label: "100", val: 100 },
                      { label: "ทั้งหมด", val: 0 },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => {
                        setJournalPageSize(opt.val);
                        setJournalPage(1);
                      }}
                      className={cn(
                        "min-h-8 rounded-md px-2.5 py-1 font-mono text-[11.5px] font-semibold transition-colors",
                        journalPageSize === opt.val
                          ? "bg-sky-600 text-white"
                          : "bg-background text-foreground hover:bg-muted",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-muted-foreground">
                    หน้า {safeJournalPage} / {totalJournalPages} (รวม{" "}
                    {filteredJournals.length} ใบสำคัญ)
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="หน้าก่อนหน้า"
                      disabled={safeJournalPage <= 1}
                      onClick={() => setJournalPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeftIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="หน้าถัดไป"
                      disabled={safeJournalPage >= totalJournalPages}
                      onClick={() =>
                        setJournalPage((p) =>
                          Math.min(totalJournalPages, p + 1),
                        )
                      }
                    >
                      <ChevronRightIcon className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>
      )}

      {/* Dialogs (Lazy-mounted when open for zero background overhead) */}
      {selectedAccount && (
        <AccountLedgerDetailDialog
          open={Boolean(selectedAccount)}
          onOpenChange={(open) => {
            if (!open) setSelectedAccount(null);
          }}
          account={selectedAccount}
          onSelectVoucher={(voucherId) => {
            const found = initialData.journals.find((j) => j.id === voucherId);
            if (found) {
              setSelectedVoucher(found);
            }
          }}
          onEditAccount={handleOpenEditAccount}
          onRecordEntryForAccount={handleOpenRecordEntryForAccount}
        />
      )}

      {selectedVoucher && (
        <JournalVoucherDetailDialog
          open={Boolean(selectedVoucher)}
          onOpenChange={(open) => {
            if (!open) setSelectedVoucher(null);
          }}
          voucher={selectedVoucher}
          seller={seller}
          onEdit={handleEditVoucher}
          onDuplicate={handleDuplicateVoucher}
          onStatusChange={handleUpdateJournalStatus}
        />
      )}

      {createJvOpen && (
        <CreateManualJournalDialog
          open={createJvOpen}
          onOpenChange={setCreateJvOpen}
          accounts={initialData.accounts}
          onCreated={refreshData}
          initialDraft={initialJvDraft}
        />
      )}

      {manageCoaOpen && (
        <ManageChartOfAccountDialog
          open={manageCoaOpen}
          onOpenChange={setManageCoaOpen}
          onSaved={refreshData}
          accounts={initialData.accounts}
          initialAccount={editingCoaAccount}
        />
      )}
    </div>
  );
}
