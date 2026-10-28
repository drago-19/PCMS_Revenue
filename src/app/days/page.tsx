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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDateLong, formatTHB } from "@/lib/format";
import {
  type DailyBatchSortKey,
  getOverallStats,
  listDailyBatches,
  listDailyBatchesPaged,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "รอบชำระเงินรายวัน" };

const VALID_BATCH_SORTS: DailyBatchSortKey[] = [
  "date_desc",
  "date_asc",
  "payout_desc",
  "payout_asc",
  "income_desc",
  "income_asc",
  "fees_desc",
  "fees_asc",
  "orders_desc",
  "orders_asc",
];

const THAI_MONTHS_SHORT = [
  "",
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

function formatYearMonthLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const monthIdx = Number(m[2]);
  return `${THAI_MONTHS_SHORT[monthIdx] ?? m[2]} ${m[1]}`;
}

export default async function DailyBatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const q = (params.q ?? "").trim();
  const rawSort = (params.sort ?? "date_desc").trim() as DailyBatchSortKey;
  const sort: DailyBatchSortKey = VALID_BATCH_SORTS.includes(rawSort)
    ? rawSort
    : "date_desc";

  function buildDaysHref(overrides: {
    nextSort?: DailyBatchSortKey;
    nextPage?: number;
  }) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    const targetSort = overrides.nextSort ?? sort;
    if (targetSort !== "date_desc") search.set("sort", targetSort);
    const targetPage = overrides.nextPage ?? 1;
    if (targetPage > 1) search.set("page", String(targetPage));
    const qs = search.toString();
    return qs ? `/days?${qs}` : "/days";
  }

  const [stats, result, allBatches] = await Promise.all([
    getOverallStats(),
    listDailyBatchesPaged({ page, pageSize: 20, q, sort }),
    listDailyBatches(1000),
  ]);

  const availableDates = allBatches.map((b) => ({
    date: b.date,
    count: b.orderCount,
  }));

  const monthSummaryMap = new Map<
    string,
    { ym: string; days: number; orders: number; payout: number }
  >();
  for (const b of allBatches) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) continue;
    const ym = b.date.slice(0, 7);
    const cur = monthSummaryMap.get(ym) ?? {
      ym,
      days: 0,
      orders: 0,
      payout: 0,
    };
    cur.days += 1;
    cur.orders += b.orderCount;
    cur.payout += b.totalPayout;
    monthSummaryMap.set(ym, cur);
  }
  const availableMonths = [...monthSummaryMap.values()].sort((a, b) =>
    b.ym.localeCompare(a.ym),
  );
  const activeMonthForPrint = /^\d{4}-\d{2}$/.test(q)
    ? q
    : availableMonths[0]?.ym ?? "";

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
        <div className="shrink-0 rounded-t-2xl border-b border-border bg-[#f8fafc] px-4 py-3 min-[640px]:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-foreground sm:text-base">
                ตารางรอบการชำระเงินรายวัน (Daily Settlement Statements)
              </h2>
              <p className="text-xs text-muted-foreground">
                เลือกกรองรายเดือนหรือรายวันจากปุ่มปฏิทินด้านขวา (แสดงหน้าละ 20 รอบ)
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center min-[960px]:w-auto">
             

              <DatePickerField
                name="q"
                defaultValue={q}
                placeholder="ทุกรอบชำระ (เลือกเดือน/วัน)"
                availableDates={availableDates}
                basePath="/days"
                className="w-full sm:w-auto"
                extraParams={{
                  sort: sort !== "date_desc" ? sort : undefined,
                }}
              />
              {activeMonthForPrint ? (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-10 min-h-[40px] w-full sm:w-auto"
                >
                  <Link href={`/days/${activeMonthForPrint}/invoices`}>
                    <IconReceipt size={15} /> พิมพ์ใบกำกับฯ เดือน{" "}
                    {formatYearMonthLabel(activeMonthForPrint)}
                  </Link>
                </Button>
              ) : null}
              {q || sort !== "date_desc" ? (
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="h-10 min-h-[40px] w-full text-muted-foreground hover:text-foreground sm:w-auto"
                >
                  <Link href="/days">ล้างตัวกรอง</Link>
                </Button>
              ) : null}
            </div>
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
                  <TableHead>
                    <Link
                      href={buildDaysHref({
                        nextSort: sort === "date_desc" ? "date_asc" : "date_desc",
                        nextPage: 1,
                      })}
                      className="inline-flex items-center gap-1 text-[#0f172a] hover:text-primary"
                    >
                      <span>วันที่ชำระเงิน</span>
                      <span className="text-[11px] text-[#64748b]">
                        {sort === "date_desc"
                          ? "↓"
                          : sort === "date_asc"
                            ? "↑"
                            : "↕"}
                      </span>
                    </Link>
                  </TableHead>
                  <TableHead className="num">
                    <Link
                      href={buildDaysHref({
                        nextSort:
                          sort === "orders_asc" ? "orders_desc" : "orders_asc",
                        nextPage: 1,
                      })}
                      className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                    >
                      <span>จำนวนบิล</span>
                      <span className="text-[11px] text-[#64748b]">
                        {sort === "orders_asc"
                          ? "↑"
                          : sort === "orders_desc"
                            ? "↓"
                            : "↕"}
                      </span>
                    </Link>
                  </TableHead>
                  <TableHead className="num min-[768px]:max-[959px]:hidden">
                    <Link
                      href={buildDaysHref({
                        nextSort:
                          sort === "income_asc" ? "income_desc" : "income_asc",
                        nextPage: 1,
                      })}
                      className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                    >
                      <span>รายได้รวม</span>
                      <span className="text-[11px] text-[#64748b]">
                        {sort === "income_asc"
                          ? "↑"
                          : sort === "income_desc"
                            ? "↓"
                            : "↕"}
                      </span>
                    </Link>
                  </TableHead>
                  <TableHead className="num min-[768px]:max-[959px]:hidden">
                    <Link
                      href={buildDaysHref({
                        nextSort: sort === "fees_asc" ? "fees_desc" : "fees_asc",
                        nextPage: 1,
                      })}
                      className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                    >
                      <span>หักค่าธรรมเนียม</span>
                      <span className="text-[11px] text-[#64748b]">
                        {sort === "fees_asc"
                          ? "↑"
                          : sort === "fees_desc"
                            ? "↓"
                            : "↕"}
                      </span>
                    </Link>
                  </TableHead>
                  <TableHead className="num">
                    <Link
                      href={buildDaysHref({
                        nextSort:
                          sort === "payout_asc" ? "payout_desc" : "payout_asc",
                        nextPage: 1,
                      })}
                      className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                    >
                      <span>ยอดชำระสุทธิ (บิล)</span>
                      <span className="text-[11px] text-[#64748b]">
                        {sort === "payout_asc"
                          ? "↑"
                          : sort === "payout_desc"
                            ? "↓"
                            : "↕"}
                      </span>
                    </Link>
                  </TableHead>
                  <TableHead className="num min-[768px]:max-[1359px]:hidden">
                    ยอดสุทธิทั้งรอบ
                  </TableHead>
                  <TableHead className="num">การจัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((batch) => {
                  const feeRatio =
                    batch.orderIncome > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (Math.abs(batch.orderFees) / batch.orderIncome) *
                              1000,
                          ) / 10,
                        )
                      : 0;
                  return (
                    <TableRow key={batch.date}>
                      <TableCell
                        data-label="วันที่ชำระเงิน"
                        className="whitespace-nowrap"
                      >
                        <Link
                          className="link inline-flex min-h-[40px] items-center gap-2 font-bold whitespace-nowrap text-[#0f172a] hover:text-primary"
                          href={`/days/${batch.date}`}
                        >
                          <span className="size-2.5 shrink-0 rounded-full bg-primary shadow-[0_0_0_3px_rgba(254,44,85,0.14)]" />
                          <span className="whitespace-nowrap">
                            {formatDateLong(batch.date)}
                          </span>
                          <span className="mono shrink-0 rounded-md border border-[#cbd5e1] bg-[#f8fafc] px-1.5 py-0.5 text-xs font-semibold text-[#475569]">
                            {formatDate(batch.date)}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell data-label="จำนวนบิล" className="num">
                        <Badge
                          variant="neutral"
                          className="border-[#cbd5e1] bg-[#f8fafc] font-bold text-[#0f172a]"
                        >
                          {batch.orderCount.toLocaleString("th-TH")} บิล
                        </Badge>
                      </TableCell>
                      <TableCell
                        data-label="รายได้รวม"
                        className="num font-semibold text-[#0f172a] min-[768px]:max-[959px]:hidden"
                      >
                        {formatTHB(batch.orderIncome)}
                      </TableCell>
                      <TableCell
                        data-label="หักค่าธรรมเนียม"
                        className="num danger font-semibold min-[768px]:max-[959px]:hidden"
                      >
                        <div className="flex flex-col items-end gap-0.5">
                          <span>{formatTHB(batch.orderFees)}</span>
                          {feeRatio > 0 ? (
                            <span className="text-xs font-normal text-[#64748b]">
                              ({feeRatio}% ของรายได้)
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell
                        data-label="ยอดชำระสุทธิ (บิล)"
                        className="num payout-col positive font-extrabold text-[13.5px] min-[1280px]:text-[14px]"
                      >
                        <div className="flex flex-col items-end gap-0.5">
                          <span>{formatTHB(batch.orderPayout)}</span>
                          <span className="hidden text-xs font-normal text-muted-foreground min-[768px]:max-[959px]:inline">
                            รับ {formatTHB(batch.orderIncome)} · หัก{" "}
                            {formatTHB(batch.orderFees)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell
                        data-label="ยอดสุทธิทั้งรอบ"
                        className="num font-bold text-[#0f172a] min-[768px]:max-[1359px]:hidden"
                      >
                        {formatTHB(batch.totalPayout)}
                      </TableCell>
                      <TableCell data-label="การจัดการ" className="num">
                        <span className="inline-flex flex-wrap items-center justify-end gap-1.5 min-[1100px]:flex-nowrap whitespace-nowrap">
                          <Button asChild variant="default" size="xs">
                            <Link href={`/days/${batch.date}`}>
                              ดูบิลในรอบ <IconChevronRight size={14} />
                            </Link>
                          </Button>
                          <Button asChild variant="outline" size="xs">
                            <Link href={`/days/${batch.date}/invoices`}>
                              <IconReceipt size={14} /> พิมพ์ใบกำกับฯ
                            </Link>
                          </Button>
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell
                    data-label="สรุปยอดรวมสะสม"
                    className="font-bold text-[#0f172a]"
                  >
                    รวมทุกรอบชำระ ({result.total.toLocaleString("th-TH")} รอบ)
                  </TableCell>
                  <TableCell data-label="รวมจำนวนบิล" className="num">
                    <Badge
                      variant="neutral"
                      className="border-[#cbd5e1] bg-white font-bold text-[#0f172a]"
                    >
                      {stats.orderCount.toLocaleString("th-TH")} บิล
                    </Badge>
                  </TableCell>
                  <TableCell
                    data-label="รวมรายได้"
                    className="num font-bold text-[#0f172a] min-[768px]:max-[959px]:hidden"
                  >
                    {formatTHB(stats.totalIncome)}
                  </TableCell>
                  <TableCell
                    data-label="รวมค่าธรรมเนียม"
                    className="num danger font-bold min-[768px]:max-[959px]:hidden"
                  >
                    {formatTHB(stats.totalFees)}
                  </TableCell>
                  <TableCell
                    data-label="รวมยอดชำระสุทธิ"
                    className="num payout-col positive font-extrabold text-[14px]"
                  >
                    {formatTHB(stats.totalPayout)}
                  </TableCell>
                  <TableCell
                    data-label="รวมยอดสุทธิทั้งรอบ"
                    className="num font-extrabold text-[#0f172a] min-[768px]:max-[1359px]:hidden"
                  >
                    {formatTHB(stats.totalPayout)}
                  </TableCell>
                  <TableCell data-label="" className="max-[767px]:hidden" />
                </TableRow>
              </TableFooter>
            </Table>

            <PaginationBar
              page={result.page}
              pageCount={result.pageCount}
              pageSize={result.pageSize}
              total={result.total}
              unitLabel="รอบชำระ"
              basePath="/days"
              extraParams={{
                q: q || undefined,
                sort: sort !== "date_desc" ? sort : undefined,
              }}
            />
          </>
        )}
      </Card>
    </div>
  );
}
