import { createHash } from "node:crypto";
import { query, queryOne, withTransaction } from "../db";
import { SELLER } from "../seller";
import { round2 } from "../format";
import {
  getReportTotal,
  parseWorkbook,
  type IngestWarning,
  type NormalizedTransaction,
  type ReportSummary,
} from "./parse";

export interface ReconciliationMetric {
  key: "payout" | "income" | "fees" | "adjustment";
  label: string;
  detail: number;
  report: number | null;
  diff: number | null;
  matched: boolean | null;
}

export interface Reconciliation {
  matched: boolean | null;
  orderCheckFailures: number;
  metrics: ReconciliationMetric[];
  reportAvailable: boolean;
}

export interface ImportResult {
  importId: number;
  duplicate: boolean;
  filename: string;
  status: "ok" | "warning";
  rowCount: number;
  orderCount: number;
  transactionCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  headerSignature: string;
  newFormat: boolean;
  warnings: IngestWarning[];
  reconciliation: Reconciliation;
}

export interface ImportProgressEvent {
  stage: "hashing" | "parsing" | "reconciling" | "saving" | "done";
  percent: number;
  message: string;
  current?: number;
  total?: number;
}

export interface ImportFileOptions {
  filename: string;
  buffer: Buffer;
  source?: "upload" | "cli";
  onProgress?: (event: ImportProgressEvent) => void;
}

const REPORT_LABELS = {
  payout: "ยอดการชำระเงินทั้งหมด",
  income: "รายได้ทั้งหมด",
  fees: "ค่าธรรมเนียมทั้งหมด",
  adjustment: "การปรับยอด",
} as const;

function sumField(transactions: NormalizedTransaction[], key: string): number {
  return round2(
    transactions.reduce((sum, transaction) => {
      const value = transaction.fields[key];
      return sum + (typeof value === "number" ? value : Number(value ?? 0));
    }, 0),
  );
}

