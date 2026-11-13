import Link from "next/link";
import { PeriodPicker } from "@/components/PeriodPicker";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getTikTokStatements } from "@/lib/platform/statements";

export const dynamic = "force-dynamic";

function money(value: number): string {
  return `฿${value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function num(value: number): string {
  return value.toLocaleString("th-TH");
}

function dayLabel(value: string | null): string {
  if (!value) return "ไม่ระบุวัน";
  const date = new Date(value);
  return date.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}


export default async function PlatformStatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const statements = await getTikTokStatements({ from: params.from, to: params.to });
  const { totals, rows } = statements;

  const feeRatio = totals.revenue > 0 ? Math.round((totals.fee / totals.revenue) * 1000) / 10 : 0;

  return (
    <main className="workspace-page flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-[20px] font-bold leading-tight">statement ของ TikTok</h1>
          <p className="text-[12.5px] text-muted-foreground">
            ใบสรุปยอดโอนรายวันที่ TikTok ส่งมา · {statements.range.from} → {statements.range.to}
          </p>
        </div>
        <Link
          href="/platform"
          className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-[13px] font-bold hover:bg-muted"
        >
          ← กลับหน้าแพลตฟอร์ม
        </Link>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-[12.5px] text-muted-foreground">ช่วงวันที่:</span>
        <PeriodPicker from={params.from} to={params.to} basePath="/platform/statements" />
        <Link
          href="/platform/statements?from=2026-01-01"
          className="text-[12.5px] underline underline-offset-2"
        >
          ทั้งปี 69
        </Link>
        {params.from || params.to ? (
          <Link href="/platform/statements" className="text-[12.5px] underline underline-offset-2">
            ล้างช่วงวันที่
          </Link>
        ) : null}
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <Card padding="padded" className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-bold text-muted-foreground">โอนจริงรวม</span>
          <span className="mono truncate text-[22px] font-bold leading-tight text-[#0d8a47]">
            {money(totals.settlement)}
          </span>
          <span className="text-[11.5px] text-muted-foreground">{num(totals.statements)} ใบ · {num(totals.orders)} ออเดอร์</span>
        </Card>
        <Card padding="padded" className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-bold text-muted-foreground">ยอดขายก่อนหัก</span>
          <span className="mono truncate text-[22px] font-bold leading-tight">{money(totals.revenue)}</span>
          <span className="text-[11.5px] text-muted-foreground">ตามที่ TikTok คำนวณในใบ</span>
        </Card>
        <Card padding="padded" className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-bold text-muted-foreground">ค่าธรรมเนียม + ภาษี</span>
          <span className="mono truncate text-[22px] font-bold leading-tight text-[#b42318]">{money(totals.fee)}</span>
          <span className="text-[11.5px] text-muted-foreground">คิดเป็น {feeRatio}% ของยอดขาย</span>
        </Card>
        <Card padding="padded" className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-bold text-muted-foreground">ปรับปรุง (adjustment)</span>
          <span className="mono truncate text-[22px] font-bold leading-tight">{money(totals.adjustment)}</span>
          <span className="text-[11.5px] text-muted-foreground">เงินคืน/หักนอกคำสั่งซื้อ</span>
        </Card>
      </div>

      {rows.length === 0 ? (
        <Card padding="padded" className="text-[13px] text-muted-foreground">
          ยังไม่มี statement ในช่วงนี้ — ลองกดซิงก์ที่หน้าแพลตฟอร์มก่อน
        </Card>
      ) : (
        <Card padding="padded" className="flex min-w-0 flex-col">
          <h2 className="mb-1 text-[14px] font-bold">รายวัน</h2>
          <ul className="flex min-w-0 flex-col">
            {rows.map((row) => (
              <li
                key={row.statementId}
                className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/70 py-2.5 last:border-0"
              >
                <span className="w-[72px] shrink-0 text-[13px] font-bold">{dayLabel(row.time)}</span>
                <Badge variant={row.paymentStatus === "SETTLED" ? "success" : "neutral"}>
                  {row.paymentStatus === "SETTLED" ? "โอนแล้ว" : (row.paymentStatus ?? "ไม่ระบุ")}
                </Badge>
                <span className="text-[11.5px] text-muted-foreground">{num(row.orderCount)} ออเดอร์</span>
                <span className="ml-auto flex shrink-0 items-baseline gap-3 text-[12px] text-muted-foreground">
                  <span className="mono">ขาย {money(row.revenue)}</span>
                  <span className="mono text-[#b42318]">หัก {money(row.fee)}</span>
                  <span className="mono text-[13.5px] font-bold text-foreground">{money(row.settlement)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
