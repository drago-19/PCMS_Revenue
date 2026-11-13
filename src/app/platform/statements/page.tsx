import { PageHeader } from "@/components/PageHeader";
import { PlatformStat, signedMoney } from "@/components/platform/PlatformCards";
import { PlatformNav } from "@/components/platform/PlatformNav";
import { PlatformPeriodBar } from "@/components/platform/PlatformPeriodBar";
import { PlatformDetail } from "@/components/platform/PlatformDetailSlot";
import { PlatformBody, PlatformSwitcher } from "@/components/platform/PlatformScope";
import { detailParam, hrefWithDetail } from "@/lib/platform/details";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getTikTokStatements } from "@/lib/platform/statements";
import { readPlatform } from "@/lib/platform/platforms";
import { thaiDate, thaiRange } from "@/lib/platform/period";
import { listPlatformAccounts, TIKTOK_PLATFORM } from "@/lib/platform/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "แพลตฟอร์ม · statement" };

function money(value: number): string {
  return `฿${value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function num(value: number): string {
  return value.toLocaleString("th-TH");
}

export default async function PlatformStatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; platform?: string; detail?: string }>;
}) {
  const params = await searchParams;
  const platform = readPlatform(params.platform);
  const [statements, accounts] = await Promise.all([
    getTikTokStatements({ from: params.from, to: params.to }),
    listPlatformAccounts(TIKTOK_PLATFORM),
  ]);
  const { totals, rows } = statements;

  const feeRatio = totals.revenue > 0 ? Math.round((totals.fee / totals.revenue) * 1000) / 10 : 0;

  return (
    <div className="workspace-page flex min-w-0 flex-col gap-4">
      <PageHeader
        eyebrow="TikTok Shop"
        title="statement ของ TikTok"
        description={`ใบสรุปยอดโอนรายวันที่ TikTok ส่งมา · ${thaiRange(statements.range.from, statements.range.to)}`}
      />

      <PlatformSwitcher
        platform={platform}
        basePath="/platform/statements"
        from={params.from}
        to={params.to}
      />

      <PlatformBody platform={platform}>
      <PlatformNav active="statements" from={params.from} to={params.to} />

      <PlatformPeriodBar
        basePath="/platform/statements"
        from={params.from}
        to={params.to}
        accounts={accounts.map((account) => ({ accountKey: account.accountKey, shopName: account.shopName }))}
      />

      <div className="grid min-w-0 grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 min-[900px]:grid-cols-4">
        <PlatformStat
          label="โอนจริงรวม"
          value={money(totals.settlement)}
          hint={`${num(totals.statements)} ใบ · ${num(totals.orders)} ออเดอร์`}
          tone="positive"
        />
        <PlatformStat label="ยอดขายก่อนหัก" value={money(totals.revenue)} hint="ตามที่ TikTok คํานวณในใบ" />
        <PlatformStat
          label="ค่าธรรมเนียม + ภาษี"
          value={signedMoney(totals.fee, 2)}
          hint={`คิดเป็น ${feeRatio}% ของยอดขาย`}
          tone="negative"
        />
        <PlatformStat
          label="ปรับปรุง (adjustment)"
          value={signedMoney(totals.adjustment, 2)}
          hint="เงินคืน/หักนอกคำสั่งซื้อ"
        />
      </div>

      {rows.length === 0 ? (
        <Card padding="padded" className="text-[13px] text-muted-foreground">
          ยังไม่มี statement ในช่วงนี้ — ลองดึงข้อมูลสดจากหน้าภาพรวมก่อน
        </Card>
      ) : (
        <Card padding="padded" className="flex min-w-0 flex-col">
          <h2 className="mb-1 text-[14px] font-bold">รายวัน</h2>
          <ul className="flex min-w-0 list-none flex-col p-0">
            {rows.map((row) => (
              <li key={row.statementId} className="border-b border-border/70 last:border-0">
                <a
                  href={hrefWithDetail("/platform/statements", params, detailParam("statement", row.statementId))}
                  className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg py-2.5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                <span className="w-[84px] shrink-0 text-[13px] font-bold">{thaiDate(row.time)}</span>
                <Badge variant={row.paymentStatus === "SETTLED" ? "success" : "neutral"}>
                  {row.paymentStatus === "SETTLED" ? "โอนแล้ว" : (row.paymentStatus ?? "ไม่ระบุ")}
                </Badge>
                <span className="text-[11.5px] text-muted-foreground">{num(row.orderCount)} ออเดอร์</span>
                <span className="ml-auto flex shrink-0 items-baseline gap-3 text-[12px] text-muted-foreground">
                  <span className="mono">ขาย {money(row.revenue)}</span>
                  <span className="mono text-[#b42318]">ค่าธรรมเนียม {signedMoney(row.fee, 2)}</span>
                  <span className="mono text-[13.5px] font-bold text-foreground">{money(row.settlement)}</span>
                </span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
      </PlatformBody>

      <PlatformDetail
        raw={params.detail}
        basePath="/platform/statements"
        params={params}
        from={params.from}
        to={params.to}
      />
    </div>
  );
}
