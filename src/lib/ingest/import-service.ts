import { createHash } from "node:crypto";
import {
  query,
  queryOne,
  withTransaction,
  type Queryable,
} from "../db";
import { compressFileBlob } from "../file-blob";
import { SELLER } from "../seller";
import { INVOICE_ELIGIBLE_SQL } from "../invoice-eligibility";
import { round2 } from "../format";
import {
  getReportTotal,
  IngestError,
  parseWorkbook,
  readInputSheets,
  recalculateTransactionWithRules,
  type IngestWarning,
  type NormalizedTransaction,
  type ReportSummary,
  type UnknownColumn,
} from "./parse";
import {
  detectAndParseOmsInput,
  extractRawHeadersFromSheets,
  type DetectedFileType,
  type ParsedOmsItem,
  type ParsedOmsOrder,
} from "./oms-parse";
import {
  getColumnMappingRules,
  lookupUnknownColumnCategory,
} from "../column-mapping-settings";

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
  fileType?: DetectedFileType;
  status: "ok" | "warning";
  rowCount: number;
  orderCount: number;
  transactionCount: number;
  systemOrderCount?: number;
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
  customMapping?: Record<string, string>;
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

async function readSystemOrderCount(): Promise<number> {
  const row = await queryOne<{ c: string | number }>(
    "SELECT COALESCE(SUM(order_count), 0) AS c FROM daily_summaries",
  );
  return Number(row?.c ?? 0);
}

async function readExistingImport(id: number): Promise<ImportResult | null> {
  const [row, systemOrderCount] = await Promise.all([
    queryOne<Record<string, unknown>>(
      `SELECT id, filename, file_type, status, row_count, order_count, transaction_count,
              period_start, period_end, header_signature, warnings_json, reconciliation_json
       FROM imports WHERE id = $1`,
      [id],
    ),
    readSystemOrderCount(),
  ]);
  if (!row) return null;
  return {
    importId: Number(row.id),
    duplicate: true,
    filename: String(row.filename),
    fileType: (row.file_type as DetectedFileType) ?? "settlement",
    status: row.status === "warning" ? "warning" : "ok",
    rowCount: Number(row.row_count),
    orderCount: Number(row.order_count),
    transactionCount: Number(row.transaction_count),
    systemOrderCount,
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

export async function saveOmsOrdersBatch(
  orders: ParsedOmsOrder[],
  importId: number,
  client: Queryable,
): Promise<void> {
  if (orders.length === 0) return;
  const deduped = new Map<string, ParsedOmsOrder>();
  for (const order of orders) {
    deduped.set(order.orderUid, order);
  }
  const uniqueOrders = [...deduped.values()];
  const BATCH_SIZE = 300;

  for (let start = 0; start < uniqueOrders.length; start += BATCH_SIZE) {
    const chunk = uniqueOrders.slice(start, start + BATCH_SIZE);
    const params: unknown[] = [];
    const placeholders: string[] = [];

    for (let i = 0; i < chunk.length; i++) {
      const o = chunk[i]!;
      const base = i * 27;
      placeholders.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16},$${base + 17},$${base + 18},$${base + 19},$${base + 20},$${base + 21},$${base + 22},$${base + 23},$${base + 24},$${base + 25},$${base + 26},$${base + 27})`,
      );
      params.push(
        o.orderUid,
        o.orderCode,
        importId,
        o.channel,
        o.customerName,
        o.customerPhone,
        o.contactName,
        o.courier,
        o.shippingFeeCustomer,
        o.shippingFeeSeller,
        o.province,
        o.bank,
        o.trackingNo,
        o.note,
        o.createdBy,
        o.createdDate,
        o.paidDate,
        o.printedDate,
        o.marketplaceOrderRaw,
        o.marketplaceOrderNorm,
        o.marketplaceOrderPrefix,
        o.marketplaceOrderFloat,
        o.discountCode,
        o.discountTotal,
        o.totalQty,
        o.salesAmount,
        o.profitAmount,
      );
    }

    await query(
      `INSERT INTO oms_orders (
        order_uid, order_code, import_id, channel, customer_name, customer_phone, contact_name,
        courier, shipping_fee_customer, shipping_fee_seller, province, bank, tracking_no,
        note, created_by, created_date, paid_date, printed_date,
        marketplace_order_raw, marketplace_order_norm, marketplace_order_prefix, marketplace_order_float,
        discount_code, discount_total, total_qty, sales_amount, profit_amount
      ) VALUES ${placeholders.join(", ")}
      ON CONFLICT (order_uid) DO UPDATE SET
        order_code = EXCLUDED.order_code,
        import_id = EXCLUDED.import_id,
        channel = EXCLUDED.channel,
        customer_name = COALESCE(EXCLUDED.customer_name, oms_orders.customer_name),
        customer_phone = COALESCE(EXCLUDED.customer_phone, oms_orders.customer_phone),
        contact_name = COALESCE(EXCLUDED.contact_name, oms_orders.contact_name),
        courier = COALESCE(EXCLUDED.courier, oms_orders.courier),
        shipping_fee_customer = EXCLUDED.shipping_fee_customer,
        shipping_fee_seller = EXCLUDED.shipping_fee_seller,
        province = COALESCE(EXCLUDED.province, oms_orders.province),
        bank = COALESCE(EXCLUDED.bank, oms_orders.bank),
        tracking_no = COALESCE(EXCLUDED.tracking_no, oms_orders.tracking_no),
        note = COALESCE(EXCLUDED.note, oms_orders.note),
        created_by = COALESCE(EXCLUDED.created_by, oms_orders.created_by),
        created_date = CASE WHEN EXCLUDED.created_date <> '' THEN EXCLUDED.created_date ELSE oms_orders.created_date END,
        paid_date = CASE WHEN EXCLUDED.paid_date <> '' THEN EXCLUDED.paid_date ELSE oms_orders.paid_date END,
        printed_date = CASE WHEN EXCLUDED.printed_date <> '' THEN EXCLUDED.printed_date ELSE oms_orders.printed_date END,
        marketplace_order_raw = COALESCE(EXCLUDED.marketplace_order_raw, oms_orders.marketplace_order_raw),
        marketplace_order_norm = COALESCE(EXCLUDED.marketplace_order_norm, oms_orders.marketplace_order_norm),
        marketplace_order_prefix = COALESCE(EXCLUDED.marketplace_order_prefix, oms_orders.marketplace_order_prefix),
        marketplace_order_float = COALESCE(EXCLUDED.marketplace_order_float, oms_orders.marketplace_order_float),
        discount_code = COALESCE(EXCLUDED.discount_code, oms_orders.discount_code),
        discount_total = EXCLUDED.discount_total,
        total_qty = CASE WHEN EXCLUDED.total_qty > 0 THEN EXCLUDED.total_qty ELSE oms_orders.total_qty END,
        sales_amount = EXCLUDED.sales_amount,
        profit_amount = EXCLUDED.profit_amount,
        matched_external_id = CASE
          WHEN EXCLUDED.channel IN ('Shopee', 'Facebook') THEN NULL
          WHEN oms_orders.marketplace_order_norm IS DISTINCT FROM EXCLUDED.marketplace_order_norm THEN NULL
          ELSE oms_orders.matched_external_id
        END,
        updated_at = now()`,
      params,
      client,
    );
  }
}

export async function saveOmsItemsBatch(
  items: ParsedOmsItem[],
  importId: number,
  client: Queryable,
): Promise<void> {
  if (items.length === 0) return;

  const orderUids = [...new Set(items.map((item) => item.orderUid))];
  const ORDER_UID_CHUNK = 1000;
  for (let start = 0; start < orderUids.length; start += ORDER_UID_CHUNK) {
    const uidChunk = orderUids.slice(start, start + ORDER_UID_CHUNK);
    await query(
      "DELETE FROM oms_order_items WHERE order_uid = ANY($1::text[])",
      [uidChunk],
      client,
    );
  }

  const BATCH_SIZE = 300;
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    const chunk = items.slice(start, start + BATCH_SIZE);
    const params: unknown[] = [];
    const placeholders: string[] = [];

    for (let i = 0; i < chunk.length; i++) {
      const it = chunk[i]!;
      const base = i * 22;
      placeholders.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16},$${base + 17},$${base + 18},$${base + 19},$${base + 20},$${base + 21},$${base + 22})`,
      );
      params.push(
        importId,
        it.orderUid,
        it.orderCode,
        it.lineNo,
        it.skuCode,
        it.productName,
        it.unitPrice,
        it.quantity,
        it.orderSalesAmount,
        it.shippingFeeCustomer,
        it.senderName,
        it.customerName,
        it.customerAddress,
        it.postalCode,
        it.customerPhone,
        it.paidDate,
        it.createdDate,
        it.courier,
        it.channel,
        it.bank,
        it.note,
        it.trackingNo,
      );
    }

    await query(
      `INSERT INTO oms_order_items (
        import_id, order_uid, order_code, line_no, sku_code, product_name, unit_price, quantity,
        order_sales_amount, shipping_fee_customer, sender_name, customer_name,
        customer_address, postal_code, customer_phone, paid_date, created_date,
        courier, channel, bank, note, tracking_no
      ) VALUES ${placeholders.join(", ")}
      ON CONFLICT (order_uid, line_no) DO UPDATE SET
        import_id = EXCLUDED.import_id,
        order_code = EXCLUDED.order_code,
        sku_code = EXCLUDED.sku_code,
        product_name = EXCLUDED.product_name,
        unit_price = EXCLUDED.unit_price,
        quantity = EXCLUDED.quantity,
        order_sales_amount = EXCLUDED.order_sales_amount,
        shipping_fee_customer = EXCLUDED.shipping_fee_customer,
        sender_name = EXCLUDED.sender_name,
        customer_name = EXCLUDED.customer_name,
        customer_address = EXCLUDED.customer_address,
        postal_code = EXCLUDED.postal_code,
        customer_phone = EXCLUDED.customer_phone,
        paid_date = EXCLUDED.paid_date,
        created_date = EXCLUDED.created_date,
        courier = EXCLUDED.courier,
        channel = EXCLUDED.channel,
        bank = EXCLUDED.bank,
        note = EXCLUDED.note,
        tracking_no = EXCLUDED.tracking_no`,
      params,
      client,
    );
  }

  // Upsert master products table
  const skuMap = new Map<string, { name: string; price: number }>();
  for (const it of items) {
    if (!skuMap.has(it.skuCode) || it.unitPrice > 0) {
      skuMap.set(it.skuCode, { name: it.productName, price: it.unitPrice });
    }
  }
  const skus = [...skuMap.entries()];
  for (let start = 0; start < skus.length; start += 300) {
    const chunk = skus.slice(start, start + 300);
    const params: unknown[] = [];
    const placeholders: string[] = [];
    for (let i = 0; i < chunk.length; i++) {
      const [code, info] = chunk[i]!;
      const base = i * 3;
      placeholders.push(`($${base + 1},$${base + 2},$${base + 3})`);
      params.push(code, info.name, info.price);
    }
    await query(
      `INSERT INTO products (sku_code, product_name, default_price)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (sku_code) DO UPDATE SET
         product_name = EXCLUDED.product_name,
         default_price = CASE WHEN EXCLUDED.default_price > 0 THEN EXCLUDED.default_price ELSE products.default_price END,
         updated_at = now()`,
      params,
      client,
    );
  }

  // Ensure baseline oms_orders exist even if File 2 (items) was uploaded before File 1 (orders)
  for (let start = 0; start < orderUids.length; start += ORDER_UID_CHUNK) {
    const uidChunk = orderUids.slice(start, start + ORDER_UID_CHUNK);
    await query(
      `WITH agg AS (
         SELECT
           order_uid,
           MAX(order_code) AS order_code,
           MAX(channel) AS channel,
           MAX(customer_name) AS customer_name,
           MAX(customer_phone) AS customer_phone,
           MAX(courier) AS courier,
           MAX(shipping_fee_customer) AS shipping_fee_customer,
           MAX(bank) AS bank,
           MAX(tracking_no) AS tracking_no,
           MAX(note) AS note,
           MAX(created_date) AS created_date,
           MAX(paid_date) AS paid_date,
           SUM(quantity)::int AS total_qty,
           SUM(unit_price * quantity) AS list_total,
           MAX(order_sales_amount) AS sales_amount
         FROM oms_order_items
         WHERE order_uid = ANY($1::text[])
         GROUP BY order_uid
       )
       INSERT INTO oms_orders (
         order_uid, order_code, import_id, channel, customer_name, customer_phone, courier,
         shipping_fee_customer, bank, tracking_no, note, created_date, paid_date,
         discount_total, total_qty, sales_amount, profit_amount
       )
       SELECT
         a.order_uid, a.order_code, $2, COALESCE(a.channel, 'TikTok'), a.customer_name, a.customer_phone, a.courier,
         COALESCE(a.shipping_fee_customer, 0), a.bank, a.tracking_no, a.note,
         COALESCE(a.created_date, ''), COALESCE(a.paid_date, ''),
         GREATEST(0, COALESCE(a.list_total, 0) - COALESCE(a.sales_amount, 0)),
         COALESCE(a.total_qty, 1), COALESCE(a.sales_amount, 0), COALESCE(a.sales_amount, 0)
       FROM agg a
       ON CONFLICT (order_uid) DO UPDATE SET
         customer_name = COALESCE(oms_orders.customer_name, EXCLUDED.customer_name),
         customer_phone = COALESCE(oms_orders.customer_phone, EXCLUDED.customer_phone),
         tracking_no = COALESCE(oms_orders.tracking_no, EXCLUDED.tracking_no),
         total_qty = CASE WHEN oms_orders.total_qty > 0 THEN oms_orders.total_qty ELSE EXCLUDED.total_qty END`,
      [uidChunk, importId],
      client,
    );
  }
}

