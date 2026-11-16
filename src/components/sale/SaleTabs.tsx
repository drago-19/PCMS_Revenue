"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Boxes, ListChecks, ShoppingCart, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * เมนูของหมวดฝ่ายขาย (/sale) — มีแค่สามหน้าที่พนักงานขายใช้จริง
 * จอ ≥1100px เป็นแถบข้างซ้าย · จอเล็กเป็นแถวเลื่อนแนวนอนเหนือเนื้อหา
 * แยกไฟล์จาก PlatformTabs ของ /platform เพื่อไม่ให้แก้เมนูฝั่งหนึ่งไปเปลี่ยนอีกฝั่ง
 */
type SaleTab = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const TABS: SaleTab[] = [
  { href: "/sale/ops", label: "งานที่ต้องทำ", icon: ListChecks },
  { href: "/sale/stocks", label: "สต็อก", icon: Boxes },
  { href: "/sale/orders", label: "ออเดอร์", icon: ShoppingCart },
];

export function SaleTabs() {
  const pathname = usePathname();
  const params = useSearchParams();
  const activeRef = useRef<HTMLAnchorElement | null>(null);

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
      aria-label="เมนูฝ่ายขาย"
      className={cn(
        "flex min-w-0 gap-1 overflow-x-auto border-b border-border pb-1",
        // ติดใต้แถบหัว (สูง 56px) — ถ้าใช้ top 0 เมนูจะเลื่อนไปซ่อนใต้แถบหัวตอนสกรอล
        "min-[1100px]:sticky min-[1100px]:top-[56px] min-[1100px]:z-30",
        "min-[1100px]:w-[198px] min-[1100px]:shrink-0 min-[1100px]:flex-col min-[1100px]:overflow-visible",
        "min-[1100px]:border-b-0 min-[1100px]:border-r min-[1100px]:pb-0 min-[1100px]:pr-2",
      )}
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={hrefFor(tab.href)}
            ref={active ? activeRef : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg border px-3 text-[13px] font-semibold whitespace-nowrap transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
              active
                ? "border-transparent bg-[color:var(--accent)] text-[color:var(--accent-foreground)]"
                : "border-transparent text-[color:var(--muted-foreground)] hover:bg-[color:var(--secondary)] hover:text-[color:var(--foreground)]",
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
