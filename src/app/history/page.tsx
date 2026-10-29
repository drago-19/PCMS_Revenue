import Link from "next/link";
import { DatePickerField } from "@/components/DatePickerField";
import { ClearAllImportsButton } from "@/components/DeleteImportButton";
import { ExcelFilePreviewDialog } from "@/components/ExcelPreviewDialog";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/PageHeader";
import { PaginationBar } from "@/components/PaginationBar";
import {
  IconCalendar,
  IconCheckCircle,
  IconFile,
  IconHistory,
  IconReceipt,
  IconUpload,
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
import { formatDate, formatDateTime, formatFileSize } from "@/lib/format";
import { getOverallStats, listDailyBatches, listImportsPaged } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "ประวัติการนำเข้าไฟล์" };

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

export default async function ImportHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; date?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const date = (params.date ?? "").trim();

  const [stats, result, allBatches] = await Promise.all([
    getOverallStats(),
    listImportsPaged({ page, pageSize: 20, date: date || undefined }),
    listDailyBatches(1000),
  ]);

  const availableDates = allBatches.map((b) => ({
    date: b.date,
    count: b.orderCount,
  }));

  const isFilteredByDate = Boolean(date);
  const datePeriodLabel = isFilteredByDate
    ? /^\d{4}-\d{2}$/.test(date)
      ? `เดือน ${formatYearMonthLabel(date)}`
      : /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? `วันที่ ${formatDate(date)}`
        : `ช่วง "${date}"`
    : "";

  const warningCount = result.rows.filter((item) => item.status === "warning").length;

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="TikTok Shop · Import History"
        title="หมวดประวัติการนำเข้าไฟล์"
        description="ตรวจสอบไฟล์ Excel ที่นำเข้าทั้งหมด ดูรายงานการจับคู่คอลัมน์ ผลตรวจยอดกับชีตสรุป หรือลบการนำเข้า"
        actions={
          <>
            <ClearAllImportsButton totalFiles={result.total} />
            <Button asChild variant="default">
              <Link href="/import">
                <IconUpload size={17} /> อัปโหลดไฟล์รายได้ใหม่
              </Link>
            </Button>
          </>
        }
      />

      <div className="stats">
        <StatCard
          label={isFilteredByDate ? "ไฟล์ในช่วงที่เลือก" : "ไฟล์ที่นำเข้าทั้งหมด"}
          value={`${result.total.toLocaleString("th-TH")} ไฟล์`}
          hint={
            isFilteredByDate
              ? `เฉพาะ${datePeriodLabel}`
              : "รวมทั้งหมด (แสดงหน้าละ 20 ไฟล์)"
          }
          tone="brand"
          icon={<IconHistory size={19} />}
        />
        <StatCard
          label={isFilteredByDate ? "บิลจากไฟล์ในช่วงที่เลือก" : "บิลคำสั่งซื้อสะสม"}
          value={`${(isFilteredByDate ? result.totals.orderCount : stats.orderCount).toLocaleString("th-TH")} ใบ`}
          hint={
            isFilteredByDate
              ? `เฉพาะไฟล์ของ${datePeriodLabel}`
              : "สร้างจากไฟล์ที่นำเข้าทั้งหมด"
          }
          tone="positive"
          icon={<IconReceipt size={19} />}
        />
        <StatCard
          label="รอบชำระล่าสุด"
          value={
            isFilteredByDate
              ? result.totals.latestPaidDate
                ? formatDate(result.totals.latestPaidDate)
                : "-"
              : stats.latestPaidDate
                ? formatDate(stats.latestPaidDate)
                : "-"
          }
          hint={
            isFilteredByDate
              ? `รอบชำระล่าสุดใน${datePeriodLabel}`
              : "วันที่ชำระเงินล่าสุดในระบบ"
          }
          tone="default"
          icon={<IconCalendar size={19} />}
        />
        <StatCard
          label="สถานะในหน้านี้"
          value={warningCount === 0 ? "ปกติทุกไฟล์" : `มีคำเตือน ${warningCount} ไฟล์`}
          hint="คลิกปุ่มรายงานเพื่อดูรายละเอียดและลบไฟล์"
          tone={warningCount === 0 ? "positive" : "default"}
          icon={<IconCheckCircle size={19} />}
        />
      </div>

      <Card className="workspace-table-card">
        <div className="shrink-0 rounded-t-2xl border-b border-border bg-[#f8fafc] px-4 py-3 min-[640px]:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-foreground sm:text-base">
                ตารางประวัติไฟล์ Excel ที่นำเข้า (Import Registry)
              </h2>
              <p className="text-xs text-muted-foreground">
                คลิกที่ชื่อไฟล์หรือปุ่ม &ldquo;เปิดอ่าน Excel&rdquo; เพื่อดูตารางข้อมูลทุกแถว-คอลัมน์เหมือนเปิดในโปรแกรม Excel
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DatePickerField
                name="date"
                defaultValue={date}
                placeholder="ทุกรอบชำระ (เลือกเดือน/วัน)"
                availableDates={availableDates}
                basePath="/history"
              />
              {date ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/history" scroll={false}>
                    ล้างตัวกรอง
                  </Link>
                </Button>
              ) : null}
              <span className="text-xs text-muted-foreground">
                ทั้งหมด <strong>{result.total.toLocaleString("th-TH")}</strong> ไฟล์
              </span>
            </div>
          </div>
        </div>

        {result.rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<IconFile size={28} />}
              title="ยังไม่มีประวัติการนำเข้าไฟล์"
              description="เริ่มต้นด้วยการอัปโหลดไฟล์ Excel รายได้จาก TikTok Shop ระบบจะแสดงประวัติและรายงานการตรวจยอดที่นี่"
              action={
                <Button asChild variant="default">
                  <Link href="/import">
                    <IconUpload size={17} /> ไปหน้าอัปโหลดไฟล์
                  </Link>
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <Table variant="stack">
              <TableHeader>
                <TableRow>
                  <TableHead>ไฟล์ที่นำเข้า</TableHead>
                  <TableHead className="min-[768px]:max-[1439px]:hidden">
                    นำเข้าเมื่อ
                  </TableHead>
                  <TableHead>รอบชำระ</TableHead>
                  <TableHead className="num min-[768px]:max-[1099px]:hidden">
                    จำนวนแถว
                  </TableHead>
                  <TableHead className="num">จำนวนบิล</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="num">การจัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell data-label="ไฟล์ที่นำเข้า">
                      <div className="flex flex-col gap-1">
                        <ExcelFilePreviewDialog
                          importId={item.id}
                          filename={item.filename}
                          fileType={item.fileType}
                          rowCount={item.rowCount}
                          triggerVariant="filename"
                        />
                        <span className="file-meta flex flex-wrap items-center gap-1.5 text-xs text-[#475569]">
                          <Badge
                            variant={
                              item.fileType === "oms_orders"
                                ? "info"
                                : item.fileType === "oms_items"
                                  ? "warning"
                                  : "default"
                            }
                            size="sm"
                          >
                            {item.fileType === "oms_orders"
                              ? "1. ออเดอร์ใน shipnity"
                              : item.fileType === "oms_items"
                                ? "3. สินค้าในออเดอร์ shipnity"
                                : "2. รายได้ TikTok"}
                          </Badge>
                          <span className="font-medium text-[#64748b]">
                            {formatFileSize(item.fileSize)} ·{" "}
                            {item.source === "cli" ? "CLI" : "อัปโหลดผ่านเว็บ"}
                          </span>
                          <span className="hidden text-[#64748b] min-[768px]:max-[1439px]:inline">
                            · {formatDateTime(item.importedAt)}
                          </span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell
                      data-label="นำเข้าเมื่อ"
                      className="whitespace-nowrap font-medium text-[#334155] min-[768px]:max-[1439px]:hidden"
                    >
                      {formatDateTime(item.importedAt)}
                    </TableCell>
                    <TableCell
                      data-label="รอบชำระ"
                      className="whitespace-nowrap"
                    >
                      {item.periodStart ? (
                        <span className="mono inline-flex items-center rounded-md border border-[#cbd5e1] bg-[#f8fafc] px-2 py-0.5 text-xs font-semibold text-[#1e293b]">
                          {item.periodStart === item.periodEnd
                            ? formatDate(item.periodStart)
                            : `${formatDate(item.periodStart)} – ${formatDate(
                                item.periodEnd ?? item.periodStart,
                              )}`}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell
                      data-label="จำนวนแถว"
                      className="num font-medium text-[#334155] min-[768px]:max-[1099px]:hidden"
                    >
                      {item.rowCount.toLocaleString("th-TH")}
                    </TableCell>
                    <TableCell
                      data-label="จำนวนบิล"
                      className="num payout-col font-extrabold text-[#0f172a]"
                    >
                      {item.orderCount.toLocaleString("th-TH")} ใบ
                    </TableCell>
                    <TableCell data-label="สถานะ">
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell data-label="การจัดการ" className="num">
                      <span className="inline-flex flex-wrap items-center justify-end gap-1.5 min-[1100px]:flex-nowrap whitespace-nowrap">
                        <ExcelFilePreviewDialog
                          importId={item.id}
                          filename={item.filename}
                          fileType={item.fileType}
                          rowCount={item.rowCount}
                        />
                        {item.periodStart ? (
                          <Button asChild variant="outline" size="xs">
                            <Link href={`/bills?date=${encodeURIComponent(item.periodStart)}`}>
                              ดูบิลรอบนี้
                            </Link>
                          </Button>
                        ) : null}
                        <Button asChild variant="secondary" size="xs">
                          <Link href={`/import/${item.id}`}>รายงาน / ลบ</Link>
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
              unitLabel="ไฟล์"
              basePath="/history"
              extraParams={{ date: date || undefined }}
            />
          </>
        )}
      </Card>
    </div>
  );
}