export async function reconcileAndSyncThreeFiles(
  client: Queryable,
  fallbackImportId: number,
  nowIso: string,
): Promise<{ matchedOrders: number; syncedOmsBills: number }> {
  // 0. Enforce TikTok, Shopee & Facebook policy on newly imported rows (scoped by import_id to avoid full-table scans)
  await query(
    `DELETE FROM oms_order_items WHERE import_id = $1 AND COALESCE(NULLIF(channel, ''), 'TikTok') NOT IN ('TikTok', 'Shopee', 'Facebook')`,
    [fallbackImportId],
    client,
  );
  await query(
    `DELETE FROM oms_orders WHERE import_id = $1 AND COALESCE(NULLIF(channel, ''), 'TikTok') NOT IN ('TikTok', 'Shopee', 'Facebook')`,
    [fallbackImportId],
    client,
  );
  await query(
    `DELETE FROM transactions WHERE import_id = $1 AND COALESCE(NULLIF(channel, ''), 'TikTok') NOT IN ('TikTok', 'Shopee', 'Facebook')`,
    [fallbackImportId],
    client,
  );

  // 0b. Never allow Shopee or Facebook OMS orders to hold a TikTok Settlement matched_external_id,
  //     and never allow TikTok Settlement rows to have channel <> 'TikTok'
  await query(
    `UPDATE oms_orders
     SET matched_external_id = NULL,
          updated_at = now()
     WHERE channel IN ('Shopee', 'Facebook')
       AND matched_external_id IS NOT NULL`,
    [],
    client,
  );
  await query(
    `UPDATE transactions
     SET channel = 'TikTok'
     WHERE is_order = 1
       AND transaction_type <> 'คำสั่งซื้อ (OMS)'
       AND channel <> 'TikTok'`,
    [],
    client,
  );

  // 1. Exact Marketplace Order ID match (scoped to unmatched OMS orders or current import)
  await query(
    `UPDATE oms_orders o
     SET matched_external_id = t.external_id,
         updated_at = now()
     FROM transactions t
     WHERE (o.matched_external_id IS NULL OR o.import_id = $1 OR t.import_id = $1)
       AND t.is_order = 1
       AND t.transaction_type <> 'คำสั่งซื้อ (OMS)'
       AND COALESCE(NULLIF(o.channel, ''), 'TikTok') = 'TikTok'
       AND o.marketplace_order_norm IS NOT NULL
       AND o.marketplace_order_norm <> ''
       AND t.external_id = o.marketplace_order_norm
       AND (o.matched_external_id IS DISTINCT FROM t.external_id)`,
    [fallbackImportId],
    client,
  );

  // 2. Smart Prefix (15-digit) + Amount + Date match for TikTok 18-digit Order IDs rounded to scientific notation by Excel
  await query(
    `WITH candidates AS (
       SELECT DISTINCT ON (o.order_uid)
         o.order_uid,
         t.external_id
       FROM oms_orders o
       JOIN transactions t
         ON t.is_order = 1
        AND t.transaction_type <> 'คำสั่งซื้อ (OMS)'
        AND COALESCE(NULLIF(o.channel, ''), 'TikTok') = 'TikTok'
        AND o.marketplace_order_prefix IS NOT NULL
        AND LENGTH(o.marketplace_order_prefix) >= 14
        AND LEFT(t.external_id, 15) = o.marketplace_order_prefix
       WHERE o.matched_external_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM oms_orders o2
           WHERE o2.matched_external_id = t.external_id
             AND o2.order_uid <> o.order_uid
         )
       ORDER BY o.order_uid,
         CASE WHEN ABS(t.income - o.sales_amount) < 0.01 THEN 0 ELSE 1 END,
         CASE WHEN t.created_date = o.created_date THEN 0 ELSE 1 END,
         ABS(t.income - o.sales_amount) ASC
     )
     UPDATE oms_orders o
     SET matched_external_id = c.external_id,
         updated_at = now()
     FROM candidates c
     WHERE o.order_uid = c.order_uid`,
    [],
    client,
  );

  // 3. If an OMS order now matched a real Settlement row, remove any temporary 'คำสั่งซื้อ (OMS)' row for that exact order_uid
  //    AND remove any unpaid/unshipped/zero-sales Shopee & Facebook OMS bills so they are never taxed.
  const deletedTempRows = await query<{ paid_date: string }>(
    `DELETE FROM transactions t
     WHERE t.transaction_type = 'คำสั่งซื้อ (OMS)'
       AND (
         EXISTS (
           SELECT 1
           FROM oms_orders o
           WHERE o.matched_external_id IS NOT NULL
             AND (
               t.oms_order_uid = o.order_uid
               OR (o.marketplace_order_norm IS NOT NULL AND o.marketplace_order_norm <> '' AND t.external_id = o.marketplace_order_norm)
             )
         )
         OR (
           t.channel IN ('Shopee', 'Facebook')
           AND (
             t.income <= 0
             OR EXISTS (
               SELECT 1
               FROM oms_orders o
               WHERE t.oms_order_uid = o.order_uid
                 AND (
                   o.sales_amount <= 0
                   OR ((o.tracking_no IS NULL OR o.tracking_no = '') AND (o.printed_date IS NULL OR o.printed_date = ''))
                 )
             )
           )
         )
       )
     RETURNING t.paid_date`,
    [],
    client,
  );
  const deletedTempPaidDates = deletedTempRows
    .map((r) => String(r.paid_date ?? ""))
    .filter((d) => d && d !== "unknown");

  // 4. For TikTok, Shopee & Facebook OMS orders that do NOT have a Settlement row (newly imported or not yet in transactions),
  //    create/upsert a bill row in transactions so they appear in /bills and can be tracked.
  //    For Shopee & Facebook, filter out unpaid/unshipped/zero-sales orders so they are never taxed.
  const unmatchedRows = await query<Record<string, unknown>>(
    `SELECT o.*
     FROM oms_orders o
     WHERE o.matched_external_id IS NULL
       AND COALESCE(NULLIF(o.channel, ''), 'TikTok') IN ('TikTok', 'Shopee', 'Facebook')
       AND (
         COALESCE(NULLIF(o.channel, ''), 'TikTok') = 'TikTok'
         OR (
           o.sales_amount > 0
           AND o.paid_date IS NOT NULL AND o.paid_date <> ''
           AND ((o.tracking_no IS NOT NULL AND o.tracking_no <> '') OR (o.printed_date IS NOT NULL AND o.printed_date <> ''))
         )
       )
       AND (
         o.import_id = $1
         OR NOT EXISTS (
           SELECT 1 FROM transactions t
           WHERE t.is_order = 1
             AND (
               t.oms_order_uid = o.order_uid
               OR (o.marketplace_order_norm IS NOT NULL AND o.marketplace_order_norm <> '' AND t.external_id = o.marketplace_order_norm)
             )
         )
       )
     ORDER BY o.paid_date DESC, o.order_uid ASC`,
    [fallbackImportId],
    client,
  );

  const BATCH_SIZE = 300;
  for (let start = 0; start < unmatchedRows.length; start += BATCH_SIZE) {
    const chunk = unmatchedRows.slice(start, start + BATCH_SIZE);
    const extIds: string[] = [];
    const orderUidsInChunk: string[] = [];
    const prefixes: string[] = [];
    const params: unknown[] = [];
    const placeholders: string[] = [];

    for (let i = 0; i < chunk.length; i++) {
      const r = chunk[i]!;
      const orderUid = String(r.order_uid);
      const orderCode = String(r.order_code);
      const channel = String(r.channel ?? "TikTok");
      const mpNorm = r.marketplace_order_norm ? String(r.marketplace_order_norm) : "";
      const mpRaw = r.marketplace_order_raw ? String(r.marketplace_order_raw) : "";
      const externalId = mpNorm && mpNorm !== "-" ? mpNorm : orderUid;
      orderUidsInChunk.push(orderUid);

      const createdDate = String(r.created_date ?? "");
      const paidDate = String(r.paid_date || createdDate || "");
      const salesAmount = round2(Number(r.sales_amount ?? 0));
      const discountTotal = round2(Math.abs(Number(r.discount_total ?? 0)));
      const shippingCustomer = round2(Number(r.shipping_fee_customer ?? 0));
      const shippingSeller = round2(Math.abs(Number(r.shipping_fee_seller ?? 0)));
      const netOmsPayout = round2(salesAmount - shippingSeller);
      const profitAmount = round2(Number(r.profit_amount ?? netOmsPayout));
      const cogsAmount = round2(Math.max(0, salesAmount - shippingSeller - profitAmount));

      const productAfterDiscount = round2(Math.max(0, salesAmount - shippingCustomer));
      const productBeforeDiscount = round2(productAfterDiscount + discountTotal);
      const incomeTotal = salesAmount;
      const feeTotal = round2(-shippingSeller);
      // AGENTS.md Rule 3 & 4:
      // - TikTok Settlement: uses Settlement file directly. For OMS temp row: salesAmount - shippingSeller
      // - Shopee & Facebook: uses profit_amount from Shipnity directly 100% as payout
      const payout = channel === "TikTok" ? netOmsPayout : profitAmount;
      const cogs = channel === "TikTok" ? 0 : cogsAmount;

      const normalized: NormalizedTransaction = {
        externalId,
        transactionType: "คำสั่งซื้อ (OMS)",
        isOrder: true,
        createdAt: createdDate,
        paidAt: paidDate,
        currency: "THB",
        fields: {
          orderId: externalId,
          transactionType: "คำสั่งซื้อ (OMS)",
          createdAt: createdDate,
          paidAt: paidDate,
          currency: "THB",
          incomeTotal,
          customerPayment: salesAmount,
          productAfterDiscount,
          productBeforeDiscount,
          storeDiscount: discountTotal > 0 ? -discountTotal : 0,
          shippingCustomerFee: shippingCustomer,
          feeTotal,
          shippingTotal: feeTotal,
          shippingSellerTotal: feeTotal,
          shippingActual: feeTotal,
          shippingActualFee: feeTotal,
          adjustment: 0,
          payout,
          cogs,
        },
        mappedFields: [
          "orderId",
          "transactionType",
          "createdAt",
          "paidAt",
          "currency",
          "incomeTotal",
          "customerPayment",
          "productAfterDiscount",
          "productBeforeDiscount",
          "storeDiscount",
          "shippingCustomerFee",
          "feeTotal",
          "shippingTotal",
          "shippingSellerTotal",
          "shippingActual",
          "payout",
        ],
        feeGroups:
          shippingSeller > 0 || shippingCustomer > 0
            ? {
                shipping: {
                  total: feeTotal,
                  children: {
                    ...(shippingSeller > 0
                      ? { shippingActual: feeTotal }
                      : {}),
                    ...(shippingCustomer > 0
                      ? { shippingCustomerFee: shippingCustomer }
                      : {}),
                  },
                },
              }
            : {},
        unknownValues: [],
        checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
        warnings: [],
        raw: {
          เลขที่ออเดอร์: orderCode,
          ช่องทางติดต่อ: channel,
          ...(mpRaw ? { "เลขที่บน Marketplace": mpRaw } : {}),
        },
        sourceRows: 1,
        firstRow: 1,
        rowIndexes: [1],
      };

      const targetImportId = Number(r.import_id ?? fallbackImportId);
      const base = i * 22;
      placeholders.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16}::jsonb,$${base + 17}::jsonb,$${base + 18}::jsonb,$${base + 19},$${base + 20},$${base + 21},$${base + 22})`,
      );
      params.push(
        targetImportId,
        externalId,
        "คำสั่งซื้อ (OMS)",
        1,
        createdDate,
        paidDate,
        "THB",
        incomeTotal,
        feeTotal,
        0,
        payout,
        orderCode,
        null,
        null,
        null,
        JSON.stringify(normalized.checks),
        JSON.stringify([]),
        JSON.stringify(normalized),
        nowIso,
        channel,
        orderCode,
        orderUid,
      );
      extIds.push(externalId);
      prefixes.push(invoicePrefix(paidDate));
    }

    await query(
      `DELETE FROM transactions
       WHERE is_order = 1
         AND (
           external_id = ANY($1::text[])
           OR (transaction_type = 'คำสั่งซื้อ (OMS)' AND oms_order_uid = ANY($2::text[]))
         )`,
      [extIds, orderUidsInChunk],
      client,
    );

    await query(
      `INSERT INTO transactions (
        import_id, external_id, transaction_type, is_order, created_date, paid_date,
        currency, income, fee_total, adjustment, payout, related_order_id,
        product_detail, weight_estimated, weight_charged, checks_json, warnings_json,
        normalized_json, created_at, channel, order_code, oms_order_uid
      ) VALUES ${placeholders.join(", ")}`,
      params,
      client,
    );
    // เลขที่ใบกำกับฯ ออกใน syncMonthlyInvoiceRegistry (ท้ายฟังก์ชันนี้) เท่านั้น
  }

  // 5. Stamp order_code, oms_order_uid, and channel onto matched transactions
  //    TikTok Settlement rows (transaction_type <> 'คำสั่งซื้อ (OMS)') strictly match via external_id = o.matched_external_id
  //    and ALWAYS keep channel = 'TikTok'
  await query(
    `UPDATE transactions t
     SET order_code = o.order_code,
         oms_order_uid = o.order_uid,
         channel = CASE
           WHEN t.transaction_type <> 'คำสั่งซื้อ (OMS)' THEN 'TikTok'
           ELSE COALESCE(NULLIF(o.channel, ''), t.channel, 'TikTok')
         END
     FROM oms_orders o
     WHERE t.is_order = 1
       AND (t.import_id = $1 OR o.import_id = $1 OR t.oms_order_uid IS NULL OR t.oms_order_uid = '')
       AND (
         (t.transaction_type <> 'คำสั่งซื้อ (OMS)' AND t.external_id = o.matched_external_id)
         OR (
           t.transaction_type = 'คำสั่งซื้อ (OMS)'
           AND (
             t.oms_order_uid = o.order_uid
             OR (o.marketplace_order_norm IS NOT NULL AND o.marketplace_order_norm <> '' AND t.external_id = o.marketplace_order_norm)
           )
         )
       )
       AND (
         t.order_code IS DISTINCT FROM o.order_code
         OR t.oms_order_uid IS DISTINCT FROM o.order_uid
         OR t.channel IS DISTINCT FROM (
           CASE
             WHEN t.transaction_type <> 'คำสั่งซื้อ (OMS)' THEN 'TikTok'
             ELSE COALESCE(NULLIF(o.channel, ''), t.channel, 'TikTok')
           END
         )
       )`,
    [fallbackImportId],
    client,
  );

  // 5b. Keep oms_order_items.channel aligned with oms_orders.channel by order_uid
  await query(
    `UPDATE oms_order_items i
     SET channel = o.channel
     FROM oms_orders o
     WHERE i.order_uid = o.order_uid
       AND (i.import_id = $1 OR o.import_id = $1)
       AND o.channel IN ('TikTok', 'Shopee', 'Facebook')
       AND i.channel IS DISTINCT FROM o.channel`,
    [fallbackImportId],
    client,
  );

  // 6. Sync human-readable SKU + Product Name summary into transactions.product_detail by order_uid
  await query(
    `WITH affected_orders AS (
       SELECT DISTINCT order_uid FROM oms_order_items WHERE import_id = $1
       UNION
       SELECT DISTINCT order_uid FROM oms_orders WHERE import_id = $1
       UNION
       SELECT DISTINCT oms_order_uid AS order_uid FROM transactions WHERE import_id = $1 AND oms_order_uid IS NOT NULL AND oms_order_uid <> ''
       UNION
       SELECT DISTINCT oms_order_uid AS order_uid FROM transactions WHERE is_order = 1 AND oms_order_uid IS NOT NULL AND oms_order_uid <> '' AND product_detail IS NULL
     ),
     item_summary AS (
       SELECT
         i.order_uid,
         STRING_AGG(i.sku_code || ' · ' || i.product_name || ' × ' || i.quantity::text, '; ' ORDER BY i.line_no) AS summary_text
       FROM oms_order_items i
       JOIN affected_orders a ON a.order_uid = i.order_uid
       GROUP BY i.order_uid
     )
     UPDATE transactions t
     SET product_detail = s.summary_text
     FROM item_summary s
     WHERE t.oms_order_uid = s.order_uid
       AND t.product_detail IS DISTINCT FROM s.summary_text`,
    [fallbackImportId],
    client,
  );

  const matchedCountRow = await queryOne<{ c: string | number }>(
    "SELECT COUNT(*) AS c FROM oms_orders WHERE import_id = $1 AND matched_external_id IS NOT NULL",
    [fallbackImportId],
    client,
  );

  await syncMonthlyInvoiceRegistry(client, fallbackImportId);

  await refreshSummaryTables(client, {
    importId: fallbackImportId,
    dates: deletedTempPaidDates,
  });

  return {
    matchedOrders: Number(matchedCountRow?.c ?? 0),
    syncedOmsBills: unmatchedRows.length,
  };
}

/**
 * ทะเบียนเลขที่ใบกำกับภาษี — เลขที่ออกแล้ว "ล็อก" ห้ามเปลี่ยน (อ้างอิงทางภาษี)
 * - ออเดอร์เดิมที่มีเลขแล้ว → ใช้เลขเดิมเสมอ (แม้ข้อมูลถูกอัปเดต)
 * - ออเดอร์ใหม่ที่เข้าเงื่อนไขบิลขายปกติ (INVOICE_ELIGIBLE_SQL) → seq = MAX(seq ของเดือน) + 1
 *   (ภายในการนำเข้าครั้งเดียวกัน เรียง TikTok → Shopee → Facebook แล้วตามวันที่)
 * - ออเดอร์ที่มีเลขแล้วแต่ไม่เข้าเงื่อนไขแล้ว (คืนเงิน/ตีกลับ/ยกเลิก) → status = 'void' (ไม่ลบ ไม่นำเลขกลับมาใช้)
 * - void แล้วกลับมาเข้าเงื่อนไข → active ด้วยเลขเดิม
 * ทุกการเปลี่ยนแปลงบันทึกลง invoice_registry_audit (append-only)
 *
 * importId ระบุ → ทำงานเฉพาะออเดอร์ที่ไฟล์นี้แตะ (กันสแกนทั้งตาราง) · ไม่ระบุ → ทั้งระบบ (ใช้กับสคริปต์ backfill)
 */
export async function syncMonthlyInvoiceRegistry(
  client: Queryable,
  importId?: number,
): Promise<void> {
  const scoped = importId !== undefined && importId !== null;
  const candidatesSql = scoped
    ? `cand AS (
         SELECT t.external_id FROM transactions t WHERE t.is_order = 1 AND t.import_id = $1
         UNION
         SELECT t.external_id FROM oms_orders o
         JOIN transactions t ON t.oms_order_uid = o.order_uid AND t.is_order = 1
         WHERE o.import_id = $1
         UNION
         SELECT t.external_id FROM oms_orders o
         JOIN transactions t ON t.external_id = o.matched_external_id AND t.is_order = 1
         WHERE o.import_id = $1
         UNION
         SELECT t.external_id FROM oms_order_items i
         JOIN transactions t ON t.oms_order_uid = i.order_uid AND t.is_order = 1
         WHERE i.import_id = $1
         UNION
         SELECT r.order_id FROM invoice_registry r WHERE r.seq IS NULL
       )`
    : `cand AS (
         SELECT t.external_id FROM transactions t WHERE t.is_order = 1 AND $1::int IS NULL
         UNION
         SELECT r.order_id FROM invoice_registry r WHERE $1::int IS NULL
       )`;
  const params = [scoped ? importId : null];

  // กันการนำเข้าพร้อมกันออกเลขชนกัน (ล็อกต่อ schema/บริษัท จนจบ transaction)
  await query(
    `SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':invoice_registry'))`,
    [],
    client,
  );

  // 1) void: มีเลขแล้วแต่ไม่เข้าเงื่อนไขบิลขายปกติแล้ว
  await query(
    `WITH ${candidatesSql},
     upd AS (
       UPDATE invoice_registry r
       SET status = 'void',
           voided_at = now(),
           void_reason = 'ไม่เข้าเงื่อนไขบิลขายปกติ (คืนเงิน/ตีกลับ/ยกเลิก/ข้อมูลไม่ครบ)'
       FROM cand c
       WHERE r.order_id = c.external_id
         AND r.status = 'active'
         AND r.seq IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM transactions t
           WHERE t.external_id = r.order_id AND ${INVOICE_ELIGIBLE_SQL}
         )
       RETURNING r.order_id, r.invoice_no, r.void_reason
     )
     INSERT INTO invoice_registry_audit (order_id, invoice_no, action, reason, import_id)
     SELECT order_id, invoice_no, 'void', void_reason, $1::int FROM upd`,
    params,
    client,
  );

  // 2) unvoid: กลับมาเข้าเงื่อนไข → ใช้เลขเดิม
  await query(
    `WITH ${candidatesSql},
     upd AS (
       UPDATE invoice_registry r
       SET status = 'active', voided_at = NULL, void_reason = NULL
       FROM cand c
       WHERE r.order_id = c.external_id
         AND r.status = 'void'
         AND EXISTS (
           SELECT 1 FROM transactions t
           WHERE t.external_id = r.order_id AND ${INVOICE_ELIGIBLE_SQL}
         )
       RETURNING r.order_id, r.invoice_no
     )
     INSERT INTO invoice_registry_audit (order_id, invoice_no, action, import_id)
     SELECT order_id, invoice_no, 'unvoid', $1::int FROM upd`,
    params,
    client,
  );

  // 3) assign: ออเดอร์ที่เข้าเงื่อนไขแต่ยังไม่มีเลข → ต่อท้าย MAX(seq) ของเดือน (batch เดียว ไม่วนทีละแถว)
  await query(
    `WITH ${candidatesSql},
     newo AS (
       SELECT DISTINCT ON (t.external_id)
              t.external_id,
              t.channel,
              COALESCE(NULLIF(t.paid_date, ''), NULLIF(t.created_date, '')) AS eff_date,
              SUBSTRING(COALESCE(NULLIF(t.paid_date, ''), NULLIF(t.created_date, '')) FROM 3 FOR 2)
                || SUBSTRING(COALESCE(NULLIF(t.paid_date, ''), NULLIF(t.created_date, '')) FROM 6 FOR 2) AS yymm
       FROM cand c
       JOIN transactions t ON t.external_id = c.external_id AND ${INVOICE_ELIGIBLE_SQL}
       WHERE COALESCE(NULLIF(t.paid_date, ''), NULLIF(t.created_date, '')) ~ '^[0-9]{4}-[0-9]{2}'
         AND NOT EXISTS (
           SELECT 1 FROM invoice_registry r WHERE r.order_id = t.external_id AND r.seq IS NOT NULL
         )
       ORDER BY t.external_id, t.id
     ),
     mx AS (
       SELECT r.yymm, MAX(r.seq) AS max_seq
       FROM invoice_registry r
       WHERE r.yymm IN (SELECT DISTINCT yymm FROM newo)
       GROUP BY r.yymm
     ),
     numbered AS (
       SELECT n.external_id, n.channel, n.yymm,
              COALESCE(mx.max_seq, 0) + ROW_NUMBER() OVER (
                PARTITION BY n.yymm
                ORDER BY CASE n.channel WHEN 'TikTok' THEN 1 WHEN 'Shopee' THEN 2 WHEN 'Facebook' THEN 3 ELSE 4 END ASC,
                         n.eff_date ASC, n.external_id ASC
              ) AS seq
       FROM newo n
       LEFT JOIN mx ON mx.yymm = n.yymm
     ),
     ins AS (
       INSERT INTO invoice_registry (order_id, invoice_no, yymm, seq, channel, status)
       SELECT external_id,
              'SEQ/' || yymm || '/' || LPAD(seq::text, GREATEST(5, LENGTH(seq::text)), '0'),
              yymm, seq, channel, 'active'
       FROM numbered
       ON CONFLICT (order_id) DO UPDATE
         SET invoice_no = EXCLUDED.invoice_no,
             yymm = EXCLUDED.yymm,
             seq = EXCLUDED.seq,
             channel = EXCLUDED.channel,
             status = 'active'
         WHERE invoice_registry.seq IS NULL
       RETURNING order_id, invoice_no
     )
     INSERT INTO invoice_registry_audit (order_id, invoice_no, action, import_id)
     SELECT order_id, invoice_no, 'assign', $1::int FROM ins`,
    params,
    client,
  );
}

export async function refreshSummaryTables(
  client: Queryable,
  scope?: { importId?: number; dates?: string[]; skus?: string[] },
): Promise<void> {
  let targetDates = (scope?.dates ?? []).filter((d) => d && d !== "unknown");
  let targetSkus = (scope?.skus ?? []).filter(Boolean);

  if (scope?.importId) {
    const dateRows = await query<{ paid_date: string }>(
      `SELECT DISTINCT paid_date FROM transactions WHERE import_id = $1 AND paid_date <> '' AND paid_date <> 'unknown'
       UNION
       SELECT DISTINCT paid_date FROM oms_orders WHERE import_id = $1 AND paid_date <> '' AND paid_date <> 'unknown'
       UNION
       SELECT DISTINCT t.paid_date
       FROM oms_orders o
       JOIN transactions t ON t.external_id = o.matched_external_id AND t.is_order = 1
       WHERE o.import_id = $1 AND t.paid_date <> '' AND t.paid_date <> 'unknown'
       UNION
       SELECT DISTINCT o.paid_date
       FROM oms_orders o
       JOIN transactions t ON t.external_id = o.matched_external_id AND t.is_order = 1
       WHERE t.import_id = $1 AND o.paid_date <> '' AND o.paid_date <> 'unknown'`,
      [scope.importId],
      client,
    );
    targetDates = [
      ...new Set([...targetDates, ...dateRows.map((r) => String(r.paid_date))]),
    ];

    const skuRows = await query<{ sku_code: string }>(
      `SELECT DISTINCT sku_code FROM oms_order_items WHERE import_id = $1`,
      [scope.importId],
      client,
    );
    targetSkus = [
      ...new Set([...targetSkus, ...skuRows.map((r) => String(r.sku_code))]),
    ];
  }

  if (targetDates.length > 0) {
    await query(
      "DELETE FROM daily_summaries WHERE paid_date = ANY($1::text[])",
      [targetDates],
      client,
    );
    await query(
      `INSERT INTO daily_summaries (
         paid_date, transaction_count, order_count, order_payout, order_income,
         order_fees, other_count, other_payout, total_payout, adjustment,
         tiktok_count, shopee_count, facebook_count,
         linked_count, oms_only_count, unlinked_count, mismatch_count,
         shipping_positive, shipping_negative, updated_at
       )
       SELECT
         paid_date,
         COUNT(*)::int,
         SUM(CASE WHEN is_order = 1 THEN 1 ELSE 0 END)::int,
         ROUND(SUM(CASE WHEN is_order = 1 THEN payout ELSE 0 END)::numeric, 2),
         ROUND(SUM(CASE WHEN is_order = 1 THEN income ELSE 0 END)::numeric, 2),
         ROUND(SUM(CASE WHEN is_order = 1 THEN fee_total ELSE 0 END)::numeric, 2),
         SUM(CASE WHEN is_order = 0 THEN 1 ELSE 0 END)::int,
         ROUND(SUM(CASE WHEN is_order = 0 THEN payout ELSE 0 END)::numeric, 2),
         ROUND(SUM(payout)::numeric, 2),
         ROUND(SUM(adjustment)::numeric, 2),
         SUM(CASE WHEN is_order = 1 AND channel = 'TikTok' THEN 1 ELSE 0 END)::int,
         SUM(CASE WHEN is_order = 1 AND channel = 'Shopee' THEN 1 ELSE 0 END)::int,
         SUM(CASE WHEN is_order = 1 AND channel = 'Facebook' THEN 1 ELSE 0 END)::int,
         SUM(CASE WHEN is_order = 1 AND link_priority = 0 THEN 1 ELSE 0 END)::int,
         SUM(CASE WHEN is_order = 1 AND link_priority = 1 THEN 1 ELSE 0 END)::int,
         SUM(CASE WHEN is_order = 1 AND link_priority = 2 THEN 1 ELSE 0 END)::int,
         SUM(CASE WHEN is_order = 1 AND (
           ABS(COALESCE((checks_json->>'incomeDiff')::numeric, 0)) >= 0.01
           OR ABS(COALESCE((checks_json->>'feeDiff')::numeric, 0)) >= 0.01
           OR ABS(COALESCE((checks_json->>'payoutDiff')::numeric, 0)) >= 0.01
         ) THEN 1 ELSE 0 END)::int,
         ROUND(COALESCE(SUM(shipping_positive), 0)::numeric, 2),
         ROUND(COALESCE(SUM(shipping_negative), 0)::numeric, 2),
         now()
       FROM transactions
       WHERE paid_date = ANY($1::text[])
         AND channel IN ('TikTok', 'Shopee', 'Facebook')
       GROUP BY paid_date`,
      [targetDates],
      client,
    );
  } else if (!scope?.importId) {
    await query("DELETE FROM daily_summaries", [], client);
    await query(
      `INSERT INTO daily_summaries (
         paid_date, transaction_count, order_count, order_payout, order_income,
         order_fees, other_count, other_payout, total_payout, adjustment,
         tiktok_count, shopee_count, facebook_count,
         linked_count, oms_only_count, unlinked_count, mismatch_count,
         shipping_positive, shipping_negative, updated_at
       )
       SELECT
         paid_date,
         COUNT(*)::int,
         SUM(CASE WHEN is_order = 1 THEN 1 ELSE 0 END)::int,
         ROUND(SUM(CASE WHEN is_order = 1 THEN payout ELSE 0 END)::numeric, 2),
         ROUND(SUM(CASE WHEN is_order = 1 THEN income ELSE 0 END)::numeric, 2),
         ROUND(SUM(CASE WHEN is_order = 1 THEN fee_total ELSE 0 END)::numeric, 2),
         SUM(CASE WHEN is_order = 0 THEN 1 ELSE 0 END)::int,
         ROUND(SUM(CASE WHEN is_order = 0 THEN payout ELSE 0 END)::numeric, 2),
         ROUND(SUM(payout)::numeric, 2),
         ROUND(SUM(adjustment)::numeric, 2),
         SUM(CASE WHEN is_order = 1 AND channel = 'TikTok' THEN 1 ELSE 0 END)::int,
         SUM(CASE WHEN is_order = 1 AND channel = 'Shopee' THEN 1 ELSE 0 END)::int,
         SUM(CASE WHEN is_order = 1 AND channel = 'Facebook' THEN 1 ELSE 0 END)::int,
         SUM(CASE WHEN is_order = 1 AND link_priority = 0 THEN 1 ELSE 0 END)::int,
         SUM(CASE WHEN is_order = 1 AND link_priority = 1 THEN 1 ELSE 0 END)::int,
         SUM(CASE WHEN is_order = 1 AND link_priority = 2 THEN 1 ELSE 0 END)::int,
         SUM(CASE WHEN is_order = 1 AND (
           ABS(COALESCE((checks_json->>'incomeDiff')::numeric, 0)) >= 0.01
           OR ABS(COALESCE((checks_json->>'feeDiff')::numeric, 0)) >= 0.01
           OR ABS(COALESCE((checks_json->>'payoutDiff')::numeric, 0)) >= 0.01
         ) THEN 1 ELSE 0 END)::int,
         ROUND(COALESCE(SUM(shipping_positive), 0)::numeric, 2),
         ROUND(COALESCE(SUM(shipping_negative), 0)::numeric, 2),
         now()
       FROM transactions
       WHERE paid_date <> '' AND paid_date <> 'unknown'
         AND channel IN ('TikTok', 'Shopee', 'Facebook')
       GROUP BY paid_date`,
      [],
      client,
    );
  }

  if (targetSkus.length > 0) {
    await query(
      "DELETE FROM sku_summaries WHERE sku_code = ANY($1::text[])",
      [targetSkus],
      client,
    );
    await query(
      `INSERT INTO sku_summaries (
         sku_code, product_name, total_qty, order_count, gross_amount,
         net_sales_amount, tiktok_qty, shopee_qty, facebook_qty, updated_at
       )
       SELECT
         i.sku_code,
         MAX(i.product_name),
         COALESCE(SUM(i.quantity), 0)::int,
         COUNT(DISTINCT COALESCE(NULLIF(i.order_uid, ''), i.order_code))::int,
         ROUND(COALESCE(SUM(i.unit_price * i.quantity), 0)::numeric, 2),
         ROUND(COALESCE(SUM(i.order_sales_amount), 0)::numeric, 2),
         COALESCE(SUM(CASE WHEN COALESCE(NULLIF(i.channel, ''), 'TikTok') = 'TikTok' THEN i.quantity ELSE 0 END), 0)::int,
         COALESCE(SUM(CASE WHEN i.channel = 'Shopee' THEN i.quantity ELSE 0 END), 0)::int,
         COALESCE(SUM(CASE WHEN i.channel = 'Facebook' THEN i.quantity ELSE 0 END), 0)::int,
         now()
       FROM oms_order_items i
       WHERE i.sku_code = ANY($1::text[])
         AND COALESCE(NULLIF(i.channel, ''), 'TikTok') IN ('TikTok', 'Shopee', 'Facebook')
       GROUP BY i.sku_code`,
      [targetSkus],
      client,
    );
  } else if (!scope?.importId) {
    await query("DELETE FROM sku_summaries", [], client);
    await query(
      `INSERT INTO sku_summaries (
         sku_code, product_name, total_qty, order_count, gross_amount,
         net_sales_amount, tiktok_qty, shopee_qty, facebook_qty, updated_at
       )
       SELECT
         i.sku_code,
         MAX(i.product_name),
         COALESCE(SUM(i.quantity), 0)::int,
         COUNT(DISTINCT COALESCE(NULLIF(i.order_uid, ''), i.order_code))::int,
         ROUND(COALESCE(SUM(i.unit_price * i.quantity), 0)::numeric, 2),
         ROUND(COALESCE(SUM(i.order_sales_amount), 0)::numeric, 2),
         COALESCE(SUM(CASE WHEN COALESCE(NULLIF(i.channel, ''), 'TikTok') = 'TikTok' THEN i.quantity ELSE 0 END), 0)::int,
         COALESCE(SUM(CASE WHEN i.channel = 'Shopee' THEN i.quantity ELSE 0 END), 0)::int,
         COALESCE(SUM(CASE WHEN i.channel = 'Facebook' THEN i.quantity ELSE 0 END), 0)::int,
         now()
       FROM oms_order_items i
       WHERE COALESCE(NULLIF(i.channel, ''), 'TikTok') IN ('TikTok', 'Shopee', 'Facebook')
       GROUP BY i.sku_code`,
      [],
      client,
    );
  }
}

export async function importWorkbook(options: ImportFileOptions): Promise<ImportResult> {
  const reportProgress = options.onProgress;
  reportProgress?.({
    stage: "hashing",
    percent: 5,
    message: "กำลังตรวจสอบไฟล์ซ้ำด้วย SHA-256...",
  });

  const hash = createHash("sha256").update(options.buffer).digest("hex");

  const savedRules = await getColumnMappingRules();
  const effectiveCustomMapping: Record<string, string> = {
    ...savedRules.headerToFieldKey,
    ...(options.customMapping ?? {}),
  };

  const existing = await queryOne<{
    id: number | string;
    has_blob: boolean;
    file_type: string;
    row_count: number | string;
  }>(
    "SELECT id, (file_blob IS NOT NULL) AS has_blob, file_type, row_count FROM imports WHERE file_hash = $1",
    [hash],
  );
  if (existing) {
    if (!existing.has_blob && options.buffer.length > 0) {
      await query("UPDATE imports SET file_blob = $1 WHERE id = $2", [
        compressFileBlob(options.buffer),
        Number(existing.id),
      ]);
    }
    const existingId = Number(existing.id);
    if (
      existing.file_type === "oms_orders" ||
      existing.file_type === "oms_items"
    ) {
      const reParsed = await detectAndParseOmsInput(
        options.buffer,
        effectiveCustomMapping,
      );
      if (reParsed && reParsed.dataRowCount > Number(existing.row_count ?? 0)) {
        const now = new Date().toISOString();
        const effectiveOrders =
          reParsed.orders.length > 0
            ? reParsed.orders.length
            : new Set(reParsed.items.map((i) => i.orderUid)).size;
        await withTransaction(async (client) => {
          await query(
            `UPDATE imports
             SET row_count = $1, transaction_count = $1, order_count = $2
             WHERE id = $3`,
            [reParsed.dataRowCount, effectiveOrders, existingId],
            client,
          );
          if (reParsed.orders.length > 0) {
            await saveOmsOrdersBatch(reParsed.orders, existingId, client);
          }
          if (reParsed.items.length > 0) {
            await saveOmsItemsBatch(reParsed.items, existingId, client);
          }
          await reconcileAndSyncThreeFiles(client, existingId, now);
        });
      }
    }
    await withTransaction(async (client) => {
      await reconcileAndSyncThreeFiles(
        client,
        existingId,
        new Date().toISOString(),
      );
    });
    const result = await readExistingImport(existingId);
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
    message: "กำลังตรวจสอบประเภทไฟล์ (.xlsx / .csv) และอ่านข้อมูลตาราง...",
  });

  // Parse input sheets once and share across OMS detection & Settlement parsing (cuts CPU & RAM usage by 50%)
  const preloadedSheets = await readInputSheets(options.buffer);

  // Check if this is File 1 (OMS Orders) or File 3 (OMS Items) first
  const omsParsed = await detectAndParseOmsInput(
    options.buffer,
    effectiveCustomMapping,
    preloadedSheets,
  );
  if (omsParsed) {
    const now = new Date().toISOString();
    const fileLabel =
      omsParsed.fileType === "oms_orders"
        ? "ไฟล์ออเดอร์ใน shipnity"
        : "ไฟล์สินค้าในออเดอร์ shipnity";

    reportProgress?.({
      stage: "reconciling",
      percent: 45,
      message: `ตรวจพบ${fileLabel} จำนวน ${omsParsed.dataRowCount.toLocaleString("th-TH")} แถว กำลังบันทึกและเชื่อมข้อมูล 3 ไฟล์...`,
    });

    const emptyReport: ReportSummary = {
      found: false,
      sheetName: omsParsed.sheetName,
      periodStart: omsParsed.periodStart,
      periodEnd: omsParsed.periodEnd,
      timezone: "UTC+7",
      currency: "THB",
      totals: {},
      raw: [],
    };
    const emptyReconciliation: Reconciliation = {
      matched: null,
      orderCheckFailures: 0,
      metrics: [],
      reportAvailable: false,
    };

    const { importId, effectiveOrderCount } = await withTransaction(async (client) => {
      const effectiveOrders =
        omsParsed.orders.length > 0
          ? omsParsed.orders.length
          : new Set(omsParsed.items.map((i) => i.orderUid)).size;

      const inserted = await queryOne<{ id: string | number }>(
        `INSERT INTO imports (
          filename, file_hash, file_size, imported_at, source, sheet_name, header_row,
          period_start, period_end, timezone, currency, header_signature, status,
          row_count, transaction_count, order_count, warnings_json, mapping_json,
          unknown_columns_json, report_json, reconciliation_json, file_type, file_blob
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
        RETURNING id`,
        [
          options.filename,
          hash,
          options.buffer.length,
          now,
          options.source ?? "upload",
          omsParsed.sheetName,
          omsParsed.headerRow,
          omsParsed.periodStart,
          omsParsed.periodEnd,
          "UTC+7",
          "THB",
          omsParsed.headerSignature,
          "ok",
          omsParsed.dataRowCount,
          omsParsed.dataRowCount,
          effectiveOrders,
          JSON.stringify(omsParsed.warnings),
          JSON.stringify(omsParsed.mapping),
          JSON.stringify([]),
          JSON.stringify(emptyReport),
          JSON.stringify(emptyReconciliation),
          omsParsed.fileType,
          compressFileBlob(options.buffer),
        ],
        client,
      );
      const id = Number(inserted!.id);

      reportProgress?.({
        stage: "saving",
        percent: 70,
        message: `กำลังบันทึก${fileLabel} และเชื่อมรหัสสินค้าเข้ากับบิล...`,
      });

      if (omsParsed.orders.length > 0) {
        await saveOmsOrdersBatch(omsParsed.orders, id, client);
      }
      if (omsParsed.items.length > 0) {
        await saveOmsItemsBatch(omsParsed.items, id, client);
      }

      await reconcileAndSyncThreeFiles(client, id, now);

      return { importId: id, effectiveOrderCount: effectiveOrders };
    });

    reportProgress?.({
      stage: "done",
      percent: 100,
      message: `นำเข้า${fileLabel} สำเร็จ (${omsParsed.dataRowCount.toLocaleString("th-TH")} แถว · ${effectiveOrderCount.toLocaleString("th-TH")} ออเดอร์)`,
      current: omsParsed.dataRowCount,
      total: omsParsed.dataRowCount,
    });

    const systemOrderCount = await readSystemOrderCount();

    return {
      importId,
      duplicate: false,
      filename: options.filename,
      fileType: omsParsed.fileType,
      status: "ok",
      rowCount: omsParsed.dataRowCount,
      orderCount: effectiveOrderCount,
      transactionCount: omsParsed.dataRowCount,
      systemOrderCount,
      periodStart: omsParsed.periodStart,
      periodEnd: omsParsed.periodEnd,
      headerSignature: omsParsed.headerSignature,
      newFormat: false,
      warnings: omsParsed.warnings,
      reconciliation: emptyReconciliation,
    };
  }

  let parsed;
  try {
    parsed = await parseWorkbook(options.buffer, {
      customMapping: effectiveCustomMapping,
      unknownColumnCategories: savedRules.unknownColumnCategories,
      preloadedSheets,
    });
  } catch (err) {
    if (
      err instanceof IngestError &&
      (err.code === "NO_DETAIL_SHEET" || err.code === "HEADER_NOT_FOUND")
    ) {
      const rawHeaders = extractRawHeadersFromSheets(preloadedSheets);
      if (rawHeaders.length > 0) {
        throw new IngestError(
          "UNRECOGNIZED_HEADERS",
          "ไม่รู้จักชื่อคอลัมน์ในไฟล์นี้ กรุณาจับคู่คอลัมน์เอง (Custom Column Mapping) เพื่อนำเข้า",
          rawHeaders,
        );
      }
    }
    throw err;
  }
  const warnings = [...parsed.warnings];

  reportProgress?.({
    stage: "reconciling",
    percent: 30,
    message: `อ่านพบ ${parsed.dataRowCount.toLocaleString("th-TH")} แถวข้อมูล กำลังตรวจสอบยอดรวมกับชีตสรุป...`,
  });

  const previousImports = await queryOne<{ count: string | number }>(
    "SELECT COUNT(*) AS count FROM imports WHERE file_type = 'settlement'",
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
        unknown_columns_json, report_json, reconciliation_json, file_type, file_blob
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
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
        "settlement",
        compressFileBlob(options.buffer),
      ],
      client,
    );
    const id = Number(inserted!.id);

    const totalTx = parsed.transactions.length;
    const BATCH_SIZE = 500;

    for (let start = 0; start < totalTx; start += BATCH_SIZE) {
      const chunk = parsed.transactions.slice(start, start + BATCH_SIZE);
      const orderChunk = chunk.filter((tx) => tx.isOrder);
      const otherChunk = chunk.filter((tx) => !tx.isOrder);

      if (orderChunk.length > 0) {
        const orderExternalIds = orderChunk.map((tx) => tx.externalId);
        await query(
          "DELETE FROM transactions WHERE external_id = ANY($1::text[]) AND is_order = 1",
          [orderExternalIds],
          client,
        );

        const orderParams: unknown[] = [];
        const orderPlaceholders: string[] = [];

        for (let i = 0; i < orderChunk.length; i++) {
          const transaction = orderChunk[i]!;
          const base = i * 20;
          orderPlaceholders.push(
            `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16}::jsonb,$${base + 17}::jsonb,$${base + 18}::jsonb,$${base + 19},$${base + 20})`,
          );
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

          orderParams.push(
            id,
            transaction.externalId,
            transaction.transactionType,
            1,
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
            JSON.stringify({ ...transaction, raw: {} }),
            now,
            "TikTok",
          );
        }

        await query(
          `INSERT INTO transactions (
            import_id, external_id, transaction_type, is_order, created_date, paid_date,
            currency, income, fee_total, adjustment, payout, related_order_id,
            product_detail, weight_estimated, weight_charged, checks_json, warnings_json,
            normalized_json, created_at, channel
          ) VALUES ${orderPlaceholders.join(", ")}`,
          orderParams,
          client,
        );

        // เลขที่ใบกำกับฯ: ออกเลข/void ใน syncMonthlyInvoiceRegistry (เรียกท้าย reconcileAndSyncThreeFiles) เท่านั้น — เลขที่ออกแล้วล็อก ห้ามลบ
      }

      if (otherChunk.length > 0) {
        const dedupedOtherMap = new Map<string, NormalizedTransaction>();
        for (const tx of otherChunk) {
          dedupedOtherMap.set(`${tx.externalId}|${tx.transactionType}|${tx.paidAt}`, tx);
        }
        const uniqueOthers = [...dedupedOtherMap.values()];

        const otherParams: unknown[] = [];
        const otherPlaceholders: string[] = [];

        for (let i = 0; i < uniqueOthers.length; i++) {
          const transaction = uniqueOthers[i]!;
          const base = i * 20;
          otherPlaceholders.push(
            `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16}::jsonb,$${base + 17}::jsonb,$${base + 18}::jsonb,$${base + 19},$${base + 20})`,
          );
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

          otherParams.push(
            id,
            transaction.externalId,
            transaction.transactionType,
            0,
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
            JSON.stringify({ ...transaction, raw: {} }),
            now,
            "TikTok",
          );
        }

        await query(
          `INSERT INTO transactions (
            import_id, external_id, transaction_type, is_order, created_date, paid_date,
            currency, income, fee_total, adjustment, payout, related_order_id,
            product_detail, weight_estimated, weight_charged, checks_json, warnings_json,
            normalized_json, created_at, channel
          ) VALUES ${otherPlaceholders.join(", ")}
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
          otherParams,
          client,
        );
      }

      const currentCount = Math.min(totalTx, start + chunk.length);
      if (reportProgress) {
        const ratio = totalTx > 0 ? currentCount / totalTx : 1;
        const percent = Math.min(95, Math.round(35 + ratio * 58));
        reportProgress({
          stage: "saving",
          percent,
          message: `กำลังสร้างบิลและบันทึกรายการ ${currentCount.toLocaleString("th-TH")} / ${totalTx.toLocaleString("th-TH")}`,
          current: currentCount,
          total: totalTx,
        });
      }
    }

    await reconcileAndSyncThreeFiles(client, id, now);

    return id;
  });

  reportProgress?.({
    stage: "done",
    percent: 100,
    message: `นำเข้าสำเร็จ สร้างบิล ${orderTransactions.length.toLocaleString("th-TH")} ใบ`,
    current: parsed.transactions.length,
    total: parsed.transactions.length,
  });

  const systemOrderCount = await readSystemOrderCount();

  return {
    importId,
    duplicate: false,
    filename: options.filename,
    fileType: "settlement",
    status,
    rowCount: parsed.dataRowCount,
    orderCount: orderTransactions.length,
    transactionCount: parsed.transactions.length,
    systemOrderCount,
    periodStart,
    periodEnd,
    headerSignature: parsed.headerSignature,
    newFormat,
    warnings,
    reconciliation,
  };
}

