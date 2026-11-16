"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Boxes, ListChecks, ShoppingCart, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * เมนูหมวดฝ่ายขาย — อยู่ในแถบ header บนสุด (แถวเดียว ไม่มีแถบข้าง)
 * จอแคบเลื่อนแนวนอนได้ และเลื่อนให้แท็บที่เปิดอยู่เห็นเสมอ
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
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  // คงร้าน/ช่วงเวลา/แพลตฟอร์มที่กำลังดูอยู่ไว้ทั้งชุด
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
    <nav aria-label="เมนูฝ่ายขาย" className="flex min-w-0 items-center gap-1 overflow-x-auto">
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
              "inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
              active
                ? "bg-[color:var(--accent)] text-[color:var(--accent-foreground)]"
                : "text-[color:var(--muted-foreground)] hover:bg-[color:var(--secondary)] hover:text-[color:var(--foreground)]",
            )}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
