"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActivityIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileBarChart2Icon,
  LandmarkIcon,
  Loader2Icon,
  LockKeyholeIcon,
  PrinterIcon,
  ScaleIcon,
  SparklesIcon,
  TrendingUpIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ACCOUNT_TYPE_META,
  JOURNAL_BOOK_META,
  calculateAccountEndingBalance,
  type AccountingOverviewData,
  type GeneralLedgerAccountRow,
  type JournalVoucher,
} from "@/lib/accounting-types";
import { formatBaht, formatThaiDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ReportSubTab =
  | "trial_balance"
  | "income_statement"
  | "balance_sheet"
  | "movements"
  | "closing";

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

export function AccountingReportsTab({
  data,
  periodLabel,
  subTab: controlledSubTab,
  onSubTabChange,
  onSelectAccount,
  onSelectVoucher,
  onOpenClosingEntry,
}: {
  data: AccountingOverviewData;
  periodLabel: string;
  subTab?: ReportSubTab;
  onSubTabChange?: (next: ReportSubTab) => void;
  onSelectAccount: (acc: GeneralLedgerAccountRow) => void;
  onSelectVoucher?: (voucher: JournalVoucher) => void;
  onOpenClosingEntry: () => void;
}) {
  const [internalSubTab, setInternalSubTab] = useState<ReportSubTab>(
    controlledSubTab || "trial_balance",
  );
  const subTab = controlledSubTab ?? internalSubTab;
  const setSubTab = (next: ReportSubTab) => {
    setInternalSubTab(next);
    onSubTabChange?.(next);
  };
  useEffect(() => {
    if (controlledSubTab) {
      setInternalSubTab(controlledSubTab);
    }
  }, [controlledSubTab]);
  const [hideZeroRows, setHideZeroRows] = useState(false);
  const [includeDrafts, setIncludeDrafts] = useState(true);

  const movementLines = useMemo(() => {
    const list: {
      key: string;
      voucher: JournalVoucher;
      entryDate: string;
      documentNo: string;
      journalType: JournalVoucher["journalType"];
      contactName: string;
      accountCode: string;
      accountName: string;
      memo: string;
      debit: number;
      credit: number;
    }[] = [];
    for (const v of data.journals) {
      if (v.status === "void") continue;
      if (!includeDrafts && v.status === "pending") continue;
      v.lines.forEach((l, idx) => {
        list.push({
          key: `${v.id}-${idx}`,
          voucher: v,
          entryDate: v.entryDate,
          documentNo: v.documentNo,
          journalType: v.journalType,
          contactName: v.contactName,
          accountCode: l.accountCode,
          accountName: l.accountName,
          memo: l.memo || v.description,
          debit: l.debit,
          credit: l.credit,
        });
      });
    }
    return list;
  }, [data.journals, includeDrafts]);

  const closingVouchers = useMemo(
    () =>
      data.journals.filter(
        (v) =>
          v.status !== "void" &&
          (v.description.includes("ปิดงบ") ||
            v.referenceNo.includes("ปิดงบ") ||
            v.lines.some((l) => l.accountCode === "32000")),
      ),
    [data.journals],
  );

  const accounts = useMemo<GeneralLedgerAccountRow[]>(() => {
    if (includeDrafts) return data.accounts;
    const drByCode = new Map<string, number>();
    const crByCode = new Map<string, number>();
    for (const v of data.journals) {
      if (v.status !== "approved") continue;
      for (const l of v.lines) {
        const c = l.accountCode.trim();
        if (!c) continue;
        drByCode.set(c, (drByCode.get(c) || 0) + l.debit);
        crByCode.set(c, (crByCode.get(c) || 0) + l.credit);
      }
    }
    return data.accounts.map((acc) => {
      const totalDebit =
        Math.round((drByCode.get(acc.accountCode) || 0) * 100) / 100;
      const totalCredit =
        Math.round((crByCode.get(acc.accountCode) || 0) * 100) / 100;
      const endingBalance = calculateAccountEndingBalance(
        acc.normalBalance,
        totalDebit,
        totalCredit,
      );
      return {
        ...acc,
        totalDebit,
        totalCredit,
        endingBalance,
      };
    });
  }, [data.accounts, data.journals, includeDrafts]);

  const visibleTrialAccounts = hideZeroRows
    ? accounts.filter(
        (a) =>
          Math.abs(a.totalDebit) >= 0.005 ||
          Math.abs(a.totalCredit) >= 0.005 ||
          Math.abs(a.endingBalance) >= 0.005,
      )
    : accounts;

  // Trial Balance Totals
  let tbEndingDebitSum = 0;
  let tbEndingCreditSum = 0;
  for (const acc of visibleTrialAccounts) {
    if (acc.normalBalance === "debit") {
      if (acc.endingBalance >= 0) tbEndingDebitSum += acc.endingBalance;
      else tbEndingCreditSum += Math.abs(acc.endingBalance);
    } else {
      if (acc.endingBalance >= 0) tbEndingCreditSum += acc.endingBalance;
      else tbEndingDebitSum += Math.abs(acc.endingBalance);
    }
  }
  tbEndingDebitSum = Math.round(tbEndingDebitSum * 100) / 100;
  tbEndingCreditSum = Math.round(tbEndingCreditSum * 100) / 100;
  const activeJournalDebitSum = useMemo(
    () =>
      Math.round(
        movementLines.reduce((s, r) => s + r.debit, 0) * 100,
      ) / 100,
    [movementLines],
  );
  const activeJournalCreditSum = useMemo(
    () =>
      Math.round(
        movementLines.reduce((s, r) => s + r.credit, 0) * 100,
      ) / 100,
    [movementLines],
  );

  // Income Statement groups
  const revenueAccounts = accounts.filter((a) => a.accountType === "revenue");
  const expenseAccounts = accounts.filter((a) => a.accountType === "expense");
  const totalRevenue =
    Math.round(
      revenueAccounts.reduce((s, a) => s + a.endingBalance, 0) * 100,
    ) / 100;
  const totalExpense =
    Math.round(
      expenseAccounts.reduce((s, a) => s + a.endingBalance, 0) * 100,
    ) / 100;
  const netProfit = Math.round((totalRevenue - totalExpense) * 100) / 100;
  const netMarginPct =
    totalRevenue > 0
      ? Math.round((netProfit / totalRevenue) * 10000) / 100
      : 0;

  // Balance Sheet groups
  const assetAccounts = accounts.filter((a) => a.accountType === "asset");
  const liabilityAccounts = accounts.filter(
    (a) => a.accountType === "liability",
  );
  const equityAccounts = accounts.filter((a) => a.accountType === "equity");

  const totalAssets =
    Math.round(assetAccounts.reduce((s, a) => s + a.endingBalance, 0) * 100) /
    100;
  const totalLiabilities =
    Math.round(
      liabilityAccounts.reduce((s, a) => s + a.endingBalance, 0) * 100,
    ) / 100;
  const totalEquity =
    Math.round(equityAccounts.reduce((s, a) => s + a.endingBalance, 0) * 100) /
    100;
  const totalEquityWithCurrentProfit =
    Math.round((totalEquity + netProfit) * 100) / 100;
  const totalLiabilitiesAndEquity =
    Math.round((totalLiabilities + totalEquityWithCurrentProfit) * 100) / 100;
  const balanceSheetDiff =
    Math.round(Math.abs(totalAssets - totalLiabilitiesAndEquity) * 100) / 100;

  const handleExportReportCsv = () => {
    if (subTab === "income_statement") {
      const headers = ["หมวดหมู่", "รหัสบัญชี", "ชื่อบัญชี", "ยอดคงเหลือสุทธิ"];
      const rows: (string | number)[][] = [];
      for (const acc of revenueAccounts) {
        if (hideZeroRows && Math.abs(acc.endingBalance) < 0.005) continue;
        rows.push([
          "4. รายได้",
          acc.accountCode,
          acc.accountName,
          acc.endingBalance.toFixed(2),
        ]);
      }
      rows.push(["รวมรายได้", "", "รวมรายได้ทั้งสิ้น", totalRevenue.toFixed(2)]);
      for (const acc of expenseAccounts) {
        if (hideZeroRows && Math.abs(acc.endingBalance) < 0.005) continue;
        rows.push([
          "5. ค่าใช้จ่าย",
          acc.accountCode,
          acc.accountName,
          acc.endingBalance.toFixed(2),
        ]);
      }
      rows.push([
        "รวมค่าใช้จ่าย",
        "",
        "รวมค่าใช้จ่ายทั้งสิ้น",
        totalExpense.toFixed(2),
      ]);
      rows.push([
        "กำไรสุทธิ",
        "",
        "กำไร (ขาดทุน) สุทธิประจำงวด",
        netProfit.toFixed(2),
      ]);
      const csv = [
        headers.map(escapeCsvCell).join(","),
        ...rows.map((r) => r.map(escapeCsvCell).join(",")),
      ].join("\n");
      downloadCsvFile(`income-statement-${data.selectedYear || "all"}.csv`, csv);
      toast.success("ดาวน์โหลดไฟล์ตารางงบกำไรขาดทุนเรียบร้อย");
      return;
    }

    if (subTab === "balance_sheet") {
      const headers = ["หมวดหมู่", "รหัสบัญชี", "ชื่อบัญชี", "ยอดคงเหลือสุทธิ"];
      const rows: (string | number)[][] = [];
      for (const acc of assetAccounts) {
        if (hideZeroRows && Math.abs(acc.endingBalance) < 0.005) continue;
        rows.push([
          "1. สินทรัพย์",
          acc.accountCode,
          acc.accountName,
          acc.endingBalance.toFixed(2),
        ]);
      }
      rows.push(["รวมสินทรัพย์", "", "รวมสินทรัพย์ทั้งสิ้น", totalAssets.toFixed(2)]);
      for (const acc of liabilityAccounts) {
        if (hideZeroRows && Math.abs(acc.endingBalance) < 0.005) continue;
        rows.push([
          "2. หนี้สิน",
          acc.accountCode,
          acc.accountName,
          acc.endingBalance.toFixed(2),
        ]);
      }
      rows.push(["รวมหนี้สิน", "", "รวมหนี้สินทั้งสิ้น", totalLiabilities.toFixed(2)]);
      for (const acc of equityAccounts) {
        rows.push([
          "3. ส่วนของผู้ถือหุ้น",
          acc.accountCode,
          acc.accountName,
          acc.endingBalance.toFixed(2),
        ]);
      }
      rows.push([
        "3. ส่วนของผู้ถือหุ้น",
        "งวดปัจจุบัน",
        "กำไร (ขาดทุน) สุทธิสำหรับงวดปัจจุบัน",
        netProfit.toFixed(2),
      ]);
      rows.push([
        "รวมหนี้สินและทุน",
        "",
        "รวมหนี้สินและส่วนของผู้ถือหุ้น",
        totalLiabilitiesAndEquity.toFixed(2),
      ]);
      const csv = [
        headers.map(escapeCsvCell).join(","),
        ...rows.map((r) => r.map(escapeCsvCell).join(",")),
      ].join("\n");
      downloadCsvFile(`balance-sheet-${data.selectedYear || "all"}.csv`, csv);
      toast.success("ดาวน์โหลดไฟล์ตารางงบแสดงฐานะการเงินเรียบร้อย");
      return;
    }

    if (subTab === "movements") {
      const headers = [
        "วันที่",
        "เลขที่ใบสำคัญ",
        "สมุดรายวัน",
        "ผู้ติดต่อ",
        "รหัสบัญชี",
        "ชื่อบัญชี",
        "คำอธิบายรายการ",
        "เดบิต",
        "เครดิต",
      ];
      const rows = movementLines.map((r) => [
        r.entryDate,
        r.documentNo,
        JOURNAL_BOOK_META[r.journalType].label,
        r.contactName,
        r.accountCode,
        r.accountName,
        r.memo,
        r.debit.toFixed(2),
        r.credit.toFixed(2),
      ]);
      rows.push([
        "",
        "รวมทั้งสิ้น",
        "",
        "",
        "",
        "",
        `${movementLines.length} รายการ`,
        activeJournalDebitSum.toFixed(2),
        activeJournalCreditSum.toFixed(2),
      ]);
      const csv = [
        headers.map(escapeCsvCell).join(","),
        ...rows.map((r) => r.map(escapeCsvCell).join(",")),
      ].join("\n");
      downloadCsvFile(`account-movements-${data.selectedYear || "all"}.csv`, csv);
      toast.success("ดาวน์โหลดไฟล์รายการเคลื่อนไหวทางบัญชีเรียบร้อย");
      return;
    }

    if (subTab === "closing") {
      const headers = [
        "รหัสบัญชี",
        "ชื่อบัญชีที่โอนปิดงบ",
        "หมวดหมู่",
        "เดบิต ปิดบัญชี",
        "เครดิต ปิดบัญชี",
      ];
      const rows: (string | number)[][] = [];
      for (const acc of revenueAccounts.filter(
        (a) => Math.abs(a.endingBalance) >= 0.005,
      )) {
        rows.push([
          acc.accountCode,
          `${acc.accountName} · ล้างบัญชีรายได้`,
          "4. รายได้",
          acc.endingBalance > 0 ? acc.endingBalance.toFixed(2) : "0.00",
          acc.endingBalance < 0
            ? Math.abs(acc.endingBalance).toFixed(2)
            : "0.00",
        ]);
      }
      for (const acc of expenseAccounts.filter(
        (a) => Math.abs(a.endingBalance) >= 0.005,
      )) {
        rows.push([
          acc.accountCode,
          `${acc.accountName} · ล้างบัญชีค่าใช้จ่าย`,
          "5. ค่าใช้จ่าย",
          acc.endingBalance < 0
            ? Math.abs(acc.endingBalance).toFixed(2)
            : "0.00",
          acc.endingBalance > 0 ? acc.endingBalance.toFixed(2) : "0.00",
        ]);
      }
      rows.push([
        "32000",
        "กำไรขาดทุนสะสมยังไม่ได้จัดสรร · รับโอนกำไรสุทธิงวดปัจจุบัน",
        "3. ส่วนของผู้ถือหุ้น",
        netProfit < 0 ? Math.abs(netProfit).toFixed(2) : "0.00",
        netProfit >= 0 ? netProfit.toFixed(2) : "0.00",
      ]);
      const csv = [
        headers.map(escapeCsvCell).join(","),
        ...rows.map((r) => r.map(escapeCsvCell).join(",")),
      ].join("\n");
      downloadCsvFile(`closing-summary-${data.selectedYear || "all"}.csv`, csv);
      toast.success("ดาวน์โหลดไฟล์สรุปการปิดงบบัญชีเรียบร้อย");
      return;
    }

    const headers = [
      "รหัสบัญชี",
      "ชื่อบัญชี",
      "หมวดบัญชี",
      "เดบิตเคลื่อนไหว",
      "เครดิตเคลื่อนไหว",
      "ยอดคงเหลือ เดบิต",
      "ยอดคงเหลือ เครดิต",
    ];
    const rows = visibleTrialAccounts.map((acc) => {
      let endDr = 0;
      let endCr = 0;
      if (acc.normalBalance === "debit") {
        if (acc.endingBalance >= 0) endDr = acc.endingBalance;
        else endCr = Math.abs(acc.endingBalance);
      } else {
        if (acc.endingBalance >= 0) endCr = acc.endingBalance;
        else endDr = Math.abs(acc.endingBalance);
      }
      return [
        acc.accountCode,
        acc.accountName,
        ACCOUNT_TYPE_META[acc.accountType].label,
        acc.totalDebit.toFixed(2),
        acc.totalCredit.toFixed(2),
        endDr.toFixed(2),
        endCr.toFixed(2),
      ];
    });
    rows.push([
      "",
      "รวมทั้งสิ้น",
      "",
      activeJournalDebitSum.toFixed(2),
      activeJournalCreditSum.toFixed(2),
      tbEndingDebitSum.toFixed(2),
      tbEndingCreditSum.toFixed(2),
    ]);
    const csv = [
      headers.map(escapeCsvCell).join(","),
      ...rows.map((r) => r.map(escapeCsvCell).join(",")),
    ].join("\n");
    downloadCsvFile(`trial-balance-${data.selectedYear || "all"}.csv`, csv);
    toast.success("ดาวน์โหลดไฟล์ตารางงบทดลองเรียบร้อย");
  };

  return (
    <div className="flex flex-col gap-3.5">
      {/* Sub-navigation bar for the 5 Financial Reports & Closing Entry */}
      <Card className="no-print flex flex-col justify-between gap-1.5 p-2 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setSubTab("trial_balance")}
            className={cn(
              "inline-flex h-9 min-h-[36px] items-center gap-1 rounded-[10px] border px-2 py-1 text-[11.5px] font-bold whitespace-nowrap transition-all",
              subTab === "trial_balance"
                ? "border-sky-600 bg-sky-600 text-white shadow-xs"
                : "border-border bg-background text-foreground hover:bg-muted/60",
            )}
          >
            <ScaleIcon className="size-3.5 shrink-0" />
            <span>งบทดลอง</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab("income_statement")}
            className={cn(
              "inline-flex h-9 min-h-[36px] items-center gap-1 rounded-[10px] border px-2 py-1 text-[11.5px] font-bold whitespace-nowrap transition-all",
              subTab === "income_statement"
                ? "border-sky-600 bg-sky-600 text-white shadow-xs"
                : "border-border bg-background text-foreground hover:bg-muted/60",
            )}
          >
            <TrendingUpIcon className="size-3.5 shrink-0" />
            <span>งบกำไรขาดทุน</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab("balance_sheet")}
            className={cn(
              "inline-flex h-9 min-h-[36px] items-center gap-1 rounded-[10px] border px-2 py-1 text-[11.5px] font-bold whitespace-nowrap transition-all",
              subTab === "balance_sheet"
                ? "border-sky-600 bg-sky-600 text-white shadow-xs"
                : "border-border bg-background text-foreground hover:bg-muted/60",
            )}
          >
            <LandmarkIcon className="size-3.5 shrink-0" />
            <span>งบฐานะการเงิน</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab("movements")}
            className={cn(
              "inline-flex h-9 min-h-[36px] items-center gap-1 rounded-[10px] border px-2 py-1 text-[11.5px] font-bold whitespace-nowrap transition-all",
              subTab === "movements"
                ? "border-sky-600 bg-sky-600 text-white shadow-xs"
                : "border-border bg-background text-foreground hover:bg-muted/60",
            )}
          >
            <ActivityIcon className="size-3.5 shrink-0" />
            <span>รายการเคลื่อนไหว</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 font-mono text-[10px]",
                subTab === "movements"
                  ? "bg-white/20 text-white"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {movementLines.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab("closing")}
            className={cn(
              "inline-flex h-9 min-h-[36px] items-center gap-1 rounded-[10px] border px-2 py-1 text-[11.5px] font-bold whitespace-nowrap transition-all",
              subTab === "closing"
                ? "border-sky-600 bg-sky-600 text-white shadow-xs"
                : "border-border bg-background text-foreground hover:bg-muted/60",
            )}
          >
            <LockKeyholeIcon className="size-3.5 shrink-0" />
            <span>ปิดงบบัญชี รายได้และค่าใช้จ่าย</span>
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <label className="inline-flex h-9 min-h-[36px] cursor-pointer items-center gap-1.5 rounded-[10px] border border-border bg-card px-2 py-1 text-[11.5px] font-semibold whitespace-nowrap text-foreground shadow-xs transition-colors hover:bg-muted/40">
            <input
              type="checkbox"
              checked={includeDrafts}
              onChange={(e) => setIncludeDrafts(e.target.checked)}
              className="size-3.5 rounded accent-sky-600"
            />
            แสดงรายการร่าง
          </label>

          <label className="inline-flex h-9 min-h-[36px] cursor-pointer items-center gap-1.5 rounded-[10px] border border-border bg-card px-2 py-1 text-[11.5px] font-semibold whitespace-nowrap text-foreground shadow-xs transition-colors hover:bg-muted/40">
            <input
              type="checkbox"
              checked={hideZeroRows}
              onChange={(e) => setHideZeroRows(e.target.checked)}
              className="size-3.5 rounded accent-sky-600"
            />
            ซ่อนยอด 0.00
          </label>

          <Button
            type="button"
            variant="outline"
            onClick={handleExportReportCsv}
            className="h-9 min-h-[36px] gap-1 px-2 text-[11.5px] font-semibold"
          >
            <DownloadIcon className="size-3.5 text-emerald-700" />
            ดาวน์โหลด
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
            className="no-print h-9 min-h-[36px] gap-1 px-2 text-[11.5px] font-semibold"
          >
            <PrinterIcon className="size-3.5" />
            พิมพ์
          </Button>
        </div>
      </Card>

      {/* Report 1: Trial Balance */}
      {subTab === "trial_balance" && (
        <Card className="overflow-hidden border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <FileBarChart2Icon className="size-4 text-sky-700" />
                <h3 className="text-[14.5px] font-bold text-foreground">
                  งบทดลอง — {periodLabel}
                </h3>
              </div>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                ตรวจสอบความสมดุลของรายการเดบิตและเครดิตครบทั้ง 5 หมวดบัญชี (คลิกที่แถวเพื่อดูรายการเดินบัญชี)
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12px] font-bold text-emerald-800">
              <CheckCircle2Icon className="size-4 text-emerald-600" />
              <span>
                งบทดลองสมดุล (เดบิต ฿{formatBaht(tbEndingDebitSum)} = เครดิต ฿
                {formatBaht(tbEndingCreditSum)})
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left text-[12.5px]">
              <thead className="bg-sky-700 text-white">
                <tr>
                  <th className="w-[120px] px-4 py-2.5 font-semibold">
                    รหัสบัญชี
                  </th>
                  <th className="px-4 py-2.5 font-semibold">ชื่อบัญชี</th>
                  <th className="w-[130px] px-3 py-2.5 font-semibold">
                    หมวดบัญชี
                  </th>
                  <th className="w-[140px] px-3 py-2.5 text-right font-semibold">
                    เดบิตสะสม
                  </th>
                  <th className="w-[140px] px-3 py-2.5 text-right font-semibold">
                    เครดิตสะสม
                  </th>
                  <th className="w-[145px] bg-sky-800 px-3 py-2.5 text-right font-semibold">
                    คงเหลือ เดบิต
                  </th>
                  <th className="w-[145px] bg-sky-800 px-3 py-2.5 text-right font-semibold">
                    คงเหลือ เครดิต
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {visibleTrialAccounts.map((acc) => {
                  const meta = ACCOUNT_TYPE_META[acc.accountType];
                  let endDr = 0;
                  let endCr = 0;
                  if (acc.normalBalance === "debit") {
                    if (acc.endingBalance >= 0) endDr = acc.endingBalance;
                    else endCr = Math.abs(acc.endingBalance);
                  } else {
                    if (acc.endingBalance >= 0) endCr = acc.endingBalance;
                    else endDr = Math.abs(acc.endingBalance);
                  }

                  return (
                    <tr
                      key={acc.accountCode}
                      onClick={() => onSelectAccount(acc)}
                      className="cursor-pointer transition-colors hover:bg-sky-50/50"
                    >
                      <td className="px-4 py-2.5 font-mono font-bold text-foreground">
                        {acc.accountCode}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        {acc.accountName}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge
                          variant="outline"
                          className={cn("text-[11px] font-semibold", meta.badgeClass)}
                        >
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                        {acc.totalDebit > 0 ? formatBaht(acc.totalDebit) : "-"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                        {acc.totalCredit > 0 ? formatBaht(acc.totalCredit) : "-"}
                      </td>
                      <td className="bg-sky-50/30 px-3 py-2.5 text-right font-mono font-bold text-sky-900">
                        {endDr > 0 ? formatBaht(endDr) : "-"}
                      </td>
                      <td className="bg-amber-50/30 px-3 py-2.5 text-right font-mono font-bold text-amber-900">
                        {endCr > 0 ? formatBaht(endCr) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-right">
                    รวมทั้งสิ้น (เดบิต = เครดิต)
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-sky-800">
                    ฿{formatBaht(data.summary.totalJournalDebit)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-amber-900">
                    ฿{formatBaht(data.summary.totalJournalCredit)}
                  </td>
                  <td className="bg-sky-100/80 px-3 py-3 text-right font-mono text-[13.5px] text-sky-950">
                    ฿{formatBaht(tbEndingDebitSum)}
                  </td>
                  <td className="bg-amber-100/80 px-3 py-3 text-right font-mono text-[13.5px] text-amber-950">
                    ฿{formatBaht(tbEndingCreditSum)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Report 2: Income Statement (P&L) */}
      {subTab === "income_statement" && (
        <Card className="overflow-hidden border-border p-4 sm:p-6">
          <div className="flex flex-col justify-between gap-2 border-b border-border pb-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-[16px] font-bold text-foreground">
                งบกำไรขาดทุน
              </h3>
              <p className="text-[12.5px] text-muted-foreground">
                งวดบัญชี: {periodLabel} · แยกตามหมวดรายได้ (4xxxx) และค่าใช้จ่าย (5xxxx)
              </p>
            </div>
            <div
              className={cn(
                "rounded-xl border px-4 py-2 text-right",
                netProfit >= 0
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-rose-200 bg-rose-50 text-rose-900",
              )}
            >
              <div className="text-[11px] font-semibold">
                กำไร (ขาดทุน) สุทธิประจำงวด ({netMarginPct.toFixed(2)}%)
              </div>
              <div className="font-mono text-[18px] font-extrabold">
                ฿{formatBaht(netProfit)}
              </div>
            </div>
          </div>

          {/* 4. Revenue Section */}
          <div className="mt-4">
            <div className="flex items-center justify-between rounded-lg bg-emerald-50/80 px-3.5 py-2 text-[13px] font-bold text-emerald-950">
              <span>4. รายได้จากการขายและให้บริการ (หมวด 4xxxx)</span>
              <span className="font-mono">฿{formatBaht(totalRevenue)}</span>
            </div>
            <div className="mt-1 divide-y divide-border">
              {revenueAccounts
                .filter((a) => !hideZeroRows || Math.abs(a.endingBalance) >= 0.005)
                .map((acc) => (
                  <div
                    key={acc.accountCode}
                    onClick={() => onSelectAccount(acc)}
                    className="flex cursor-pointer items-center justify-between px-3.5 py-2.5 text-[13px] hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold text-muted-foreground">
                        {acc.accountCode}
                      </span>
                      <span className="font-medium text-foreground">
                        {acc.accountName}
                      </span>
                    </div>
                    <span className="font-mono font-semibold text-foreground">
                      {acc.endingBalance !== 0
                        ? `฿${formatBaht(acc.endingBalance)}`
                        : "-"}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* 5. Expense Section */}
          <div className="mt-5">
            <div className="flex items-center justify-between rounded-lg bg-rose-50/80 px-3.5 py-2 text-[13px] font-bold text-rose-950">
              <span>5. ต้นทุนขายและค่าใช้จ่ายในการดำเนินงาน (หมวด 5xxxx)</span>
              <span className="font-mono">฿{formatBaht(totalExpense)}</span>
            </div>
            <div className="mt-1 divide-y divide-border">
              {expenseAccounts
                .filter((a) => !hideZeroRows || Math.abs(a.endingBalance) >= 0.005)
                .map((acc) => (
                  <div
                    key={acc.accountCode}
                    onClick={() => onSelectAccount(acc)}
                    className="flex cursor-pointer items-center justify-between px-3.5 py-2.5 text-[13px] hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold text-muted-foreground">
                        {acc.accountCode}
                      </span>
                      <span className="font-medium text-foreground">
                        {acc.accountName}
                      </span>
                    </div>
                    <span className="font-mono font-semibold text-foreground">
                      {acc.endingBalance !== 0
                        ? `฿${formatBaht(acc.endingBalance)}`
                        : "-"}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* Net Income Footer */}
          <div className="mt-6 flex items-center justify-between rounded-xl border-2 border-sky-700 bg-sky-950 px-4 py-3.5 text-white">
            <div>
              <div className="text-[14px] font-bold">
                กำไร (ขาดทุน) สุทธิก่อนภาษีเงินได้นิติบุคคล
              </div>
              <div className="text-[11.5px] text-sky-200">
                รวมรายได้ ฿{formatBaht(totalRevenue)} หัก รวมค่าใช้จ่าย ฿
                {formatBaht(totalExpense)}
              </div>
            </div>
            <div className="font-mono text-[18px] font-extrabold text-emerald-300">
              ฿{formatBaht(netProfit)}
            </div>
          </div>
        </Card>
      )}

      {/* Report 3: Balance Sheet */}
      {subTab === "balance_sheet" && (
        <Card className="overflow-hidden border-border p-4 sm:p-6">
          <div className="flex flex-col justify-between gap-2 border-b border-border pb-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-[16px] font-bold text-foreground">
                งบแสดงฐานะการเงิน
              </h3>
              <p className="text-[12.5px] text-muted-foreground">
                สมการบัญชี: สินทรัพย์รวม = หนี้สินรวม + ส่วนของผู้ถือหุ้น
              </p>
            </div>
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12px] font-bold",
                balanceSheetDiff < 0.02
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800",
              )}
            >
              <CheckCircle2Icon className="size-4 text-emerald-600" />
              <span>
                สมการงบดุลสมดุล 100% (฿{formatBaht(totalAssets)} = ฿
                {formatBaht(totalLiabilitiesAndEquity)})
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Left Column: Assets */}
            <div className="flex flex-col justify-between rounded-xl border border-border p-3.5">
              <div>
                <div className="flex items-center justify-between rounded-lg bg-sky-50 px-3 py-2 text-[13px] font-bold text-sky-950">
                  <span>1. สินทรัพย์ (หมวด 1xxxx)</span>
                  <span className="font-mono">฿{formatBaht(totalAssets)}</span>
                </div>
                <div className="mt-1 divide-y divide-border">
                  {assetAccounts
                    .filter(
                      (a) => !hideZeroRows || Math.abs(a.endingBalance) >= 0.005,
                    )
                    .map((acc) => (
                      <div
                        key={acc.accountCode}
                        onClick={() => onSelectAccount(acc)}
                        className="flex cursor-pointer items-center justify-between px-3 py-2 text-[12.5px] hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-muted-foreground">
                            {acc.accountCode}
                          </span>
                          <span className="font-medium text-foreground">
                            {acc.accountName}
                          </span>
                        </div>
                        <span className="font-mono font-semibold text-foreground">
                          {acc.endingBalance !== 0
                            ? `฿${formatBaht(acc.endingBalance)}`
                            : "-"}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-lg bg-sky-900 px-3.5 py-2.5 text-[13.5px] font-bold text-white">
                <span>รวมสินทรัพย์ทั้งสิ้น</span>
                <span className="font-mono">฿{formatBaht(totalAssets)}</span>
              </div>
            </div>

            {/* Right Column: Liabilities + Equity */}
            <div className="flex flex-col justify-between rounded-xl border border-border p-3.5">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-950">
                    <span>2. หนี้สิน (หมวด 2xxxx)</span>
                    <span className="font-mono">
                      ฿{formatBaht(totalLiabilities)}
                    </span>
                  </div>
                  <div className="mt-1 divide-y divide-border">
                    {liabilityAccounts
                      .filter(
                        (a) =>
                          !hideZeroRows || Math.abs(a.endingBalance) >= 0.005,
                      )
                      .map((acc) => (
                        <div
                          key={acc.accountCode}
                          onClick={() => onSelectAccount(acc)}
                          className="flex cursor-pointer items-center justify-between px-3 py-2 text-[12.5px] hover:bg-muted/40"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-muted-foreground">
                              {acc.accountCode}
                            </span>
                            <span className="font-medium text-foreground">
                              {acc.accountName}
                            </span>
                          </div>
                          <span className="font-mono font-semibold text-foreground">
                            {acc.endingBalance !== 0
                              ? `฿${formatBaht(acc.endingBalance)}`
                              : "-"}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between rounded-lg bg-purple-50 px-3 py-2 text-[13px] font-bold text-purple-950">
                    <span>3. ส่วนของผู้ถือหุ้น (หมวด 3xxxx)</span>
                    <span className="font-mono">
                      ฿{formatBaht(totalEquityWithCurrentProfit)}
                    </span>
                  </div>
                  <div className="mt-1 divide-y divide-border">
                    {equityAccounts.map((acc) => (
                      <div
                        key={acc.accountCode}
                        onClick={() => onSelectAccount(acc)}
                        className="flex cursor-pointer items-center justify-between px-3 py-2 text-[12.5px] hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-muted-foreground">
                            {acc.accountCode}
                          </span>
                          <span className="font-medium text-foreground">
                            {acc.accountName}
                          </span>
                        </div>
                        <span className="font-mono font-semibold text-foreground">
                          {acc.endingBalance !== 0
                            ? `฿${formatBaht(acc.endingBalance)}`
                            : "-"}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between bg-emerald-50/50 px-3 py-2 text-[12.5px]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-700">
                          งวดนี้
                        </span>
                        <span className="font-semibold text-emerald-950">
                          บวก: กำไร (ขาดทุน) สุทธิสำหรับงวดปัจจุบัน (รอปิดงบเข้า 32000)
                        </span>
                      </div>
                      <span className="font-mono font-bold text-emerald-800">
                        ฿{formatBaht(netProfit)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-lg bg-sky-900 px-3.5 py-2.5 text-[13.5px] font-bold text-white">
                <span>รวมหนี้สินและส่วนของผู้ถือหุ้น</span>
                <span className="font-mono">
                  ฿{formatBaht(totalLiabilitiesAndEquity)}
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Report 4: รายการเคลื่อนไหว (Account Movements) */}
      {subTab === "movements" && (
        <Card className="overflow-hidden border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <ActivityIcon className="size-4 text-sky-700" />
                <h3 className="text-[14.5px] font-bold text-foreground">
                  รายงานรายการเคลื่อนไหวทางบัญชี — {periodLabel}
                </h3>
              </div>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                แสดงทุกรายการเดินบัญชีเดบิตและเครดิตเรียงตามลำดับวันที่และใบสำคัญสมุดรายวัน ({movementLines.length} รายการย่อย)
              </p>
            </div>
            <div className="font-mono text-[12px] font-bold text-sky-900">
              รวมเดบิต ฿{formatBaht(data.summary.totalJournalDebit)} = เครดิต ฿
              {formatBaht(data.summary.totalJournalCredit)}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-[12.5px]">
              <thead className="bg-sky-700 text-white">
                <tr>
                  <th className="w-[115px] px-3.5 py-2.5 font-semibold">วันที่</th>
                  <th className="w-[165px] px-3 py-2.5 font-semibold">เลขที่ใบสำคัญ</th>
                  <th className="w-[105px] px-3 py-2.5 font-semibold">รหัสบัญชี</th>
                  <th className="px-3 py-2.5 font-semibold">ชื่อบัญชี / คำอธิบายรายการ</th>
                  <th className="w-[140px] px-3 py-2.5 text-right font-semibold">
                    เดบิต
                  </th>
                  <th className="w-[140px] px-3.5 py-2.5 text-right font-semibold">
                    เครดิต
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {movementLines.map((row) => {
                  const bookMeta = JOURNAL_BOOK_META[row.journalType];
                  return (
                    <tr
                      key={row.key}
                      onClick={() => onSelectVoucher?.(row.voucher)}
                      className="cursor-pointer transition-colors hover:bg-sky-50/40"
                    >
                      <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-foreground">
                        {formatThaiDate(row.entryDate)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-sky-700">
                            {row.documentNo}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "px-1.5 py-0 text-[10px] font-bold",
                              bookMeta.badgeClass,
                            )}
                          >
                            {row.journalType}
                          </Badge>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono font-bold text-foreground">
                        {row.accountCode}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-foreground">
                          {row.accountName}
                        </div>
                        <div className="text-[11.5px] text-muted-foreground">
                          {row.memo}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-bold text-sky-800">
                        {row.debit > 0 ? formatBaht(row.debit) : "-"}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono font-bold text-amber-900">
                        {row.credit > 0 ? formatBaht(row.credit) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900">
                <tr>
                  <td colSpan={4} className="px-3.5 py-3 text-right">
                    รวมรายการเคลื่อนไหวทั้งหมด ({movementLines.length} รายการ)
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-sky-900">
                    ฿{formatBaht(data.summary.totalJournalDebit)}
                  </td>
                  <td className="px-3.5 py-3 text-right font-mono text-amber-900">
                    ฿{formatBaht(data.summary.totalJournalCredit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Report 5: ปิดงบบัญชี — รายได้และค่าใช้จ่าย */}
      {subTab === "closing" && (
        <Card className="overflow-hidden border-border p-4 sm:p-6">
          <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <LockKeyholeIcon className="size-4.5 text-sky-700" />
                <h3 className="text-[15.5px] font-bold text-foreground">
                  ปิดงบบัญชี — รายได้และค่าใช้จ่าย · {periodLabel}
                </h3>
              </div>
              <p className="mt-1 text-[12px] text-muted-foreground">
                สรุปยอดคงเหลือหมวดรายได้ 4xxxx และหมวดค่าใช้จ่าย 5xxxx เพื่อโอนปิดเข้าบัญชี 32000 กำไรขาดทุนสะสมยังไม่ได้จัดสรร
              </p>
            </div>
            <ClosingActionButton onOpenClosingEntry={onOpenClosingEntry} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="text-[12px] font-bold text-emerald-900">
                1. เดบิต ล้างหมวดรายได้รวม 4xxxx
              </div>
              <div className="mt-1 font-mono text-[20px] font-extrabold text-emerald-950">
                ฿{formatBaht(totalRevenue)}
              </div>
              <div className="mt-0.5 text-[11.5px] text-emerald-800">
                {revenueAccounts.filter((a) => Math.abs(a.endingBalance) >= 0.005).length} บัญชีรายได้ที่มีเคลื่อนไหว
              </div>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
              <div className="text-[12px] font-bold text-rose-900">
                2. เครดิต ล้างหมวดค่าใช้จ่ายรวม 5xxxx
              </div>
              <div className="mt-1 font-mono text-[20px] font-extrabold text-rose-950">
                ฿{formatBaht(totalExpense)}
              </div>
              <div className="mt-0.5 text-[11.5px] text-rose-800">
                {expenseAccounts.filter((a) => Math.abs(a.endingBalance) >= 0.005).length} บัญชีค่าใช้จ่ายที่มีเคลื่อนไหว
              </div>
            </div>

            <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4">
              <div className="text-[12px] font-bold text-sky-900">
                3. โอนเข้า 32000 กำไรขาดทุนสะสมสุทธิ
              </div>
              <div className="mt-1 font-mono text-[20px] font-extrabold text-sky-950">
                ฿{formatBaht(netProfit)}
              </div>
              <div className="mt-0.5 text-[11.5px] text-sky-800">
                อัตรากำไรสุทธิ {netMarginPct.toFixed(2)}%
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[680px] border-collapse text-left text-[12.5px]">
              <thead className="bg-sky-600 text-white">
                <tr>
                  <th className="w-[120px] px-4 py-2.5 font-semibold">รหัสบัญชี</th>
                  <th className="px-4 py-2.5 font-semibold">ชื่อบัญชีที่ต้องโอนปิดงบ</th>
                  <th className="w-[140px] px-3 py-2.5 font-semibold">หมวดหมู่</th>
                  <th className="w-[155px] px-3 py-2.5 text-right font-semibold">
                    เดบิต ปิดบัญชี
                  </th>
                  <th className="w-[155px] px-4 py-2.5 text-right font-semibold">
                    เครดิต ปิดบัญชี
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {revenueAccounts
                  .filter((a) => Math.abs(a.endingBalance) >= 0.005)
                  .map((acc) => (
                    <tr key={acc.accountCode} className="hover:bg-muted/40">
                      <td className="px-4 py-2.5 font-mono font-bold">
                        {acc.accountCode}
                      </td>
                      <td className="px-4 py-2.5 font-medium">
                        {acc.accountName} · ล้างบัญชีรายได้
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-800"
                        >
                          4. รายได้
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-sky-800">
                        {acc.endingBalance > 0
                          ? formatBaht(acc.endingBalance)
                          : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-900">
                        {acc.endingBalance < 0
                          ? formatBaht(Math.abs(acc.endingBalance))
                          : "-"}
                      </td>
                    </tr>
                  ))}
                {expenseAccounts
                  .filter((a) => Math.abs(a.endingBalance) >= 0.005)
                  .map((acc) => (
                    <tr key={acc.accountCode} className="hover:bg-muted/40">
                      <td className="px-4 py-2.5 font-mono font-bold">
                        {acc.accountCode}
                      </td>
                      <td className="px-4 py-2.5 font-medium">
                        {acc.accountName} · ล้างบัญชีค่าใช้จ่าย
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge
                          variant="outline"
                          className="border-rose-200 bg-rose-50 text-[11px] font-semibold text-rose-800"
                        >
                          5. ค่าใช้จ่าย
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-sky-800">
                        {acc.endingBalance < 0
                          ? formatBaht(Math.abs(acc.endingBalance))
                          : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-900">
                        {acc.endingBalance > 0
                          ? formatBaht(acc.endingBalance)
                          : "-"}
                      </td>
                    </tr>
                  ))}
                <tr className="bg-sky-50/70 font-bold">
                  <td className="px-4 py-3 font-mono text-sky-950">32000</td>
                  <td className="px-4 py-3 text-sky-950">
                    กำไรขาดทุนสะสมยังไม่ได้จัดสรร · รับโอนกำไรสุทธิงวดปัจจุบัน
                  </td>
                  <td className="px-3 py-3">
                    <Badge
                      variant="outline"
                      className="border-sky-200 bg-white text-[11px] font-semibold text-sky-800"
                    >
                      3. ส่วนของผู้ถือหุ้น
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-sky-900">
                    {netProfit < 0 ? formatBaht(Math.abs(netProfit)) : "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-amber-950">
                    {netProfit >= 0 ? formatBaht(netProfit) : "-"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Saved Closing Vouchers History Table (Matching FlowAccount) */}
          <div className="mt-5 rounded-xl border border-border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-2.5 text-[12.5px]">
              <span className="font-bold text-foreground">
                ประวัติเอกสารปิดงบบัญชีที่บันทึกไว้ ({closingVouchers.length} รายการ)
              </span>
              <span className="text-[11.5px] text-muted-foreground">
                คลิกที่แถวเอกสารเพื่อดูไส้ในหรือแก้ไขรายการปิดงบ
              </span>
            </div>
            {closingVouchers.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">
                ยังไม่มีใบสำคัญปิดงบบัญชีที่บันทึกในงวดนี้ — กดปุ่ม &ldquo;สร้างใบสำคัญปิดงบบัญชี โอนเข้า 32000&rdquo; ด้านบนเพื่อบันทึกได้ทันที
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-[12.5px]">
                  <thead className="bg-muted/40 text-foreground">
                    <tr>
                      <th className="w-[120px] px-4 py-2.5 font-semibold">วันที่</th>
                      <th className="w-[150px] px-3 py-2.5 font-semibold">เลขที่เอกสาร</th>
                      <th className="px-3 py-2.5 font-semibold">คำอธิบายรอบปิดบัญชี</th>
                      <th className="w-[140px] px-3 py-2.5 text-right font-semibold">ยอดรวมสุทธิ</th>
                      <th className="w-[120px] px-4 py-2.5 font-semibold">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {closingVouchers.map((v) => (
                      <tr
                        key={v.id}
                        onClick={() => onSelectVoucher?.(v)}
                        className="cursor-pointer transition-colors hover:bg-sky-50/40"
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono">
                          {formatThaiDate(v.entryDate)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono font-bold text-sky-700">
                          {v.documentNo}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-foreground">
                          {v.description}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-bold">
                          ฿{formatBaht(v.totalDebit)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              v.status === "approved"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-800",
                            )}
                          >
                            {v.status === "approved" ? "อนุมัติแล้ว" : "รอดำเนินการ"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function ClosingActionButton({
  onOpenClosingEntry,
}: {
  onOpenClosingEntry?: () => void;
}) {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      type="button"
      size="sm"
      disabled={loading}
      onClick={() => {
        if (!onOpenClosingEntry) return;
        setLoading(true);
        setTimeout(() => {
          onOpenClosingEntry();
          setTimeout(() => setLoading(false), 120);
        }, 0);
      }}
      className="h-8.5 min-h-[34px] shrink-0 gap-1.5 rounded-lg bg-sky-600 px-3 text-[12px] font-bold text-white shadow-xs hover:bg-sky-700"
    >
      {loading ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : (
        <SparklesIcon className="size-3.5" />
      )}
      สร้างใบสำคัญปิดงบบัญชี โอนเข้า 32000
    </Button>
  );
}
