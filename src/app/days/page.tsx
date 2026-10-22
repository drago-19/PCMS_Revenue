import Link from "next/link";
import { DatePickerField } from "@/components/DatePickerField";
import { EmptyState, PageHeader, StatCard } from "@/components/PageHeader";
import { PaginationBar } from "@/components/PaginationBar";
import {
  IconAlert,
  IconCalendar,
  IconChevronRight,
  IconReceipt,
  IconSearch,
  IconTrend,
  IconUpload,
  IconWallet,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDateLong, formatTHB } from "@/lib/format";
import {
  getOverallStats,
  listDailyBatches,
  listDailyBatchesPaged,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "รอบชำระเงินรายวัน" };

export default async function DailyBatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const q = (params.q ?? "").trim();

  const [stats, result, allBatches] = await Promise.all([
    getOverallStats(),
    listDailyBatchesPaged({ page, pageSize: 20, q }),
    listDailyBatches(60),
  ]);

  const availableDates = allBatches.map((b) => ({
    date: b.date,
    count: b.orderCount,
  }));

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="TikTok Shop · Daily Settlements"
        title="หมวดรอบชำระเงินรายวัน"
        description="สรุปยอดโอนเงินแยกตามวันที่ชำระ (Settlement Date) แสดงหน้าละ 20 รอบ พร้อมทางลัดเปิดดูบิลรายวันและพิมพ์ใบกำกับภาษี"
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/bills">
                <IconReceipt size={16} /> ดูบิลคำสั่งซื้อทั้งหมด
              </Link>
            </Button>
            <Button asChild variant="default">
              <Link href="/import">
                <IconUpload size={16} /> อัปโหลดไฟล์รายได้
              </Link>
            </Button>
          </>
        }
      />

      <div className="stats">
        <StatCard
          label="ยอดชำระสุทธิสะสม"
          value={formatTHB(stats.totalPayout)}
          hint="รวมทุกวันที่มีการโอนเงิน"
          tone="positive"
          icon={<IconWallet size={19} />}
        />
        <StatCard
          label="รายได้รวมก่อนหัก"
          value={formatTHB(stats.totalIncome)}
          hint="ยอดขายรวมก่อนหักค่าธรรมเนียม"
          tone="brand"
          icon={<IconTrend size={19} />}
        />
        <StatCard
          label="ค่าธรรมเนียมรวม"
          value={formatTHB(stats.totalFees)}
          hint="หักค่าธรรมเนียม TikTok Shop"
          tone="negative"
          icon={<IconAlert size={19} />}
        />
        <StatCard
          label="จำนวนรอบชำระที่พบ"
          value={`${result.total.toLocaleString("th-TH")} รอบ`}
          hint={`บิลคำสั่งซื้อสะสม ${stats.orderCount.toLocaleString("th-TH")} ใบ`}
          tone="default"
          icon={<IconCalendar size={19} />}
        />
      </div>

      <Card className="workspace-table-card">
        <div className="shrink-0 border-b border-border bg-[#f8fafc] px-4 py-3 min-[640px]:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-foreground sm:text-base">
                ตารางรอบการชำระเงินรายวัน (Daily Settlement Statements)
              </h2>
              <p className="text-xs text-muted-foreground">
                คลิกที่วันที่เพื่อดูรายการบิลเฉพาะของรอบนั้น (แสดงหน้าละ 20 รอบ)
              </p>
            </div>

            <form className="flex flex-wrap items-center gap-2" method="get">
              <DatePickerField
                name="q"
                defaultValue={q}
                placeholder="ทุกรอบชำระ (เลือกวันที่)"
                availableDates={availableDates}
                basePath="/days"
              />
              <Button
                type="submit"
                variant="default"
                size="sm"
                className="h-10 min-h-[40px]"
              >
                <IconSearch size={15} /> กรองวันที่
              </Button>
              {q ? (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-10 min-h-[40px]"
                >
                  <Link href="/days">ล้างตัวกรอง</Link>
                </Button>
              ) : null}
            </form>
          </div>
        </div>

        {result.rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<IconCalendar size={28} />}
              title="ไม่พบรอบการชำระเงิน"
              description={
                q
                  ? "ไม่พบรอบชำระที่ตรงกับวันที่เลือก ลองล้างตัวกรองเพื่อดูทุกรอบ"
                  : "ยังไม่มีข้อมูลรอบชำระในระบบ เริ่มต้นด้วยการอัปโหลดไฟล์รายได้ Excel"
              }
              action={
                q ? (
                  <Button asChild variant="secondary">
                    <Link href="/days">แสดงทุกรอบชำระ</Link>
                  </Button>
                ) : (
                  <Button asChild variant="default">
                    <Link href="/import">
                      <IconUpload size={17} /> อัปโหลดไฟล์รายได้
                    </Link>
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <>
            <Table variant="stack">
              <TableHeader>
                <TableRow>
                  <TableHead>วันที่ชำระเงิน (Settlement Date)</TableHead>
                  <TableHead className="num">จำนวนบิล</TableHead>
                  <TableHead className="num">รายได้รวม</TableHead>
                  <TableHead className="num">หักค่าธรรมเนียม</TableHead>
                  <TableHead className="num">ยอดชำระสุทธิ (บิล)</TableHead>
                  <TableHead className="num">ยอดสุทธิทั้งรอบ</TableHead>
                  <TableHead className="num">การจัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((batch) => (
                  <TableRow key={batch.date}>
                    <TableCell data-label="วันที่ชำระเงิน">
                      <Link
                        className="link inline-flex min-h-[38px] items-center gap-2"
                        href={`/days/${batch.date}`}
                      >
                        <span className="size-2 rounded-full bg-primary" />
                        <span>{formatDateLong(batch.date)}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          ({formatDate(batch.date)})
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell data-label="จำนวนบิล" className="num">
                      <Badge variant="neutral">
                        {batch.orderCount.toLocaleString("th-TH")} บิล
                      </Badge>
                    </TableCell>
                    <TableCell data-label="รายได้รวม" className="num font-semibold">
                      {formatTHB(batch.orderIncome)}
                    </TableCell>
                    <TableCell
                      data-label="หักค่าธรรมเนียม"
                      className="num danger font-semibold"
                    >
                      {formatTHB(batch.orderFees)}
                    </TableCell>
                    <TableCell
                      data-label="ยอดชำระสุทธิ (บิล)"
                      className="num positive strong"
                    >
                      {formatTHB(batch.orderPayout)}
                    </TableCell>
                    <TableCell
                      data-label="ยอดสุทธิทั้งรอบ"
                      className="num font-semibold"
                    >
                      {formatTHB(batch.totalPayout)}
                    </TableCell>
                    <TableCell data-label="การจัดการ" className="num">
                      <span className="inline-flex flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
                        <Button asChild variant="default" size="xs">
                          <Link href={`/days/${batch.date}`}>
                            เปิดดูบิลในรอบ <IconChevronRight size={14} />
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="xs">
                          <Link href={`/days/${batch.date}/invoices`}>
                            <IconReceipt size={14} /> พิมพ์ใบกำกับฯ ทั้งรอบ
                          </Link>
                        </Button>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <PaginationBar
              page={result.page}
              pageCount={result.pageCount}
              pageSize={result.pageSize}
              total={result.total}
              unitLabel="รอบชำระ"
              basePath="/days"
              extraParams={{ q: q || undefined }}
            />
          </>
        )}
      </Card>
    </div>
  );
}
