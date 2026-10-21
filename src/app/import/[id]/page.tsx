import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteImportButton } from "@/components/DeleteImportButton";
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
import { getImport } from "@/lib/queries";

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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const importId = Number(id);
  if (!Number.isInteger(importId) || importId <= 0) notFound();
  const importRow = await getImport(importId);
  if (!importRow) notFound();

  const mappedCount = importRow.mapping.filter((entry) => entry.fieldKey).length;
  const unknownCols = new Set(importRow.unknownColumns.map((column) => column.col));
  const warnings = importRow.warnings;

  return (
    <>
      <PageHeader
        eyebrow="TikTok Shop · รายงานการนำเข้า"
        title={importRow.filename}
        description={`นำเข้า ${formatDateTime(importRow.importedAt)} · รอบชำระ ${
          importRow.periodStart ? formatDate(importRow.periodStart) : "-"
        }${importRow.periodEnd && importRow.periodEnd !== importRow.periodStart ? ` – ${formatDate(importRow.periodEnd)}` : ""}`}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/import">
                <IconArrowLeft size={17} /> กลับหน้าอัปโหลด
              </Link>
            </Button>
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

      <div className="import-status-line">
        <StatusBadge status={importRow.status} />
        <span className="muted">
          ชีตข้อมูล: <strong>{importRow.sheetName ?? "-"}</strong> · แถวหัวตาราง:{" "}
          {importRow.headerRow ?? "-"} · รูปแบบ:{" "}
          <span className="mono">{importRow.headerSignature ?? "-"}</span>
        </span>
      </div>

      <div className="stats">
        <StatCard
          label="แถวข้อมูล"
          value={importRow.rowCount.toLocaleString("th-TH")}
          hint="แถวที่อ่านได้จากชีต"
          icon={<IconFile size={19} />}
        />
        <StatCard
          label="บิลที่สร้าง"
          value={importRow.orderCount.toLocaleString("th-TH")}
          hint="เฉพาะประเภทธุรกรรมคำสั่งซื้อ"
          icon={<IconReceipt size={19} />}
        />
        <StatCard
          label="รายการทั้งหมด"
          value={importRow.transactionCount.toLocaleString("th-TH")}
          hint={`รวมรายการที่ไม่ใช่คำสั่งซื้อ ${Math.max(0, importRow.transactionCount - importRow.orderCount)} รายการ`}
          icon={<IconCalendar size={19} />}
        />
        <StatCard
          label="คำเตือน"
          value={warnings.length.toLocaleString("th-TH")}
          hint={warnings.length === 0 ? "ไม่พบปัญหา" : "ตรวจสอบรายละเอียดด้านล่าง"}
          tone={warnings.length === 0 ? "positive" : "negative"}
          icon={<IconAlert size={19} />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ตรวจยอดกับชีตสรุป</CardTitle>
          <MoneyDiffBadge matched={importRow.reconciliation.matched} />
        </CardHeader>
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
            <span>ไม่พบชีตสรุปในไฟล์นี้ ระบบจึงคำนวณยอดจากชีตรายละเอียดเท่านั้น</span>
          </div>
        )}
        <CardFooter>
          <span className="muted small">
            ตรวจสูตรรายบิล:{" "}
            {importRow.reconciliation.orderCheckFailures === 0
              ? "ผ่านทุกบิล"
              : `${importRow.reconciliation.orderCheckFailures} บิลไม่ลงตัว`}
          </span>
          {importRow.periodStart ? (
            <Button asChild variant="ghost" size="sm" className="card-link">
              <Link href={`/days/${importRow.periodStart}`}>
                ดูรอบชำระ {formatDate(importRow.periodStart)}
              </Link>
            </Button>
          ) : null}
        </CardFooter>
      </Card>

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
              <li key={`${warning.code}-${index}`} className={`severity-${warning.severity}`}>
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

      <Card>
        <CardHeader>
          <CardTitle>การจับคู่หัวคอลัมน์</CardTitle>
          <span className="muted small">
            {mappedCount} / {importRow.mapping.filter((entry) => entry.header).length} คอลัมน์ที่จับคู่ได้
          </span>
        </CardHeader>
        <Table variant="mapping" containerClassName="scroll-table">
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
                <TableRow key={entry.col} className={unknown ? "row-warning" : undefined}>
                  <TableCell className="header-cell">
                    {entry.header || <span className="muted">(คอลัมน์ว่าง)</span>}
                  </TableCell>
                  <TableCell>
                    {entry.label ?? (
                      <span className="muted">{entry.header ? "— ไม่รู้จัก —" : "—"}</span>
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
      </Card>

      <div className="grid-2">
        <Card>
          <CardHeader>
            <CardTitle>คอลัมน์ใหม่ที่ยังไม่รู้จัก</CardTitle>
            <span className="muted small">{importRow.unknownColumns.length} คอลัมน์</span>
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
                  <TableHead className="num">ค่าที่ไม่ใช่ศูนย์</TableHead>
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
                    <TableCell data-label="ค่าที่ไม่ใช่ศูนย์" className="num">
                      {column.nonZeroNumeric}
                    </TableCell>
                    <TableCell data-label="ตัวอย่าง" className="muted small">
                      {column.samples.length > 0 ? column.samples.join(", ") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card padding="padded" className="card-pad">
          <h2 className="card-title">ข้อมูลไฟล์</h2>
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
              <dd>{importRow.source === "cli" ? "คำสั่ง CLI" : "อัปโหลดผ่านหน้าเว็บ"}</dd>
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
              <dd>{Math.max(1, Math.round(importRow.fileSize / 1024)).toLocaleString("th-TH")} KB</dd>
            </div>
          </dl>
        </Card>
      </div>

      <p className="page-foot-note">
        การลบการนำเข้าจะลบบิลของไฟล์นี้ออกจากระบบ แต่ไม่ลบไฟล์ Excel ต้นฉบับ
      </p>
    </>
  );
}
