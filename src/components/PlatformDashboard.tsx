import Link from "next/link";
import { EmptyState } from "@/components/PageHeader";
import { IconInfo, IconTruck, IconWallet } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { TikTokDashboard } from "@/lib/platform/dashboard";

function money(value: number): string {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** เงินบาทพร้อมเครื่องหมายลบไว้หน้า ฿ เช่น -฿178,221.37 (อ่านง่ายกว่า ฿-178,221.37) */
function baht(value: number): string {
  return value < 0 ? `-฿${money(Math.abs(value))}` : `฿${money(value)}`;
}

function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("th-TH", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function KpiCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "accent";
}) {
  return (
    <Card padding="padded" className="flex min-w-0 flex-col gap-1">
      <span className="text-[12.5px] font-bold text-muted-foreground">{label}</span>
      <span
        className={
          tone === "accent"
            ? "mono truncate text-[22px] font-bold leading-tight text-[#0d8a47]"
            : "mono truncate text-[22px] font-bold leading-tight"
        }
      >
        {value}
      </span>
      {hint ? <span className="text-[12px] text-muted-foreground">{hint}</span> : null}
    </Card>
  );
}

function DailyBars({ daily }: { daily: TikTokDashboard["daily"] }) {
  if (daily.length === 0) {
    return (
      <p className="text-[13px] leading-6 text-muted-foreground">
        ยังไม่มีข้อมูล statement ในช่วงนี้
      </p>
    );
  }

  const recent = daily.slice(-14);
  const max = Math.max(...recent.map((point) => Math.abs(point.settlement)), 1);

  return (
    <ul className="flex list-none flex-col gap-1.5 p-0">
      {recent.map((point) => {
        const width = Math.max(2, Math.round((Math.abs(point.settlement) / max) * 100));
        const negative = point.settlement < 0;
        return (
          <li key={point.date} className="grid grid-cols-[62px_minmax(0,1fr)_112px] items-center gap-2">
            <span className="text-[12px] text-muted-foreground">{shortDate(point.date)}</span>
            <span
              className="h-2.5 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${shortDate(point.date)} ยอดโอน ${money(point.settlement)} บาท`}
            >
              <span
                className={negative ? "block h-full rounded-full bg-[#c2410c]" : "block h-full rounded-full bg-[#0f766e]"}
                style={{ width: `${width}%` }}
              />
            </span>
            <span
              className={
                negative
                  ? "mono text-right text-[12.5px] font-bold text-[#c2410c]"
                  : "mono text-right text-[12.5px] font-bold"
              }
            >
              {money(point.settlement)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function StatusList({ statuses }: { statuses: TikTokDashboard["packageStatuses"] }) {
  const total = statuses.reduce((sum, entry) => sum + entry.count, 0);
  if (total === 0) {
    return (
      <p className="text-[13px] leading-6 text-muted-foreground">
        ไม่มีพัสดุในช่วง 30 วันนี้ (หรือสิทธิ์ Fulfillment ยังไม่พอ)
      </p>
    );
  }

  const colors: Record<string, string> = {
    PROCESSING: "#f59e0b",
    FULFILLING: "#2563eb",
    COMPLETED: "#0f766e",
    CANCELLED: "#b91c1c",
  };

  return (
    <ul className="flex list-none flex-col gap-2.5 p-0">
      {statuses.map((entry) => {
        const share = Math.round((entry.count / total) * 100);
        return (
          <li key={entry.status} className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-[13px]">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colors[entry.status] ?? "#64748b" }}
                />
                <span className="truncate font-bold">{entry.label}</span>
              </span>
              <span className="mono shrink-0 text-[12.5px] text-muted-foreground">
                {entry.count} พัสดุ · {share}%
              </span>
            </div>
            <span className="h-1.5 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full"
                style={{ width: `${share}%`, backgroundColor: colors[entry.status] ?? "#64748b" }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function PlatformDashboardView({
  dashboard,
  configured,
}: {
  dashboard: TikTokDashboard | null;
  configured: boolean;
}) {
  if (!dashboard) {
    return (
      <EmptyState
        icon={<IconWallet size={22} aria-hidden="true" />}
        title="ยังไม่มีร้าน TikTok ที่เชื่อมต่อ"
        description="ใส่ App Key / App Secret / Service ID และกดเชื่อมร้านที่หน้าตั้งค่า เมื่อเชื่อมแล้วแดชบอร์ดจะแสดงยอดเงินและสถานะพัสดุจริง"
        action={
          <Button asChild>
            <Link href="/settings?tab=platforms">ไปที่หน้าตั้งค่า · เชื่อมต่อ TikTok</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {dashboard.error ? (
        <Card variant="warning" padding="padded" className="flex items-start gap-2 text-[13px] leading-6">
          <IconInfo size={15} aria-hidden="true" className="mt-1 shrink-0" />
          <span className="min-w-0 break-words">
            ดึงข้อมูลไม่สำเร็จ: {dashboard.error} — ตัวเลขด้านล่างอาจว่างหรือเป็น 0
          </span>
        </Card>
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge variant="success">{dashboard.shop.name ?? "ร้าน TikTok"}</Badge>
        <span className="text-[12.5px] text-muted-foreground">
          {dashboard.shop.region ?? "—"} · ข้อมูล {dashboard.rangeDays} วันล่าสุด · เรียลไทม์จาก API
        </span>
        {!configured ? null : (
          <span className="text-[12.5px] text-muted-foreground">
            · อัปเดตทุกครั้งที่เปิดหน้า
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 min-[820px]:grid-cols-4">
        <KpiCard
          label="ยอดโอนสุทธิ"
          value={`฿${money(dashboard.totals.settlement)}`}
          hint={`${dashboard.totals.statements} statement`}
          tone="accent"
        />
        <KpiCard label="ยอดขาย (revenue)" value={`฿${money(dashboard.totals.revenue)}`} />
        <KpiCard
          label="ค่าธรรมเนียม/ภาษี"
          value={baht(dashboard.totals.fee)}
          hint="หักออกจากยอดขายแล้ว"
        />
        <KpiCard
          label="พัสดุในช่วงนี้"
          value={dashboard.totals.packages.toLocaleString("th-TH")}
          hint={`${dashboard.rangeDays} วัน`}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 min-[980px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card padding="padded" className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <h2 className="text-[14.5px] font-bold">ยอดโอนรายวัน</h2>
            <span className="text-[12px] text-muted-foreground">14 วันล่าสุด · บาท</span>
          </div>
          <DailyBars daily={dashboard.daily} />
        </Card>

        <Card padding="padded" className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[14.5px] font-bold">
              <IconTruck size={15} aria-hidden="true" />
              สถานะพัสดุ
            </h2>
            <span className="text-[12px] text-muted-foreground">{dashboard.rangeDays} วัน</span>
          </div>
          <StatusList statuses={dashboard.packageStatuses} />
        </Card>
      </div>

      <Card padding="padded" className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h2 className="text-[14.5px] font-bold">Statement ล่าสุด</h2>
          <Link
            href="/settings?tab=platforms"
            className="text-[12.5px] font-bold underline underline-offset-2"
          >
            จัดการการเชื่อมต่อ
          </Link>
        </div>

        {dashboard.recent.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">ยังไม่มี statement ในช่วงนี้</p>
        ) : (
          <ul className="flex list-none flex-col divide-y divide-border p-0">
            {dashboard.recent.map((statement) => (
              <li
                key={statement.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-bold">
                    {new Date(statement.statementTime * 1000).toLocaleDateString("th-TH", {
                      dateStyle: "medium",
                    })}
                  </p>
                  <p className="mono truncate text-[11.5px] text-muted-foreground">{statement.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statement.paymentStatus === "SETTLED" ? "success" : "outline"}>
                    {statement.paymentStatus}
                  </Badge>
                  <span className="mono text-[13.5px] font-bold">
                    ฿{money(Number(statement.settlementAmount || 0))}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-[12px] leading-6 text-muted-foreground">
        ที่ยังไม่มีในหน้านี้: สถานะออเดอร์รายตัว เหตุผลยกเลิก และการคืนเงิน — ต้องใช้สิทธิ์ Order
        Information (เพิ่งเปิด กำลังรอ authorize ใหม่) และ Return &amp; Refund Basic
      </p>
    </div>
  );
}
