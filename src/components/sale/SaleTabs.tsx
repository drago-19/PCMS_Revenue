"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Boxes, ListChecks, PackageCheck, ShoppingCart, Warehouse, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SALE_THEME } from "@/lib/sale/theme";

/**
 * เมนูหมวดฝ่ายขาย — แถวเมนูของตัวเองใต้แถบหัว (เดิมยัดในแถบหัวแล้วล้นจอเล็ก)
 * จอเล็กเรียง 2×2 ปุ่มใหญ่กดง่าย · จอ ≥560px เรียงแถวเดียวเต็มความกว้าง ไม่มีแถบเลื่อน
 */
type SaleTab = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const TABS: SaleTab[] = [
  { href: "/sale/ops", label: "งานที่ต้องทำ", icon: ListChecks },
  { href: "/sale/stocks", label: "สต็อก", icon: Boxes },
  { href: "/sale/central-stock", label: "สต็อกกลาง", icon: Warehouse },
  { href: "/sale/orders", label: "ออเดอร์", icon: ShoppingCart },
  // หน้าแพ็คอยู่ที่ /orders (นอกหมวด) — ใส่ไว้ข้าง ๆ แท็บออเดอร์ให้กดถึงง่าย
  { href: "/orders", label: "ออเดอร์รอแพ็ค", icon: PackageCheck },
];

export function SaleTabs() {
  const pathname = usePathname();
  const params = useSearchParams();

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
    // วางใน root layout นอกตัวครอบธีมของ /sale จึงต้องส่งชุดสีเข้าไปเอง
    <nav
      aria-label="เมนูฝ่ายขาย"
      style={SALE_THEME}
      className="border-b border-border bg-card px-2 py-1.5 min-[560px]:px-4"
      // หน้าต่าง (Radix Dialog) ใส่ aria-hidden ให้ทุกอย่างนอกหน้าต่างตอนเปิด — server เรนเดอร์ก่อน
      // จึงไม่มี attribute นั้น แล้ว React เตือน hydration ทุกครั้ง เป็น noise จากไลบรารี ไม่ใช่ผังผิด
      suppressHydrationWarning
    >
      <div className="grid grid-cols-2 gap-1 min-[560px]:grid-cols-5">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={hrefFor(tab.href)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold whitespace-nowrap transition-colors",
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
      </div>
    </nav>
  );
}
