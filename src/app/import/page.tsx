import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { UploadForm } from "@/components/UploadForm";
import {
  IconAlert,
  IconCalendar,
  IconCheckCircle,
  IconHistory,
  IconReceipt,
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
import { formatDate, formatDateLong, formatNumber } from "@/lib/format";
import {
  getDailyUploadCompleteness,
  type UploadDateMode,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "อัปโหลดรายได้" };

type DayStatusFilter = "all" | "incomplete" | "complete";

function formatMonthThai(ym: string): string {
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  if (!m) return ym;
  const monthNames = [
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
  const monthIdx = Number(m[2]) - 1;
  return `${monthNames[monthIdx] ?? m[2]} ${m[1]}`;
}

export default async function ImportPage({
  searchParams,
}: {
  searchParams?: Promise<{
    month?: string;
    mode?: string;
    filter?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const mode: UploadDateMode = sp.mode === "paid" ? "paid" : "created";
  const statusFilter: DayStatusFilter =
    sp.filter === "incomplete" || sp.filter === "complete" ? sp.filter : "all";

  const report = await getDailyUploadCompleteness({
    month: sp.month,
    mode,
  });

  const filteredRows = report.rows.filter((row) => {
    if (statusFilter === "complete") return row.isComplete;
    if (statusFilter === "incomplete") return !row.isComplete;
    return true;
  });

  const buildHref = (overrides: {
    month?: string;
    mode?: UploadDateMode;
    filter?: DayStatusFilter;
  }) => {
    const nextMonth = overrides.month ?? report.month;
    const nextMode = overrides.mode ?? report.mode;
    const nextFilter = overrides.filter ?? statusFilter;
    const qs = new URLSearchParams();
    if (nextMonth) qs.set("month", nextMonth);
    if (nextMode !== "created") qs.set("mode", nextMode);
    if (nextFilter !== "all") qs.set("filter", nextFilter);
    const str = qs.toString();
    return str ? `/import?${str}#completeness-check` : "/import#completeness-check";
  };

  return (
    <>
      <PageHeader
        eyebrow="TikTok Shop & Shopee · นำเข้าและแมปข้อมูล 3 ไฟล์"
        title="หมวดอัปโหลดไฟล์รายได้ & รายการสินค้า"
        description="รองรับทั้งไฟล์ .xlsx และ .csv จากทั้ง 3 ส่วน: (1) ไฟล์ออเดอร์ใน shipnity  (2) ไฟล์รายได้ TikTok Shop  (3) ไฟล์สินค้าในออเดอร์ shipnity (รองรับทั้งช่องทาง TikTok และ Shopee)"
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/history">
                <IconHistory size={17} /> ประวัติไฟล์ที่นำเข้า
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/bills">
                <IconReceipt size={17} /> ดูบิลทั้งหมด
              </Link>
            </Button>
          </>
        }
      />

      <div className="import-grid">
        <Card padding="padded" className="card-pad w-full">
          <h2 className="card-title">
            นำเข้าไฟล์ .xlsx หรือ .csv (เลือกพร้อมกันได้)
          </h2>
          <p className="card-sub">
            อัปโหลดไฟล์รายได้ TikTok Shop, ไฟล์ออเดอร์ใน shipnity
            และไฟล์สินค้าในออเดอร์ shipnity (SKU)
            ระบบจะตรวจสอบชนิดไฟล์และเชื่อมข้อมูลเข้าด้วยกันให้อัตโนมัติ
          </p>
          <UploadForm />
        </Card>
      </div>

      {/* ตารางตรวจสอบความครบถ้วนของข้อมูลรายวัน (ครบ 3 ไฟล์ หรือยังขาดวันไหน) */}
      <Card
        id="completeness-check"
        padding="none"
        className="mt-6 overflow-hidden border-border/90 shadow-sm"
      >
        <div className="border-b border-border/80 bg-gradient-to-b from-muted/35 to-card px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info" className="font-semibold">
                  <IconCalendar size={13} /> ตรวจสอบข้อมูลรายวัน
                </Badge>
                <span className="text-xs font-semibold text-muted-foreground">
                  ประจำเดือน {formatMonthThai(report.month)}
                </span>
              </div>
              <h2 className="mt-1.5 text-base font-extrabold tracking-tight text-foreground sm:text-lg">
                ตารางเช็กสถานะการอัปโหลดรายวัน (ครบ 3 ไฟล์ / ขาดวันไหนบ้าง)
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                ช่วยตรวจสอบทีละวันว่าวันไหนอัปครบทั้ง{" "}
                <strong className="font-semibold text-foreground">
                  (1) ไฟล์ออเดอร์ Shipnity
                </strong>
                ,{" "}
                <strong className="font-semibold text-foreground">
                  (2) ไฟล์สินค้า Shipnity
                </strong>{" "}
                และ{" "}
                <strong className="font-semibold text-foreground">
                  (3) ไฟล์รายได้ TikTok Shop (income_*.xlsx)
                </strong>{" "}
                หรือวันไหนยังตกหล่น
              </p>
            </div>

            {report.availableMonths.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs font-semibold text-muted-foreground">
                  เดือน:
                </span>
                {report.availableMonths.map((ym) => {
                  const active = ym === report.month;
                  return (
                    <Button
                      key={ym}
                      asChild
                      size="sm"
                      variant={active ? "default" : "outline"}
                      className="min-h-10"
                    >
                      <Link href={buildHref({ month: ym })}>
                        {formatMonthThai(ym)}
                      </Link>
                    </Button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* การ์ดสรุปภาพรวม 4 ใบ */}
          <div className="mt-4 grid grid-cols-1 gap-2.5 min-[520px]:grid-cols-2 min-[960px]:grid-cols-4">
            <div className="rounded-xl border border-border/80 bg-card px-3.5 py-3 shadow-xs">
              <div className="text-xs font-semibold text-muted-foreground">
                จำนวนวันทั้งหมดในเดือนนี้
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-xl font-extrabold tabular-nums text-foreground">
                  {formatNumber(report.summary.totalDays)} วัน
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  {formatNumber(report.summary.totalNormalOrders)} บิลขายปกติ
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-3.5 py-3 shadow-xs">
              <div className="flex items-center justify-between gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <span>วันที่ครบ 3 ไฟล์ 100%</span>
                <IconCheckCircle size={15} />
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {formatNumber(report.summary.completeDays)} วัน
                </span>
                <span className="text-xs font-semibold tabular-nums text-emerald-700/85 dark:text-emerald-300/85">
                  ครบ {formatNumber(report.summary.totalCompleteOrders)} บิล
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/35 bg-amber-500/[0.07] px-3.5 py-3 shadow-xs">
              <div className="flex items-center justify-between gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
                <span>วันที่ยังขาดไฟล์ / รอโอน</span>
                <IconAlert size={15} />
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-xl font-extrabold tabular-nums text-amber-800 dark:text-amber-300">
                  {formatNumber(report.summary.incompleteDays)} วัน
                </span>
                <span className="text-xs font-semibold tabular-nums text-amber-800/85 dark:text-amber-300/85">
                  ขาดไฟล์ Shipnity{" "}
                  {formatNumber(
                    report.summary.totalMissingFile1 +
                      report.summary.totalMissingFile2,
                  )}{" "}
                  บิล
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-3.5 py-3 shadow-xs">
              <div className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                รอไฟล์รายได้ TikTok (income_*.xlsx)
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-xl font-extrabold tabular-nums text-rose-700 dark:text-rose-300">
                  {formatNumber(report.summary.totalMissingFile3)} บิล
                </span>
                <Link
                  href="/bills?link=oms_only"
                  className="text-xs font-bold text-rose-700 underline underline-offset-2 hover:opacity-80 dark:text-rose-300"
                >
                  ดูรายการที่ขาด →
                </Link>
              </div>
            </div>
          </div>

          {/* แถบสลับโหมดวันที่ + ตัวกรองสถานะ */}
          <div className="mt-3.5 flex flex-col gap-2.5 border-t border-border/60 pt-3 min-[860px]:flex-row min-[860px]:items-center min-[860px]:justify-between">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
              <span className="text-xs font-semibold text-muted-foreground">
                มุมมองวันที่:
              </span>
              <div className="grid grid-cols-1 gap-1.5 min-[460px]:grid-cols-2">
                <Button
                  asChild
                  size="sm"
                  variant={report.mode === "created" ? "default" : "outline"}
                  className="min-h-10 justify-center"
                >
                  <Link href={buildHref({ mode: "created" })}>
                    ตามวันสั่งซื้อ (เช็กง่ายครบทุกวัน)
                  </Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant={report.mode === "paid" ? "default" : "outline"}
                  className="min-h-10 justify-center"
                >
                  <Link href={buildHref({ mode: "paid" })}>
                    ตามวันโอนเงิน (Paid Date)
                  </Link>
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
              <span className="text-xs font-semibold text-muted-foreground">
                แสดงเฉพาะ:
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <Button
                  asChild
                  size="sm"
                  variant={statusFilter === "all" ? "default" : "outline"}
                  className="min-h-10 justify-center px-2.5"
                >
                  <Link href={buildHref({ filter: "all" })}>
                    ทั้งหมด ({formatNumber(report.summary.totalDays)})
                  </Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant={
                    statusFilter === "incomplete" ? "default" : "outline"
                  }
                  className="min-h-10 justify-center px-2.5"
                >
                  <Link href={buildHref({ filter: "incomplete" })}>
                    ยังขาดไฟล์ ({formatNumber(report.summary.incompleteDays)})
                  </Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant={statusFilter === "complete" ? "default" : "outline"}
                  className="min-h-10 justify-center px-2.5"
                >
                  <Link href={buildHref({ filter: "complete" })}>
                    ครบ 3 ไฟล์ ({formatNumber(report.summary.completeDays)})
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ตารางแสดงสถานะรายวัน */}
        {filteredRows.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            ไม่พบรายการวันที่ตรงกับตัวกรองที่เลือก
          </div>
        ) : (
          <Table variant="stack">
            <TableHeader className="min-[768px]:sticky min-[768px]:top-[61px] min-[768px]:z-20 min-[1100px]:top-0 bg-muted/90 backdrop-blur-xs">
              <TableRow>
                <TableHead className="whitespace-normal">
                  {report.mode === "paid"
                    ? "วันที่โอนเงิน"
                    : "วันที่สั่งซื้อ"}
                </TableHead>
                <TableHead className="text-right whitespace-normal">
                  บิลปกติ
                </TableHead>
                <TableHead className="text-center whitespace-normal">
                  ไฟล์ 1: ออเดอร์ Shipnity
                </TableHead>
                <TableHead className="text-center whitespace-normal">
                  ไฟล์ 2: สินค้า Shipnity
                </TableHead>
                <TableHead className="text-center whitespace-normal">
                  ไฟล์ 3: รายได้ TikTok
                </TableHead>
                <TableHead className="whitespace-normal">
                  สรุปสิ่งที่ยังขาด / ต้องอัปเพิ่ม
                </TableHead>
                <TableHead className="text-right whitespace-normal">
                  ดูบิล
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => {
                const isEmptyDay = row.normalOrders === 0;
                const file3DoneCount = Math.max(
                  0,
                  row.normalOrders - row.missingFile3Count,
                );
                const missingDescriptions: string[] = [];
                if (isEmptyDay) {
                  missingDescriptions.push(
                    "ไม่มีรายการออเดอร์ในวันนี้ (ยังไม่ได้อัปโหลดทั้ง 3 ไฟล์ หรือไม่มีคำสั่งซื้อ)",
                  );
                } else {
                  if (row.missingFile1Count > 0) {
                    missingDescriptions.push(
                      `ขาดไฟล์ 1 ออเดอร์ Shipnity (${formatNumber(row.missingFile1Count)} บิล)`,
                    );
                  }
                  if (row.missingFile2Count > 0) {
                    missingDescriptions.push(
                      `ขาดไฟล์ 2 สินค้า Shipnity (${formatNumber(row.missingFile2Count)} บิล)`,
                    );
                  }
                  if (row.missingFile3Count > 0) {
                    if (file3DoneCount === 0) {
                      missingDescriptions.push(
                        `ยังไม่อัปไฟล์รายได้ TikTok (${formatNumber(row.missingFile3Count)} บิล)`,
                      );
                    } else {
                      missingDescriptions.push(
                        `อัปรายได้ TikTok แล้ว ${formatNumber(file3DoneCount)} บิล · รอรอบโอนถัดไปอีก ${formatNumber(row.missingFile3Count)} บิล`,
                      );
                    }
                  }
                }

                const inspectHref =
                  report.mode === "paid"
                    ? `/days/${row.date}`
                    : `/bills?q=${encodeURIComponent(row.date)}`;

                return (
                  <TableRow
                    key={row.date}
                    className={
                      row.isComplete
                        ? "bg-emerald-500/[0.03]"
                        : isEmptyDay
                          ? "bg-muted/25"
                          : ""
                    }
                  >
                    <TableCell
                      data-label={
                        report.mode === "paid"
                          ? "วันที่โอนเงิน"
                          : "วันที่สั่งซื้อ"
                      }
                      className="font-bold text-foreground"
                    >
                      <div>{formatDateLong(row.date)}</div>
                      <div className="mono text-[11px] font-normal text-muted-foreground">
                        {formatDate(row.date)}
                      </div>
                    </TableCell>

                    <TableCell
                      data-label="บิลขายปกติ"
                      className="text-right font-bold tabular-nums text-foreground"
                    >
                      {formatNumber(row.normalOrders)} บิล
                    </TableCell>

                    <TableCell
                      data-label="ไฟล์ 1: ออเดอร์ Shipnity"
                      className="text-center"
                    >
                      {isEmptyDay ? (
                        <Badge variant="neutral">ยังไม่มีข้อมูล</Badge>
                      ) : row.missingFile1Count === 0 ? (
                        <Badge variant="success">
                          ✓ ครบ ({formatNumber(row.normalOrders)})
                        </Badge>
                      ) : (
                        <Badge variant="danger">
                          ขาด {formatNumber(row.missingFile1Count)} บิล
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell
                      data-label="ไฟล์ 2: สินค้า Shipnity"
                      className="text-center"
                    >
                      {isEmptyDay ? (
                        <Badge variant="neutral">ยังไม่มีข้อมูล</Badge>
                      ) : row.missingFile1Count === 0 &&
                        row.missingFile2Count === 0 ? (
                        <Badge variant="success">
                          ✓ ครบ ({formatNumber(row.normalOrders)})
                        </Badge>
                      ) : (
                        <Badge variant="warning">
                          ขาด{" "}
                          {formatNumber(
                            row.missingFile1Count + row.missingFile2Count,
                          )}{" "}
                          บิล
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell
                      data-label="ไฟล์ 3: รายได้ TikTok"
                      className="text-center"
                    >
                      {isEmptyDay ? (
                        <Badge variant="neutral">ยังไม่มีข้อมูล</Badge>
                      ) : row.missingFile3Count === 0 ? (
                        <Badge variant="success">
                          ✓ ครบ ({formatNumber(row.normalOrders)})
                        </Badge>
                      ) : file3DoneCount === 0 ? (
                        <Badge variant="danger">
                          ยังไม่อัป ({formatNumber(row.missingFile3Count)} บิล)
                        </Badge>
                      ) : (
                        <Badge variant="warning">
                          อัปแล้ว {formatNumber(file3DoneCount)} · รอโอน{" "}
                          {formatNumber(row.missingFile3Count)}
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell data-label="สรุปสิ่งที่ยังขาด">
                      {row.isComplete ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                          <IconCheckCircle size={14} /> ครบทั้ง 3 ไฟล์ 100%
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                          {missingDescriptions.join(" · ")}
                        </span>
                      )}
                    </TableCell>

                    <TableCell data-label="ดูบิล" className="text-right">
                      {isEmptyDay ? (
                        <span className="text-xs text-muted-foreground">-</span>
                      ) : (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="min-h-9"
                        >
                          <Link href={inspectHref}>ดูบิลวันนี้</Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-extrabold">
                  รวม ({formatNumber(filteredRows.length)} วัน)
                </TableCell>
                <TableCell className="text-right font-extrabold tabular-nums">
                  {formatNumber(
                    filteredRows.reduce((s, r) => s + r.normalOrders, 0),
                  )}{" "}
                  บิล
                </TableCell>
                <TableCell className="text-center font-bold">
                  ขาด{" "}
                  {formatNumber(
                    filteredRows.reduce((s, r) => s + r.missingFile1Count, 0),
                  )}{" "}
                  บิล
                </TableCell>
                <TableCell className="text-center font-bold">
                  ขาด{" "}
                  {formatNumber(
                    filteredRows.reduce((s, r) => s + r.missingFile2Count, 0),
                  )}{" "}
                  บิล
                </TableCell>
                <TableCell className="text-center font-bold">
                  รอไฟล์รายได้{" "}
                  {formatNumber(
                    filteredRows.reduce((s, r) => s + r.missingFile3Count, 0),
                  )}{" "}
                  บิล
                </TableCell>
                <TableCell colSpan={2} className="text-right font-extrabold">
                  ครบสมบูรณ์{" "}
                  {formatNumber(
                    filteredRows.reduce((s, r) => s + r.completeCount, 0),
                  )}{" "}
                  บิล
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </Card>
    </>
  );
}