function buildReconciliation(
  transactions: NormalizedTransaction[],
  report: ReportSummary,
): Reconciliation {
  const detail = {
    payout: sumField(transactions, "payout"),
    income: sumField(transactions, "incomeTotal"),
    fees: sumField(transactions, "feeTotal"),
    adjustment: sumField(transactions, "adjustment"),
  };

  const metrics: ReconciliationMetric[] = (
    [
      ["payout", REPORT_LABELS.payout],
      ["income", REPORT_LABELS.income],
      ["fees", REPORT_LABELS.fees],
      ["adjustment", REPORT_LABELS.adjustment],
    ] as const
  ).map(([key, label]) => {
    const reportValue = getReportTotal(report, label);
    const diff = reportValue === null ? null : round2(detail[key] - reportValue);
    return {
      key,
      label,
      detail: detail[key],
      report: reportValue,
      diff,
      matched: diff === null ? null : Math.abs(diff) < 0.01,
    };
  });

  const compared = metrics.filter((metric) => metric.matched !== null);
  const matched =
    compared.length === 0 ? null : compared.every((metric) => metric.matched === true);

  const orderCheckFailures = transactions.filter((transaction) => {
    if (!transaction.isOrder) return false;
    const { incomeDiff, feeDiff, payoutDiff } = transaction.checks;
    return (
      Math.abs(incomeDiff) > 0.01 ||
      Math.abs(feeDiff) > 0.01 ||
      Math.abs(payoutDiff) > 0.01
    );
  }).length;

  return {
    matched,
    orderCheckFailures,
    metrics,
    reportAvailable: report.found,
  };
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

async function readExistingImport(id: number): Promise<ImportResult | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT id, filename, status, row_count, order_count, transaction_count,
            period_start, period_end, header_signature, warnings_json, reconciliation_json
     FROM imports WHERE id = $1`,
    [id],
  );
  if (!row) return null;
  return {
    importId: Number(row.id),
    duplicate: true,
    filename: String(row.filename),
    status: row.status === "warning" ? "warning" : "ok",
    rowCount: Number(row.row_count),
    orderCount: Number(row.order_count),
    transactionCount: Number(row.transaction_count),
    periodStart: row.period_start ? String(row.period_start) : null,
    periodEnd: row.period_end ? String(row.period_end) : null,
    headerSignature: String(row.header_signature ?? ""),
    newFormat: false,
    warnings: parseJsonField<IngestWarning[]>(row.warnings_json, []),
    reconciliation: parseJsonField<Reconciliation>(row.reconciliation_json, {
      matched: null,
      orderCheckFailures: 0,
      metrics: [],
      reportAvailable: false,
    }),
  };
}

function invoicePrefix(paidAt: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(paidAt);
  const yy = match ? match[1].slice(2) : "00";
  const mm = match ? match[2] : "00";
  return `${SELLER.invoicePrefix}${yy}${mm}`;
}

export async function importWorkbook(options: ImportFileOptions): Promise<ImportResult> {
  const reportProgress = options.onProgress;
  reportProgress?.({
    stage: "hashing",
    percent: 5,
    message: "กำลังตรวจสอบไฟล์ซ้ำด้วย SHA-256...",
  });

  const hash = createHash("sha256").update(options.buffer).digest("hex");

  const existing = await queryOne<{ id: number | string }>(
    "SELECT id FROM imports WHERE file_hash = $1",
    [hash],
  );
  if (existing) {
    const result = await readExistingImport(Number(existing.id));
    if (result) {
      reportProgress?.({
        stage: "done",
        percent: 100,
        message: "พบไฟล์ที่เคยนำเข้าแล้ว ไม่ต้องบันทึกซ้ำ",
      });
      return result;
    }
  }

  reportProgress?.({
    stage: "parsing",
    percent: 15,
    message: "กำลังอ่านชีตและจับคู่หัวคอลัมน์จากไฟล์ Excel...",
  });

  const parsed = await parseWorkbook(options.buffer);
  const warnings = [...parsed.warnings];

  reportProgress?.({
    stage: "reconciling",
    percent: 30,
    message: `อ่านพบ ${parsed.dataRowCount.toLocaleString("th-TH")} แถวข้อมูล กำลังตรวจสอบยอดรวมกับชีตสรุป...`,
  });

  const previousImports = await queryOne<{ count: string | number }>(
    "SELECT COUNT(*) AS count FROM imports",
  );
  const sameSignature = await queryOne<{ count: string | number }>(
    "SELECT COUNT(*) AS count FROM imports WHERE header_signature = $1",
    [parsed.headerSignature],
  );
  const newFormat =
    Number(previousImports?.count ?? 0) > 0 && Number(sameSignature?.count ?? 0) === 0;

  if (newFormat) {
    warnings.unshift({
      code: "NEW_FORMAT",
      message:
        "พบรูปแบบคอลัมน์ใหม่ที่ไม่เคยนำเข้า – ระบบจับคู่หัวคอลัมน์แบบยืดหยุ่นและนำเข้าต่อให้ กรุณาตรวจสอบรายงานการนำเข้า",
      severity: "warning",
    });
  }

  const reconciliation = buildReconciliation(parsed.transactions, parsed.report);
  if (reconciliation.matched === false) {
    const differences = reconciliation.metrics
      .filter((metric) => metric.matched === false)
      .map((metric) => `${metric.label} ต่าง ${metric.diff}`)
      .join(", ");
    warnings.push({
      code: "RECONCILIATION_MISMATCH",
      message: `ยอดรวมจากรายละเอียดไม่ตรงกับชีตสรุป: ${differences}`,
      severity: "warning",
    });
  }
  if (reconciliation.orderCheckFailures > 0) {
    warnings.push({
      code: "ORDER_CHECK_FAILURE",
      message: `มี ${reconciliation.orderCheckFailures} บิลที่ยอดรายได้/ค่าธรรมเนียม/ยอดชำระ ไม่ลงตัวตามสูตร – ระบบจะแสดงส่วนต่างในบิล`,
      severity: "warning",
    });
  }

  const orderTransactions = parsed.transactions.filter((transaction) => transaction.isOrder);
  const paidDates = orderTransactions
    .map((transaction) => transaction.paidAt)
    .filter(Boolean)
    .sort();
  const periodStart = parsed.report.periodStart ?? paidDates[0] ?? null;
  const periodEnd = parsed.report.periodEnd ?? paidDates[paidDates.length - 1] ?? null;

  const status: "ok" | "warning" = warnings.some(
    (warning) => warning.severity === "warning" || warning.severity === "error",
  )
    ? "warning"
    : "ok";

  const now = new Date().toISOString();

  const importId = await withTransaction(async (client) => {
    const inserted = await queryOne<{ id: string | number }>(
      `INSERT INTO imports (
        filename, file_hash, file_size, imported_at, source, sheet_name, header_row,
        period_start, period_end, timezone, currency, header_signature, status,
        row_count, transaction_count, order_count, warnings_json, mapping_json,
        unknown_columns_json, report_json, reconciliation_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      RETURNING id`,
      [
        options.filename,
        hash,
        options.buffer.length,
        now,
        options.source ?? "upload",
        parsed.sheetName,
        parsed.headerRow,
        periodStart,
        periodEnd,
        parsed.report.timezone ?? "UTC+7",
        parsed.report.currency ?? "THB",
        parsed.headerSignature,
        status,
        parsed.dataRowCount,
        parsed.transactions.length,
        orderTransactions.length,
        JSON.stringify(warnings),
        JSON.stringify(parsed.mapping),
        JSON.stringify(parsed.unknownColumns),
        JSON.stringify(parsed.report),
        JSON.stringify(reconciliation),
      ],
      client,
    );
    const id = Number(inserted!.id);

    const totalTx = parsed.transactions.length;
    const step = Math.max(1, Math.floor(totalTx / 25));

    for (let index = 0; index < totalTx; index++) {
      const transaction = parsed.transactions[index]!;
      if (transaction.isOrder) {
        await query(
          "DELETE FROM transactions WHERE external_id = $1 AND is_order = 1",
          [transaction.externalId],
          client,
        );
      }
      const income = round2(Number(transaction.fields.incomeTotal ?? 0));
      const feeTotal = round2(Number(transaction.fields.feeTotal ?? 0));
      const adjustment = round2(Number(transaction.fields.adjustment ?? 0));
      const payout = round2(Number(transaction.fields.payout ?? 0));
      const productDetail =
        typeof transaction.fields.productDetail === "string"
          ? transaction.fields.productDetail
          : null;
      const relatedOrderId =
        typeof transaction.fields.relatedOrderId === "string"
          ? transaction.fields.relatedOrderId
          : null;
      const weightEstimated =
        typeof transaction.fields.weightEstimated === "number"
          ? transaction.fields.weightEstimated
          : null;
      const weightCharged =
        typeof transaction.fields.weightCharged === "number"
          ? transaction.fields.weightCharged
          : null;

      const params = [
        id,
        transaction.externalId,
        transaction.transactionType,
        transaction.isOrder ? 1 : 0,
        transaction.createdAt,
        transaction.paidAt,
        transaction.currency,
        income,
        feeTotal,
        adjustment,
        payout,
        relatedOrderId,
        productDetail,
        weightEstimated,
        weightCharged,
        JSON.stringify(transaction.checks),
        JSON.stringify(transaction.warnings),
        JSON.stringify(transaction),
        now,
      ];

      if (transaction.isOrder) {
        await query(
          `INSERT INTO transactions (
            import_id, external_id, transaction_type, is_order, created_date, paid_date,
            currency, income, fee_total, adjustment, payout, related_order_id,
            product_detail, weight_estimated, weight_charged, checks_json, warnings_json,
            normalized_json, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
          params,
          client,
        );
        const seq = await queryOne<{ seq: string | number }>(
          "SELECT nextval('invoice_seq') AS seq",
          [],
          client,
        );
        const invoiceNo = `${invoicePrefix(transaction.paidAt)}/${String(seq!.seq).padStart(5, "0")}`;
        await query(
          `INSERT INTO invoice_registry (order_id, invoice_no) VALUES ($1, $2)
           ON CONFLICT (order_id) DO NOTHING`,
          [transaction.externalId, invoiceNo],
          client,
        );
      } else {
        await query(
          `INSERT INTO transactions (
            import_id, external_id, transaction_type, is_order, created_date, paid_date,
            currency, income, fee_total, adjustment, payout, related_order_id,
            product_detail, weight_estimated, weight_charged, checks_json, warnings_json,
            normalized_json, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
          ON CONFLICT (external_id, transaction_type, paid_date) DO UPDATE SET
            import_id = EXCLUDED.import_id,
            is_order = EXCLUDED.is_order,
            created_date = EXCLUDED.created_date,
            currency = EXCLUDED.currency,
            income = EXCLUDED.income,
            fee_total = EXCLUDED.fee_total,
            adjustment = EXCLUDED.adjustment,
            payout = EXCLUDED.payout,
            related_order_id = EXCLUDED.related_order_id,
            product_detail = EXCLUDED.product_detail,
            weight_estimated = EXCLUDED.weight_estimated,
            weight_charged = EXCLUDED.weight_charged,
            checks_json = EXCLUDED.checks_json,
            warnings_json = EXCLUDED.warnings_json,
            normalized_json = EXCLUDED.normalized_json,
            created_at = EXCLUDED.created_at`,
          params,
          client,
        );
      }

      const currentCount = index + 1;
      if (reportProgress && (currentCount === 1 || currentCount === totalTx || currentCount % step === 0)) {
        const ratio = totalTx > 0 ? currentCount / totalTx : 1;
        const percent = Math.min(98, Math.round(35 + ratio * 63));
        reportProgress({
          stage: "saving",
          percent,
          message: `กำลังสร้างบิลและบันทึกรายการ ${currentCount.toLocaleString("th-TH")} / ${totalTx.toLocaleString("th-TH")}`,
          current: currentCount,
          total: totalTx,
        });
      }
    }

    return id;
  });

  reportProgress?.({
    stage: "done",
    percent: 100,
    message: `นำเข้าสำเร็จ สร้างบิล ${orderTransactions.length.toLocaleString("th-TH")} ใบ`,
    current: parsed.transactions.length,
    total: parsed.transactions.length,
  });

  return {
    importId,
    duplicate: false,
    filename: options.filename,
    status,
    rowCount: parsed.dataRowCount,
    orderCount: orderTransactions.length,
    transactionCount: parsed.transactions.length,
    periodStart,
    periodEnd,
    headerSignature: parsed.headerSignature,
    newFormat,
    warnings,
    reconciliation,
  };
}
