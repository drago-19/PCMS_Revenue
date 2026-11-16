"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Boxes,
  LayoutDashboard,
  ListChecks,
  Package,
  Receipt,
  ShoppingCart,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * เมนูของหมวดแพลตฟอร์ม — แถวเดียวอยู่เหนือเนื้อหา อ่านจากซ้ายไปขวา
 * ไม่ทำเป็นคอลัมน์ที่สอง: ทางซ้ายมีเมนูหลักของระบบอยู่แล้ว สองคอลัมน์ติดกัน
 * ทำให้พื้นที่ทำงานแคบลง (ตารางสต็อก/ออเดอร์ต้องการความกว้าง) และตาดูเหมือนเมนูซ้อนกัน
 * จอแคบให้เลื่อนแนวนอนในแถวเดียว — ไม่ตัดขึ้นบรรทัดใหม่จนกลายเป็นกองซ้อน
 * statement ถูกเอาออกตามที่ตกลง: ฝ่ายขายใช้หน้านี้ทำงาน ไม่ได้ตรวจใบสรุปยอด
 */
type PlatformTab = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** path ที่ทำให้แท็บนี้ active (รองรับหน้าย่อย เช่น /platform/orders/123) */
  match: string;
};

const TABS: PlatformTab[] = [
  { href: "/platform", label: "ภาพรวม", icon: LayoutDashboard, match: "/platform" },
  // statement ไม่มีทางเข้าอื่นเลยนอกจำ url ตรง — ใส่แท็บกลับให้ฝั่ง CEO กดเข้าได้
  { href: "/platform/statements", label: "ยอดโอน", icon: Receipt, match: "/platform/statements" },
  { href: "/platform/ops", label: "งานที่ต้องทำ", icon: ListChecks, match: "/platform/ops" },
  { href: "/platform/products", label: "สินค้าและเหตุผล", icon: Package, match: "/platform/products" },
  { href: "/platform/stocks", label: "สต็อก", icon: Boxes, match: "/platform/stocks" },
  { href: "/platform/customers", label: "ลูกค้า", icon: Users, match: "/platform/customers" },
  { href: "/platform/orders", label: "ออเดอร์", icon: ShoppingCart, match: "/platform/orders" },
];

function isActive(pathname: string, tab: PlatformTab): boolean {
  if (tab.match === "/platform") return pathname === "/platform";
  return pathname === tab.match || pathname.startsWith(`${tab.match}/`);
}

export function PlatformTabs() {
  const pathname = usePathname();
  const params = useSearchParams();
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  // จอแคบ: แถบนี้เลื่อนแนวนอนได้ ถ้าเปิดหน้ามาจากลิงก์ตรง แท็บที่เปิดอยู่จะอยู่นอกจอ
  // เลื่อนให้เห็นแท็บนั้นเสมอ เพื่อให้รู้ว่าตัวเองอยู่ส่วนไหน
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  // คงร้าน/ช่วงเวลา/แพลตฟอร์มที่กำลังดูอยู่ไว้ทั้งชุด เพื่อไม่ต้องเลือกใหม่ทุกครั้งที่สลับหน้า
  const hrefFor = (href: string) => {
    const query = new URLSearchParams();
    for (const key of ["platform", "shop", "from", "to"]) {
      const value = params.get(key);
      if (value) query.set(key, value);
    }
    const text = query.toString();
    return text ? `${href}?${text}` : href;
  };

  return (
    <nav
      aria-label="เมนูหมวดแพลตฟอร์ม"
      className="flex min-w-0 items-center gap-2 overflow-x-auto border-b border-border bg-background min-[1100px]:sticky min-[1100px]:top-[var(--wco-offset,0px)] min-[1100px]:z-30"
    >
      {TABS.map((tab) => {
        const active = isActive(pathname, tab);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={hrefFor(tab.href)}
            ref={active ? activeRef : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[13px] font-bold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              active
                ? "rounded-t-lg border-[color:var(--primary)] bg-[color:var(--accent)] text-[color:var(--accent-foreground)]"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
