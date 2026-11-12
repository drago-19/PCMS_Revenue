import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface BillsShopTabsProps {
  activeShop: string;
  shopCounts: Record<string, number>;
  hrefs?: {
    all: string;
    kiddee: string;
    kissi: string;
  };
  shopHrefs?: Record<string, string>;
}

export function BillsShopTabs({
  activeShop,
  shopCounts,
  hrefs,
  shopHrefs,
}: BillsShopTabsProps) {
  const rawShopKeys = Object.keys(shopCounts).filter(
    (k) => k !== "all" && k !== "อื่นๆ" && k !== "รอผูกไฟล์ร้านค้า",
  );
  const namedShopKeys = rawShopKeys.sort();

  const getShopHref = (key: string) => {
    if (shopHrefs && shopHrefs[key]) return shopHrefs[key];
    if (key === "all") return hrefs?.all ?? "/bills";
    if (key === "Kiddee Shop") return hrefs?.kiddee ?? "/bills?shop=Kiddee+Shop";
    if (key === "Kissi Studio") return hrefs?.kissi ?? "/bills?shop=Kissi+Studio";
    return `/bills?shop=${encodeURIComponent(key)}`;
  };

  const unlinkedCount =
    (shopCounts["รอผูกไฟล์ร้านค้า"] ?? 0) + (shopCounts["อื่นๆ"] ?? 0);

  const shops = [
    {
      key: "all",
      label: "รวมทุกร้าน",
      count: shopCounts.all ?? 0,
      icon: "🏢",
      isUnlinked: false,
      href: getShopHref("all"),
    },
    ...namedShopKeys.map((name) => ({
      key: name,
      label: name,
      count: shopCounts[name] ?? 0,
      icon: name.includes("Kiddee")
        ? "🛍️"
        : name.includes("Kissi")
          ? "👗"
          : "🏪",
      isUnlinked: false,
      href: getShopHref(name),
    })),
    ...(unlinkedCount > 0
      ? [
          {
            key: "รอผูกไฟล์ร้านค้า",
            label: "รอผูกไฟล์ร้านค้า",
            count: unlinkedCount,
            icon: "⏳",
            isUnlinked: true,
            href: getShopHref("รอผูกไฟล์ร้านค้า"),
          },
        ]
      : []),
  ];

  const isCurrentActive = (key: string) => {
    if (key === "รอผูกไฟล์ร้านค้า") {
      return activeShop === "รอผูกไฟล์ร้านค้า" || activeShop === "อื่นๆ";
    }
    return activeShop === key;
  };

  return (
    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        <span className="text-[11px] font-bold text-muted-foreground mr-1 shrink-0">
          ร้านค้า:
        </span>
        {shops.map((s) => {
          const isActive = isCurrentActive(s.key);
          return (
            <Button
              key={s.key}
              asChild
              size="xs"
              variant="outline"
              className={cn(
                "h-8 gap-1.5 px-2.5 text-xs font-bold transition-all shrink-0",
                isActive
                  ? "bg-slate-900 text-white hover:bg-slate-800 hover:text-white shadow-xs border-slate-900 font-extrabold"
                  : s.isUnlinked
                    ? "border-amber-300 bg-amber-50/80 text-amber-950 hover:bg-amber-100 hover:text-amber-950 font-semibold"
                    : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200",
              )}
            >
              <Link
                prefetch={false}
                href={s.href}
                scroll={false}
                className={cn("flex items-center gap-1.5", isActive && "!text-white")}
              >
                <span>{s.icon}</span>
                <span className={cn(isActive && "!text-white")}>{s.label}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "ml-0.5 h-4 px-1 text-[10px] font-bold border-0",
                    isActive
                      ? "bg-slate-800 text-white"
                      : s.isUnlinked
                        ? "bg-amber-200 text-amber-900 font-extrabold"
                        : "bg-slate-100 text-slate-600",
                  )}
                >
                  {formatNumber(s.count ?? 0)}
                </Badge>
              </Link>
            </Button>
          );
        })}
      </div>
      {activeShop !== "all" ? (
        <Link
          prefetch={false}
          href={getShopHref("all")}
          scroll={false}
          className="text-[11px] font-semibold text-primary hover:underline shrink-0"
        >
          ล้างตัวกรองร้าน ({activeShop}) ×
        </Link>
      ) : null}
    </div>
  );
}
