import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";
import { PageHeader, StatCard } from "@/components/PageHeader";
import {
  IconAlert,
  IconCalendar,
  IconCheckCircle,
  IconReceipt,
  IconSearch,
  IconTrend,
  IconWallet,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDateLong, formatTHB } from "@/lib/format";
import { getDailyBatch } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "รอบรายวัน" };

export default async function DailyPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const batch = await getDailyBatch(date);
  if (!batch) notFound();

  return (
    <>
      <PageHeader
        eyebrow="TikTok Shop · รอบชำระรายวัน"
        title={`รอบชำระ ${formatDateLong(date)}`}
        description={`บิลคำสั่งซื้อ ${batch.summary.orderCount.toLocaleString("th-TH")} ใบ · รายการทั้งหมด ${batch.summary.transactionCount.toLocaleString("th-TH")} รายการ · ยอดสุทธิรวม ${formatTHB(batch.summary.totalPayout)}`}
        actions={
          <>
            <Button asChild variant="default">
              <Link href={`/days/${date}/invoices`}>
                <IconReceipt size={16} /> พิมพ์ใบกำกับภาษีทั้งรอบ
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/bills?date=${date}`}>
                <IconSearch size={16} /> ค้นหาบิลในรอบ
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/">กลับภาพรวม</Link>
            </Button>
          </>
        }
      />

      <div className="stats mb-4">
        <StatCard
          label="บิลในรอบ"
          value={`${batch.summary.orderCount.toLocaleString("th-TH")} ใบ`}
          hint={`จากทั้งหมด ${batch.summary.transactionCount.toLocaleString("th-TH")} รายการ`}
          icon={<IconReceipt size={19} />}
        />
        <StatCard
          label="รายได้รวม"
          value={formatTHB(batch.summary.orderIncome)}
          hint="ยอดก่อนหักค่าธรรมเนียม"
          icon={<IconTrend size={19} />}
        />
        <StatCard
          label="หักค่าธรรมเนียม"
          value={formatTHB(batch.summary.orderFees)}
          hint="รวมค่าธรรมเนียมทุกประเภท"
          tone="negative"
          icon={<IconAlert size={19} />}
        />
        <StatCard
          label="ยอดชำระจากบิล"
          value={formatTHB(batch.summary.orderPayout)}
          hint={`ยอดสุทธิทั้งรอบ ${formatTHB(batch.summary.totalPayout)}`}
          tone="positive"
          icon={<IconWallet size={19} />}
        />
      </div>

      {batch.summary.otherCount > 0 ? (
        <Card variant="warning" padding="compact" className="notice mb-4">
          <IconAlert size={19} />
          <div>
            <strong>รอบนี้มีรายการที่ไม่ใช่คำสั่งซื้อ ({batch.summary.otherCount.toLocaleString("th-TH")} รายการ)</strong>
            <p>
              ยอดรวม {formatTHB(batch.summary.otherPayout)} (เช่น การชำระด้วย GMV หรือการปรับยอด)
              ทำให้ยอดสุทธิของรอบเท่ากับ <strong>{formatTHB(batch.summary.totalPayout)}</strong> (ยอดบิล + รายการอื่น)
            </p>
          </div>
        </Card>
      ) : null}

      <Tabs defaultValue="orders" className="w-full">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <TabsList className="h-auto flex-wrap gap-1 p-1">
            <TabsTrigger value="orders" className="min-h-[38px] px-3.5">
              บิลคำสั่งซื้อ ({batch.orders.length.toLocaleString("th-TH")})
            </TabsTrigger>
            {batch.others.length > 0 ? (
              <TabsTrigger value="others" className="min-h-[38px] px-3.5">
                รายการอื่นที่ไม่ใช่บิล ({batch.others.length.toLocaleString("th-TH")})
              </TabsTrigger>
            ) : null}
          </TabsList>

          <Button asChild variant="ghost" size="sm" className="card-link">
            <Link href={`/bills?date=${date}`}>
              <IconSearch size={15} /> ค้นหาละเอียดในหน้าบิลทั้งหมด
            </Link>
          </Button>
        </div>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>รายการบิลคำสั่งซื้อในรอบนี้</CardTitle>
              <span className="muted small">
                {batch.orders.length.toLocaleString("th-TH")} ใบ · ยอดชำระรวม{" "}
                {formatTHB(batch.summary.orderPayout)}
              </span>
            </CardHeader>
            <Table variant="stack">
              <TableHeader>
                <TableRow>
                  <TableHead>หมายเลขคำสั่งซื้อ</TableHead>
                  <TableHead>วันที่สร้าง</TableHead>
                  <TableHead className="num">รายได้</TableHead>
                  <TableHead className="num">ค่าธรรมเนียม</TableHead>
                  <TableHead className="num">ยอดชำระสุทธิ</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="num">เอกสาร</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batch.orders.map((order) => {
                  const ok =
                    Math.abs(order.checks.incomeDiff) < 0.01 &&
                    Math.abs(order.checks.feeDiff) < 0.01 &&
                    Math.abs(order.checks.payoutDiff) < 0.01;
                  return (
                    <TableRow key={order.id}>
                      <TableCell data-label="หมายเลขคำสั่งซื้อ">
                        <div className="flex flex-col items-end min-[641px]:items-start">
                          <span className="inline-flex items-center gap-1.5">
                            <Link
                              className="mono link inline-flex min-h-[40px] items-center"
                              href={`/bills/${order.externalId}`}
                            >
                              {order.externalId}
                            </Link>
                            <CopyButton value={order.externalId} />
                          </span>
                          {order.invoiceNo ? (
                            <span className="muted small mono">
                              ใบกำกับฯ: {order.invoiceNo}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell data-label="วันที่สร้าง">
                        {formatDate(order.createdDate)}
                      </TableCell>
                      <TableCell data-label="รายได้" className="num">
                        {formatTHB(order.income)}
                      </TableCell>
                      <TableCell data-label="ค่าธรรมเนียม" className="num danger">
                        {formatTHB(order.feeTotal)}
                      </TableCell>
                      <TableCell data-label="ยอดชำระสุทธิ" className="num positive strong">
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
        </TabsContent>

        {batch.others.length > 0 ? (
          <TabsContent value="others">
            <Card>
              <CardHeader>
                <CardTitle>รายการอื่นในรอบ (ไม่สร้างบิล)</CardTitle>
                <span className="muted small">
                  {batch.others.length.toLocaleString("th-TH")} รายการ · ยอดรวม{" "}
                  {formatTHB(batch.summary.otherPayout)}
                </span>
              </CardHeader>
              <Table variant="stack">
                <TableHeader>
                  <TableRow>
                    <TableHead>เลขอ้างอิง</TableHead>
                    <TableHead>ประเภทธุรกรรม</TableHead>
                    <TableHead className="num">ยอดชำระ</TableHead>
                    <TableHead className="num">การปรับยอด</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batch.others.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell data-label="เลขอ้างอิง" className="mono">
                        {item.externalId}
                      </TableCell>
                      <TableCell data-label="ประเภทธุรกรรม">
                        <Badge variant="neutral">{item.transactionType}</Badge>
                      </TableCell>
                      <TableCell data-label="ยอดชำระ" className="num strong">
                        {formatTHB(item.payout)}
                      </TableCell>
                      <TableCell data-label="การปรับยอด" className="num">
                        {formatTHB(item.adjustment)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>

      <p className="page-foot-note">
        <IconCalendar size={15} /> ยอดทั้งหมดแยกตามวันที่ชำระเงิน (settlement date) จากไฟล์ export ของ TikTok Shop
      </p>
    </>
  );
}
