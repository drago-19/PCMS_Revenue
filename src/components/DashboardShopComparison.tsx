import Link from "next/link";
import { AnimatedValueText } from "@/components/AnimatedValueText";
import { IconChevronRight } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatNumber, formatTHB } from "@/lib/format";
import type { ShopSummaryStat } from "@/lib/queries";

interface DashboardShopComparisonProps {
  shopSummaries: ShopSummaryStat[];
  totalPayout: number;
}

export function DashboardShopComparison({
  shopSummaries,
  totalPayout,
}: DashboardShopComparisonProps) {
  const namedShops = shopSummaries.filter(
    (s) =>
      s.shopName !== "รอผูกไฟล์ร้านค้า" &&
      s.shopName !== "อื่นๆ" &&
      s.orderCount > 0,
  );
  const unlinked = shopSummaries.find(
    (s) => s.shopName === "รอผูกไฟล์ร้านค้า" || s.shopName === "อื่นๆ",
  );

  if (namedShops.length === 0 && (!unlinked || unlinked.orderCount === 0)) {
    return null;
  }

  const unlinkedPayout = unlinked?.totalPayout ?? 0;
  const safeTotalPayout = Math.max(1, totalPayout);
  const unlinkedPct = Math.round((unlinkedPayout / safeTotalPayout) * 1000) / 10;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold tracking-tight text-foreground sm:text-base">
          📊 เปรียบเทียบผลประกอบการรายร้านค้า (Shop Breakdown)
        </h3>
        <span className="text-xs text-muted-foreground">
          สรุปยอดรวมสะสมทุกช่องทาง
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3.5 min-[768px]:grid-cols-2 lg:grid-cols-3">
        {namedShops.map((shop, idx) => {
          const shopPct =
            Math.round((shop.totalPayout / safeTotalPayout) * 1000) / 10;
          const isPrimaryStyle = idx % 2 === 1 || shop.shopName.includes("Kissi");
          const icon = shop.shopName.includes("Kiddee")
            ? "🛍️"
            : shop.shopName.includes("Kissi")
              ? "👗"
              : "🏪";
          const subtitle =
            shop.shopName === "Kiddee Shop"
              ? "ร้านหลัก (TikTok, Shopee, Facebook, Lazada, LINE OA)"
              : shop.shopName === "Kissi Studio"
                ? "ร้านแฟชั่น (TikTok, Shopee, Facebook, LINE OA)"
                : "ข้อมูลร้านค้าจากไฟล์ที่อัปโหลด";

          return (
            <Card
              key={shop.shopName}
              className={
                isPrimaryStyle
                  ? "flex flex-col justify-between border-primary/30 bg-gradient-to-br from-primary/[0.04] via-card to-card p-4 sm:p-5 shadow-2xs"
                  : "flex flex-col justify-between border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.04] via-card to-card p-4 sm:p-5 shadow-2xs"
              }
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        isPrimaryStyle
                          ? "flex size-9 items-center justify-center rounded-xl bg-primary/15 text-lg"
                          : "flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 text-lg"
                      }
                    >
                      {icon}
                    </span>
                    <div>
                      <h4 className="text-base font-extrabold text-foreground">
                        {shop.shopName}
                      </h4>
                      <p className="text-xs text-muted-foreground">{subtitle}</p>
                    </div>
                  </div>
                  <Badge
                    variant={isPrimaryStyle ? "info" : "success"}
                    className="font-extrabold"
                  >
                    {shopPct}% ของยอดรับรวม
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl border border-border/70 bg-card p-3">
                  <div>
                    <span className="text-[11px] font-bold text-muted-foreground">
                      ยอดชำระสุทธิ (เงินรับจริง)
                    </span>
                    <div className="text-base font-extrabold text-emerald-700 dark:text-emerald-400">
                      <AnimatedValueText value={formatTHB(shop.totalPayout)} />
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-muted-foreground">
                      ยอดขายรวมก่อนหัก
                    </span>
                    <div className="text-base font-extrabold text-foreground">
                      <AnimatedValueText value={formatTHB(shop.totalIncome)} />
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-muted-foreground">
                      ค่าธรรมเนียม / ค่าส่ง
                    </span>
                    <div className="text-sm font-extrabold text-rose-700 dark:text-rose-400">
                      <AnimatedValueText value={formatTHB(shop.totalFees)} />
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-muted-foreground">
                      จำนวนบิลทั้งหมด
                    </span>
                    <div className="text-sm font-extrabold text-foreground">
                      <AnimatedValueText
                        value={`${formatNumber(shop.orderCount)} ใบ`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-border/60">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="w-full justify-between font-bold"
                >
                  <Link
                    href={`/bills?shop=${encodeURIComponent(shop.shopName)}`}
                    prefetch={false}
                  >
                    <span>
                      ดูบิล {shop.shopName} ({formatNumber(shop.orderCount)} บิล)
                    </span>
                    <IconChevronRight size={15} />
                  </Link>
                </Button>
              </div>
            </Card>
          );
        })}

        {/* Unlinked Settlement Orders Card */}
        {unlinked && unlinked.orderCount > 0 ? (
          <Card className="flex flex-col justify-between border-amber-300 bg-gradient-to-br from-amber-500/[0.04] via-card to-card p-4 sm:p-5 shadow-2xs">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-amber-500/15 text-lg">
                    ⏳
                  </span>
                  <div>
                    <h4 className="text-base font-extrabold text-amber-950 dark:text-amber-200">
                      รอผูกไฟล์ร้านค้า
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      บิล TikTok Settlement รอจับคู่ไฟล์ Shipnity
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="font-extrabold border-amber-300 bg-amber-100 text-amber-950">
                  {unlinkedPct}% ของยอดรับรวม
                </Badge>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl border border-border/70 bg-card p-3">
                <div>
                  <span className="text-[11px] font-bold text-muted-foreground">
                    ยอดชำระสุทธิ (เงินรับจริง)
                  </span>
                  <div className="text-base font-extrabold text-amber-700 dark:text-amber-400">
                    <AnimatedValueText value={formatTHB(unlinked.totalPayout)} />
                  </div>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-muted-foreground">
                    ยอดขายรวมก่อนหัก
                  </span>
                  <div className="text-base font-extrabold text-foreground">
                    <AnimatedValueText value={formatTHB(unlinked.totalIncome)} />
                  </div>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-muted-foreground">
                    ค่าธรรมเนียม / ค่าส่ง
                  </span>
                  <div className="text-sm font-extrabold text-rose-700 dark:text-rose-400">
                    <AnimatedValueText value={formatTHB(unlinked.totalFees)} />
                  </div>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-muted-foreground">
                    จำนวนบิลทั้งหมด
                  </span>
                  <div className="text-sm font-extrabold text-foreground">
                    <AnimatedValueText
                      value={`${formatNumber(unlinked.orderCount)} ใบ`}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border/60">
              <Button asChild variant="outline" size="sm" className="w-full justify-between font-bold border-amber-300 hover:bg-amber-100 text-amber-950">
                <Link href={`/bills?shop=${encodeURIComponent("รอผูกไฟล์ร้านค้า")}`} prefetch={false}>
                  <span>ดูบิลรอผูกไฟล์ ({formatNumber(unlinked.orderCount)} บิล)</span>
                  <IconChevronRight size={15} />
                </Link>
              </Button>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
