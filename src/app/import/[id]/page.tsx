import Link from "next/link";
import { notFound } from "next/navigation";
import { BillPreviewTrigger } from "@/components/BillPreviewDialog";
import { DeleteImportButton } from "@/components/DeleteImportButton";
import {
  ExcelFilePreviewDialog,
  ExcelSpreadsheetViewer,
} from "@/components/ExcelPreviewDialog";
import { UnknownColumnsManager } from "@/components/UnknownColumnsManager";
import {
  MoneyDiffBadge,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/PageHeader";
import { getColumnMappingRules } from "@/lib/column-mapping-settings";
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
import { toNumber } from "@/lib/ingest/parse";
import {
  getImport,
  getImportSpreadsheetData,
  listDuplicateOrderTransactionsForImport,
} from "@/lib/queries";

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

  const duplicateOrderRows =
    activeTab === "details"
      ? await listDuplicateOrderTransactionsForImport(importId)
      : [];

  const columnMappingRules =
    activeTab === "details" ? await getColumnMappingRules() : null;

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
                <Link href={`/bills?date=${encodeURIComponent(importRow.periodStart)}`}>
                  <IconCalendar size={16} /> เปิดดูบิลรอบนี้
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
        <div className="shrink-0 rounded-t-2xl border-b border-border bg-[#f8fafc] px-4 py-3 min-[640px]:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid w-full grid-cols-1 gap-1 rounded-xl border border-border bg-white p-1 shadow-2xs min-[480px]:grid-cols-2 sm:inline-flex sm:w-auto sm:flex-wrap sm:items-center">
              <Button
                asChild
                variant={activeTab === "spreadsheet" ? "default" : "ghost"}
                size="xs"
                className={
                  activeTab === "spreadsheet"
                    ? "w-full justify-center shadow-xs sm:w-auto"
                    : "w-full justify-center text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a] sm:w-auto"
                }
              >
                <Link href={`/import/${importRow.id}?tab=spreadsheet`} scroll={false}>
                  ตารางข้อมูลไฟล์ (Excel)
                </Link>
              </Button>
              <Button
                asChild
                variant={activeTab === "reconcile" ? "default" : "ghost"}
                size="xs"
                className={
                  activeTab === "reconcile"
                    ? "w-full justify-center shadow-xs sm:w-auto"
                    : "w-full justify-center text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a] sm:w-auto"
                }
              >
                <Link href={`/import/${importRow.id}?tab=reconcile`} scroll={false}>
                  ตรวจยอดกับชีตสรุป
                </Link>
              </Button>
              <Button
                asChild
                variant={activeTab === "mapping" ? "default" : "ghost"}
                size="xs"
                className={
                  activeTab === "mapping"
                    ? "w-full justify-center shadow-xs sm:w-auto"
                    : "w-full justify-center text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a] sm:w-auto"
                }
              >
                <Link href={`/import/${importRow.id}?tab=mapping`} scroll={false}>
                  การจับคู่หัวคอลัมน์ ({mappedCount}/{totalHeaders})
                </Link>
              </Button>
              <Button
                asChild
                variant={activeTab === "details" ? "default" : "ghost"}
                size="xs"
                className={
                  activeTab === "details"
                    ? "w-full justify-center shadow-xs sm:w-auto"
                    : "w-full justify-center text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a] sm:w-auto"
                }
              >
                <Link href={`/import/${importRow.id}?tab=details`} scroll={false}>
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
          <ExcelSpreadsheetViewer
            data={spreadsheetData}
            className="max-h-[calc(100dvh-210px)] rounded-b-2xl"
          />
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
                    <TableHead className="num">ผลตรวจ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importRow.reconciliation.metrics.map((metric) => (
                    <TableRow
                      key={metric.key}
                      className={
                        metric.matched === false
                          ? "bg-[#fffbeb]/70 hover:bg-[#fef3c7]/60"
                          : undefined
                      }
                    >
                      <TableCell
                        data-label="รายการ"
                        className="font-semibold text-[#0f172a]"
                      >
                        {metric.label}
                      </TableCell>
                      <TableCell
                        data-label="จากชีตรายละเอียด"
                        className="num font-semibold text-[#0f172a]"
                      >
                        {formatTHB(metric.detail)}
                      </TableCell>
                      <TableCell
                        data-label="จากชีตสรุป"
                        className="num font-medium text-[#334155]"
                      >
                        {metric.report === null ? "—" : formatTHB(metric.report)}
                      </TableCell>
                      <TableCell
                        data-label="ส่วนต่าง"
                        className={`num font-bold${metric.matched === false ? " danger" : " text-[#059669]"}`}
                      >
                        {metric.diff === null ? "—" : formatTHB(metric.diff)}
                      </TableCell>
                      <TableCell data-label="ผลตรวจ" className="num">
                        {metric.matched === null ? (
                          <span className="muted">—</span>
                        ) : metric.matched ? (
                          <Badge variant="success" size="sm">
                            <IconCheckCircle size={13} /> ยอดตรง
                          </Badge>
                        ) : (
                          <Badge variant="warning" size="sm">
                            <IconAlert size={13} /> มีส่วนต่าง
                          </Badge>
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
                  <Link href={`/bills?date=${encodeURIComponent(importRow.periodStart)}`}>
                    ดูบิลรอบ {formatDate(importRow.periodStart)}
                  </Link>
                </Button>
              ) : null}
            </CardFooter>
          </>
        ) : activeTab === "mapping" ? (
          <Table variant="stack" className="mapping-table">
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
                    <TableCell data-label="หัวคอลัมน์ในไฟล์" className="header-cell">
                      {entry.header || <span className="muted">(คอลัมน์ว่าง)</span>}
                    </TableCell>
                    <TableCell data-label="ฟิลด์ที่ระบบใช้">
                      {entry.label ?? (
                        <span className="muted">
                          {entry.header ? "— ไม่รู้จัก —" : "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell data-label="ความมั่นใจ">
                      <Badge
                        variant={CONFIDENCE_VARIANT[entry.confidence] ?? "neutral"}
                        className={`badge-conf-${entry.confidence}`}
                      >
                        {CONFIDENCE_LABEL[entry.confidence] ?? entry.confidence}
                      </Badge>
                    </TableCell>
                    <TableCell data-label="มีค่า" className="num">
                      {entry.nonEmpty}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="min-h-0 flex-1 p-4 min-[640px]:p-5 space-y-4">
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
                  {warnings.map((warning, index) => {
                    const isDuplicateOrderWarning =
                      warning.code === "DUPLICATE_ORDER_ROWS" &&
                      duplicateOrderRows.length > 0;
                    const enrichedMessage = isDuplicateOrderWarning
                      ? `พบคำสั่งซื้อที่ปรากฏหลายแถวในไฟล์ Excel จำนวน ${duplicateOrderRows.length} รายการ (${duplicateOrderRows
                          .slice(0, 6)
                          .map((tx) => {
                            const rowNums =
                              tx.normalized.rowIndexes?.length > 0
                                ? `แถว ${tx.normalized.rowIndexes.join(", ")}`
                                : `${tx.normalized.sourceRows} แถว`;
                            return `#${tx.externalId} [${rowNums}]`;
                          })
                          .join(" · ")}${
                          duplicateOrderRows.length > 6
                            ? ` และอีก ${duplicateOrderRows.length - 6} รายการ`
                            : ""
                        }) — ระบบรวมยอดสุทธิเป็นบิลเดียวให้แล้ว (ดูรายละเอียดด้านล่าง)`
                      : warning.message;

                    return (
                      <li
                        key={`${warning.code}-${index}`}
                        className={`severity-${warning.severity}`}
                      >
                        <IconAlert size={17} />
                        <div>
                          <strong>{warning.code}</strong>
                          <span>{enrichedMessage}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {duplicateOrderRows.length > 0 ? (
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>
                      รายการคำสั่งซื้อที่ปรากฏหลายแถวในไฟล์ Excel (รวมเป็นบิลเดียวแล้ว)
                    </CardTitle>
                    <Badge variant="warning" size="sm">
                      {duplicateOrderRows.length.toLocaleString("th-TH")} คำสั่งซื้อ
                    </Badge>
                  </div>
                  <span className="muted small">
                    เกิดจากออเดอร์ที่มีทั้งแถวขายปกติและแถวคืนเงิน/ปรับปรุงยอดแยกบรรทัดกันในไฟล์ TikTok
                  </span>
                </CardHeader>
                <Table variant="stack">
                  <TableHeader>
                    <TableRow>
                      <TableHead>หมายเลขคำสั่งซื้อ</TableHead>
                      <TableHead>บรรทัดใน Excel</TableHead>
                      <TableHead>สาเหตุที่มีหลายแถว</TableHead>
                      <TableHead className="num min-[768px]:max-[1099px]:hidden">
                        รายได้สุทธิ
                      </TableHead>
                      <TableHead className="num min-[768px]:max-[1099px]:hidden">
                        ค่าธรรมเนียม
                      </TableHead>
                      <TableHead className="num">ยอดรับสุทธิ (หลังรวม)</TableHead>
                      <TableHead className="num">ตรวจสอบบิล</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {duplicateOrderRows.map((tx) => {
                      const rowIndexes = tx.normalized.rowIndexes ?? [];
                      const sourceRows =
                        tx.normalized.sourceRows ?? Math.max(2, rowIndexes.length);
                      const productAfterDiscount = toNumber(
                        tx.normalized.fields.productAfterDiscount,
                      );
                      const refundAfterDiscount = toNumber(
                        tx.normalized.fields.refundAfterDiscount,
                      );
                      const reasonText =
                        productAfterDiscount > 0 && refundAfterDiscount < 0
                          ? Math.abs(productAfterDiscount + refundAfterDiscount) < 0.01
                            ? `ขาย ${formatTHB(productAfterDiscount)} + คืนเงินเต็มจำนวน ${formatTHB(refundAfterDiscount)}`
                            : `ขาย ${formatTHB(productAfterDiscount)} + คืนเงินบางส่วน ${formatTHB(refundAfterDiscount)}`
                          : `แยกบันทึก ${sourceRows} แถวในรอบชำระเดียวกัน`;

                      return (
                        <TableRow key={tx.id}>
                          <TableCell data-label="หมายเลขคำสั่งซื้อ">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="mono font-bold text-[#0f172a]">
                                #{tx.externalId}
                              </span>
                              {tx.orderCode ? (
                                <Badge variant="secondary" size="sm">
                                  ผูก #{tx.orderCode}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="mt-0.5 text-xs text-[#64748b]">
                              สร้าง {formatDate(tx.createdDate)} · ชำระ{" "}
                              {formatDate(tx.paidDate)}
                            </div>
                          </TableCell>
                          <TableCell data-label="บรรทัดใน Excel">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="warning" size="sm">
                                {sourceRows} แถว
                              </Badge>
                              {rowIndexes.length > 0 ? (
                                <span className="mono text-xs font-semibold text-[#334155]">
                                  แถวที่ {rowIndexes.join(", ")}
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell
                            data-label="สาเหตุที่มีหลายแถว"
                            className="text-xs font-medium text-[#334155]"
                          >
                            {reasonText}
                          </TableCell>
                          <TableCell
                            data-label="รายได้สุทธิ"
                            className="num font-semibold text-[#0f172a] min-[768px]:max-[1099px]:hidden"
                          >
                            {formatTHB(tx.income)}
                          </TableCell>
                          <TableCell
                            data-label="ค่าธรรมเนียม"
                            className={`num font-semibold min-[768px]:max-[1099px]:hidden${tx.feeTotal < 0 ? " danger" : ""}`}
                          >
                            {formatTHB(tx.feeTotal)}
                          </TableCell>
                          <TableCell
                            data-label="ยอดรับสุทธิ (หลังรวม)"
                            className={`num font-bold${tx.payout < 0 ? " danger" : " positive"}`}
                          >
                            {formatTHB(tx.payout)}
                          </TableCell>
                          <TableCell data-label="ตรวจสอบบิล" className="num">
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              <BillPreviewTrigger
                                row={tx}
                                defaultTab="bill"
                                triggerVariant="outline"
                                label="เปิดดูบิล"
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            ) : null}

            <UnknownColumnsManager
              importId={importRow.id}
              unknownColumns={importRow.unknownColumns}
              initialRules={
                columnMappingRules ?? {
                  headerToFieldKey: {},
                  unknownColumnCategories: {},
                }
              }
            />

            <div className="grid grid-cols-1 gap-4">
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
