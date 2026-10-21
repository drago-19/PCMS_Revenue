import Link from "next/link";
import {
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/PageHeader";
import { CopyButton } from "@/components/CopyButton";
import {
  IconAlert,
  IconCheckCircle,
  IconChevronRight,
  IconFile,
  IconReceipt,
  IconTrend,
  IconUpload,
  IconWallet,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDateLong, formatTHB } from "@/lib/format";
import { getDailyBatch, getOverallStats, listDailyBatches, listImports } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const stats = await getOverallStats();
  const batches = await listDailyBatches(8);
  const imports = await listImports(6);
  const latest = batches[0] ?? null;
  const latestImport = imports[0] ?? null;
  const latestOrders = latest
    ? ((await getDailyBatch(latest.date))?.orders.slice(0, 8) ?? [])
    : [];

  return (
    <>
      <PageHeader
        eyebrow="ภาพรวม"
        title="รายได้และบิลรายวัน"
        description="สรุปยอดชำระจากไฟล์ TikTok Shop แยกเป็นบิลรายคำสั่งซื้อ พร้อมตรวจยอดกับชีตสรุปของทุกไฟล์"
        actions={
          <Button asChild variant="default">
            <Link href="/import">
              <IconUpload size={17} /> อัปโหลดไฟล์รายได้
            </Link>
          </Button>
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
              <small>แยกตามหมายเลขคำสั่งซื้อ</small>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <section className="hero">
            <div className="hero-main">
              <p className="hero-label">รอบชำระล่าสุด</p>
              <h2 className="hero-date">{formatDateLong(latest.date)}</h2>
              <p className="hero-sub">ยอดชำระจากบิลในรอบนี้</p>
              <p className="hero-amount">{formatTHB(latest.orderPayout)}</p>
              <div className="hero-pills">
                <Badge variant="glass" className="pill">
                  {latest.orderCount.toLocaleString("th-TH")} บิล
                </Badge>
                <Badge variant="glass" className="pill">
                  รายได้ {formatTHB(latest.orderIncome)}
                </Badge>
                <Badge variant="glass" className="pill">
                  ค่าธรรมเนียม {formatTHB(latest.orderFees)}
                </Badge>
                {latest.otherCount > 0 ? (
                  <Badge variant="glass" className="pill">
                    รายการอื่น {formatTHB(latest.otherPayout)}
                  </Badge>
                ) : null}
              </div>
              <div className="hero-actions">
                <Button asChild variant="light">
                  <Link href={`/days/${latest.date}`}>
                    ดูรอบนี้ <IconChevronRight size={16} />
                  </Link>
                </Button>
                <Button asChild variant="outline-light">
                  <Link href={`/days/${latest.date}/invoices`}>
                    <IconReceipt size={16} /> พิมพ์ใบกำกับภาษีทั้งรอบ
                  </Link>
                </Button>
                <Button asChild variant="outline-light">
                  <Link href="/bills">ดูบิลทั้งหมด</Link>
                </Button>
              </div>
            </div>
            <div className="hero-side">
              <div className="hero-side-item">
                <span>ยอดสุทธิของรอบ (รวมรายการอื่น)</span>
                <strong>{formatTHB(latest.totalPayout)}</strong>
              </div>
              <div className="hero-side-item">
                <span>รายการที่ไม่ใช่คำสั่งซื้อ</span>
                <strong>{latest.otherCount.toLocaleString("th-TH")} รายการ</strong>
              </div>
              <div className="hero-side-item">
                <span>ไฟล์ล่าสุด</span>
                <strong className="break-all">{latestImport?.filename ?? "-"}</strong>
              </div>
            </div>
          </section>

          <div className="stats">
            <StatCard
              label="บิลทั้งหมด"
              value={stats.orderCount.toLocaleString("th-TH")}
              hint={`จาก ${stats.importCount} ไฟล์ที่นำเข้า`}
              icon={<IconReceipt size={19} />}
            />
            <StatCard
              label="รายได้รวม"
              value={formatTHB(stats.totalIncome)}
              hint="ยอดก่อนหักค่าธรรมเนียม"
              icon={<IconTrend size={19} />}
            />
            <StatCard
              label="ค่าธรรมเนียมรวม"
              value={formatTHB(stats.totalFees)}
              hint="รวมค่าธรรมเนียมทุกประเภท"
              tone="negative"
              icon={<IconAlert size={19} />}
            />
            <StatCard
              label="ยอดชำระจากบิล"
              value={formatTHB(stats.totalPayout)}
              hint="เฉพาะคำสั่งซื้อที่สร้างบิล"
              tone="positive"
              icon={<IconWallet size={19} />}
            />
          </div>

          <div className="grid-2">
            <Card>
              <CardHeader>
                <CardTitle>บิลล่าสุดในรอบ</CardTitle>
                <Button asChild variant="ghost" size="sm" className="card-link">
                  <Link href={`/days/${latest.date}`}>
                    ดูทั้งหมด <IconChevronRight size={15} />
                  </Link>
                </Button>
              </CardHeader>
              <Table variant="stack">
                <TableHeader>
                  <TableRow>
                    <TableHead>หมายเลขคำสั่งซื้อ</TableHead>
                    <TableHead>วันที่ชำระ</TableHead>
                    <TableHead className="num">ยอดชำระ</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="num">เอกสาร</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latestOrders.map((order) => {
                    const ok =
                      Math.abs(order.checks.incomeDiff) < 0.01 &&
                      Math.abs(order.checks.feeDiff) < 0.01 &&
                      Math.abs(order.checks.payoutDiff) < 0.01;
                    return (
                      <TableRow key={order.id}>
                        <TableCell data-label="หมายเลขคำสั่งซื้อ">
                          <span className="inline-flex items-center gap-1.5">
                            <Link
                              className="mono link inline-flex min-h-[40px] items-center"
                              href={`/bills/${order.externalId}`}
                            >
                              {order.externalId}
                            </Link>
                            <CopyButton value={order.externalId} />
                          </span>
                        </TableCell>
                        <TableCell data-label="วันที่ชำระ">{formatDate(order.paidDate)}</TableCell>
                        <TableCell data-label="ยอดชำระ" className="num positive strong">
                          {formatTHB(order.payout)}
                        </TableCell>
                        <TableCell data-label="สถานะ">
                          {ok ? (
                            <Badge variant="success" size="sm">
                              <IconCheckCircle size={13} /> ยอดตรง
                            </Badge>
                          ) : (
                            <Badge variant="warning" size="sm">
                              <IconAlert size={13} /> ตรวจสอบ
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell data-label="เอกสาร" className="num">
                          <span className="inline-flex flex-wrap items-center justify-end gap-2">
                            <Button asChild variant="secondary" size="xs">
                              <Link href={`/bills/${order.externalId}`}>ดูบิล</Link>
                            </Button>
                            <Button asChild variant="ghost" size="xs">
                              <Link href={`/invoices/${order.externalId}`}>ใบกำกับฯ</Link>
                            </Button>
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>ประวัติการนำเข้า</CardTitle>
                <Button asChild variant="ghost" size="sm" className="card-link">
                  <Link href="/import">
                    จัดการ <IconChevronRight size={15} />
                  </Link>
                </Button>
              </CardHeader>
              <ul className="history-list">
                {imports.map((item) => (
                  <li key={item.id}>
                    <div className="history-main">
                      <Link
                        href={`/import/${item.id}`}
                        className="history-file inline-flex min-h-[40px] items-center"
                      >
                        <IconFile size={16} />
                        <span className="break-all whitespace-normal">{item.filename}</span>
                      </Link>
                      <span className="muted small">
                        {item.orderCount} บิล ·{" "}
                        {item.periodStart ? formatDate(item.periodStart) : "-"}
                      </span>
                    </div>
                    <StatusBadge status={item.status} />
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {batches.length > 0 ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>สรุปรอบชำระรายวัน</CardTitle>
                <span className="muted small">แยกตามวันที่ชำระเงินจาก TikTok Shop</span>
              </CardHeader>
              <Table variant="stack">
                <TableHeader>
                  <TableRow>
                    <TableHead>วันที่ชำระ</TableHead>
                    <TableHead className="num">จำนวนบิล</TableHead>
                    <TableHead className="num">รายได้รวม</TableHead>
                    <TableHead className="num">หักค่าธรรมเนียม</TableHead>
                    <TableHead className="num">ยอดชำระสุทธิ (บิล)</TableHead>
                    <TableHead className="num">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow key={batch.date}>
                      <TableCell data-label="วันที่ชำระ">
                        <Link
                          className="link inline-flex min-h-[40px] items-center"
                          href={`/days/${batch.date}`}
                        >
                          {formatDateLong(batch.date)}
                        </Link>
                      </TableCell>
                      <TableCell data-label="จำนวนบิล" className="num">
                        <Badge variant="neutral">
                          {batch.orderCount.toLocaleString("th-TH")} บิล
                        </Badge>
                      </TableCell>
                      <TableCell data-label="รายได้รวม" className="num">
                        {formatTHB(batch.orderIncome)}
                      </TableCell>
                      <TableCell data-label="หักค่าธรรมเนียม" className="num danger">
                        {formatTHB(batch.orderFees)}
                      </TableCell>
                      <TableCell data-label="ยอดชำระสุทธิ (บิล)" className="num positive strong">
                        {formatTHB(batch.orderPayout)}
                      </TableCell>
                      <TableCell data-label="จัดการ" className="num">
                        <span className="inline-flex flex-wrap items-center justify-end gap-2">
                          <Button asChild variant="secondary" size="xs">
                            <Link href={`/days/${batch.date}`}>
                              ดูรอบ <IconChevronRight size={14} />
                            </Link>
                          </Button>
                          <Button asChild variant="ghost" size="xs">
                            <Link href={`/days/${batch.date}/invoices`}>
                              <IconReceipt size={14} /> พิมพ์ทั้งรอบ
                            </Link>
                          </Button>
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : null}
        </>
      )}
    </>
  );
}