export async function reapplyColumnRulesToImport(
  targetImportId?: number,
): Promise<{ updatedImports: number; updatedTransactions: number }> {
  const rules = await getColumnMappingRules();

  return withTransaction(async (client) => {
    const importRows = targetImportId
      ? await query<Record<string, unknown>>(
          `SELECT id, unknown_columns_json, warnings_json, report_json, file_type
           FROM imports
           WHERE id = $1 AND COALESCE(file_type, 'settlement') = 'settlement'`,
          [targetImportId],
          client,
        )
      : await query<Record<string, unknown>>(
          `SELECT id, unknown_columns_json, warnings_json, report_json, file_type
           FROM imports
           WHERE COALESCE(file_type, 'settlement') = 'settlement'`,
          [],
          client,
        );

    let updatedImports = 0;
    let updatedTransactions = 0;

    for (const imp of importRows) {
      const impId = Number(imp.id);
      const unknownColumns = parseJsonField<UnknownColumn[]>(
        imp.unknown_columns_json,
        [],
      ).map((col) => {
        const category = lookupUnknownColumnCategory(
          col.header,
          rules.unknownColumnCategories,
        );
        return {
          ...col,
          ...(category ? { category } : { category: undefined }),
        };
      });

      const report = parseJsonField<ReportSummary>(imp.report_json, {
        found: false,
        sheetName: null,
        periodStart: null,
        periodEnd: null,
        timezone: "UTC+7",
        currency: "THB",
        totals: {},
        raw: [],
      });

      const txRows = await query<{
        id: number | string;
        normalized_json: unknown;
      }>(
        `SELECT id, normalized_json FROM transactions WHERE import_id = $1`,
        [impId],
        client,
      );

      const recalculatedTxs: NormalizedTransaction[] = [];
      const txIds: number[] = [];
      const checksPayloads: string[] = [];
      const normalizedPayloads: string[] = [];

      for (const txRow of txRows) {
        const norm = parseJsonField<NormalizedTransaction | null>(
          txRow.normalized_json,
          null,
        );
        if (!norm) continue;
        const recalculated = recalculateTransactionWithRules(
          norm,
          rules.unknownColumnCategories,
        );
        recalculatedTxs.push(recalculated);
        txIds.push(Number(txRow.id));
        checksPayloads.push(JSON.stringify(recalculated.checks));
        normalizedPayloads.push(JSON.stringify({ ...recalculated, raw: {} }));
      }

      if (txIds.length > 0) {
        await query(
          `UPDATE transactions AS t
           SET checks_json = u.checks_json::jsonb,
               normalized_json = u.normalized_json::jsonb
           FROM unnest($1::int[], $2::text[], $3::text[]) AS u(id, checks_json, normalized_json)
           WHERE t.id = u.id`,
          [txIds, checksPayloads, normalizedPayloads],
          client,
        );
        updatedTransactions += txIds.length;
      }

      const reconciliation = buildReconciliation(recalculatedTxs, report);
      const existingWarnings = parseJsonField<IngestWarning[]>(
        imp.warnings_json,
        [],
      ).filter(
        (w) =>
          w.code !== "UNKNOWN_COLUMNS" &&
          w.code !== "ORDER_CHECK_FAILURE" &&
          w.code !== "RECONCILIATION_MISMATCH",
      );

      const unclassifiedUnknowns = unknownColumns.filter((c) => !c.category);
      if (unclassifiedUnknowns.length > 0) {
        existingWarnings.push({
          code: "UNKNOWN_COLUMNS",
          message: `พบ ${unclassifiedUnknowns.length} คอลัมน์ที่ระบบยังไม่รู้จัก: ${unclassifiedUnknowns
            .map((column) => column.header)
            .join(", ")}`,
          severity: "warning",
        });
      }
      if (reconciliation.matched === false) {
        const differences = reconciliation.metrics
          .filter((metric) => metric.matched === false)
          .map((metric) => `${metric.label} ต่าง ${metric.diff}`)
          .join(", ");
        existingWarnings.push({
          code: "RECONCILIATION_MISMATCH",
          message: `ยอดรวมจากรายละเอียดไม่ตรงกับชีตสรุป: ${differences}`,
          severity: "warning",
        });
      }
      if (reconciliation.orderCheckFailures > 0) {
        existingWarnings.push({
          code: "ORDER_CHECK_FAILURE",
          message: `มี ${reconciliation.orderCheckFailures} บิลที่ยอดรายได้/ค่าธรรมเนียม/ยอดชำระ ไม่ลงตัวตามสูตร – ระบบจะแสดงส่วนต่างในบิล`,
          severity: "warning",
        });
      }

      const nextStatus: "ok" | "warning" = existingWarnings.some(
        (w) => w.severity === "warning" || w.severity === "error",
      )
        ? "warning"
        : "ok";

      await query(
        `UPDATE imports
         SET unknown_columns_json = $1::jsonb,
             reconciliation_json = $2::jsonb,
             warnings_json = $3::jsonb,
             status = $4
         WHERE id = $5`,
        [
          JSON.stringify(unknownColumns),
          JSON.stringify(reconciliation),
          JSON.stringify(existingWarnings),
          nextStatus,
          impId,
        ],
        client,
      );
      updatedImports++;
    }

    return { updatedImports, updatedTransactions };
  });
}
