import { ExpensesManager } from "@/components/ExpensesManager";
import { PageHeader } from "@/components/PageHeader";
import { getExpensesOverview } from "@/lib/expenses";
import { getDocumentSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "รายจ่ายบริษัท",
  description: "บันทึกและจัดการรายจ่ายบริษัท เช็คยอดรับจากแฟลตฟอร์ม และติดตามกำไรสุทธิคงเหลือ",
};

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const params = await searchParams;
  const selectedYear = params.year || "all";
  const [data, settings] = await Promise.all([
    getExpensesOverview(selectedYear),
    getDocumentSettings(),
  ]);

  return (
    <div className="flex flex-col gap-[14px]">
      <PageHeader
        eyebrow="การเงินและผลกำไร · Company Expenses"
        title="รายจ่ายบริษัทและกำไรสุทธิ"
        description="จัดการบิลค่าใช้จ่าย (EXP...) พร้อมรหัสบัญชี ภาษีซื้อ VAT 7% หัก ณ ที่จ่าย แนบรูปใบเสร็จ/สลิป และเชื่อมตารางสรุปกำไรรายเดือนอัตโนมัติ"
      />

      <ExpensesManager
        initialData={data}
        initialYear={selectedYear}
        seller={settings}
      />
    </div>
  );
}
