import {
  AccountingManager,
  type MainAccountingTab,
} from "@/components/AccountingManager";
import type { ReportSubTab } from "@/components/AccountingReportsTab";
import type { VatReportSubView } from "@/components/AccountingVatTab";
import { PageHeader } from "@/components/PageHeader";
import type { JournalBookType } from "@/lib/accounting-types";
import { getAccountingOverview } from "@/lib/accounting";
import { getExpensesOverview } from "@/lib/expenses";
import { getDocumentSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "บริหารบัญชี · บัญชีแยกประเภท สมุดรายวัน รายงานบัญชี และรายจ่าย",
  description:
    "ระบบบริหารบัญชีครบวงจร: บัญชีแยกประเภท 5 หมวดหลัก สมุดรายวัน 5 เล่ม งบทดลอง งบกำไรขาดทุน งบดุล และบิลค่าใช้จ่ายบริษัท",
};

function parseInitialTab(raw?: string): MainAccountingTab {
  if (
    raw === "journals" ||
    raw === "reports" ||
    raw === "vat" ||
    raw === "expenses"
  ) {
    return raw;
  }
  return "ledger";
}

function parseInitialBook(raw?: string): "all" | JournalBookType {
  if (raw === "JV" || raw === "UV" || raw === "SV" || raw === "PV" || raw === "RV") {
    return raw;
  }
  return "all";
}

function parseInitialReport(raw?: string): ReportSubTab {
  if (
    raw === "trial_balance" ||
    raw === "income_statement" ||
    raw === "balance_sheet" ||
    raw === "movements" ||
    raw === "closing"
  ) {
    return raw;
  }
  return "trial_balance";
}

function parseInitialVat(raw?: string): VatReportSubView {
  if (
    raw === "input_docs" ||
    raw === "pp30_summary" ||
    raw === "pp36_report" ||
    raw === "input_vat" ||
    raw === "output_vat"
  ) {
    return raw;
  }
  return "pp30_summary";
}

function parseInitialExp(raw?: string): "ledger" | "wht" | "table" {
  if (raw === "ledger" || raw === "wht" || raw === "table") {
    return raw;
  }
  return "ledger";
}

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    year?: string;
    tab?: string;
    book?: string;
    report?: string;
    vat?: string;
    exp?: string;
  }>;
}) {
  const params = await searchParams;
  const selectedPeriod = params.period || params.year || "all";
  const initialTab = parseInitialTab(params.tab);
  const initialBook = parseInitialBook(params.book);
  const initialReport = parseInitialReport(params.report);
  const initialVat = parseInitialVat(params.vat);
  const initialExp = parseInitialExp(params.exp);
  const expenseYear = /^\d{4}$/.test(selectedPeriod) ? selectedPeriod : "all";

  const [data, expensesData, settings] = await Promise.all([
    getAccountingOverview(selectedPeriod),
    getExpensesOverview(expenseYear),
    getDocumentSettings(),
  ]);

  return (
    <div className="flex flex-col gap-[14px]">
      <PageHeader
        eyebrow="ระบบบริหารบัญชีครบวงจร"
        title="บริหารบัญชี · บัญชีแยกประเภท สมุดรายวัน งบการเงิน และรายจ่าย"
        description="ผังบัญชีมาตรฐาน 5 หมวดหลัก สมุดรายวัน 5 เล่ม งบทดลอง งบกำไรขาดทุน งบแสดงฐานะการเงิน และบันทึกบิลรายจ่าย พร้อมเชื่อมยอดขายแพลตฟอร์มอัตโนมัติในหน้าเดียว"
      />

      <AccountingManager
        initialData={data}
        expensesData={expensesData}
        initialPeriod={selectedPeriod}
        initialTab={initialTab}
        initialBook={initialBook}
        initialReport={initialReport}
        initialVat={initialVat}
        initialExp={initialExp}
        seller={settings}
      />
    </div>
  );
}
