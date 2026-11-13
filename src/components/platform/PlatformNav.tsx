// เมนูกลางของหมวด "แพลตฟอร์ม" — อยู่บนทุกหน้าในหมวดนี้
// ตอบคำถามว่าแต่ละส่วนอยู่หน้าไหน พร้อมพาช่วงเวลา/ร้านที่กำลังดูอยู่ไปด้วย
// ไม่มีการเคลื่อนไหวโดยตั้งใจ: เมนูต้องนิ่งเพื่อให้จำตำแหน่งได้

import Link from "next/link";
import { cn } from "@/lib/utils";

const ITEMS = [
  { key: "overview", href: "/platform", label: "ภาพรวม" },
  { key: "ops", href: "/platform/ops", label: "งานที่ต้องทำ" },
  { key: "products", href: "/platform/products", label: "สินค้าและเหตุผล" },
  { key: "customers", href: "/platform/customers", label: "ลูกค้า" },
  { key: "orders", href: "/platform/orders", label: "ออเดอร์" },
  { key: "statements", href: "/platform/statements", label: "statement" },
] as const;

export type PlatformNavKey = (typeof ITEMS)[number]["key"];

export function withPeriodQuery(
  href: string,
  { from, to, shop }: { from?: string; to?: string; shop?: string },
): string {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (shop) qs.set("shop", shop);
  return qs.toString() ? `${href}?${qs.toString()}` : href;
}

export function PlatformNav({
  active,
  from,
  to,
  shop,
}: {
  active: PlatformNavKey;
  from?: string;
  to?: string;
  shop?: string;
}) {
  return (
    <nav aria-label="เมนูหมวดแพลตฟอร์ม" className="-mx-1">
      <ul className="flex list-none flex-wrap gap-x-1 space-y-0 border-b border-border p-0">
        {ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <li key={item.key} className="-mb-px">
              <Link
                href={withPeriodQuery(item.href, { from, to, shop })}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-[44px] items-center whitespace-nowrap border-b-2 px-3 text-[13.5px] font-bold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
