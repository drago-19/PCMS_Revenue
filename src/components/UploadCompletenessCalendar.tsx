"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  IconAlert,
  IconCalendar,
  IconCheckCircle,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatDateLong, formatNumber } from "@/lib/format";
import type {
  DailyUploadCompletenessReport,
  DailyUploadCompletenessRow,
} from "@/lib/queries";
import { cn } from "@/lib/utils";

const MONTH_NAMES_SHORT = [
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

const MONTH_NAMES_LONG = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const WEEKDAY_LABELS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

function formatMonthLong(ym: string): string {
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  if (!m) return ym;
  const idx = Number(m[2]) - 1;
  return `${MONTH_NAMES_LONG[idx] ?? m[2]} ${m[1]}`;
}

function getShortDayMissingTags(row: DailyUploadCompletenessRow): string[] {
  if (row.normalOrders === 0) {
    return ["ยังไม่อัปทั้ง 3 ไฟล์"];
  }
  const tags: string[] = [];
  if (row.missingFile1Count > 0) {
    tags.push("ขาดออเดอร์");
  }
  if (row.missingFile1Count + row.missingFile2Count > 0) {
    tags.push("ขาดสินค้า");
  }
  if (row.missingFile3Count > 0) {
    tags.push("ขาดรายได้ TikTok");
  }
  return tags;
}

export function UploadCompletenessCalendar({
  report,
}: {
  report: DailyUploadCompletenessReport;
}) {
  const [selectedDay, setSelectedDay] =
    useState<DailyUploadCompletenessRow | null>(null);
  const [showOnlyIncompleteList, setShowOnlyIncompleteList] = useState(true);

  const calendarCells = useMemo(() => {
    const m = report.month.match(/^(\d{4})-(\d{2})$/);
    const year = m ? Number(m[1]) : report.year;
    const monthNum = m ? Number(m[2]) : 1;
    // Day of week for the 1st of the month (0 = Sunday .. 6 = Saturday)
    const firstWeekday = new Date(Date.UTC(year, monthNum - 1, 1)).getUTCDay();
    const blanksBefore = Array.from({ length: firstWeekday }, (_, i) => i);
    return { blanksBefore, days: report.rows };
  }, [report.month, report.year, report.rows]);

  const incompleteDays = useMemo(
    () => report.rows.filter((r) => !r.isComplete),
    [report.rows],
  );

  const selectedMonthOverview = useMemo(
    () => report.monthsOverview.find((m) => m.month === report.month),
    [report.monthsOverview, report.month],
  );

  const buildMonthHref = (ym: string) => {
    const qs = new URLSearchParams();
    qs.set("month", ym);
    if (report.mode !== "created") qs.set("mode", report.mode);
    return `/import?${qs.toString()}#completeness-check`;
  };

  const buildYearHref = (year: number) => {
    const qs = new URLSearchParams();
    qs.set("year", String(year));
    if (report.mode !== "created") qs.set("mode", report.mode);
    return `/import?${qs.toString()}#completeness-check`;
  };

  return (
    <Card
      id="completeness-check"
      padding="none"
      className="mt-6 overflow-hidden border-border/90 shadow-sm"
    >
      {/* ส่วนหัว + สรุปสั้นเข้าใจง่าย */}
      <div className="border-b border-border/80 bg-gradient-to-b from-muted/35 to-card px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="info" className="font-semibold">
                <IconCalendar size={13} /> ปฏิทินเช็กข้อมูลรายวัน
              </Badge>
              <span className="text-xs font-semibold text-muted-foreground">
                ปี {report.year}
              </span>
            </div>
            <h2 className="mt-1.5 text-base font-extrabold tracking-tight text-foreground sm:text-lg">
              เช็กสถานะข้อมูลปี {report.year}: เดือนไหน / วันไหนยังไม่ครบ และขาดไฟล์อะไร
            </h2>
          </div>

          {/* คำอธิบายสี (เขียว = ครบ / แดง = ยังไม่ครบ) */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-emerald-800 dark:text-emerald-300">
              <span className="size-2.5 rounded-full bg-emerald-500" />
              สีเขียว = ข้อมูลครบ 3 ไฟล์
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-rose-800 dark:text-rose-300">
              <span className="size-2.5 rounded-full bg-rose-500" />
              สีแดง = ข้อมูลยังไม่ครบ
            </span>
          </div>
        </div>

        {/* แถบเลือกปี (มีปุ่มเลื่อนปีก่อนหน้า / ปีถัดไป และปุ่มปีที่มีข้อมูล) */}
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
          <span className="mr-1 text-xs font-bold text-muted-foreground">
            เลือกปี:
          </span>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="min-h-10 px-2.5 font-bold"
          >
            <Link
              href={buildYearHref(report.year - 1)}
              aria-label={`ดูปี ${report.year - 1}`}
            >
              ‹ {report.year - 1}
            </Link>
          </Button>

          {report.availableYears.map((y) => {
            const active = y === report.year;
            return (
              <Button
                key={y}
                asChild
                size="sm"
                variant={active ? "default" : "outline"}
                className="min-h-10 px-3 font-extrabold"
              >
                <Link href={buildYearHref(y)}>ปี {y}</Link>
              </Button>
            );
          })}

          <Button
            asChild
            size="sm"
            variant="outline"
            className="min-h-10 px-2.5 font-bold"
          >
            <Link
              href={buildYearHref(report.year + 1)}
              aria-label={`ดูปี ${report.year + 1}`}
            >
              {report.year + 1} ›
            </Link>
          </Button>
        </div>

        {/* ขั้นที่ 1: เลือกเดือนของปีนี้ (แสดงสีเขียว/แดงชัดเจนว่าเดือนไหนครบหรือขาดอะไร) */}
        <div className="mt-4">
          <div className="mb-2 text-xs font-bold text-muted-foreground">
            1. เลือกเดือนในปี {report.year} (คลิกที่เดือนเพื่อดูปฏิทินรายวัน):
          </div>
          <div className="grid grid-cols-2 gap-2 min-[520px]:grid-cols-3 min-[860px]:grid-cols-5">
            {report.monthsOverview.map((m) => {
              const isSelected = m.month === report.month;
              const isMonthComplete = m.status === "complete";
              const shortMissing: string[] = [];
              if (m.totalNormalOrders === 0) {
                shortMissing.push("ยังไม่อัปทั้ง 3 ไฟล์");
              } else {
                if (m.missingFile1 > 0) shortMissing.push("ขาดออเดอร์");
                if (m.missingFile1 + m.missingFile2 > 0)
                  shortMissing.push("ขาดสินค้า");
                if (m.missingFile3 > 0) shortMissing.push("ขาดรายได้ TikTok");
                if (shortMissing.length === 0 && m.emptyDays > 0) {
                  shortMissing.push(
                    `ยังไม่อัป ${m.emptyDays} วัน (ครบแล้ว ${m.completeDays} วัน)`,
                  );
                }
              }

              return (
                <Link
                  key={m.month}
                  href={buildMonthHref(m.month)}
                  className={cn(
                    "group flex min-h-[72px] flex-col justify-between rounded-xl border p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isMonthComplete
                      ? "border-emerald-500/45 bg-emerald-500/[0.08] hover:bg-emerald-500/[0.14]"
                      : "border-rose-500/40 bg-rose-500/[0.07] hover:bg-rose-500/[0.13]",
                    isSelected &&
                      "ring-2 ring-foreground ring-offset-2 ring-offset-background shadow-sm",
                  )}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-sm font-extrabold text-foreground">
                      {MONTH_NAMES_SHORT[m.monthIndex - 1]} {report.year}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-extrabold",
                        isMonthComplete
                          ? "bg-emerald-600 text-white"
                          : "bg-rose-600 text-white",
                      )}
                    >
                      {isMonthComplete
                        ? "✓ ครบ"
                        : `ขาด ${m.incompleteDays} วัน`}
                    </span>
                  </div>

                  <div className="mt-1.5 text-[11px] leading-snug">
                    {isMonthComplete ? (
                      <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                        ครบทุกวัน ({formatNumber(m.completeDays)} วัน)
                      </span>
                    ) : (
                      <span className="font-semibold text-rose-800 dark:text-rose-300">
                        {shortMissing.join(" · ")}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ขั้นที่ 2: ปฏิทินรายวันของเดือนที่เลือก */}
      <div className="p-4 sm:p-6">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-extrabold text-foreground sm:text-lg">
              2. ปฏิทินเดือน{formatMonthLong(report.month)}
            </h3>
            <p className="text-xs text-muted-foreground">
              ครบ 3 ไฟล์แล้ว{" "}
              <strong className="font-bold text-emerald-700 dark:text-emerald-300">
                {formatNumber(report.summary.completeDays)} วัน
              </strong>{" "}
              · ยังไม่ครบ{" "}
              <strong className="font-bold text-rose-700 dark:text-rose-300">
                {formatNumber(report.summary.incompleteDays)} วัน
              </strong>{" "}
              (แตะที่ช่องวันที่เพื่อดูรายละเอียด)
            </p>
          </div>

          {selectedMonthOverview && !selectedMonthOverview.completeDays && selectedMonthOverview.totalNormalOrders === 0 ? (
            <Badge variant="danger">เดือนนี้ยังไม่ได้อัปโหลดทั้ง 3 ไฟล์</Badge>
          ) : null}
        </div>

        {/* หัวตารางวันในสัปดาห์ (ซ่อนบนมือถือเล็กที่แสดงเป็น Grid 2 คอลัมน์, แสดงบนจอ >= 640px ที่เป็นปฏิทิน 7 ช่อง) */}
        <div className="hidden min-[640px]:grid min-[640px]:grid-cols-7 min-[640px]:gap-2 min-[640px]:pb-2">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="text-center text-xs font-extrabold text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        {/* ตารางช่องปฏิทินรายวัน */}
        <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3 min-[640px]:grid-cols-7">
          {calendarCells.blanksBefore.map((idx) => (
            <div
              key={`blank-${idx}`}
              aria-hidden="true"
              className="hidden min-[640px]:block min-[640px]:min-h-[96px] min-[640px]:rounded-xl min-[640px]:border min-[640px]:border-dashed min-[640px]:border-border/50 min-[640px]:bg-muted/15"
            />
          ))}

          {calendarCells.days.map((row) => {
            const dayNum = Number(row.date.slice(8, 10));
            const weekdayIdx = new Date(`${row.date}T00:00:00Z`).getUTCDay();
            const weekdayName = WEEKDAY_LABELS[weekdayIdx] ?? "";
            const missingTags = getShortDayMissingTags(row);

            return (
              <button
                key={row.date}
                type="button"
                onClick={() => setSelectedDay(row)}
                className={cn(
                  "group flex min-h-[94px] flex-col justify-between rounded-xl border p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  row.isComplete
                    ? "border-emerald-500/50 bg-emerald-500/[0.10] hover:bg-emerald-500/[0.18]"
                    : "border-rose-500/50 bg-rose-500/[0.09] hover:bg-rose-500/[0.16]",
                )}
              >
                {/* แถวบน: เลขวันที่ + ป้ายสถานะสีเขียว/แดง */}
                <div className="flex w-full items-center justify-between gap-1">
                  <span className="inline-flex items-baseline gap-1">
                    <span className="text-base font-extrabold tabular-nums text-foreground">
                      {dayNum}
                    </span>
                    <span className="text-[11px] font-semibold text-muted-foreground min-[640px]:hidden">
                      ({weekdayName})
                    </span>
                  </span>

                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-extrabold leading-none",
                      row.isComplete
                        ? "bg-emerald-600 text-white"
                        : "bg-rose-600 text-white",
                    )}
                  >
                    {row.isComplete
                      ? row.normalOrders === 0
                        ? "✓ ไม่มีบิล"
                        : "✓ ครบ"
                      : "ไม่ครบ"}
                  </span>
                </div>

                {/* แถวล่าง: บอกชัดๆ ว่าครบหรือขาดอะไร */}
                <div className="mt-2 w-full">
                  {row.isComplete ? (
                    <div className="text-[11px] font-bold leading-tight text-emerald-800 dark:text-emerald-300">
                      {row.normalOrders === 0
                        ? "ไม่มีคำสั่งซื้อ (0 บิล)"
                        : row.shopeeOrders > 0 && row.tiktokOrders === 0
                          ? `ครบ 2 ไฟล์ Shopee (${formatNumber(row.normalOrders)} บิล)`
                          : `ครบ 3 ไฟล์ (${formatNumber(row.normalOrders)} บิล)`}
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {missingTags.map((tag) => (
                        <div
                          key={tag}
                          className="text-[11px] font-bold leading-tight text-rose-800 dark:text-rose-300"
                        >
                          • {tag}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* ขั้นที่ 3: สรุปเฉพาะวันที่ยังไม่ครบในเดือนนี้ (สั้น กระชับ อ่านง่าย) */}
        <div className="mt-5 rounded-xl border border-border/80 bg-muted/20 p-3.5 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {incompleteDays.length === 0 ? (
                <IconCheckCircle size={18} className="text-emerald-600" />
              ) : (
                <IconAlert size={18} className="text-rose-600" />
              )}
              <h4 className="text-sm font-extrabold text-foreground">
                3. สรุปวันที่ข้อมูลยังไม่ครบในเดือน{formatMonthLong(report.month)} (
                {formatNumber(incompleteDays.length)} วัน)
              </h4>
            </div>

            {incompleteDays.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowOnlyIncompleteList((v) => !v)}
                className="min-h-10 self-start sm:self-auto"
              >
                {showOnlyIncompleteList
                  ? "ซ่อนรายการวันไม่ครบ"
                  : `แสดงรายการวันไม่ครบ (${formatNumber(incompleteDays.length)} วัน)`}
              </Button>
            ) : null}
          </div>

          {incompleteDays.length === 0 ? (
            <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              ข้อมูลในเดือนนี้ครบถ้วนทุกวันแล้ว
            </p>
          ) : showOnlyIncompleteList ? (
            <div className="mt-3 grid grid-cols-1 gap-2 min-[640px]:grid-cols-2 min-[1024px]:grid-cols-3">
              {incompleteDays.map((row) => {
                const missingParts: string[] = [];
                if (row.normalOrders === 0) {
                  missingParts.push("ยังไม่อัปทั้ง 3 ไฟล์");
                } else {
                  if (row.missingFile1Count > 0) {
                    missingParts.push(
                      `ขาดไฟล์ออเดอร์ Shipnity (${formatNumber(row.missingFile1Count)} บิล)`,
                    );
                  }
                  if (row.missingFile1Count + row.missingFile2Count > 0) {
                    missingParts.push(
                      `ขาดไฟล์สินค้า Shipnity (${formatNumber(row.missingFile1Count + row.missingFile2Count)} บิล)`,
                    );
                  }
                  if (row.missingFile3Count > 0) {
                    missingParts.push(
                      `ขาดไฟล์รายได้ TikTok (${formatNumber(row.missingFile3Count)} บิล TikTok)`,
                    );
                  }
                }

                return (
                  <button
                    key={`missing-${row.date}`}
                    type="button"
                    onClick={() => setSelectedDay(row)}
                    className="flex min-h-11 items-start justify-between gap-2 rounded-lg border border-rose-500/30 bg-card px-3 py-2 text-left transition-colors hover:bg-rose-500/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-foreground">
                        {formatDateLong(row.date)}
                      </div>
                      <div className="mt-0.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
                        {missingParts.join(" · ")}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-md bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300">
                      ดู
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {/* ป๊อปอัปแสดงรายละเอียดของวันที่คลิกเลือก */}
      <Dialog
        open={Boolean(selectedDay)}
        onOpenChange={(open) => {
          if (!open) setSelectedDay(null);
        }}
      >
        {selectedDay ? (
          <DialogContent className="max-w-md">
            <DialogHeader className="pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={selectedDay.isComplete ? "success" : "danger"}
                >
                  {selectedDay.isComplete
                    ? selectedDay.normalOrders === 0
                      ? "✓ ไม่มีคำสั่งซื้อในวันนี้ (0 บิล)"
                      : "✓ ข้อมูลครบถ้วน"
                    : "✕ ข้อมูลยังไม่ครบ"}
                </Badge>
                <span className="mono text-xs text-muted-foreground">
                  {formatDate(selectedDay.date)}
                </span>
              </div>
              <DialogTitle className="mt-1 text-lg font-extrabold">
                วันที่ {formatDateLong(selectedDay.date)}
              </DialogTitle>
              <DialogDescription>
                {selectedDay.normalOrders === 0
                  ? selectedDay.isComplete
                    ? "วันนี้ไม่มีรายการคำสั่งซื้อในระบบ (0 บิล)"
                    : "ยังไม่มีข้อมูลคำสั่งซื้อในวันนี้ (0 บิล)"
                  : `บิลขายปกติทั้งหมด ${formatNumber(selectedDay.normalOrders)} บิล (TikTok ${formatNumber(selectedDay.tiktokOrders)} บิล · Shopee ${formatNumber(selectedDay.shopeeOrders)} บิล)`}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 space-y-2.5">
              {/* ไฟล์ 1 */}
              <div
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5",
                  selectedDay.hasFile1
                    ? "border-emerald-500/40 bg-emerald-500/[0.08]"
                    : "border-rose-500/40 bg-rose-500/[0.08]",
                )}
              >
                <span className="text-xs font-bold text-foreground">
                  1. ไฟล์ออเดอร์ Shipnity (TikTok & Shopee)
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs font-extrabold",
                    selectedDay.hasFile1
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-rose-700 dark:text-rose-300",
                  )}
                >
                  {selectedDay.normalOrders === 0
                    ? selectedDay.isComplete
                      ? "✓ ไม่มีคำสั่งซื้อ (0 บิล)"
                      : "ยังไม่อัปโหลด"
                    : selectedDay.hasFile1
                      ? `✓ ครบ (${formatNumber(selectedDay.normalOrders - selectedDay.missingFile1Count)} บิล)`
                      : `✕ ขาด ${formatNumber(selectedDay.missingFile1Count)} บิล`}
                </span>
              </div>

              {/* ไฟล์ 2 */}
              <div
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5",
                  selectedDay.hasFile2
                    ? "border-emerald-500/40 bg-emerald-500/[0.08]"
                    : "border-rose-500/40 bg-rose-500/[0.08]",
                )}
              >
                <span className="text-xs font-bold text-foreground">
                  2. ไฟล์สินค้า Shipnity (TikTok & Shopee)
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs font-extrabold",
                    selectedDay.hasFile2
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-rose-700 dark:text-rose-300",
                  )}
                >
                  {selectedDay.normalOrders === 0
                    ? selectedDay.isComplete
                      ? "✓ ไม่มีคำสั่งซื้อ (0 บิล)"
                      : "ยังไม่อัปโหลด"
                    : selectedDay.hasFile2
                      ? `✓ ครบ (${formatNumber(selectedDay.normalOrders - selectedDay.missingFile1Count - selectedDay.missingFile2Count)} บิล)`
                      : `✕ ขาด ${formatNumber(selectedDay.missingFile1Count + selectedDay.missingFile2Count)} บิล`}
                </span>
              </div>

              {/* ไฟล์ 3 */}
              <div
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5",
                  selectedDay.hasFile3
                    ? "border-emerald-500/40 bg-emerald-500/[0.08]"
                    : "border-rose-500/40 bg-rose-500/[0.08]",
                )}
              >
                <span className="text-xs font-bold text-foreground">
                  3. ไฟล์รายได้ TikTok (เฉพาะบิล TikTok)
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs font-extrabold",
                    selectedDay.hasFile3
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-rose-700 dark:text-rose-300",
                  )}
                >
                  {selectedDay.normalOrders === 0
                    ? selectedDay.isComplete
                      ? "✓ ไม่มีคำสั่งซื้อ (0 บิล)"
                      : "ยังไม่อัปโหลด"
                    : selectedDay.tiktokOrders === 0
                      ? `✓ ไม่ต้องใช้ (มีเฉพาะ Shopee ${formatNumber(selectedDay.shopeeOrders)} บิล)`
                      : selectedDay.hasFile3
                        ? `✓ ครบ (TikTok ${formatNumber(selectedDay.tiktokOrders)} บิล)`
                        : `✕ ขาด ${formatNumber(selectedDay.missingFile3Count)} บิล TikTok`}
                </span>
              </div>
            </div>

            {selectedDay.normalOrders > 0 ? (
              <div className="mt-4 flex justify-end gap-2">
                <Button asChild size="sm" variant="default" className="min-h-10">
                  <Link
                    href={
                      report.mode === "paid"
                        ? `/bills?date=${encodeURIComponent(selectedDay.date)}`
                        : `/bills?createdDate=${encodeURIComponent(selectedDay.date)}`
                    }
                  >
                    ดูรายการบิลของวันนี้ →
                  </Link>
                </Button>
              </div>
            ) : null}
          </DialogContent>
        ) : null}
      </Dialog>
    </Card>
  );
}
