import Link from "next/link";
import { PageHeader, StatCard, StatusBadge } from "@/components/PageHeader";
import {
  IconAlert,
  IconCalendar,
  IconChevronRight,
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

export default async function DashboardPage() {
  const [stats, batches, imports] = await Promise.all([
    getOverallStats(),
    listDailyBatches(1),
    listImports(1),
  ]);

  const latest = batches[0] ?? null;
  const latestImport = imports[0] ?? null;

  return (
    <div className="flex flex-col gap-[14px]">
      <PageHeader
        eyebrow="TikTok Shop · Finance Overview"
        title="หมวดภาพรวมสรุปยอดรายได้"
        description="สรุปยอดชำระสะสม รอบโอนเงินล่าสุด และทางลัดเข้าสู่แต่ละหมวดหมู่โดยไม่ต้องเลื่อนหาข้อมูลยาว"
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/days">
                <IconCalendar size={16} /> ดูรอบชำระรายวัน
              </Link>
            </Button>
            <Button asChild variant="default">
              <Link href="/import">
                <IconUpload size={17} /> อัปโหลดไฟล์รายได้
              </Link>
            </Button>
          </>
        }
      />

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
            <Link href="/import">
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
              label="ยอดชำระสุทธิสะสม"
              value={formatTHB(stats.totalPayout)}
              hint="ยอดเงินโอนจากบิลคำสั่งซื้อทั้งหมด"
              tone="positive"
              icon={<IconWallet size={19} />}
            />
            <StatCard
              label="รายได้รวมก่อนหัก"
              value={formatTHB(stats.totalIncome)}
              hint="ยอดขายรวมส่วนลดและค่าจัดส่ง"
              tone="brand"
              icon={<IconTrend size={19} />}
            />
            <StatCard
              label="ค่าธรรมเนียม TikTok Shop"
              value={formatTHB(stats.totalFees)}
              hint="ค่าคอมมิชชั่น + ค่าธุรกรรม + ค่าส่ง"
              tone="negative"
              icon={<IconAlert size={19} />}
            />
            <StatCard
              label="จำนวนบิลคำสั่งซื้อสะสม"
              value={`${stats.orderCount.toLocaleString("th-TH")} ใบ`}
              hint={`นำเข้าแล้ว ${stats.importCount.toLocaleString("th-TH")} ไฟล์`}
              tone="default"
              icon={<IconReceipt size={19} />}
            />
          </div>

          <section className="hero">
            <div className="hero-main">
              <div className="flex flex-wrap items-center gap-2">
                <p className="hero-label">
                  <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                  รอบชำระเงินล่าสุด · Latest Settlement
                </p>
                <Badge variant="neutral" className="border-border bg-white/80 text-foreground">
                  อัปเดตจาก {stats.importCount} ไฟล์
                </Badge>
              </div>
              <h2 className="hero-date">{formatDateLong(latest.date)}</h2>
              <p className="hero-sub">
                ยอดเงินโอนสุทธิจากคำสั่งซื้อในรอบนี้ (Order Payout)
              </p>
              <p className="hero-amount">{formatTHB(latest.orderPayout)}</p>
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
                  <Link href={`/days/${latest.date}`}>
                    เปิดดูรอบชำระนี้ ({latest.orderCount.toLocaleString("th-TH")} บิล){" "}
                    <IconChevronRight size={16} />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/days/${latest.date}/invoices`}>
                    <IconReceipt size={16} /> พิมพ์ใบกำกับภาษีทั้งรอบ
                  </Link>
                </Button>
              </div>
            </div>
            <div className="hero-side">
              <div className="hero-side-item">
                <span>ยอดสุทธิทั้งรอบ (รวม GMV / ปรับยอด)</span>
                <strong>{formatTHB(latest.totalPayout)}</strong>
              </div>
              <div className="hero-side-item">
                <span>รายการที่ไม่ใช่คำสั่งซื้อในรอบนี้</span>
                <strong>{latest.otherCount.toLocaleString("th-TH")} รายการ</strong>
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
                <div className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-[#fff0f3] text-[#fe2c55]">
                  <IconCalendar size={20} />
                </div>
                <h3 className="text-base font-bold text-foreground">
                  หมวดรอบชำระเงินรายวัน
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  ดูตารางสรุปยอดโอนแยกตามวัน แสดงหน้าละ 20 รอบ พร้อมเปิดดูบิลและพิมพ์ใบกำกับฯ รายวัน
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border">
                <Button asChild variant="secondary" size="sm" className="w-full justify-between">
                  <Link href="/days">
                    เปิดหมวดรอบรายวัน <IconChevronRight size={15} />
                  </Link>
                </Button>
              </div>
            </Card>

            <Card className="flex flex-col justify-between p-5">
              <div>
                <div className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-[#ecfdf5] text-[#059669]">
                  <IconReceipt size={20} />
                </div>
                <h3 className="text-base font-bold text-foreground">
                  หมวดบิลคำสั่งซื้อทั้งหมด
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  ค้นหาเลขคำสั่งซื้อ กรองสถานะยอดตรง/ต้องตรวจสอบ และเปิดดูบิลหรือใบกำกับฯ แบบป๊อปอัป
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border">
                <Button asChild variant="secondary" size="sm" className="w-full justify-between">
                  <Link href="/bills">
                    ค้นหาบิลทั้งหมด ({stats.orderCount.toLocaleString("th-TH")}){" "}
                    <IconChevronRight size={15} />
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
                  อัปโหลดไฟล์ .xlsx จาก TikTok Shop พร้อมป๊อปอัปแสดงเปอร์เซ็นต์ความคืบหน้าแบบเรียลไทม์
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border">
                <Button asChild variant="default" size="sm" className="w-full justify-between">
                  <Link href="/import">
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
                  <Link href="/history">
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
