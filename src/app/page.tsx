import Link from "next/link";
import { AnimatedValueText } from "@/components/AnimatedValueText";
import { DashboardShopComparison } from "@/components/DashboardShopComparison";
import { DashboardShopTabs } from "@/components/DashboardShopTabs";
import { PageHeader, StatCard, StatusBadge } from "@/components/PageHeader";
import type { StatBreakdownConfig } from "@/components/StatBreakdownDialog";
import {
  IconAlert,
  IconChevronRight,
  IconFile,
  IconHistory,
  IconReceipt,
  IconTrend,
  IconUpload,
  IconWallet,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate, formatDateLong, formatTHB } from "@/lib/format";
import { getOverallStats, listDailyBatches, listImports } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ shop?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const activeShop = (sp.shop ?? "all").trim();

  const [stats, batches, imports] = await Promise.all([
    getOverallStats({ shop: activeShop }),
    listDailyBatches(1, { shop: activeShop }),
    listImports(1),
  ]);

  const latest = batches[0] ?? null;
  const latestImport = imports[0] ?? null;

  const totalAllOrderCount =
    stats.shopSummaries?.reduce((acc, s) => acc + s.orderCount, 0) ??
    stats.orderCount;

  const channelSummaries = stats.channelSummaries ?? [];
  const shopSummaries = stats.shopSummaries ?? [];
  const nonOrderBreakdown = stats.nonOrderBreakdown ?? [];

  const totalNormalPayout = Number(
    channelSummaries.reduce((acc, c) => acc + c.normalPayout, 0).toFixed(2),
  );
  const totalNormalCount = channelSummaries.reduce(
    (acc, c) => acc + c.normalCount,
    0,
  );
  const totalRefundPayout = Number(
    channelSummaries.reduce((acc, c) => acc + c.refundPayout, 0).toFixed(2),
  );
  const totalRefundCount = channelSummaries.reduce(
    (acc, c) => acc + c.refundCount,
    0,
  );
  const totalZeroCount = channelSummaries.reduce(
    (acc, c) => acc + c.zeroCount,
    0,
  );
  const totalCompCount = channelSummaries.reduce(
    (acc, c) => acc + c.compensationCount,
    0,
  );
  const totalCompPayout = Number(
    channelSummaries.reduce((acc, c) => acc + c.compensationPayout, 0).toFixed(2),
  );
  const otherDedItems = nonOrderBreakdown.filter((i) => i.payout <= 0);
  const otherDedCount = otherDedItems.reduce((acc, i) => acc + i.count, 0);
  const otherDedPayout = Number(
    otherDedItems.reduce((acc, i) => acc + i.payout, 0).toFixed(2),
  );
  const netSettlementWithAllNonOrder = Number(
    (stats.totalPayout + otherDedPayout).toFixed(2),
  );

  const scopeSubtitle =
    activeShop !== "all"
      ? `ขอบเขตข้อมูล: เฉพาะร้าน ${activeShop}`
      : "ขอบเขตข้อมูล: รวมทุกร้านค้าและทุกช่องทางจำหน่าย";

  const dashboardPayoutBreakdown: StatBreakdownConfig = {
    title: "รายละเอียดที่มา: ยอดชำระสุทธิสะสม",
    subtitle: scopeSubtitle,
    heroLabel:
      activeShop !== "all"
        ? `ยอดชำระสุทธิสะสม (${activeShop})`
        : "ยอดชำระสุทธิสะสม (บิล + ชดเชย · ก่อนหักค่าโฆษณา GMV)",
    heroValue: formatTHB(stats.totalPayout),
    heroTone: "positive",
    formulaNote:
      "รวมยอดเงินโอนจากบิลขายปกติ หักออเดอร์ตีกลับ/คืนเงิน และรวมเงินชดเชยแพลตฟอร์ม — ยอดนี้ยังไม่หักค่าโฆษณา GMV / รายการปรับยอดนอกคำสั่งซื้อ (หักในข้อ 4)",
    sections: [
      {
        title: "1. แยกตามหมวดหมู่บิลคำสั่งซื้อ",
        rows: [
          {
            label: "หมวดบิลขายปกติ (เฉพาะคำสั่งซื้อ)",
            countText: `${Math.max(0, totalNormalCount - totalCompCount).toLocaleString("th-TH")} ใบ`,
            valueText: formatTHB(
              Number((totalNormalPayout - totalCompPayout).toFixed(2)),
            ),
            tone: "positive",
          },
          ...(totalCompCount > 0
            ? [
                {
                  label: "บวก: เงินชดเชยแพลตฟอร์ม / โลจิสติกส์",
                  countText: `${totalCompCount.toLocaleString("th-TH")} รายการ`,
                  valueText: `+${formatTHB(totalCompPayout)}`,
                  tone: "positive" as const,
                },
              ]
            : []),
          ...(totalRefundCount > 0 || totalRefundPayout !== 0
            ? [
                {
                  label: "หัก: ออเดอร์คืนเงิน / ตีกลับ / ขาดทุนค่าส่ง",
                  countText: `${totalRefundCount.toLocaleString("th-TH")} ใบ`,
                  valueText: formatTHB(totalRefundPayout),
                  tone: "negative" as const,
                },
              ]
            : []),
          ...(totalZeroCount > 0
            ? [
                {
                  label: "ออเดอร์ยกเลิก / หักล้างเป็น 0 บาท",
                  countText: `${totalZeroCount.toLocaleString("th-TH")} ใบ`,
                  valueText: formatTHB(0),
                  tone: "muted" as const,
                },
              ]
            : []),
          {
            label: "รวมยอดชำระสุทธิสะสม (บนการ์ด)",
            countText: `${stats.orderCount.toLocaleString("th-TH")} ใบ`,
            valueText: formatTHB(stats.totalPayout),
            isTotal: true,
          },
        ],
      },
      ...(channelSummaries.length > 0
        ? [
            {
              title: "2. แยกตามช่องทางจำหน่าย",
              rows: channelSummaries.map((ch) => ({
                label: ch.channel === "LINE" ? "LINE OA" : ch.channel,
                countText: `${ch.orderCount.toLocaleString("th-TH")} ใบ`,
                valueText: formatTHB(ch.totalPayout),
                tone:
                  ch.totalPayout < 0
                    ? ("negative" as const)
                    : ("positive" as const),
              })),
            },
          ]
        : []),
      ...(activeShop === "all" && shopSummaries.length > 1
        ? [
            {
              title: "3. แยกตามร้านค้า",
              rows: shopSummaries.map((s) => ({
                label: s.shopName,
                countText: `${s.orderCount.toLocaleString("th-TH")} ใบ`,
                valueText: formatTHB(s.totalPayout),
                tone:
                  s.totalPayout < 0
                    ? ("negative" as const)
                    : ("positive" as const),
              })),
            },
          ]
        : []),
      ...(otherDedCount > 0
        ? [
            {
              title: "4. รายการหักนอกคำสั่งซื้อในไฟล์ Settlement (ค่าโฆษณา GMV / ปรับยอด)",
              description:
                "รายการเหล่านี้ไม่ใช่คำสั่งซื้อของลูกค้า แต่ถูกหักจากยอดโอนรวมในไฟล์ Settlement",
              rows: [
                ...otherDedItems.map((item) => ({
                  label: item.transactionType || "รายการปรับยอดอื่นๆ",
                  countText: `${item.count.toLocaleString("th-TH")} รายการ`,
                  valueText: formatTHB(item.payout),
                  tone: "negative" as const,
                })),
                {
                  label:
                    "= ยอดสุทธิหลังหักค่าโฆษณา GMV / ปรับยอด (ยอดเดียวกับตารางรายวัน)",
                  valueText: formatTHB(netSettlementWithAllNonOrder),
                  tone: "positive" as const,
                  isSubtotal: true,
                },
              ],
            },
          ]
        : []),
    ],
  };

  const dashboardIncomeBreakdown: StatBreakdownConfig = {
    title: "รายละเอียดที่มา: รายได้รวมก่อนหัก",
    subtitle: scopeSubtitle,
    heroLabel:
      activeShop !== "all"
        ? `รายได้รวมก่อนหัก (${activeShop})`
        : "รายได้รวมก่อนหักค่าธรรมเนียมสะสม",
    heroValue: formatTHB(stats.totalIncome),
    heroTone: "brand",
    formulaNote:
      "ดึงตรงจากช่อง ยอดขาย (รวมส่วนลดและค่าจัดส่งตามไฟล์) ของบิลทั้งหมด",
    sections: [
      {
        title: "1. แยกตามหมวดหมู่บิล",
        rows: [
          {
            label: "รายได้จากหมวดบิลขายปกติ",
            countText: `${totalNormalCount.toLocaleString("th-TH")} ใบ`,
            valueText: formatTHB(
              Number(
                channelSummaries
                  .reduce((acc, c) => acc + c.normalIncome, 0)
                  .toFixed(2),
              ),
            ),
            tone: "brand",
          },
          ...(totalRefundCount > 0
            ? [
                {
                  label: "หักเงินคืนค่าสินค้า (หมวดคืนเงิน / ตีกลับ)",
                  countText: `${totalRefundCount.toLocaleString("th-TH")} ใบ`,
                  valueText: formatTHB(
                    Number(
                      channelSummaries
                        .reduce((acc, c) => acc + c.refundIncome, 0)
                        .toFixed(2),
                    ),
                  ),
                  tone: "negative" as const,
                },
              ]
            : []),
          {
            label: "รวมรายได้ก่อนหักสะสมทั้งหมด",
            countText: `${stats.orderCount.toLocaleString("th-TH")} ใบ`,
            valueText: formatTHB(stats.totalIncome),
            isTotal: true,
          },
        ],
      },
      ...(channelSummaries.length > 0
        ? [
            {
              title: "2. แยกตามช่องทางจำหน่าย",
              rows: channelSummaries.map((ch) => ({
                label: ch.channel === "LINE" ? "LINE OA" : ch.channel,
                countText: `${ch.orderCount.toLocaleString("th-TH")} ใบ`,
                valueText: formatTHB(ch.totalIncome),
                tone: "default" as const,
              })),
            },
          ]
        : []),
      ...(activeShop === "all" && shopSummaries.length > 1
        ? [
            {
              title: "3. แยกตามร้านค้า",
              rows: shopSummaries.map((s) => ({
                label: s.shopName,
                countText: `${s.orderCount.toLocaleString("th-TH")} ใบ`,
                valueText: formatTHB(s.totalIncome),
              })),
            },
          ]
        : []),
    ],
  };

  const dashboardFeesBreakdown: StatBreakdownConfig = {
    title: "รายละเอียดที่มา: ค่าธรรมเนียมทั้งหมด",
    subtitle: scopeSubtitle,
    heroLabel:
      activeShop !== "all"
        ? `ค่าธรรมเนียมทั้งหมด (${activeShop})`
        : "ค่าธรรมเนียมและค่าจัดส่งที่ถูกหักสะสม",
    heroValue: formatTHB(stats.totalFees),
    heroTone: "negative",
    formulaNote:
      "รวมค่าคอมมิชชั่นแพลตฟอร์ม + ค่าธรรมเนียมธุรกรรม + ค่าจัดส่งสุทธิของทุกคำสั่งซื้อ",
    sections: [
      {
        title: "1. แยกตามหมวดหมู่บิล",
        rows: [
          {
            label: "ค่าธรรมเนียมในหมวดบิลขายปกติ",
            countText: `${totalNormalCount.toLocaleString("th-TH")} ใบ`,
            valueText: formatTHB(
              Number(
                channelSummaries
                  .reduce((acc, c) => acc + c.normalFees, 0)
                  .toFixed(2),
              ),
            ),
            tone: "negative",
          },
          ...(totalRefundCount > 0
            ? [
                {
                  label: "ค่าขนส่งตีกลับและค่าธรรมเนียมในหมวดคืนเงิน",
                  countText: `${totalRefundCount.toLocaleString("th-TH")} ใบ`,
                  valueText: formatTHB(
                    Number(
                      channelSummaries
                        .reduce((acc, c) => acc + c.refundFees, 0)
                        .toFixed(2),
                    ),
                  ),
                  tone: "negative" as const,
                },
              ]
            : []),
          {
            label: "รวมค่าธรรมเนียมทั้งหมด",
            countText: `${stats.orderCount.toLocaleString("th-TH")} ใบ`,
            valueText: formatTHB(stats.totalFees),
            isTotal: true,
          },
        ],
      },
      ...(channelSummaries.length > 0
        ? [
            {
              title: "2. แยกตามช่องทางจำหน่าย",
              rows: channelSummaries.map((ch) => ({
                label: ch.channel === "LINE" ? "LINE OA" : ch.channel,
                countText: `${ch.orderCount.toLocaleString("th-TH")} ใบ`,
                valueText: formatTHB(ch.totalFees),
                tone:
                  ch.totalFees < 0
                    ? ("negative" as const)
                    : ("muted" as const),
              })),
            },
          ]
        : []),
      ...(activeShop === "all" && shopSummaries.length > 1
        ? [
            {
              title: "3. แยกตามร้านค้า",
              rows: shopSummaries.map((s) => ({
                label: s.shopName,
                countText: `${s.orderCount.toLocaleString("th-TH")} ใบ`,
                valueText: formatTHB(s.totalFees),
                tone: "negative" as const,
              })),
            },
          ]
        : []),
    ],
  };

  const dashboardCountBreakdown: StatBreakdownConfig = {
    title: "รายละเอียดที่มา: จำนวนบิลคำสั่งซื้อสะสม",
    subtitle: scopeSubtitle,
    heroLabel:
      activeShop !== "all"
        ? `จำนวนบิลสะสม (${activeShop})`
        : "จำนวนบิลคำสั่งซื้อสะสมทั้งหมด",
    heroValue: `${stats.orderCount.toLocaleString("th-TH")} ใบ`,
    heroTone: "default",
    formulaNote: `นำเข้าจากไฟล์ข้อมูลทั้งหมด ${stats.importCount.toLocaleString("th-TH")} ไฟล์`,
    sections: [
      {
        title: "1. แยกตามหมวดหมู่บิลทั้ง 3 หมวด",
        rows: [
          {
            label: "หมวดบิลขายปกติ (+ ชดเชยแพลตฟอร์ม)",
            valueText: `${totalNormalCount.toLocaleString("th-TH")} ใบ`,
            tone: "positive",
          },
          {
            label: "หมวดคืนเงิน / ตีกลับ / ขาดทุน (ติดลบ)",
            valueText: `${totalRefundCount.toLocaleString("th-TH")} ใบ`,
            tone: "negative",
          },
          {
            label: "หมวดยกเลิก / หักล้างเป็น 0 บาท",
            valueText: `${totalZeroCount.toLocaleString("th-TH")} ใบ`,
            tone: "muted",
          },
          {
            label: "รวมบิลคำสั่งซื้อสะสมทั้งหมด",
            valueText: `${stats.orderCount.toLocaleString("th-TH")} ใบ`,
            isTotal: true,
          },
        ],
      },
      ...(channelSummaries.length > 0
        ? [
            {
              title: "2. แยกตามช่องทางจำหน่าย",
              rows: channelSummaries.map((ch) => ({
                label: ch.channel === "LINE" ? "LINE OA" : ch.channel,
                valueText: `${ch.orderCount.toLocaleString("th-TH")} ใบ`,
              })),
            },
          ]
        : []),
      ...(shopSummaries.length > 0
        ? [
            {
              title: "3. แยกตามร้านค้า",
              rows: shopSummaries.map((s) => ({
                label: s.shopName,
                valueText: `${s.orderCount.toLocaleString("th-TH")} ใบ`,
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <div className="flex flex-col gap-[14px]">
      <PageHeader
        eyebrow="TikTok Shop, Shopee, Facebook, Lazada & LINE OA · Multi-Shop Finance Overview"
        title="หมวดภาพรวมสรุปยอดรายได้"
        description="สรุปยอดชำระสะสม รอบโอนเงินล่าสุด และแยกดูผลประกอบการรายร้านค้าได้ทันที · คลิกที่การ์ดตัวเลขเพื่อดูรายละเอียดที่มา"
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/bills" prefetch={false}>
                <IconReceipt size={16} /> ดูบิลคำสั่งซื้อทั้งหมด
              </Link>
            </Button>
            <Button asChild variant="default">
              <Link href="/import" prefetch={false}>
                <IconUpload size={17} /> อัปโหลดไฟล์รายได้
              </Link>
            </Button>
          </>
        }
      />

      {/* แถบสลับร้านค้า */}
      {stats.shopSummaries && stats.shopSummaries.length > 0 ? (
        <DashboardShopTabs
          activeShop={activeShop}
          shopSummaries={stats.shopSummaries}
          totalOrderCount={totalAllOrderCount}
        />
      ) : null}

      {!latest ? (
        <Card className="empty-hero">
          <div className="empty-icon large">
            <IconUpload size={34} />
          </div>
          <h2>เริ่มจากไฟล์รายได้ไฟล์แรก</h2>
          <p>
            อัปโหลดไฟล์ Excel ที่ export จาก TikTok Shop (รายละเอียดคำสั่งซื้อ)
            ระบบจะสร้างบิลสรุปยอดชำระให้ทุกหมายเลขคำสั่งซื้อโดยอัตโนมัติ
          </p>
          <Button asChild variant="default">
            <Link href="/import" prefetch={false}>
              <IconUpload size={17} /> เลือกไฟล์ .xlsx
            </Link>
          </Button>
          <div className="steps">
            <div>
              <span>1</span>
              <strong>อัปโหลดไฟล์รายได้</strong>
              <small>ไฟล์ .xlsx จาก Seller Center</small>
            </div>
            <div>
              <span>2</span>
              <strong>ระบบตรวจและจับคู่คอลัมน์</strong>
              <small>ตรวจยอดกับชีตสรุปอัตโนมัติ</small>
            </div>
            <div>
              <span>3</span>
              <strong>เปิดบิลและพิมพ์ได้ทันที</strong>
              <small>แยกตามหมวดหมู่ชัดเจน</small>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="stats m-0">
            <StatCard
              label={activeShop !== "all" ? `ยอดชำระสุทธิสะสม (${activeShop})` : "ยอดชำระสุทธิสะสม"}
              value={formatTHB(stats.totalPayout)}
              hint={
                activeShop !== "all"
                  ? `ยอดเงินโอนจากบิลเฉพาะร้าน ${activeShop} · ยังไม่หักค่าโฆษณา GMV`
                  : "ยอดเงินโอนจากบิลคำสั่งซื้อ + ชดเชย · ยังไม่หักค่าโฆษณา GMV / ปรับยอด"
              }
              tone="positive"
              icon={<IconWallet size={19} />}
              breakdown={dashboardPayoutBreakdown}
            />
            <StatCard
              label={activeShop !== "all" ? `รายได้รวมก่อนหัก (${activeShop})` : "รายได้รวมก่อนหัก"}
              value={formatTHB(stats.totalIncome)}
              hint="ยอดขายรวมส่วนลดและค่าจัดส่ง"
              tone="brand"
              icon={<IconTrend size={19} />}
              breakdown={dashboardIncomeBreakdown}
            />
            <StatCard
              label={activeShop !== "all" ? `ค่าธรรมเนียม (${activeShop})` : "ค่าธรรมเนียมทั้งหมด"}
              value={formatTHB(stats.totalFees)}
              hint="ค่าคอมมิชชั่น + ค่าธุรกรรม + ค่าส่ง"
              tone="negative"
              icon={<IconAlert size={19} />}
              breakdown={dashboardFeesBreakdown}
            />
            <StatCard
              label={activeShop !== "all" ? `จำนวนบิล (${activeShop})` : "จำนวนบิลคำสั่งซื้อสะสม"}
              value={`${stats.orderCount.toLocaleString("th-TH")} ใบ`}
              hint={activeShop !== "all" ? `จากบิลร้าน ${activeShop}` : `นำเข้าแล้ว ${stats.importCount.toLocaleString("th-TH")} ไฟล์`}
              tone="default"
              icon={<IconReceipt size={19} />}
              breakdown={dashboardCountBreakdown}
            />
          </div>

          {/* การ์ดเปรียบเทียบสัดส่วนร้านค้า (แสดงเมื่อเลือกโหมดรวมทุกร้าน) */}
          {activeShop === "all" && stats.shopSummaries && stats.shopSummaries.length > 0 ? (
            <DashboardShopComparison
              shopSummaries={stats.shopSummaries}
              totalPayout={stats.totalPayout}
            />
          ) : null}

          <section className="hero">
            <div className="hero-main">
              <div className="flex flex-wrap items-center gap-2">
                <p className="hero-label">
                  <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                  รอบชำระเงินล่าสุด
                </p>
                {activeShop !== "all" ? (
                  <Badge variant="info" className="font-extrabold">
                    เฉพาะร้าน {activeShop}
                  </Badge>
                ) : (
                  <Badge variant="neutral" className="border-border bg-white/80 text-foreground font-bold">
                    รวมทุกร้าน
                  </Badge>
                )}
                <Badge variant="neutral" className="border-border bg-white/80 text-foreground">
                  อัปเดตจาก {stats.importCount} ไฟล์
                </Badge>
              </div>
              <h2 className="hero-date">{formatDateLong(latest.date)}</h2>
              <p className="hero-sub">
                ยอดเงินโอนสุทธิจากคำสั่งซื้อในรอบนี้
              </p>
              <p className="hero-amount">
                <AnimatedValueText value={formatTHB(latest.orderPayout)} />
              </p>
              <div className="hero-pills">
                <Badge variant="neutral" className="border-border bg-white px-3 py-1 text-xs font-semibold text-foreground shadow-2xs">
                  {latest.orderCount.toLocaleString("th-TH")} บิลคำสั่งซื้อ
                </Badge>
                <Badge variant="neutral" className="border-border bg-white px-3 py-1 text-xs font-semibold text-foreground shadow-2xs">
                  รายได้รวม {formatTHB(latest.orderIncome)}
                </Badge>
                <Badge variant="neutral" className="border-border bg-white px-3 py-1 text-xs font-semibold text-foreground shadow-2xs">
                  หักค่าธรรมเนียม {formatTHB(latest.orderFees)}
                </Badge>
                {latest.otherCount > 0 ? (
                  <Badge variant="neutral" className="border-border bg-white px-3 py-1 text-xs font-semibold text-foreground shadow-2xs">
                    รายการอื่น {formatTHB(latest.otherPayout)}
                  </Badge>
                ) : null}
              </div>
              <div className="hero-actions">
                <Button asChild variant="default">
                  <Link
                    href={`/bills?date=${latest.date}${activeShop !== "all" ? `&shop=${encodeURIComponent(activeShop)}` : ""}`}
                    prefetch={false}
                  >
                    เปิดดูบิลรอบนี้ ({latest.orderCount.toLocaleString("th-TH")} บิล){" "}
                    <IconChevronRight size={16} />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/days/${latest.date}/invoices`} prefetch={false}>
                    <IconReceipt size={16} /> พิมพ์ใบกำกับภาษีทั้งรอบ
                  </Link>
                </Button>
              </div>
            </div>
            <div className="hero-side">
              <div className="hero-side-item">
                <span>ยอดสุทธิหลังหัก GMV / ปรับยอด</span>
                <strong>
                  <AnimatedValueText value={formatTHB(latest.totalPayout)} />
                </strong>
              </div>
              <div className="hero-side-item">
                <span>รายการที่ไม่ใช่คำสั่งซื้อในรอบนี้</span>
                <strong>
                  <AnimatedValueText
                    value={`${latest.otherCount.toLocaleString("th-TH")} รายการ`}
                  />
                </strong>
              </div>
              <div className="hero-side-item">
                <span>ไฟล์ Excel ล่าสุดที่นำเข้า</span>
                <strong className="break-all text-sm">
                  {latestImport?.filename ?? "-"}
                </strong>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-[14px] min-[768px]:grid-cols-2 min-[1180px]:grid-cols-4">
            <Card className="flex flex-col justify-between p-5">
              <div>
                <div className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-[#ecfdf5] text-[#059669]">
                  <IconReceipt size={20} />
                </div>
                <h3 className="text-base font-bold text-foreground">
                  หมวดบิลคำสั่งซื้อทั้งหมด
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  ค้นหาเลขคำสั่งซื้อ เลือกดูรายวัน/รายเดือน กรองสถานะ และเปิดดูบิลหรือพิมพ์ใบกำกับฯ ได้ทันที
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border">
                <Button asChild variant="secondary" size="sm" className="w-full justify-between">
                  <Link href={activeShop !== "all" ? `/bills?shop=${encodeURIComponent(activeShop)}` : "/bills"} prefetch={false}>
                    ค้นหาบิล ({stats.orderCount.toLocaleString("th-TH")}){" "}
                    <IconChevronRight size={15} />
                  </Link>
                </Button>
              </div>
            </Card>

            <Card className="flex flex-col justify-between p-5">
              <div>
                <div className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-[#fff0f3] text-[#fe2c55]">
                  <IconFile size={20} />
                </div>
                <h3 className="text-base font-bold text-foreground">
                  หมวดสรุปยอดรหัสสินค้า
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  ดูจำนวนชิ้นและยอดขายแยกตามรหัสสินค้า เลือกกรองรายเดือนหรือรายวันได้
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border">
                <Button asChild variant="secondary" size="sm" className="w-full justify-between">
                  <Link href="/products" prefetch={false}>
                    เปิดสรุปยอดสินค้า <IconChevronRight size={15} />
                  </Link>
                </Button>
              </div>
            </Card>

            <Card className="flex flex-col justify-between p-5">
              <div>
                <div className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-[#f0fdfa] text-[#0d9488]">
                  <IconUpload size={20} />
                </div>
                <h3 className="text-base font-bold text-foreground">
                  หมวดอัปโหลดไฟล์รายได้
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  อัปโหลดไฟล์จาก TikTok Shop, Shopee, Facebook, Lazada, LINE OA และ Shipnity พร้อมปฏิทินตรวจความครบของแต่ละร้าน
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border">
                <Button asChild variant="default" size="sm" className="w-full justify-between">
                  <Link href="/import" prefetch={false}>
                    ไปหน้าอัปโหลดไฟล์ <IconChevronRight size={15} />
                  </Link>
                </Button>
              </div>
            </Card>

            <Card className="flex flex-col justify-between p-5">
              <div>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="inline-flex size-10 items-center justify-center rounded-xl bg-[#f1f5f9] text-[#0f172a]">
                    <IconHistory size={20} />
                  </span>
                  {latestImport ? <StatusBadge status={latestImport.status} /> : null}
                </div>
                <h3 className="text-base font-bold text-foreground">
                  หมวดประวัติการนำเข้าไฟล์
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  ตรวจสอบไฟล์ที่นำเข้าแล้ว ({stats.importCount.toLocaleString("th-TH")} ไฟล์) ดูรายงานการจับคู่คอลัมน์ หรือลบไฟล์
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border">
                <Button asChild variant="secondary" size="sm" className="w-full justify-between">
                  <Link href="/history" prefetch={false}>
                    ดูประวัติการนำเข้า ({stats.importCount.toLocaleString("th-TH")}){" "}
                    <IconChevronRight size={15} />
                  </Link>
                </Button>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
