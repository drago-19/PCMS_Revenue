import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteImportButton } from "@/components/DeleteImportButton";
import {
  ExcelFilePreviewDialog,
  ExcelSpreadsheetViewer,
} from "@/components/ExcelPreviewDialog";
import {
  MoneyDiffBadge,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/PageHeader";
import {
  IconAlert,
  IconArrowLeft,
  IconCalendar,
  IconCheckCircle,
  IconFile,
  IconReceipt,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDateTime, formatTHB } from "@/lib/format";
import { getImport, getImportSpreadsheetData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "รายงานการนำเข้า" };

const CONFIDENCE_LABEL: Record<string, string> = {
  exact: "ตรง",
  canonical: "ตัดคำโดยประมาณ",
  fuzzy: "ใกล้เคียง",
  unmapped: "ไม่รู้จัก",
};

const CONFIDENCE_VARIANT: Record<
  string,
  "success" | "secondary" | "warning" | "neutral"
> = {
  exact: "success",
  canonical: "secondary",
  fuzzy: "warning",
  unmapped: "neutral",
};

export default async function ImportReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const importId = Number(id);
  if (!Number.isInteger(importId) || importId <= 0) notFound();
  const importRow = await getImport(importId);
  if (!importRow) notFound();

  const resolvedSearchParams = await searchParams;
  const rawTab = resolvedSearchParams.tab ?? "spreadsheet";
  const activeTab: "spreadsheet" | "reconcile" | "mapping" | "details" =
    rawTab === "reconcile" || rawTab === "mapping" || rawTab === "details"
      ? rawTab
      : "spreadsheet";

  const spreadsheetData =
    activeTab === "spreadsheet"
      ? await getImportSpreadsheetData(importId)
      : null;

  const mappedCount = importRow.mapping.filter((entry) => entry.fieldKey).length;
  const totalHeaders = importRow.mapping.filter((entry) => entry.header).length;
  const unknownCols = new Set(importRow.unknownColumns.map((column) => column.col));
  const warnings = importRow.warnings;

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="TikTok Shop · รายงานการนำเข้า"
        title={importRow.filename}
        description={`นำเข้า ${formatDateTime(importRow.importedAt)} · รอบชำระ ${
          importRow.periodStart ? formatDate(importRow.periodStart) : "-"
        }${
          importRow.periodEnd && importRow.periodEnd !== importRow.periodStart
            ? ` – ${formatDate(importRow.periodEnd)}`
            : ""
        } · ชีต: ${importRow.sheetName ?? "-"}`}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/history">
                <IconArrowLeft size={17} /> กลับหมวดประวัติการนำเข้า
              </Link>
            </Button>
            <ExcelFilePreviewDialog
              importId={importRow.id}
              filename={importRow.filename}
              fileType={importRow.fileType}
              rowCount={importRow.rowCount}
              triggerLabel="ขยายเต็มจอ (Excel)"
            />
            {importRow.periodStart ? (
              <Button asChild variant="secondary">
                <Link href={`/days/${importRow.periodStart}`}>
                  <IconCalendar size={16} /> เปิดรอบชำระ
                </Link>
              </Button>
            ) : null}
            <DeleteImportButton
              importId={importRow.id}
              filename={importRow.filename}
              billCount={importRow.orderCount}
            />
          </>
        }
      />

      <div className="stats">
        <StatCard
          label="บิลคำสั่งซื้อที่สร้าง"
          value={importRow.orderCount.toLocaleString("th-TH")}
          hint="เฉพาะประเภทธุรกรรมคำสั่งซื้อ"
          tone="brand"
          icon={<IconReceipt size={19} />}
        />
        <StatCard
          label="แถวข้อมูลที่อ่านได้"
          value={importRow.rowCount.toLocaleString("th-TH")}
          hint="แถวจากชีตรายละเอียด"
          tone="default"
          icon={<IconFile size={19} />}
        />
        <StatCard
          label="รายการธุรกรรมทั้งหมด"
          value={importRow.transactionCount.toLocaleString("th-TH")}
          hint={`รวมรายการอื่น ${Math.max(
            0,
            importRow.transactionCount - importRow.orderCount,
          )} รายการ`}
          tone="default"
          icon={<IconCalendar size={19} />}
        />
        <StatCard
          label="คำเตือนการนำเข้า"
          value={warnings.length.toLocaleString("th-TH")}
          hint={
            warnings.length === 0 ? "ไม่พบปัญหา" : "ดูรายละเอียดในแท็บคำเตือน"
          }
          tone={warnings.length === 0 ? "positive" : "negative"}
          icon={<IconAlert size={19} />}
        />
      </div>

      <Card className="workspace-table-card">
        <div className="shrink-0 border-b border-border bg-[#f8fafc] px-4 py-3 min-[640px]:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-[#cbd5e1] bg-[#e2e8f0] p-1">
              <Button
                asChild
                variant={activeTab === "spreadsheet" ? "default" : "ghost"}
                size="xs"
                className={
                  activeTab === "spreadsheet"
                    ? "shadow-xs"
                    : "text-[#334155] hover:bg-white/70 hover:text-[#0f172a]"
                }
              >
                <Link href={`/import/${importRow.id}?tab=spreadsheet`}>
                  ตารางข้อมูลไฟล์ (Excel)
                </Link>
              </Button>
              <Button
                asChild
                variant={activeTab === "reconcile" ? "default" : "ghost"}
                size="xs"
                className={
                  activeTab === "reconcile"
                    ? "shadow-xs"
                    : "text-[#334155] hover:bg-white/70 hover:text-[#0f172a]"
                }
              >
                <Link href={`/import/${importRow.id}?tab=reconcile`}>
                  ตรวจยอดกับชีตสรุป
                </Link>
              </Button>
              <Button
                asChild
                variant={activeTab === "mapping" ? "default" : "ghost"}
                size="xs"
                className={
                  activeTab === "mapping"
                    ? "shadow-xs"
                    : "text-[#334155] hover:bg-white/70 hover:text-[#0f172a]"
                }
              >
                <Link href={`/import/${importRow.id}?tab=mapping`}>
                  การจับคู่หัวคอลัมน์ ({mappedCount}/{totalHeaders})
                </Link>
              </Button>
              <Button
                asChild
                variant={activeTab === "details" ? "default" : "ghost"}
                size="xs"
                className={
                  activeTab === "details"
                    ? "shadow-xs"
                    : "text-[#334155] hover:bg-white/70 hover:text-[#0f172a]"
                }
              >
                <Link href={`/import/${importRow.id}?tab=details`}>
                  คำเตือน & ข้อมูลไฟล์ ({warnings.length})
                </Link>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={importRow.status} />
              <MoneyDiffBadge matched={importRow.reconciliation.matched} />
            </div>
          </div>
        </div>

        {activeTab === "spreadsheet" && spreadsheetData ? (
          <ExcelSpreadsheetViewer data={spreadsheetData} />
        ) : activeTab === "reconcile" ? (
          <>
            {importRow.reconciliation.reportAvailable ? (
              <Table variant="stack">
                <TableHeader>
                  <TableRow>
                    <TableHead>รายการ</TableHead>
                    <TableHead className="num">จากชีตรายละเอียด</TableHead>
                    <TableHead className="num">จากชีตสรุป</TableHead>
                    <TableHead className="num">ส่วนต่าง</TableHead>
                    <TableHead className="icon-cell" aria-label="ผลตรวจ" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importRow.reconciliation.metrics.map((metric) => (
                    <TableRow key={metric.key}>
                      <TableCell data-label="รายการ">{metric.label}</TableCell>
                      <TableCell data-label="จากชีตรายละเอียด" className="num">
                        {formatTHB(metric.detail)}
                      </TableCell>
                      <TableCell data-label="จากชีตสรุป" className="num">
                        {metric.report === null ? "—" : formatTHB(metric.report)}
                      </TableCell>
                      <TableCell
                        data-label="ส่วนต่าง"
                        className={`num${metric.matched === false ? " danger" : ""}`}
                      >
                        {metric.diff === null ? "—" : formatTHB(metric.diff)}
                      </TableCell>
                      <TableCell data-label="ผลตรวจ" className="icon-cell">
                        {metric.matched === null ? (
                          <span className="muted">—</span>
                        ) : metric.matched ? (
                          <IconCheckCircle size={17} className="ok-icon" />
                        ) : (
                          <IconAlert size={17} className="warn-icon" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="inline-empty">
                <IconAlert size={20} />
                <span>
                  ไม่พบชีตสรุปในไฟล์นี้ ระบบจึงคำนวณยอดจากชีตรายละเอียดเท่านั้น
                </span>
              </div>
            )}
            <CardFooter className="shrink-0 bg-[#f8fafc]">
              <span className="muted small">
                ตรวจสูตรรายบิล:{" "}
                {importRow.reconciliation.orderCheckFailures === 0
                  ? "ผ่านทุกบิล"
                  : `${importRow.reconciliation.orderCheckFailures} บิลไม่ลงตัว`}
              </span>
              {importRow.periodStart ? (
                <Button asChild variant="ghost" size="xs" className="card-link">
                  <Link href={`/days/${importRow.periodStart}`}>
                    ดูรอบชำระ {formatDate(importRow.periodStart)}
                  </Link>
                </Button>
              ) : null}
            </CardFooter>
          </>
        ) : activeTab === "mapping" ? (
          <Table variant="mapping">
            <TableHeader>
              <TableRow>
                <TableHead>หัวคอลัมน์ในไฟล์</TableHead>
                <TableHead>ฟิลด์ที่ระบบใช้</TableHead>
                <TableHead>ความมั่นใจ</TableHead>
                <TableHead className="num">มีค่า</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {importRow.mapping.map((entry) => {
                const unknown = unknownCols.has(entry.col);
                return (
                  <TableRow
                    key={entry.col}
                    className={unknown ? "row-warning" : undefined}
                  >
                    <TableCell className="header-cell">
                      {entry.header || <span className="muted">(คอลัมน์ว่าง)</span>}
                    </TableCell>
                    <TableCell>
                      {entry.label ?? (
                        <span className="muted">
                          {entry.header ? "— ไม่รู้จัก —" : "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={CONFIDENCE_VARIANT[entry.confidence] ?? "neutral"}
                        className={`badge-conf-${entry.confidence}`}
                      >
                        {CONFIDENCE_LABEL[entry.confidence] ?? entry.confidence}
                      </Badge>
                    </TableCell>
                    <TableCell className="num">{entry.nonEmpty}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4 min-[640px]:p-5 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>คำเตือนและข้อสังเกต</CardTitle>
                <span className="muted small">{warnings.length} รายการ</span>
              </CardHeader>
              {warnings.length === 0 ? (
                <div className="inline-empty success">
                  <IconCheckCircle size={20} />
                  <span>ไม่พบคำเตือน — หัวคอลัมน์และยอดเงินตรงตามที่ระบบรู้จัก</span>
                </div>
              ) : (
                <ul className="warning-list">
                  {warnings.map((warning, index) => (
                    <li
                      key={`${warning.code}-${index}`}
                      className={`severity-${warning.severity}`}
                    >
                      <IconAlert size={17} />
                      <div>
                        <strong>{warning.code}</strong>
                        <span>{warning.message}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <div className="grid grid-cols-1 gap-4 min-[980px]:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>คอลัมน์ใหม่ที่ยังไม่รู้จัก</CardTitle>
                  <span className="muted small">
                    {importRow.unknownColumns.length} คอลัมน์
                  </span>
                </CardHeader>
                {importRow.unknownColumns.length === 0 ? (
                  <div className="inline-empty success">
                    <IconCheckCircle size={20} />
                    <span>ไม่มีคอลัมน์ใหม่</span>
                  </div>
                ) : (
                  <Table variant="stack">
                    <TableHeader>
                      <TableRow>
                        <TableHead>คอลัมน์</TableHead>
                        <TableHead className="num">มีค่า</TableHead>
                        <TableHead className="num">ไม่ใช่ศูนย์</TableHead>
                        <TableHead>ตัวอย่าง</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importRow.unknownColumns.map((column) => (
                        <TableRow key={column.col}>
                          <TableCell data-label="คอลัมน์">
                            <strong>{column.header}</strong>
                            {column.moneyLike ? (
                              <Badge variant="warning" size="sm" className="ml-1.5">
                                อาจเป็นเงิน
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell data-label="มีค่า" className="num">
                            {column.nonEmpty}
                          </TableCell>
                          <TableCell data-label="ไม่ใช่ศูนย์" className="num">
                            {column.nonZeroNumeric}
                          </TableCell>
                          <TableCell data-label="ตัวอย่าง" className="muted small">
                            {column.samples.length > 0
                              ? column.samples.join(", ")
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>

              <Card padding="padded" className="card-pad">
                <h2 className="card-title">ข้อมูลไฟล์ต้นฉบับ</h2>
                <dl className="info-list">
                  <div>
                    <dt>ชื่อไฟล์</dt>
                    <dd className="break-all">{importRow.filename}</dd>
                  </div>
                  <div>
                    <dt>นำเข้าเมื่อ</dt>
                    <dd>{formatDateTime(importRow.importedAt)}</dd>
                  </div>
                  <div>
                    <dt>แหล่งที่มา</dt>
                    <dd>
                      {importRow.source === "cli"
                        ? "คำสั่ง CLI"
                        : "อัปโหลดผ่านหน้าเว็บ"}
                    </dd>
                  </div>
                  <div>
                    <dt>ชีตข้อมูล</dt>
                    <dd>{importRow.sheetName ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>ชีตสรุป</dt>
                    <dd>{importRow.report.sheetName ?? "ไม่พบ"}</dd>
                  </div>
                  <div>
                    <dt>เขตเวลา / สกุลเงิน</dt>
                    <dd>
                      {importRow.timezone ?? "-"} / {importRow.currency ?? "-"}
                    </dd>
                  </div>
                  <div>
                    <dt>Header signature</dt>
                    <dd className="mono">{importRow.headerSignature ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>ไฟล์ขนาด</dt>
                    <dd>
                      {Math.max(
                        1,
                        Math.round(importRow.fileSize / 1024),
                      ).toLocaleString("th-TH")}{" "}
                      KB
                    </dd>
                  </div>
                </dl>
              </Card>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
