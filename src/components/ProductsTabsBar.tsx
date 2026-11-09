import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface ProductsTabsBarProps {
  currentTab: "sales" | "stock";
  q?: string;
  date?: string;
  channel?: string;
  totalProductsCount: number;
}

export function ProductsTabsBar({
  currentTab,
  q,
  date,
  channel,
  totalProductsCount,
}: ProductsTabsBarProps) {
  function buildTabHref(tab: "sales" | "stock") {
    const params = new URLSearchParams();
    if (tab !== "sales") params.set("tab", tab);
    if (q) params.set("q", q);
    if (date) params.set("date", date);
    if (channel && channel !== "all") params.set("channel", channel);
    const qs = params.toString();
    return qs ? `/products?${qs}` : "/products";
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
      <div
        className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-2xs"
        role="tablist"
        aria-label="เลือกมุมมองสินค้า"
      >
        <Link
          href={buildTabHref("sales")}
          scroll={false}
          role="tab"
          aria-selected={currentTab === "sales"}
          className={`inline-flex min-h-[38px] items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            currentTab === "sales"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <span>📊 สรุปยอดขายสินค้า</span>
        </Link>

        <Link
          href={buildTabHref("stock")}
          scroll={false}
          role="tab"
          aria-selected={currentTab === "stock"}
          className={`inline-flex min-h-[38px] items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            currentTab === "stock"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <span>📦 สต๊อกและต้นทุนสินค้า</span>
          <Badge
            variant={currentTab === "stock" ? "secondary" : "neutral"}
            size="sm"
            className="text-[10.5px]"
          >
            บัญชี
          </Badge>
        </Link>
      </div>

      <div className="text-xs text-[#64748b]">
        รวมสินค้าในระบบ: <strong className="mono text-[#0f172a]">{totalProductsCount.toLocaleString("th-TH")}</strong> รหัส
      </div>
    </div>
  );
}
