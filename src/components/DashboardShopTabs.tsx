import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import type { ShopSummaryStat } from "@/lib/queries";
import { cn } from "@/lib/utils";

interface DashboardShopTabsProps {
  activeShop: string;
  shopSummaries: ShopSummaryStat[];
  totalOrderCount: number;
}

export function DashboardShopTabs({
  activeShop,
  shopSummaries,
  totalOrderCount,
}: DashboardShopTabsProps) {
  const tabs = [
    {
      key: "all",
      label: "รวมทุกร้าน",
      count: totalOrderCount,
      icon: "🏢",
      isUnlinked: false,
      href: "/",
    },
    ...shopSummaries.map((s) => {
      const isUnlinked =
        s.shopName === "รอผูกไฟล์ร้านค้า" || s.shopName === "อื่นๆ";
      return {
        key: s.shopName,
        label: isUnlinked ? "รอผูกไฟล์ร้านค้า" : s.shopName,
        count: s.orderCount,
        icon: isUnlinked
          ? "⏳"
          : s.shopName.includes("Kiddee")
            ? "🛍️"
            : s.shopName.includes("Kissi")
              ? "👗"
              : "🏪",
        isUnlinked,
        href: `/?shop=${encodeURIComponent(s.shopName)}`,
      };
    }),
  ];

  const isCurrentActive = (key: string) => {
    if (key === "รอผูกไฟล์ร้านค้า" || key === "อื่นๆ") {
      return activeShop === "รอผูกไฟล์ร้านค้า" || activeShop === "อื่นๆ";
    }
    return activeShop === key;
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/80 bg-gradient-to-r from-card via-card to-muted/20 p-3 sm:p-4 shadow-2xs">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            เลือกร้านค้า
          </span>
          <span className="text-xs text-muted-foreground">• สรุปข้อมูลแยกตามร้าน</span>
        </div>
        {activeShop !== "all" ? (
          <div className="text-xs font-semibold text-primary">
            กำลังแสดงข้อมูลเฉพาะร้าน:{" "}
            <strong className="font-extrabold">
              {activeShop === "รอผูกไฟล์ร้านค้า" || activeShop === "อื่นๆ"
                ? "⏳ รอผูกไฟล์ร้านค้า"
                : activeShop}
            </strong>
          </div>
        ) : (
          <div className="text-xs font-semibold text-muted-foreground">
            กำลังแสดงภาพรวมทุกร้านค้ารวมกัน
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        {tabs.map((tab) => {
          const isActive = isCurrentActive(tab.key);
          return (
            <Button
              key={tab.key}
              asChild
              size="sm"
              variant="outline"
              className={cn(
                "min-h-10 shrink-0 gap-2 px-3.5 font-bold transition-all",
                isActive
                  ? "bg-slate-900 text-white hover:bg-slate-800 hover:text-white shadow-xs border-slate-900 font-extrabold"
                  : tab.isUnlinked
                    ? "border-amber-300 bg-amber-50/80 text-amber-950 hover:bg-amber-100 hover:text-amber-950 font-semibold"
                    : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200",
              )}
            >
              <Link
                href={tab.href}
                scroll={false}
                className={cn("flex items-center gap-2", isActive && "!text-white")}
              >
                <span>{tab.icon}</span>
                <span className={cn(isActive && "!text-white")}>{tab.label}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "ml-1 font-bold border-0",
                    isActive
                      ? "bg-slate-800 text-white"
                      : tab.isUnlinked
                        ? "bg-amber-200 text-amber-900 font-extrabold"
                        : "bg-slate-100 text-slate-600",
                  )}
                >
                  {formatNumber(tab.count)}
                </Badge>
              </Link>
            </Button>
          );
        })}
      </div>
      {activeShop !== "all" ? (
        <div className="pt-1">
          <Link
            href="/"
            scroll={false}
            className="text-xs font-semibold text-primary hover:underline"
          >
            แสดงทุกร้านค้ารวมกัน (ล้างตัวกรองร้าน) ×
          </Link>
        </div>
      ) : null}
    </div>
  );
}
