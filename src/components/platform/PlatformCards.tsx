// ชิ้นส่วนที่ใช้ร่วมกันของสองมุมมองในหมวดแพลตฟอร์ม
// รวมไว้ที่เดียวเพื่อไม่ให้แต่ละหน้าเขียนการ์ด/แถบสัดส่วน/รูปย่อซ้ำกันคนละแบบ

import type { ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { OpsCountRow, OpsOrderRow } from "@/lib/platform/ops";
import { cn } from "@/lib/utils";

/** เกณฑ์ที่ถือว่า "เกิน" ของอัตรายกเลิก — ค่าเดียวกับที่การ์ดวิเคราะห์ใช้ (analytics เป็นผู้ตัดสิน) */
export const CANCEL_RATE_LIMIT = 5;

export function num(value: number): string {
  return value.toLocaleString("th-TH");
}

export function money(value: number): string {
  return `฿${value.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`;
}

/** ยอดติดลบเขียนเป็น -฿1,234 ไม่ใช่ ฿-1,234 */
export function signedMoney(value: number, fractionDigits = 0): string {
  const abs = Math.abs(value).toLocaleString("th-TH", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `${value < 0 ? "-" : ""}฿${abs}`;
}

/**
 * ป้ายการเปลี่ยนแปลง — สีบอกว่า "ดีหรือแย่" ไม่ใช่ "ขึ้นหรือลง"
 * อัตรายกเลิกลดลงเป็นข่าวดี จึงต้องเขียว ไม่ใช่แดง
 */
export function TrendChip({
  delta,
  goodWhen,
}: {
  delta: { text: string; up: boolean } | null;
  goodWhen: "up" | "down";
}) {
  if (!delta) {
    return <span className="text-[12px] text-muted-foreground">ยังไม่มีช่วงก่อนให้เทียบ</span>;
  }
  const good = goodWhen === "up" ? delta.up : !delta.up;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-[12px] font-bold",
        good ? "bg-[#0d8a47]/10 text-[#0d8a47]" : "bg-[#b42318]/10 text-[#b42318]",
      )}
    >
      <span aria-hidden="true">{delta.up ? "▲" : "▼"}</span>
      {delta.text}
      <span className="sr-only">เทียบช่วงก่อนหน้า ({good ? "ดีขึ้น" : "แย่ลง"})</span>
    </span>
  );
}

/** การ์ดตัวเลขกลางของหมวดแพลตฟอร์ม — ไม่ย่อตัวเลขเงิน เพราะต้องเทียบกับ statement ได้ตรงตัว */
export function PlatformStat({
  label,
  value,
  hint,
  tone = "default",
  delta,
  goodWhen = "up",
  href,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: "default" | "positive" | "negative";
  delta?: { text: string; up: boolean } | null;
  goodWhen?: "up" | "down";
  href?: string;
}) {
  const color =
    tone === "positive" ? "text-[#0d8a47]" : tone === "negative" ? "text-[#b42318]" : "text-foreground";

  const card = (
    <Card
      padding="padded"
      className={cn(
        "flex min-w-0 flex-col gap-1.5",
        href && "transition-colors group-hover:border-foreground/30 group-hover:bg-muted/40",
      )}
    >
      <span className="text-[13.5px] font-bold text-muted-foreground">{label}</span>
      <span className={cn("mono break-words text-[22px] font-bold leading-tight tabular-nums", color)}>{value}</span>
      {delta !== undefined ? <TrendChip delta={delta} goodWhen={goodWhen} /> : null}
      {hint ? <span className="text-[12px] leading-5 text-muted-foreground">{hint}</span> : null}
      {href ? (
        <span className="mt-0.5 text-[11.5px] font-bold text-muted-foreground group-hover:text-foreground">
          ดูรายละเอียด →
        </span>
      ) : null}
    </Card>
  );

  if (!href) return card;

  return (
    <Link
      href={href}
      className="group block min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {card}
    </Link>
  );
}

export function Thumb({ src }: { src: string | null }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
      {src ? <img src={src} alt="" loading="lazy" className="size-full object-cover" /> : null}
    </span>
  );
}

export function Tile({
  label,
  value,
  hint,
  tone = "default",
  href,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "danger" | "warning" | "ok";
  href?: string;
}) {
  const color =
    tone === "danger"
      ? "text-[#b42318]"
      : tone === "warning"
        ? "text-[#b45309]"
        : tone === "ok"
          ? "text-[#0d8a47]"
          : "text-foreground";

  const card = (
    <Card
      padding="padded"
      className={cn(
        "flex min-w-0 flex-col gap-1",
        href && "transition-colors group-hover:border-foreground/30 group-hover:bg-muted/40",
      )}
    >
      <span className="text-[13.5px] font-bold text-muted-foreground">{label}</span>
      <span className={`mono truncate text-[24px] font-bold leading-tight ${color}`}>{value}</span>
      <span className="text-[12px] leading-5 text-muted-foreground">{hint}</span>
    </Card>
  );

  if (!href) return card;

  return (
    <Link
      href={href}
      className="group block min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {card}
    </Link>
  );
}

export function OrderLine({ row }: { row: OpsOrderRow }) {
  return (
    <li className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border/70 py-2 last:border-0">
      <span className="mono text-[13px] font-bold">{row.orderId}</span>
      <Badge variant={row.hoursLate > 24 ? "danger" : "warning"}>
        {row.hoursLate > 0 ? `เกิน ${num(row.hoursLate)} ชม.` : "ครบกำหนด"}
      </Badge>
      <span className="text-[12.5px] text-muted-foreground">{row.province ?? "ไม่ระบุจังหวัด"}</span>
      <span className="mono ml-auto text-[13px] font-bold">{money(row.amount)}</span>
    </li>
  );
}

export function CountLine({
  row,
  unit,
  tone = "muted",
  href,
}: {
  row: OpsCountRow;
  unit: number;
  tone?: "muted" | "danger";
  href?: string;
}) {
  const width = unit > 0 ? Math.max(4, Math.round((row.count / unit) * 100)) : 0;
  const inner = (
    <>
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <span className="truncate text-[13px]">{row.label}</span>
        <span className="mono shrink-0 text-[12.5px] font-bold text-muted-foreground">
          {num(row.count)} · {row.rate}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className={`h-full rounded-full ${tone === "danger" ? "bg-[#b42318]" : "bg-slate-400"}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </>
  );

  return (
    <li className="flex min-w-0 flex-col gap-1">
      {href ? (
        <Link
          href={href}
          className="flex min-w-0 flex-col gap-1 rounded-lg py-1.5 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-col gap-1 py-1.5">{inner}</div>
      )}
    </li>
  );
}
export function ListCard({
  title,
  hint,
  empty,
  emptyText = "ไม่มีข้อมูลในช่วงนี้",
  children,
}: {
  title: string;
  hint?: string;
  empty: boolean;
  emptyText?: string;
  children: ReactNode;
}) {
  return (
    <Card padding="padded" className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-bold">{title}</h3>
        {hint ? <span className="text-[11.5px] text-muted-foreground">{hint}</span> : null}
      </div>
      {empty ? <p className="text-[13px] text-muted-foreground">{emptyText}</p> : children}
    </Card>
  );
}
