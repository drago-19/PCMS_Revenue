import { createHash } from "node:crypto";
import {
  detectAndParseLazadaInput,
  isItemPriceTransactionName,
  type LazadaNormalizedTransaction,
} from "./lazada-parse";
import { detectAndParseShopeeInput } from "./shopee-parse";
import {
  getActiveCompanyId,
  query,
  queryOne,
  withTransaction,
  type Queryable,
} from "../db";
import { compressFileBlob } from "../file-blob";
import { SELLER } from "../seller";
import {
  BILLABLE_COMPENSATION_SQL,
  INVOICE_ELIGIBLE_SQL,
} from "../invoice-eligibility";
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
  buildOmsOrderUid,
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
  uploadCategory?: "standard" | "accounting";
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

export function detectCrossCompanyWarning(
  companyId: string,
  filename: string,
  texts: (string | null | undefined)[],
): IngestWarning | null {
  const combinedSamples = [filename, ...texts.filter(Boolean)]
    .map((t) => String(t).toLowerCase())
    .filter(Boolean);
  if (combinedSamples.length === 0) return null;

  const dragon19Re = /kiddee|kissi|homepong|plkshopee|kukid|dragon\s*19|ดราก้อน/i;
  const seehengRe = /seeheng|see\s*heng|ชีเฮง/i;

  if (companyId === "seeheng") {
    const dragonHits = combinedSamples.filter((s) => dragon19Re.test(s)).length;
    const seehengHits = combinedSamples.filter((s) => seehengRe.test(s)).length;
    if (dragonHits > 0 && seehengHits === 0) {
      return {
        code: "CROSS_COMPANY_WARNING",
        message:
          "ตรวจพบชื่อร้านหรือผู้สร้างรายการของฝั่ง Dragon19 (เช่น Kiddee Shop / Kissi Studio) ขณะกำลังนำเข้าในบริษัทโรงงานชีเฮง กรุณาตรวจสอบว่าเลือกบริษัทถูกต้อง",
        severity: "warning",
      };
    }
  } else if (companyId === "dragon19") {
    const seehengHits = combinedSamples.filter((s) => seehengRe.test(s)).length;
    const dragonHits = combinedSamples.filter((s) => dragon19Re.test(s)).length;
    if (seehengHits > 0 && dragonHits === 0) {
      return {
        code: "CROSS_COMPANY_WARNING",
        message:
          "ตรวจพบชื่อไฟล์หรือข้อมูลของโรงงานชีเฮง (Seeheng) ขณะกำลังนำเข้าในบริษัท Dragon19 กรุณาตรวจสอบว่าเลือกบริษัทถูกต้อง",
        severity: "warning",
      };
    }
  }
  return null;
}

export async function saveOmsOrdersBatch(
  orders: ParsedOmsOrder[],
  importId: number,
  client: Queryable,
  options?: { isAccounting?: boolean },
): Promise<void> {
  if (orders.length === 0) return;
  const isAccounting = Boolean(options?.isAccounting);

  // Guard #15: Prevent auto-generated FB-YYMMDD / FB-YYMMDD-N / LN-YYMMDD / LN-YYMMDD-N codes from colliding with a different file's distinct orders on the same date
  const autoGenPrefixRe = /^((?:FB|LN)-\d{6})(?:-(\d+))?$/i;
  const autoGenPrefixes = new Set<string>();
  for (const o of orders) {
    const m = autoGenPrefixRe.exec(o.orderCode);
    if (m) autoGenPrefixes.add(m[1]!.toUpperCase());
  }
  if (autoGenPrefixes.size > 0) {
    const prefixPatterns = [...autoGenPrefixes].map((p) => `${p}%`);
    const existingAutoRows = await query<{
      order_uid: string;
      order_code: string;
      import_id: number | null;
      sales_amount: string | number;
      note: string | null;
      customer_name: string | null;
    }>(
      `SELECT order_uid, order_code, import_id, sales_amount, note, customer_name
       FROM oms_orders
       WHERE order_code LIKE ANY($1::text[])`,
      [prefixPatterns],
      client,
    );
    if (existingAutoRows.length > 0) {
      const existingByUid = new Map(existingAutoRows.map((r) => [r.order_uid, r]));
      const maxSeqByPrefix = new Map<string, number>();
      for (const r of existingAutoRows) {
        const m = autoGenPrefixRe.exec(r.order_code);
        if (m) {
          const pfx = m[1]!.toUpperCase();
          const seq = m[2] ? Number(m[2]) : 1;
          maxSeqByPrefix.set(pfx, Math.max(maxSeqByPrefix.get(pfx) ?? 0, seq));
        }
      }
      for (const o of orders) {
        const m = autoGenPrefixRe.exec(o.orderCode);
        if (m) {
          const pfx = m[1]!.toUpperCase();
          const seq = m[2] ? Number(m[2]) : 1;
          maxSeqByPrefix.set(pfx, Math.max(maxSeqByPrefix.get(pfx) ?? 0, seq));
        }
      }
      for (const o of orders) {
        const m = autoGenPrefixRe.exec(o.orderCode);
        if (!m) continue;
        const prev = existingByUid.get(o.orderUid);
        if (prev && Number(prev.import_id ?? 0) !== importId) {
          const sameAmount = Math.abs(Number(prev.sales_amount ?? 0) - o.salesAmount) < 0.01;
          const sameNote = (prev.note ?? "") === (o.note ?? "");
          const sameCustomer = (prev.customer_name ?? "") === (o.customerName ?? "");
          if (!sameAmount || !sameNote || !sameCustomer) {
            const pfx = m[1]!.toUpperCase();
            const nextSeq = (maxSeqByPrefix.get(pfx) ?? 0) + 1;
            maxSeqByPrefix.set(pfx, nextSeq);
            const newOrderCode = `${pfx}-${nextSeq}`;
            o.orderCode = newOrderCode;
            o.orderUid = buildOmsOrderUid(
              newOrderCode,
              o.paidDate,
              o.createdDate,
              o.trackingNo,
            );
          }
        }
      }
    }
  }

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
      const base = i * 29;
      placeholders.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16},$${base + 17},$${base + 18},$${base + 19},$${base + 20},$${base + 21},$${base + 22},$${base + 23},$${base + 24},$${base + 25},$${base + 26},$${base + 27},$${base + 28},$${base + 29})`,
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
        (o.channel === "LINE" || o.channel === "Facebook") && isAccounting ? importId : null,
        (o.channel === "LINE" || o.channel === "Facebook") && isAccounting ? o.salesAmount : null,
      );
    }

    await query(
      `INSERT INTO oms_orders (
        order_uid, order_code, import_id, channel, customer_name, customer_phone, contact_name,
        courier, shipping_fee_customer, shipping_fee_seller, province, bank, tracking_no,
        note, created_by, created_date, paid_date, printed_date,
        marketplace_order_raw, marketplace_order_norm, marketplace_order_prefix, marketplace_order_float,
        discount_code, discount_total, total_qty, sales_amount, profit_amount,
        accounting_import_id, accounting_sales_amount
      ) VALUES ${placeholders.join(", ")}
      ON CONFLICT (order_uid) DO UPDATE SET
        order_code = EXCLUDED.order_code,
        import_id = EXCLUDED.import_id,
        channel = EXCLUDED.channel,
        customer_name = CASE
          WHEN EXCLUDED.customer_name IS NOT NULL AND EXCLUDED.customer_name NOT IN ('', 'ลูกค้า Lazada') THEN EXCLUDED.customer_name
          WHEN oms_orders.customer_name IS NOT NULL AND oms_orders.customer_name NOT IN ('', 'ลูกค้า Lazada') THEN oms_orders.customer_name
          ELSE COALESCE(EXCLUDED.customer_name, oms_orders.customer_name)
        END,
        customer_phone = COALESCE(EXCLUDED.customer_phone, oms_orders.customer_phone),
        contact_name = COALESCE(EXCLUDED.contact_name, oms_orders.contact_name),
        courier = CASE
          WHEN EXCLUDED.courier IS NOT NULL AND EXCLUDED.courier NOT IN ('', 'Lazada Logistics') THEN EXCLUDED.courier
          WHEN oms_orders.courier IS NOT NULL AND oms_orders.courier NOT IN ('', 'Lazada Logistics') THEN oms_orders.courier
          ELSE COALESCE(EXCLUDED.courier, oms_orders.courier)
        END,
        shipping_fee_customer = EXCLUDED.shipping_fee_customer,
        shipping_fee_seller = EXCLUDED.shipping_fee_seller,
        province = COALESCE(EXCLUDED.province, oms_orders.province),
        bank = COALESCE(EXCLUDED.bank, oms_orders.bank),
        tracking_no = CASE
          WHEN EXCLUDED.tracking_no IS NOT NULL AND EXCLUDED.tracking_no <> '' AND EXCLUDED.tracking_no NOT LIKE 'TH1JWSSKAK-%' THEN EXCLUDED.tracking_no
          WHEN oms_orders.tracking_no IS NOT NULL AND oms_orders.tracking_no <> '' AND oms_orders.tracking_no NOT LIKE 'TH1JWSSKAK-%' THEN oms_orders.tracking_no
          ELSE COALESCE(EXCLUDED.tracking_no, oms_orders.tracking_no)
        END,
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
        accounting_import_id = COALESCE(EXCLUDED.accounting_import_id, oms_orders.accounting_import_id),
        accounting_sales_amount = COALESCE(EXCLUDED.accounting_sales_amount, oms_orders.accounting_sales_amount),
        sales_amount = COALESCE(EXCLUDED.accounting_sales_amount, oms_orders.accounting_sales_amount, EXCLUDED.sales_amount),
        profit_amount = CASE
          WHEN EXCLUDED.accounting_sales_amount IS NOT NULL THEN EXCLUDED.profit_amount
          WHEN oms_orders.accounting_sales_amount IS NOT NULL THEN oms_orders.profit_amount
          ELSE EXCLUDED.profit_amount
        END,
        matched_external_id = CASE
          WHEN EXCLUDED.channel IN ('Facebook', 'Lazada', 'LINE', 'Other') THEN NULL
          WHEN oms_orders.marketplace_order_norm IS DISTINCT FROM EXCLUDED.marketplace_order_norm THEN NULL
          ELSE oms_orders.matched_external_id
        END,
        updated_at = now()`,
      params,
      client,
    );
  }

  // เติม shop_name อัตโนมัติสำหรับออเดอร์ที่ยังไม่มีไฟล์สินค้า แต่ระบุอีเมลผู้สร้างของร้านชัดเจน
  await query(
    `UPDATE oms_orders
     SET shop_name = CASE
       WHEN created_by ILIKE '%kissiestudio%' THEN 'Kissi Studio'
       WHEN created_by ILIKE '%homepong%' OR created_by ILIKE '%plkshopee%' OR created_by ILIKE '%kukid%' THEN 'Kiddee Shop'
       ELSE shop_name
     END
     WHERE import_id = $1
       AND shop_name IS NULL
       AND created_by IS NOT NULL
       AND (
         created_by ILIKE '%kissiestudio%'
         OR created_by ILIKE '%homepong%'
         OR created_by ILIKE '%plkshopee%'
         OR created_by ILIKE '%kukid%'
       )`,
    [importId],
    client,
  );
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
            MAX(sender_name) AS sender_name,
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
         discount_total, total_qty, sales_amount, profit_amount, shop_name
        )
        SELECT
          a.order_uid, a.order_code, $2, COALESCE(a.channel, 'TikTok'), a.customer_name, a.customer_phone, a.courier,
          COALESCE(a.shipping_fee_customer, 0), a.bank, a.tracking_no, a.note,
          COALESCE(a.created_date, ''), COALESCE(a.paid_date, ''),
          GREATEST(0, COALESCE(a.list_total, 0) - COALESCE(a.sales_amount, 0)),
          COALESCE(a.total_qty, 1), COALESCE(a.sales_amount, 0), COALESCE(a.sales_amount, 0),
          a.sender_name
        FROM agg a
        ON CONFLICT (order_uid) DO UPDATE SET
          customer_name = COALESCE(NULLIF(oms_orders.customer_name, ''), EXCLUDED.customer_name),
          customer_phone = COALESCE(NULLIF(oms_orders.customer_phone, ''), EXCLUDED.customer_phone),
          tracking_no = COALESCE(NULLIF(oms_orders.tracking_no, ''), EXCLUDED.tracking_no),
          shop_name = COALESCE(NULLIF(EXCLUDED.shop_name, ''), oms_orders.shop_name),
          total_qty = CASE WHEN oms_orders.total_qty > 0 THEN oms_orders.total_qty ELSE EXCLUDED.total_qty END,
          updated_at = now()`,
      [uidChunk, importId],
      client,
    );
  }
}

/**
 * Smart Order UID Linker:
 * เมื่อมีการนำเข้าไฟล์ออเดอร์ (เช่น line_ปี69.xlsx) ที่ตอนแรกยังไม่มีเลขพัสดุ (tracking_no ว่าง)
 * ระบบจะสร้าง order_uid เป็น "AB015|2026-09|2026-09-12"
 * หากในอนาคตมีการอัปโหลดไฟล์สินค้า (oms_items) หรือไฟล์ออเดอร์ใหม่ของออเดอร์เดียวกัน (order_code + เดือนเดียวกัน)
 * ที่มีเลขพัสดุแนบมาด้วย (เช่น "AB015|2026-09|JTTH...") หรือกลับกัน:
 * ฟังก์ชันนี้จะรวมร่าง (Merge) รหัส order_uid เข้าหากันโดยอัตโนมัติ เพื่อไม่ให้เกิดบิลซ้ำและให้รายการสินค้าผูกเข้ากับบิลเดิมทันที 100%
 */
export async function reconcileCrossFileOrderUids(
  client: Queryable,
  importId: number,
): Promise<string[]> {
  const affectedPaidDates = new Set<string>();

  // กรณีที่ 1: มี oms_orders 2 แถวที่เป็นออเดอร์เดียวกัน (order_code + channel + เดือนเดียวกัน)
  // แถวหนึ่งไม่มีเลขพัสดุ (ใช้วันที่เป็นส่วนท้ายของ order_uid) และอีกแถวหนึ่งมีเลขพัสดุจริง
  const dupOrderPairs = await query<{
    no_trk_uid: string;
    with_trk_uid: string;
    no_trk_paid: string | null;
    with_trk_paid: string | null;
    merged_paid_date: string | null;
    tracking_no: string | null;
    shop_name: string | null;
    customer_phone: string | null;
    courier: string | null;
    sales_amount: number;
    profit_amount: number;
    shipping_fee_customer: number;
    shipping_fee_seller: number;
    discount_total: number;
    total_qty: number;
    accounting_import_id: number | null;
    accounting_sales_amount: number | null;
  }>(
    `SELECT
       o_notrk.order_uid AS no_trk_uid,
       o_trk.order_uid AS with_trk_uid,
       o_notrk.paid_date AS no_trk_paid,
       o_trk.paid_date AS with_trk_paid,
       COALESCE(
         CASE WHEN o_notrk.accounting_import_id IS NOT NULL AND o_notrk.paid_date <> '' THEN o_notrk.paid_date END,
         CASE WHEN o_trk.accounting_import_id IS NOT NULL AND o_trk.paid_date <> '' THEN o_trk.paid_date END,
         NULLIF(o_notrk.paid_date, ''),
         NULLIF(o_trk.paid_date, '')
       ) AS merged_paid_date,
       COALESCE(NULLIF(o_notrk.tracking_no, ''), NULLIF(o_trk.tracking_no, '')) AS tracking_no,
       COALESCE(NULLIF(o_notrk.shop_name, ''), NULLIF(o_trk.shop_name, '')) AS shop_name,
       COALESCE(NULLIF(o_notrk.customer_phone, ''), NULLIF(o_trk.customer_phone, '')) AS customer_phone,
       COALESCE(NULLIF(o_notrk.courier, ''), NULLIF(o_trk.courier, '')) AS courier,
       COALESCE(o_notrk.accounting_sales_amount, o_trk.accounting_sales_amount, CASE WHEN o_notrk.sales_amount > 0 THEN o_notrk.sales_amount ELSE o_trk.sales_amount END) AS sales_amount,
       CASE WHEN o_notrk.sales_amount > 0 THEN o_notrk.profit_amount ELSE o_trk.profit_amount END AS profit_amount,
       CASE WHEN o_notrk.shipping_fee_customer > 0 THEN o_notrk.shipping_fee_customer ELSE o_trk.shipping_fee_customer END AS shipping_fee_customer,
       CASE WHEN o_notrk.shipping_fee_seller > 0 THEN o_notrk.shipping_fee_seller ELSE o_trk.shipping_fee_seller END AS shipping_fee_seller,
       GREATEST(COALESCE(o_notrk.discount_total, 0), COALESCE(o_trk.discount_total, 0)) AS discount_total,
       CASE WHEN o_notrk.total_qty > 0 THEN o_notrk.total_qty ELSE o_trk.total_qty END AS total_qty,
       COALESCE(o_notrk.accounting_import_id, o_trk.accounting_import_id) AS accounting_import_id,
       COALESCE(o_notrk.accounting_sales_amount, o_trk.accounting_sales_amount) AS accounting_sales_amount
     FROM oms_orders o_notrk
     JOIN oms_orders o_trk
       ON o_notrk.order_code = o_trk.order_code
      AND COALESCE(NULLIF(o_notrk.channel, ''), 'TikTok') = COALESCE(NULLIF(o_trk.channel, ''), 'TikTok')
      AND (
        SUBSTRING(COALESCE(NULLIF(o_notrk.paid_date, ''), o_notrk.created_date) FROM 1 FOR 7)
          = SUBSTRING(COALESCE(NULLIF(o_trk.paid_date, ''), o_trk.created_date) FROM 1 FOR 7)
        OR (
          o_notrk.tracking_no IS NOT NULL AND o_notrk.tracking_no <> '' AND o_notrk.tracking_no <> '-'
          AND o_notrk.tracking_no = o_trk.tracking_no
        )
        OR (
          o_notrk.created_date IS NOT NULL AND o_notrk.created_date <> ''
          AND (o_notrk.created_date = o_trk.created_date OR o_notrk.created_date = o_trk.paid_date)
        )
        OR (
          o_notrk.paid_date IS NOT NULL AND o_notrk.paid_date <> ''
          AND (o_notrk.paid_date = o_trk.created_date OR o_notrk.paid_date = o_trk.paid_date)
        )
      )
      AND o_notrk.order_uid <> o_trk.order_uid
     WHERE (o_notrk.import_id = $1 OR o_trk.import_id = $1)
       AND (
         (
           (o_notrk.tracking_no IS NULL OR o_notrk.tracking_no = '' OR o_notrk.tracking_no = '-')
           AND (o_trk.tracking_no IS NOT NULL AND o_trk.tracking_no <> '' AND o_trk.tracking_no <> '-')
         )
         OR (
           o_notrk.tracking_no IS NOT NULL AND o_notrk.tracking_no <> '' AND o_notrk.tracking_no <> '-'
           AND o_notrk.tracking_no = o_trk.tracking_no
           AND (
             (o_notrk.sales_amount > 0 AND o_trk.sales_amount = 0)
             OR (
               SPLIT_PART(o_notrk.order_uid, '|', 3) IN (o_notrk.paid_date, o_notrk.created_date)
               AND SPLIT_PART(o_trk.order_uid, '|', 3) = o_trk.tracking_no
             )
           )
         )
         OR (
           o_notrk.accounting_import_id IS NOT NULL
           AND o_trk.accounting_import_id IS NULL
           AND (
             (
               o_notrk.tracking_no IS NOT NULL AND o_notrk.tracking_no <> '' AND o_notrk.tracking_no <> '-'
               AND o_notrk.tracking_no = o_trk.tracking_no
             )
             OR (
               o_notrk.paid_date IS NOT NULL AND o_notrk.paid_date <> ''
               AND o_notrk.paid_date = o_trk.paid_date
               AND o_notrk.customer_name IS NOT NULL AND o_notrk.customer_name <> ''
               AND o_notrk.customer_name = o_trk.customer_name
             )
           )
         )
       )`,
    [importId],
    client,
  );

  for (const pair of dupOrderPairs) {
    if (pair.no_trk_paid) affectedPaidDates.add(String(pair.no_trk_paid));
    if (pair.with_trk_paid) affectedPaidDates.add(String(pair.with_trk_paid));

    // ยึด canonical_uid เป็นตัวที่มีอยู่แล้วใน transactions (เพื่อให้ external_id และ invoice_registry เดิมไม่หลุด)
    const txNoTrk = await queryOne<{ external_id: string }>(
      `SELECT external_id FROM transactions WHERE is_order = 1 AND oms_order_uid = $1 LIMIT 1`,
      [pair.no_trk_uid],
      client,
    );
    const canonicalUid = txNoTrk ? pair.no_trk_uid : pair.with_trk_uid;
    const obsoleteUid = txNoTrk ? pair.with_trk_uid : pair.no_trk_uid;

    // ย้ายรายการสินค้าทั้งหมดมาที่ canonicalUid
    await query(
      `DELETE FROM oms_order_items
       WHERE order_uid = $1
         AND line_no IN (SELECT line_no FROM oms_order_items WHERE order_uid = $2)`,
      [canonicalUid, obsoleteUid],
      client,
    );
    await query(
      `UPDATE oms_order_items SET order_uid = $1 WHERE order_uid = $2`,
      [canonicalUid, obsoleteUid],
      client,
    );

    // อัปเดตข้อมูลที่สมบูรณ์เข้าสู่แถว oms_orders หลัก (และผูก import_id = $12 เพื่อให้ Step 4 ใน reconcileAndSyncThreeFiles ซิงก์บิลทันที)
    await query(
      `UPDATE oms_orders
       SET tracking_no = COALESCE(NULLIF($2, ''), tracking_no),
           shop_name = COALESCE(NULLIF($3, ''), shop_name),
           customer_phone = COALESCE(NULLIF($4, ''), customer_phone),
           courier = COALESCE(NULLIF($5, ''), courier),
           sales_amount = $6,
           profit_amount = $7,
           shipping_fee_customer = $8,
           shipping_fee_seller = $9,
           discount_total = $10,
           total_qty = $11,
           import_id = $12,
           accounting_import_id = COALESCE($13, accounting_import_id),
           accounting_sales_amount = COALESCE($14, accounting_sales_amount),
           paid_date = COALESCE(NULLIF($15, ''), paid_date),
           updated_at = now()
       WHERE order_uid = $1`,
      [
        canonicalUid,
        pair.tracking_no,
        pair.shop_name,
        pair.customer_phone,
        pair.courier,
        pair.sales_amount,
        pair.profit_amount,
        pair.shipping_fee_customer,
        pair.shipping_fee_seller,
        pair.discount_total,
        pair.total_qty,
        importId,
        pair.accounting_import_id,
        pair.accounting_sales_amount,
        pair.merged_paid_date,
      ],
      client,
    );
    await query(
      `DELETE FROM transactions
       WHERE is_order = 1
         AND transaction_type = 'คำสั่งซื้อ (OMS)'
         AND oms_order_uid = $1
         AND oms_order_uid <> $2`,
      [obsoleteUid, canonicalUid],
      client,
    );
    await query(
      `DELETE FROM oms_orders WHERE order_uid = $1`,
      [obsoleteUid],
      client,
    );
  }

  // กรณีที่ 2: มีรายการใน oms_order_items ที่ order_uid ไม่ตรงกับ oms_orders เพราะเลขพัสดุหรือวันที่ต่างกันเล็กน้อยในเดือนเดียวกัน
  const unmatchedItemsLinked = await query<{ paid_date: string | null }>(
    `WITH unmatched_items AS (
       SELECT DISTINCT
         i.order_uid AS item_uid,
         o.order_uid AS target_order_uid,
         o.paid_date AS target_paid_date,
         NULLIF(i.tracking_no, '') AS item_tracking,
         NULLIF(i.sender_name, '') AS item_sender,
         NULLIF(i.customer_phone, '') AS item_phone
       FROM oms_order_items i
       JOIN oms_orders o
         ON o.order_code = i.order_code
        AND (
          SUBSTRING(COALESCE(NULLIF(o.paid_date, ''), o.created_date) FROM 1 FOR 7)
            = SUBSTRING(COALESCE(NULLIF(i.paid_date, ''), i.created_date) FROM 1 FOR 7)
          OR (
            o.tracking_no IS NOT NULL AND o.tracking_no <> '' AND o.tracking_no <> '-'
            AND o.tracking_no = i.tracking_no
          )
          OR (
            o.created_date IS NOT NULL AND o.created_date <> ''
            AND (o.created_date = i.created_date OR o.created_date = i.paid_date)
          )
          OR (
            o.paid_date IS NOT NULL AND o.paid_date <> ''
            AND (o.paid_date = i.created_date OR o.paid_date = i.paid_date)
          )
        )
        AND (
          COALESCE(NULLIF(o.channel, ''), 'TikTok') = COALESCE(NULLIF(i.channel, ''), 'TikTok')
          OR i.channel IS NULL OR i.channel = ''
        )
       WHERE (i.import_id = $1 OR o.import_id = $1)
         AND i.order_uid <> o.order_uid
         AND NOT EXISTS (SELECT 1 FROM oms_orders o2 WHERE o2.order_uid = i.order_uid)
     ),
     updated_orders AS (
       UPDATE oms_orders o
       SET tracking_no = COALESCE(NULLIF(o.tracking_no, ''), u.item_tracking),
           shop_name = COALESCE(NULLIF(o.shop_name, ''), u.item_sender),
           customer_phone = COALESCE(NULLIF(o.customer_phone, ''), u.item_phone),
           import_id = $1,
           updated_at = now()
       FROM unmatched_items u
       WHERE o.order_uid = u.target_order_uid
       RETURNING u.item_uid, u.target_order_uid, u.target_paid_date
     ),
     updated_items AS (
       UPDATE oms_order_items i
       SET order_uid = u.target_order_uid
       FROM unmatched_items u
       WHERE i.order_uid = u.item_uid
         AND NOT EXISTS (
           SELECT 1 FROM oms_order_items i2
           WHERE i2.order_uid = u.target_order_uid AND i2.line_no = i.line_no
         )
       RETURNING i.order_uid
     )
     SELECT DISTINCT target_paid_date AS paid_date FROM updated_orders`,
    [importId],
    client,
  );

  for (const r of unmatchedItemsLinked) {
    if (r.paid_date) affectedPaidDates.add(String(r.paid_date));
  }

  return [...affectedPaidDates];
}

export async function reconcileAndSyncThreeFiles(
  client: Queryable,
  fallbackImportId: number,
  nowIso: string,
): Promise<{ matchedOrders: number; syncedOmsBills: number }> {
  // 0a. Smart Order UID Linker: รวมร่าง order_uid ระหว่างไฟล์ออเดอร์กับไฟล์สินค้าในกรณีที่ไฟล์หนึ่งมีเลขพัสดุและอีกไฟล์ไม่มีเลขพัสดุ
  const mergedUidPaidDates = await reconcileCrossFileOrderUids(client, fallbackImportId);

  // 0. Enforce TikTok, Shopee, Facebook, LINE & Other policy on newly imported rows (scoped by import_id to avoid full-table scans)
  await query(
    `DELETE FROM oms_order_items WHERE import_id = $1 AND COALESCE(NULLIF(channel, ''), 'TikTok') NOT IN ('TikTok', 'Shopee', 'Facebook', 'Lazada', 'LINE', 'Other')`,
    [fallbackImportId],
    client,
  );
  await query(
    `DELETE FROM oms_orders WHERE import_id = $1 AND COALESCE(NULLIF(channel, ''), 'TikTok') NOT IN ('TikTok', 'Shopee', 'Facebook', 'Lazada', 'LINE', 'Other')`,
    [fallbackImportId],
    client,
  );
  await query(
    `DELETE FROM transactions WHERE import_id = $1 AND COALESCE(NULLIF(channel, ''), 'TikTok') NOT IN ('TikTok', 'Shopee', 'Facebook', 'Lazada', 'LINE', 'Other')`,
    [fallbackImportId],
    client,
  );

  // 0b. Never allow Facebook, LINE or Other OMS orders to hold a Settlement matched_external_id,
  //     and never allow TikTok Settlement rows to have channel <> 'TikTok'
  //     (Shopee เปลี่ยนเป็น flow 3 ไฟล์แบบ TikTok — จับคู่ไฟล์รายได้ Shopee ด้วย exact-ID ได้แล้ว)
  await query(
    `UPDATE oms_orders
     SET matched_external_id = NULL,
          updated_at = now()
     WHERE channel IN ('Facebook', 'Lazada', 'LINE', 'Other')
       AND matched_external_id IS NOT NULL`,
    [],
    client,
  );
  await query(
    `UPDATE transactions
     SET channel = 'TikTok'
     WHERE is_order = 1
       AND transaction_type <> 'คำสั่งซื้อ (OMS)'
       AND channel <> 'TikTok'
       AND channel <> 'Shopee'`,
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

  // 2b. Shopee (ไฟล์รายได้ Shopee แบบ 3 ไฟล์): exact-ID match เท่านั้น
  //     (oms_orders.marketplace_order_norm = transactions.external_id เรียงตามตัวอักษร)
  //     — ห้ามเดาด้วยยอดเงิน+วันที่ และแยกขอบเขตแพลตฟอร์มชัดเจนทั้งสองฝั่ง (AGENTS.md ข้อ 3)
  await query(
    `UPDATE oms_orders o
     SET matched_external_id = t.external_id,
         updated_at = now()
     FROM transactions t
     WHERE (o.matched_external_id IS NULL OR o.import_id = $1 OR t.import_id = $1)
       AND t.is_order = 1
       AND t.transaction_type <> 'คำสั่งซื้อ (OMS)'
       AND o.channel = 'Shopee'
       AND t.channel = 'Shopee'
       AND o.marketplace_order_norm IS NOT NULL
       AND o.marketplace_order_norm <> ''
       AND t.external_id = o.marketplace_order_norm
       AND (o.matched_external_id IS DISTINCT FROM t.external_id)`,
    [fallbackImportId],
    client,
  );

  // 3. If an OMS order now matched a real Settlement row, copy any user-entered buyer tax info first (#13),
  //    then remove any temporary 'คำสั่งซื้อ (OMS)' row for that exact order_uid
  //    AND remove any unpaid/unshipped/zero-sales Shopee & Facebook OMS bills so they are never taxed.
  await query(
    `UPDATE transactions target
     SET buyer_name = COALESCE(NULLIF(target.buyer_name, ''), NULLIF(temp.buyer_name, '')),
         buyer_tax_id = COALESCE(NULLIF(target.buyer_tax_id, ''), NULLIF(temp.buyer_tax_id, '')),
         buyer_address = COALESCE(NULLIF(target.buyer_address, ''), NULLIF(temp.buyer_address, ''))
     FROM oms_orders o
     JOIN transactions temp
       ON temp.transaction_type = 'คำสั่งซื้อ (OMS)'
      AND (
        temp.oms_order_uid = o.order_uid
        OR (
          o.marketplace_order_norm IS NOT NULL
          AND o.marketplace_order_norm <> ''
          AND temp.external_id = o.marketplace_order_norm
        )
      )
     WHERE o.matched_external_id IS NOT NULL
       AND target.external_id = o.matched_external_id
       AND target.is_order = 1
       AND target.transaction_type <> 'คำสั่งซื้อ (OMS)'
       AND (
         (temp.buyer_name IS NOT NULL AND temp.buyer_name <> '')
         OR (temp.buyer_tax_id IS NOT NULL AND temp.buyer_tax_id <> '')
         OR (temp.buyer_address IS NOT NULL AND temp.buyer_address <> '')
       )`,
    [],
    client,
  );

  const deletedTempRows = await query<{ paid_date: string }>(
    `DELETE FROM transactions t
     WHERE t.transaction_type = 'คำสั่งซื้อ (OMS)'
       AND (
         EXISTS (
           SELECT 1
           FROM oms_orders o
           WHERE o.matched_external_id IS NOT NULL
             AND o.order_uid = t.oms_order_uid
         )
         OR EXISTS (
           SELECT 1
           FROM oms_orders o
           WHERE o.matched_external_id IS NOT NULL
             AND o.marketplace_order_norm IS NOT NULL
             AND o.marketplace_order_norm <> ''
             AND o.marketplace_order_norm = t.external_id
         )
         OR (
           t.channel = 'Shopee'
           AND (
             t.income <= 0
             OR EXISTS (
               SELECT 1
               FROM oms_orders o
               WHERE o.order_uid = t.oms_order_uid
                 AND (
                   o.sales_amount <= 0
                   OR ((o.tracking_no IS NULL OR o.tracking_no = '') AND (o.printed_date IS NULL OR o.printed_date = ''))
                 )
             )
           )
         )
         OR (
           t.channel = 'Facebook'
           AND (
             t.income <= 0
             OR EXISTS (
               SELECT 1
               FROM oms_orders o
               WHERE o.order_uid = t.oms_order_uid
                 AND (
                   o.sales_amount <= 0
                   OR o.paid_date IS NULL
                   OR o.paid_date = ''
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

  // 4. For TikTok, Shopee, Facebook, LINE & Other OMS orders that do NOT have a Settlement row (newly imported or not yet in transactions),
  //    create/upsert a bill row in transactions so they appear in /bills and can be tracked.
  //    - Shopee & Facebook: filter out unpaid/unshipped/zero-sales orders so they are never taxed.
  //    - LINE: require paid_date and sales_amount > 0.
  //    - Other: allow orders with paid_date or created_date (including 0-baht internal sample orders).
  const unmatchedRows = await query<Record<string, unknown>>(
    `SELECT o.*
     FROM oms_orders o
     WHERE o.matched_external_id IS NULL
       AND COALESCE(NULLIF(o.channel, ''), 'TikTok') IN ('TikTok', 'Shopee', 'Facebook', 'LINE', 'Other')
       AND (
         COALESCE(NULLIF(o.channel, ''), 'TikTok') = 'TikTok'
         OR (
           o.channel = 'Shopee'
           AND o.sales_amount > 0
           AND o.paid_date IS NOT NULL AND o.paid_date <> ''
           AND ((o.tracking_no IS NOT NULL AND o.tracking_no <> '') OR (o.printed_date IS NOT NULL AND o.printed_date <> ''))
         )
         OR (
           o.channel = 'Facebook'
           AND o.sales_amount > 0
           AND o.paid_date IS NOT NULL AND o.paid_date <> ''
         )
         OR (
           o.channel = 'LINE'
           AND o.sales_amount > 0
           AND o.paid_date IS NOT NULL AND o.paid_date <> ''
         )
         OR (
           o.channel = 'Other'
           AND ((o.paid_date IS NOT NULL AND o.paid_date <> '') OR (o.created_date IS NOT NULL AND o.created_date <> ''))
         )
       )
       AND (
         o.import_id = $1
         OR EXISTS (
           SELECT 1 FROM oms_order_items i
           WHERE i.order_uid = o.order_uid AND i.import_id = $1
         )
         OR (
           NOT EXISTS (
             SELECT 1 FROM transactions t
             WHERE t.is_order = 1
               AND t.oms_order_uid = o.order_uid
           )
           AND (
             o.marketplace_order_norm IS NULL
             OR o.marketplace_order_norm = ''
             OR NOT EXISTS (
               SELECT 1 FROM transactions t
               WHERE t.is_order = 1
                 AND t.external_id = o.marketplace_order_norm
             )
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
      // AGENTS.md Rule 3 & 4 (Strict Platform Financial Isolation):
      // - TikTok OMS temp row: payout = salesAmount - shippingSeller, cogs = 0
      // - Shopee, Facebook, LINE, Other (Shipnity 2-file channels): payout = salesAmount - shippingSeller (net cash for tax), cogs = cogsAmount
      let payout = netOmsPayout;
      let cogs = 0;
      if (channel === "TikTok") {
        payout = netOmsPayout;
        cogs = 0;
      } else if (channel === "Shopee") {
        payout = netOmsPayout;
        cogs = cogsAmount;
      } else if (channel === "Facebook") {
        payout = netOmsPayout;
        cogs = cogsAmount;
      } else if (channel === "Lazada") {
        payout = netOmsPayout;
        cogs = 0;
      } else if (channel === "LINE") {
        payout = netOmsPayout;
        cogs = cogsAmount;
      } else if (channel === "Other") {
        payout = netOmsPayout;
        cogs = cogsAmount;
      }

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
          shipnityProfit: profitAmount,
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
      const shopName = r.shop_name ? String(r.shop_name) : null;
      const base = i * 23;
      placeholders.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16}::jsonb,$${base + 17}::jsonb,$${base + 18}::jsonb,$${base + 19},$${base + 20},$${base + 21},$${base + 22},$${base + 23})`,
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
        shopName,
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
        normalized_json, created_at, channel, order_code, oms_order_uid, shop_name
      ) VALUES ${placeholders.join(", ")}`,
      params,
      client,
    );
    // เลขที่ใบกำกับฯ ออกใน syncMonthlyInvoiceRegistry (ท้ายฟังก์ชันนี้) เท่านั้น
  }

  // 5. Stamp order_code, oms_order_uid, shop_name, and channel onto matched transactions (order-independent across all 3 files)
  //    First ensure oms_orders.shop_name is populated from oms_order_items.sender_name whenever items exist
  await query(
    `UPDATE oms_orders o
     SET shop_name = sub.sender_name,
         updated_at = now()
     FROM (
       SELECT DISTINCT ON (order_uid) order_uid, sender_name
       FROM oms_order_items
       WHERE order_uid IS NOT NULL AND order_uid <> ''
         AND sender_name IS NOT NULL AND sender_name <> ''
       ORDER BY order_uid, line_no ASC
     ) sub
     WHERE o.order_uid = sub.order_uid
       AND (o.shop_name IS NULL OR o.shop_name = '')`,
    [],
    client,
  );

  //    5a-extra: For oms_orders still missing shop_name, infer from other oms_orders with the same created_by email/user,
  //    and for LINE OA orders without Shipnity items (e.g., clearance orders where created_by = '-'), fallback to the dominant shop_name in the same import
  await query(
    `UPDATE oms_orders o
     SET shop_name = sub.shop_name,
         updated_at = now()
     FROM (
       SELECT created_by,
              (ARRAY_AGG(shop_name ORDER BY cnt DESC))[1] AS shop_name
       FROM (
         SELECT created_by, shop_name, COUNT(*) AS cnt
         FROM oms_orders
         WHERE created_by IS NOT NULL AND created_by <> '' AND created_by <> '-'
           AND shop_name IS NOT NULL AND shop_name <> ''
         GROUP BY created_by, shop_name
       ) g
       GROUP BY created_by
     ) sub
     WHERE o.created_by = sub.created_by
       AND (o.shop_name IS NULL OR o.shop_name = '')`,
    [],
    client,
  );

  await query(
    `UPDATE oms_orders o
     SET shop_name = sub.shop_name,
         updated_at = now()
     FROM (
       SELECT import_id,
              (ARRAY_AGG(shop_name ORDER BY cnt DESC))[1] AS shop_name
       FROM (
         SELECT import_id, shop_name, COUNT(*) AS cnt
         FROM oms_orders
         WHERE import_id IS NOT NULL
           AND shop_name IS NOT NULL AND shop_name <> ''
         GROUP BY import_id, shop_name
       ) g
       GROUP BY import_id
     ) sub
     WHERE o.channel IN ('LINE', 'Facebook')
       AND o.import_id = sub.import_id
       AND (o.shop_name IS NULL OR o.shop_name = '')`,
    [],
    client,
  );

  //    TikTok Settlement rows (transaction_type <> 'คำสั่งซื้อ (OMS)') strictly match via external_id = o.matched_external_id
  //    and ALWAYS keep channel = 'TikTok'
  //    (Shopee settlement rows ถูก merge ใน 5a-Shopee แยกต่างหาก — ห้ามบังคับเป็น TikTok)
  await query(
    `UPDATE transactions t
     SET order_code = o.order_code,
         oms_order_uid = o.order_uid,
         shop_name = COALESCE(NULLIF(o.shop_name, ''), t.shop_name),
         channel = CASE
           WHEN t.transaction_type <> 'คำสั่งซื้อ (OMS)' THEN 'TikTok'
           ELSE COALESCE(NULLIF(o.channel, ''), t.channel, 'TikTok')
         END
     FROM oms_orders o
     WHERE t.is_order = 1
       AND t.transaction_type <> 'คำสั่งซื้อ (OMS)'
       AND t.channel <> 'Shopee'
       AND o.matched_external_id IS NOT NULL
       AND t.external_id = o.matched_external_id
       AND (
         t.order_code IS DISTINCT FROM o.order_code
         OR t.oms_order_uid IS DISTINCT FROM o.order_uid
         OR t.shop_name IS DISTINCT FROM COALESCE(NULLIF(o.shop_name, ''), t.shop_name)
         OR t.channel IS DISTINCT FROM 'TikTok'
       )`,
    [],
    client,
  );

  //    5a-Shopee: merge native Shopee settlement rows with their Shopee OMS order
  //    (exact-ID match only — channel คงเป็น 'Shopee' ทั้งสองฝั่ง ห้ามปนกับ TikTok)
  await query(
    `UPDATE transactions t
     SET order_code = o.order_code,
         oms_order_uid = o.order_uid,
         shop_name = COALESCE(NULLIF(o.shop_name, ''), t.shop_name)
     FROM oms_orders o
     WHERE t.is_order = 1
       AND t.transaction_type <> 'คำสั่งซื้อ (OMS)'
       AND t.channel = 'Shopee'
       AND o.channel = 'Shopee'
       AND o.matched_external_id IS NOT NULL
       AND t.external_id = o.matched_external_id
       AND (
         t.order_code IS DISTINCT FROM o.order_code
         OR t.oms_order_uid IS DISTINCT FROM o.order_uid
         OR t.shop_name IS DISTINCT FROM COALESCE(NULLIF(o.shop_name, ''), t.shop_name)
       )`,
    [],
    client,
  );

  await query(
    `UPDATE transactions t
     SET order_code = o.order_code,
         oms_order_uid = o.order_uid,
         shop_name = COALESCE(NULLIF(o.shop_name, ''), t.shop_name),
         channel = COALESCE(NULLIF(o.channel, ''), t.channel, 'TikTok')
     FROM oms_orders o
     WHERE t.is_order = 1
       AND t.transaction_type = 'คำสั่งซื้อ (OMS)'
       AND t.oms_order_uid = o.order_uid
       AND (
         t.order_code IS DISTINCT FROM o.order_code
         OR t.shop_name IS DISTINCT FROM COALESCE(NULLIF(o.shop_name, ''), t.shop_name)
         OR t.channel IS DISTINCT FROM COALESCE(NULLIF(o.channel, ''), t.channel, 'TikTok')
       )`,
    [],
    client,
  );

  await query(
    `UPDATE transactions t
     SET order_code = o.order_code,
         oms_order_uid = o.order_uid,
         shop_name = COALESCE(NULLIF(o.shop_name, ''), t.shop_name),
         channel = COALESCE(NULLIF(o.channel, ''), t.channel, 'TikTok')
     FROM oms_orders o
     WHERE t.is_order = 1
       AND t.transaction_type = 'คำสั่งซื้อ (OMS)'
       AND o.marketplace_order_norm IS NOT NULL
       AND o.marketplace_order_norm <> ''
       AND t.external_id = o.marketplace_order_norm
       AND (
         t.order_code IS DISTINCT FROM o.order_code
         OR t.oms_order_uid IS DISTINCT FROM o.order_uid
         OR t.shop_name IS DISTINCT FROM COALESCE(NULLIF(o.shop_name, ''), t.shop_name)
         OR t.channel IS DISTINCT FROM COALESCE(NULLIF(o.channel, ''), t.channel, 'TikTok')
       )`,
    [],
    client,
  );

  //    Also sync transactions.shop_name directly from oms_order_items.sender_name by oms_order_uid if still empty
  await query(
    `UPDATE transactions t
     SET shop_name = sub.sender_name
     FROM (
       SELECT DISTINCT ON (order_uid) order_uid, sender_name
       FROM oms_order_items
       WHERE order_uid IS NOT NULL AND order_uid <> ''
         AND sender_name IS NOT NULL AND sender_name <> ''
       ORDER BY order_uid, line_no ASC
     ) sub
     WHERE t.oms_order_uid = sub.order_uid
       AND (t.shop_name IS NULL OR t.shop_name = '')`,
    [],
    client,
  );

  // 5b. Keep oms_order_items.channel aligned with oms_orders.channel by order_uid
  await query(
    `UPDATE oms_order_items i
     SET channel = o.channel
     FROM oms_orders o
     WHERE i.order_uid = o.order_uid
       AND (i.import_id = $1 OR o.import_id = $1)
       AND o.channel IN ('TikTok', 'Shopee', 'Facebook', 'Lazada', 'LINE', 'Other')
       AND i.channel IS DISTINCT FROM o.channel`,
    [fallbackImportId],
    client,
  );

  // 5c. Link TikTok Platform Compensation rows ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์') to oms_orders and shop_name
  //     ห้ามดึงแถวของ Shopee มาเปลี่ยนเป็น TikTok (Strict Platform Financial Isolation)
  await query(
    `UPDATE transactions t
     SET order_code = o.order_code,
         oms_order_uid = o.order_uid,
         shop_name = COALESCE(o.shop_name, t.shop_name),
         channel = 'TikTok'
     FROM oms_orders o
     WHERE t.is_order = 0
       AND t.transaction_type IN ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์')
       AND COALESCE(NULLIF(t.channel, ''), 'TikTok') <> 'Shopee'
       AND (t.import_id = $1 OR o.import_id = $1 OR t.order_code IS NULL OR t.shop_name IS NULL)
       AND o.marketplace_order_norm IS NOT NULL
       AND o.marketplace_order_norm <> ''
       AND (
         COALESCE(NULLIF(t.related_order_id, ''), t.normalized_json->'fields'->>'relatedOrderId') = o.marketplace_order_norm
         OR (
           o.marketplace_order_prefix IS NOT NULL
           AND LENGTH(o.marketplace_order_prefix) >= 14
           AND LEFT(COALESCE(NULLIF(t.related_order_id, ''), t.normalized_json->'fields'->>'relatedOrderId', ''), 15) = o.marketplace_order_prefix
         )
       )
       AND (
         t.order_code IS DISTINCT FROM o.order_code
         OR t.oms_order_uid IS DISTINCT FROM o.order_uid
         OR t.shop_name IS NULL
       )`,
    [fallbackImportId],
    client,
  );

  await query(
    `UPDATE transactions t
     SET shop_name = ord.shop_name
     FROM transactions ord
     WHERE t.is_order = 0
       AND t.transaction_type IN ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์')
       AND (t.shop_name IS NULL OR t.shop_name = '')
       AND ord.is_order = 1
       AND ord.shop_name IS NOT NULL AND ord.shop_name <> ''
       AND ord.external_id = COALESCE(NULLIF(t.related_order_id, ''), t.normalized_json->'fields'->>'relatedOrderId')`,
    [],
    client,
  );

  await query(
    `UPDATE transactions t
     SET shop_name = COALESCE(
       (
         SELECT t2.shop_name
         FROM transactions t2
         WHERE t2.import_id = t.import_id
           AND t2.shop_name IS NOT NULL AND t2.shop_name <> ''
         GROUP BY t2.shop_name
         ORDER BY COUNT(*) DESC
         LIMIT 1
       ),
       (
         SELECT t3.shop_name
         FROM transactions t3
         WHERE t3.shop_name IS NOT NULL AND t3.shop_name <> ''
           AND t3.shop_name <> 'อื่นๆ'
           AND t3.shop_name <> 'รอผูกไฟล์ร้านค้า'
         GROUP BY t3.shop_name
         ORDER BY COUNT(*) DESC
         LIMIT 1
       )
     )
     WHERE t.is_order = 0
       AND t.transaction_type IN ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์')
       AND t.payout > 0
       AND (t.shop_name IS NULL OR t.shop_name = '')`,
    [],
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
       SELECT DISTINCT oms_order_uid AS order_uid FROM transactions WHERE (is_order = 1 OR transaction_type IN ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์')) AND oms_order_uid IS NOT NULL AND oms_order_uid <> '' AND (product_detail IS NULL OR product_detail = '' OR product_detail = '/' OR product_detail NOT LIKE '%·%' OR product_detail LIKE 'CLEARANCE · %')
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

  // 6b. Fallback: if any order transaction still lacks SKU/product summary ('·'), match by order_code + same channel + same year-month
  await query(
    `WITH item_by_code AS (
       SELECT DISTINCT ON (i.order_code, COALESCE(NULLIF(i.channel, ''), 'TikTok'), SUBSTRING(COALESCE(NULLIF(i.paid_date, ''), i.created_date) FROM 1 FOR 7))
         i.order_code,
         COALESCE(NULLIF(i.channel, ''), 'TikTok') AS channel,
         SUBSTRING(COALESCE(NULLIF(i.paid_date, ''), i.created_date) FROM 1 FOR 7) AS ym,
         i.order_uid,
         MAX(NULLIF(i.sender_name, '')) AS sender_name,
         STRING_AGG(i.sku_code || ' · ' || i.product_name || ' × ' || i.quantity::text, '; ' ORDER BY i.line_no) AS summary_text
       FROM oms_order_items i
       WHERE i.order_code IS NOT NULL AND i.order_code <> ''
       GROUP BY i.order_code, COALESCE(NULLIF(i.channel, ''), 'TikTok'), SUBSTRING(COALESCE(NULLIF(i.paid_date, ''), i.created_date) FROM 1 FOR 7), i.order_uid
       ORDER BY i.order_code, COALESCE(NULLIF(i.channel, ''), 'TikTok'), SUBSTRING(COALESCE(NULLIF(i.paid_date, ''), i.created_date) FROM 1 FOR 7), i.order_uid DESC
     )
     UPDATE transactions t
     SET product_detail = c.summary_text,
         shop_name = COALESCE(NULLIF(t.shop_name, ''), c.sender_name)
     FROM item_by_code c
     WHERE t.is_order = 1
       AND t.order_code = c.order_code
       AND COALESCE(NULLIF(t.channel, ''), 'TikTok') = c.channel
       AND (
         SUBSTRING(COALESCE(NULLIF(t.created_date, ''), t.paid_date) FROM 1 FOR 7) = c.ym
         OR SUBSTRING(COALESCE(NULLIF(t.paid_date, ''), t.created_date) FROM 1 FOR 7) = c.ym
       )
       AND (t.product_detail IS NULL OR t.product_detail = '' OR t.product_detail = '/' OR t.product_detail NOT LIKE '%·%' OR t.product_detail LIKE 'CLEARANCE · %')`,
    [],
    client,
  );

  // 6c. LINE OA & Facebook accounting/clearance orders without Shipnity item records:
  //     stamp "CLEARANCE · ..." so they are eligible for tax invoices and display on bills & tax invoices.
  //     If real oms_order_items are uploaded later, steps 6 / 6b above will automatically overwrite this.
  await query(
    `UPDATE transactions t
     SET product_detail = CASE
           WHEN o.note IS NOT NULL AND o.note LIKE '%เปลี่ยนไซส์%' THEN 'CLEARANCE · ' || o.note || ' × ' || GREATEST(1, COALESCE(o.total_qty, 1))::text
           ELSE 'CLEARANCE · สินค้าโล๊ะสต๊อก × ' || GREATEST(1, COALESCE(o.total_qty, 1))::text
         END,
         shop_name = COALESCE(NULLIF(t.shop_name, ''), NULLIF(o.shop_name, ''))
     FROM oms_orders o
     WHERE t.is_order = 1
       AND t.channel IN ('LINE', 'Facebook')
       AND o.accounting_import_id IS NOT NULL
       AND t.oms_order_uid = o.order_uid
       AND t.income > 0
       AND (t.product_detail IS NULL OR t.product_detail = '' OR t.product_detail = '/' OR t.product_detail NOT LIKE '%·%')
       AND NOT EXISTS (
         SELECT 1 FROM oms_order_items i WHERE i.order_uid = t.oms_order_uid
       )`,
    [],
    client,
  );

  const matchedCountRow = await queryOne<{ c: string | number }>(
    "SELECT COUNT(*) AS c FROM oms_orders WHERE import_id = $1 AND matched_external_id IS NOT NULL",
    [fallbackImportId],
    client,
  );

  await syncMonthlyInvoiceRegistry(
    client,
    fallbackImportId && fallbackImportId > 0 ? fallbackImportId : undefined,
  );

  await refreshSummaryTables(client, {
    importId: fallbackImportId,
    dates: [...deletedTempPaidDates, ...mergedUidPaidDates],
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
         SELECT t.external_id FROM transactions t WHERE (t.is_order = 1 OR ${BILLABLE_COMPENSATION_SQL}) AND t.import_id = $1
         UNION
         SELECT t.external_id FROM oms_orders o
         JOIN transactions t ON t.oms_order_uid = o.order_uid AND (t.is_order = 1 OR ${BILLABLE_COMPENSATION_SQL})
         WHERE o.import_id = $1
         UNION
         SELECT t.external_id FROM oms_orders o
         JOIN transactions t ON t.external_id = o.matched_external_id AND t.is_order = 1
         WHERE o.import_id = $1
         UNION
         SELECT t.external_id FROM oms_order_items i
         JOIN transactions t ON t.oms_order_uid = i.order_uid AND (t.is_order = 1 OR ${BILLABLE_COMPENSATION_SQL})
         WHERE i.import_id = $1
         UNION
         SELECT r.order_id AS external_id FROM invoice_registry r
         WHERE r.status = 'active'
           AND NOT EXISTS (
             SELECT 1 FROM transactions t
             WHERE t.external_id = r.order_id AND ${INVOICE_ELIGIBLE_SQL}
           )
         UNION
         SELECT r.order_id FROM invoice_registry r WHERE r.seq IS NULL
       )`
    : `cand AS (
         SELECT t.external_id FROM transactions t WHERE (t.is_order = 1 OR ${BILLABLE_COMPENSATION_SQL}) AND $1::int IS NULL
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
       SELECT r.yymm, COALESCE(NULLIF(r.channel, ''), 'TikTok') AS channel, MAX(r.seq) AS max_seq
       FROM invoice_registry r
       WHERE r.yymm IN (SELECT DISTINCT yymm FROM newo)
       GROUP BY r.yymm, COALESCE(NULLIF(r.channel, ''), 'TikTok')
     ),
     numbered AS (
       SELECT n.external_id, COALESCE(NULLIF(n.channel, ''), 'TikTok') AS channel, n.yymm,
              COALESCE(mx.max_seq, 0) + ROW_NUMBER() OVER (
                PARTITION BY n.yymm, COALESCE(NULLIF(n.channel, ''), 'TikTok')
                ORDER BY n.eff_date ASC, n.external_id ASC
              ) AS seq
       FROM newo n
       LEFT JOIN mx ON mx.yymm = n.yymm AND mx.channel = COALESCE(NULLIF(n.channel, ''), 'TikTok')
     ),
     ins AS (
       INSERT INTO invoice_registry (order_id, invoice_no, yymm, seq, channel, status)
       SELECT external_id,
              CASE
                WHEN channel = 'TikTok' THEN 'SEQ/' || yymm || '/' || LPAD(seq::text, GREATEST(5, LENGTH(seq::text)), '0')
                ELSE 'SEQ/' || UPPER(channel) || '/' || yymm || '/' || LPAD(seq::text, GREATEST(5, LENGTH(seq::text)), '0')
              END,
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
  const { clearDailyBatchesCache } = await import("../queries");
  clearDailyBatchesCache();
  let targetDates = (scope?.dates ?? []).filter((d) => d && d !== "unknown");
  let targetSkus = (scope?.skus ?? []).filter(Boolean);

  if (scope?.importId) {
    const dateRows = await query<{ paid_date: string }>(
      `SELECT DISTINCT paid_date FROM transactions WHERE import_id = $1 AND paid_date <> '' AND paid_date <> 'unknown'
       UNION
       SELECT DISTINCT paid_date FROM oms_orders WHERE import_id = $1 AND paid_date <> '' AND paid_date <> 'unknown'
       UNION
       SELECT DISTINCT paid_date FROM oms_order_items WHERE import_id = $1 AND paid_date <> '' AND paid_date <> 'unknown'
       UNION
       SELECT DISTINCT t.paid_date
       FROM oms_orders o
       JOIN transactions t ON t.external_id = o.matched_external_id AND t.is_order = 1
       WHERE o.import_id = $1 AND t.paid_date <> '' AND t.paid_date <> 'unknown'
       UNION
       SELECT DISTINCT o.paid_date
       FROM oms_orders o
       JOIN transactions t ON t.external_id = o.matched_external_id AND t.is_order = 1
       WHERE t.import_id = $1 AND o.paid_date <> '' AND o.paid_date <> 'unknown'
       UNION
       SELECT DISTINCT t.paid_date
       FROM oms_order_items i
       JOIN transactions t ON t.oms_order_uid = i.order_uid
       WHERE i.import_id = $1 AND t.paid_date <> '' AND t.paid_date <> 'unknown'`,
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
         tiktok_count, shopee_count, facebook_count, lazada_count, line_count, other_channel_count, compensation_count,
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
         SUM(CASE WHEN is_order = 1 AND channel = 'Lazada' THEN 1 ELSE 0 END)::int,
         SUM(CASE WHEN is_order = 1 AND channel = 'LINE' THEN 1 ELSE 0 END)::int,
         SUM(CASE WHEN is_order = 1 AND channel = 'Other' THEN 1 ELSE 0 END)::int,
         SUM(CASE WHEN is_order = 0 AND transaction_type IN ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์') AND payout > 0 THEN 1 ELSE 0 END)::int,
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
         AND channel IN ('TikTok', 'Shopee', 'Facebook', 'Lazada', 'LINE', 'Other')
         AND NOT (channel = 'Shopee' AND transaction_type = 'คำสั่งซื้อ (OMS)')
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
         tiktok_count, shopee_count, facebook_count, lazada_count, line_count, other_channel_count, compensation_count,
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
         SUM(CASE WHEN is_order = 1 AND channel = 'Lazada' THEN 1 ELSE 0 END)::int,
         SUM(CASE WHEN is_order = 1 AND channel = 'LINE' THEN 1 ELSE 0 END)::int,
         SUM(CASE WHEN is_order = 1 AND channel = 'Other' THEN 1 ELSE 0 END)::int,
         SUM(CASE WHEN is_order = 0 AND transaction_type IN ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์') AND payout > 0 THEN 1 ELSE 0 END)::int,
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
         AND channel IN ('TikTok', 'Shopee', 'Facebook', 'Lazada', 'LINE', 'Other')
         AND NOT (channel = 'Shopee' AND transaction_type = 'คำสั่งซื้อ (OMS)')
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
      `WITH target_orders AS (
         SELECT DISTINCT COALESCE(NULLIF(order_uid, ''), order_code) AS ord_key
         FROM oms_order_items
         WHERE sku_code = ANY($1::text[])
       ),
       order_lines AS (
         SELECT
           i.*,
           COALESCE(NULLIF(i.order_uid, ''), i.order_code) AS ord_key,
           SUM(i.unit_price * i.quantity) OVER (PARTITION BY COALESCE(NULLIF(i.order_uid, ''), i.order_code)) AS order_gross_sum,
           COUNT(*) OVER (PARTITION BY COALESCE(NULLIF(i.order_uid, ''), i.order_code)) AS order_line_cnt
         FROM oms_order_items i
         JOIN target_orders to_ord ON COALESCE(NULLIF(i.order_uid, ''), i.order_code) = to_ord.ord_key
         WHERE COALESCE(NULLIF(i.channel, ''), 'TikTok') IN ('TikTok', 'Shopee', 'Facebook', 'Lazada', 'LINE', 'Other')
       )
       INSERT INTO sku_summaries (
         sku_code, product_name, total_qty, order_count, gross_amount,
         net_sales_amount, tiktok_qty, shopee_qty, facebook_qty, lazada_qty, line_qty, other_qty, updated_at
       )
       SELECT
         i.sku_code,
         MAX(i.product_name),
         COALESCE(SUM(i.quantity), 0)::int,
         COUNT(DISTINCT i.ord_key)::int,
         ROUND(COALESCE(SUM(i.unit_price * i.quantity), 0)::numeric, 2),
         ROUND(COALESCE(SUM(
           CASE
             WHEN i.order_gross_sum > 0 THEN i.order_sales_amount * (i.unit_price * i.quantity) / i.order_gross_sum
             WHEN i.order_line_cnt > 0 THEN i.order_sales_amount / i.order_line_cnt
             ELSE i.order_sales_amount
           END
         ), 0)::numeric, 2),
         COALESCE(SUM(CASE WHEN COALESCE(NULLIF(i.channel, ''), 'TikTok') = 'TikTok' THEN i.quantity ELSE 0 END), 0)::int,
         COALESCE(SUM(CASE WHEN i.channel = 'Shopee' THEN i.quantity ELSE 0 END), 0)::int,
         COALESCE(SUM(CASE WHEN i.channel = 'Facebook' THEN i.quantity ELSE 0 END), 0)::int,
         COALESCE(SUM(CASE WHEN i.channel = 'Lazada' THEN i.quantity ELSE 0 END), 0)::int,
         COALESCE(SUM(CASE WHEN i.channel = 'LINE' THEN i.quantity ELSE 0 END), 0)::int,
         COALESCE(SUM(CASE WHEN i.channel = 'Other' THEN i.quantity ELSE 0 END), 0)::int,
         now()
       FROM order_lines i
       WHERE i.sku_code = ANY($1::text[])
       GROUP BY i.sku_code`,
      [targetSkus],
      client,
    );
  } else if (!scope?.importId) {
    await query("DELETE FROM sku_summaries", [], client);
    await query(
      `WITH order_lines AS (
         SELECT
           i.*,
           COALESCE(NULLIF(i.order_uid, ''), i.order_code) AS ord_key,
           SUM(i.unit_price * i.quantity) OVER (PARTITION BY COALESCE(NULLIF(i.order_uid, ''), i.order_code)) AS order_gross_sum,
           COUNT(*) OVER (PARTITION BY COALESCE(NULLIF(i.order_uid, ''), i.order_code)) AS order_line_cnt
         FROM oms_order_items i
         WHERE COALESCE(NULLIF(i.channel, ''), 'TikTok') IN ('TikTok', 'Shopee', 'Facebook', 'Lazada', 'LINE', 'Other')
       )
       INSERT INTO sku_summaries (
         sku_code, product_name, total_qty, order_count, gross_amount,
         net_sales_amount, tiktok_qty, shopee_qty, facebook_qty, lazada_qty, line_qty, other_qty, updated_at
       )
       SELECT
         i.sku_code,
         MAX(i.product_name),
         COALESCE(SUM(i.quantity), 0)::int,
         COUNT(DISTINCT i.ord_key)::int,
         ROUND(COALESCE(SUM(i.unit_price * i.quantity), 0)::numeric, 2),
         ROUND(COALESCE(SUM(
           CASE
             WHEN i.order_gross_sum > 0 THEN i.order_sales_amount * (i.unit_price * i.quantity) / i.order_gross_sum
             WHEN i.order_line_cnt > 0 THEN i.order_sales_amount / i.order_line_cnt
             ELSE i.order_sales_amount
           END
         ), 0)::numeric, 2),
         COALESCE(SUM(CASE WHEN COALESCE(NULLIF(i.channel, ''), 'TikTok') = 'TikTok' THEN i.quantity ELSE 0 END), 0)::int,
         COALESCE(SUM(CASE WHEN i.channel = 'Shopee' THEN i.quantity ELSE 0 END), 0)::int,
         COALESCE(SUM(CASE WHEN i.channel = 'Facebook' THEN i.quantity ELSE 0 END), 0)::int,
         COALESCE(SUM(CASE WHEN i.channel = 'Lazada' THEN i.quantity ELSE 0 END), 0)::int,
         COALESCE(SUM(CASE WHEN i.channel = 'LINE' THEN i.quantity ELSE 0 END), 0)::int,
         COALESCE(SUM(CASE WHEN i.channel = 'Other' THEN i.quantity ELSE 0 END), 0)::int,
         now()
       FROM order_lines i
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

  const isAccountingUpload =
    options.uploadCategory === "accounting" ||
    /line[\s_-]*ปี|เฟสบุ๊ค|เฟสบุค|บัญชี/i.test(options.filename);

  const existing = await queryOne<{
    id: number | string;
    has_blob: boolean;
    file_type: string;
    row_count: number | string;
    is_accounting: number | string;
  }>(
    "SELECT id, (file_blob IS NOT NULL) AS has_blob, file_type, row_count, COALESCE(is_accounting, 0) AS is_accounting FROM imports WHERE file_hash = $1",
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
    const prevIsAccounting = Number(existing.is_accounting ?? 0) === 1;
    const requestedIsAccounting =
      options.uploadCategory === "accounting"
        ? true
        : options.uploadCategory === "standard"
          ? false
          : prevIsAccounting || isAccountingUpload;
    if (
      existing.file_type === "oms_orders" ||
      existing.file_type === "oms_items"
    ) {
      const reParsed = await detectAndParseOmsInput(
        options.buffer,
        effectiveCustomMapping,
      );
      const hasMultiMarketplace = Boolean(
        reParsed?.orders.some(
          (o) => o.channel === "TikTok" || o.channel === "Shopee",
        ),
      );
      const effectiveIsAccounting =
        reParsed?.fileType === "oms_orders" &&
        !hasMultiMarketplace &&
        requestedIsAccounting;
      const modeChanged = effectiveIsAccounting !== prevIsAccounting;
      if (
        reParsed &&
        (reParsed.dataRowCount > Number(existing.row_count ?? 0) ||
          reParsed.orders.length > 0 ||
          modeChanged)
      ) {
        const now = new Date().toISOString();
        const effectiveOrders =
          reParsed.orders.length > 0
            ? reParsed.orders.length
            : new Set(reParsed.items.map((i) => i.orderUid)).size;
        await withTransaction(async (client) => {
          await query(
            `UPDATE imports
             SET row_count = $1, transaction_count = $1, order_count = $2,
                 period_start = COALESCE($3, period_start),
                 period_end = COALESCE($4, period_end),
                 is_accounting = $5
             WHERE id = $6`,
            [
              reParsed.dataRowCount,
              effectiveOrders,
              reParsed.periodStart,
              reParsed.periodEnd,
              effectiveIsAccounting ? 1 : 0,
              existingId,
            ],
            client,
          );
          if (!effectiveIsAccounting && prevIsAccounting) {
            await query(
              `UPDATE oms_orders o
               SET accounting_import_id = NULL,
                   accounting_sales_amount = NULL,
                   sales_amount = COALESCE(
                     (SELECT MAX(i.order_sales_amount) FROM oms_order_items i WHERE i.order_uid = o.order_uid AND i.order_sales_amount > 0),
                     o.sales_amount
                   ),
                   updated_at = now()
               WHERE o.accounting_import_id = $1`,
              [existingId],
              client,
            );
          }
          if (reParsed.orders.length > 0) {
            await saveOmsOrdersBatch(reParsed.orders, existingId, client, {
              isAccounting: effectiveIsAccounting,
            });
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
    const hasMultiMarketplace = omsParsed.orders.some(
      (o) => o.channel === "TikTok" || o.channel === "Shopee",
    );
    const isAccountingOms =
      omsParsed.fileType === "oms_orders" &&
      !hasMultiMarketplace &&
      isAccountingUpload;
    if (
      omsParsed.fileType === "oms_orders" &&
      isAccountingUpload &&
      hasMultiMarketplace
    ) {
      omsParsed.warnings.unshift({
        code: "AUTO_SWITCHED_TO_STANDARD_OMS",
        message:
          "ตรวจพบออเดอร์ TikTok / Shopee ในไฟล์นี้ ระบบจึงปรับเป็นโหมด 'ไฟล์ออเดอร์ Shipnity ปกติ' ให้อัตโนมัติ (สามารถสลับโหมดภายหลังได้ที่หน้าประวัติการนำเข้า)",
        severity: "info",
      });
    }
    const activeCompanyId = await getActiveCompanyId();
    const crossCompanyWarn = detectCrossCompanyWarning(
      activeCompanyId,
      options.filename,
      [
        ...omsParsed.orders.slice(0, 100).flatMap((o) => [o.createdBy, o.contactName]),
        ...omsParsed.items.slice(0, 100).map((i) => i.senderName),
      ],
    );
    if (crossCompanyWarn) {
      omsParsed.warnings.unshift(crossCompanyWarn);
    }
    const fileLabel =
      omsParsed.fileType === "oms_orders"
        ? isAccountingOms
          ? "ไฟล์สรุปออเดอร์จากฝ่ายบัญชี"
          : "ไฟล์ออเดอร์ใน shipnity"
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
          unknown_columns_json, report_json, reconciliation_json, file_type, file_blob, is_accounting
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
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
          isAccountingOms ? 1 : 0,
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
        await saveOmsOrdersBatch(omsParsed.orders, id, client, {
          isAccounting: isAccountingOms,
        });
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

  const lazadaParsed = await detectAndParseLazadaInput(
    options.buffer,
    preloadedSheets,
  );
  if (lazadaParsed) {
    const now = new Date().toISOString();
    const fileLabel = "ไฟล์คำสั่งซื้อและรายได้ Lazada";

    if (lazadaParsed.lazadaSubtype === "balance_transactions") {
      reportProgress?.({
        stage: "done",
        percent: 100,
        message:
          "ข้ามไฟล์ประวัติฝาก-ถอนเงินกระเป๋า Lazada อัตโนมัติ (ไม่มีเลขคำสั่งซื้อ)",
        current: lazadaParsed.dataRowCount,
        total: lazadaParsed.dataRowCount,
      });
      const systemOrderCount = await readSystemOrderCount();
      return {
        importId: 0,
        duplicate: true,
        filename: options.filename,
        fileType: lazadaParsed.fileType,
        status: "ok",
        rowCount: lazadaParsed.dataRowCount,
        orderCount: 0,
        transactionCount: 0,
        systemOrderCount,
        periodStart: lazadaParsed.periodStart,
        periodEnd: lazadaParsed.periodEnd,
        headerSignature: lazadaParsed.headerSignature,
        newFormat: false,
        warnings: lazadaParsed.warnings,
        reconciliation: {
          matched: null,
          orderCheckFailures: 0,
          metrics: [],
          reportAvailable: false,
        },
      };
    }

    reportProgress?.({
      stage: "reconciling",
      percent: 45,
      message: `ตรวจพบ${fileLabel} จำนวน ${lazadaParsed.dataRowCount.toLocaleString("th-TH")} แถว (${lazadaParsed.orders.length.toLocaleString("th-TH")} ออเดอร์) กำลังบันทึกเข้าสู่ระบบ...`,
    });

    const emptyReport: ReportSummary = {
      found: false,
      sheetName: lazadaParsed.sheetName,
      periodStart: lazadaParsed.periodStart,
      periodEnd: lazadaParsed.periodEnd,
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

    const effectiveOrders = lazadaParsed.orders.length;

    const { importId } = await withTransaction(async (client) => {
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
          lazadaParsed.sheetName,
          lazadaParsed.headerRow,
          lazadaParsed.periodStart,
          lazadaParsed.periodEnd,
          "UTC+7",
          "THB",
          lazadaParsed.headerSignature,
          "ok",
          lazadaParsed.dataRowCount,
          lazadaParsed.transactions.length,
          effectiveOrders,
          JSON.stringify(lazadaParsed.warnings),
          JSON.stringify(lazadaParsed.mapping),
          JSON.stringify([]),
          JSON.stringify(emptyReport),
          JSON.stringify(emptyReconciliation),
          lazadaParsed.fileType,
          compressFileBlob(options.buffer),
        ],
        client,
      );
      const id = Number(inserted!.id);

      reportProgress?.({
        stage: "saving",
        percent: 70,
        message: `กำลังบันทึก${fileLabel} และผูกข้อมูลร้านค้า...`,
      });

      if (lazadaParsed.orders.length > 0) {
        await saveOmsOrdersBatch(lazadaParsed.orders, id, client);
      }
      if (lazadaParsed.items.length > 0) {
        await saveOmsItemsBatch(lazadaParsed.items, id, client);
      }

      await query(
        `UPDATE oms_orders
         SET shop_name = CASE
           WHEN contact_name IS NULL OR contact_name = '' OR contact_name = 'TH1JWSSKAK' THEN 'Kiddee Shop'
           ELSE contact_name
         END
         WHERE import_id = $1 AND channel = 'Lazada'`,
        [id],
        client,
      );

      const touchedLazadaPaidDates = new Set<string>();
      const BATCH_SIZE = 300;
      for (let start = 0; start < lazadaParsed.transactions.length; start += BATCH_SIZE) {
        const chunk = lazadaParsed.transactions.slice(start, start + BATCH_SIZE);
        const extIds = chunk.map((t) => t.externalId);
        const orderUidsInChunk = chunk.map((t) => t.omsOrderUid);

        const existingRows = await query<{
          external_id: string;
          oms_order_uid: string | null;
          paid_date: string | null;
          income: string | number;
          fee_total: string | number;
          payout: string | number;
          normalized_json: unknown;
        }>(
          `SELECT external_id, oms_order_uid, paid_date, income, fee_total, payout, normalized_json
           FROM transactions
           WHERE is_order = 1
             AND channel = 'Lazada'
             AND (
               external_id = ANY($1::text[])
               OR oms_order_uid = ANY($2::text[])
             )`,
          [extIds, orderUidsInChunk],
          client,
        );
        for (const r of existingRows) {
          if (r.paid_date) touchedLazadaPaidDates.add(String(r.paid_date));
        }
        const existingByExt = new Map(
          existingRows.map((r) => [String(r.external_id), r]),
        );

        const params: unknown[] = [];
        const placeholders: string[] = [];

        for (let i = 0; i < chunk.length; i++) {
          let tx: LazadaNormalizedTransaction = chunk[i]!;
          const prev = existingByExt.get(tx.externalId);

          if (prev) {
            const prevNorm =
              typeof prev.normalized_json === "string"
                ? (JSON.parse(prev.normalized_json) as NormalizedTransaction)
                : ((prev.normalized_json as NormalizedTransaction) ?? tx);
            const prevHasFees =
              Number(prev.fee_total ?? 0) < 0 ||
              (prevNorm.unknownValues ?? []).some((u) => u.amount < 0);

            if (lazadaParsed.lazadaSubtype === "order_export" && prevHasFees) {
              // Keep existing financial statement breakdown; only update omsOrderUid & buyer metadata
              tx = {
                ...prevNorm,
                omsOrderUid: tx.omsOrderUid,
                raw: {
                  ...prevNorm.raw,
                  ...tx.raw,
                },
              };
            } else {
              // Check if new tx is a fee-refund-only supplement (no item price line) while prev had item price
              const newRawKeys = Object.keys(tx.raw ?? {});
              const newHasItemPrice = newRawKeys.some((k) =>
                isItemPriceTransactionName(k),
              );
              const prevRawKeys = Object.keys(prevNorm.raw ?? {});
              const prevHadItemPrice = prevRawKeys.some((k) =>
                isItemPriceTransactionName(k),
              );
              if (
                lazadaParsed.lazadaSubtype === "statement_detailed" &&
                !newHasItemPrice &&
                prevHadItemPrice
              ) {
                tx = {
                  ...prevNorm,
                  omsOrderUid: tx.omsOrderUid,
                };
              }
            }
          }

          const income = round2(Number(tx.fields.incomeTotal ?? 0));
          const feeTotal = round2(Number(tx.fields.feeTotal ?? 0));
          const payout = round2(Number(tx.fields.payout ?? 0));
          const base = i * 23;
          placeholders.push(
            `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16}::jsonb,$${base + 17}::jsonb,$${base + 18}::jsonb,$${base + 19},$${base + 20},$${base + 21},$${base + 22},$${base + 23})`,
          );
          params.push(
            id,
            tx.externalId,
            tx.transactionType,
            1,
            tx.createdAt,
            tx.paidAt,
            "THB",
            income,
            feeTotal,
            0,
            payout,
            tx.externalId,
            null,
            null,
            null,
            JSON.stringify(tx.checks),
            JSON.stringify(tx.warnings),
            JSON.stringify(tx),
            now,
            "Lazada",
            tx.externalId,
            tx.omsOrderUid,
            tx.shopName ?? "Kiddee Shop",
          );
        }

        await query(
          `DELETE FROM transactions
           WHERE is_order = 1
             AND (
               external_id = ANY($1::text[])
               OR oms_order_uid = ANY($2::text[])
             )`,
          [extIds, orderUidsInChunk],
          client,
        );

        await query(
          `INSERT INTO transactions (
            import_id, external_id, transaction_type, is_order, created_date, paid_date,
            currency, income, fee_total, adjustment, payout, related_order_id,
            product_detail, weight_estimated, weight_charged, checks_json, warnings_json,
            normalized_json, created_at, channel, order_code, oms_order_uid, shop_name
          ) VALUES ${placeholders.join(", ")}`,
          params,
          client,
        );
      }

      if (lazadaParsed.transactions.length > 0) {
        await reconcileAndSyncThreeFiles(client, id, now);
        if (touchedLazadaPaidDates.size > 0) {
          await refreshSummaryTables(client, {
            dates: [...touchedLazadaPaidDates],
          });
        }
      }

      return { importId: id };
    });

    reportProgress?.({
      stage: "done",
      percent: 100,
      message: `นำเข้า${fileLabel} สำเร็จ (${lazadaParsed.dataRowCount.toLocaleString("th-TH")} แถว · ${effectiveOrders.toLocaleString("th-TH")} ออเดอร์)`,
      current: lazadaParsed.dataRowCount,
      total: lazadaParsed.dataRowCount,
    });

    const systemOrderCount = await readSystemOrderCount();

    return {
      importId,
      duplicate: false,
      filename: options.filename,
      fileType: lazadaParsed.fileType,
      status: "ok",
      rowCount: lazadaParsed.dataRowCount,
      orderCount: effectiveOrders,
      transactionCount: lazadaParsed.transactions.length,
      systemOrderCount,
      periodStart: lazadaParsed.periodStart,
      periodEnd: lazadaParsed.periodEnd,
      headerSignature: lazadaParsed.headerSignature,
      newFormat: false,
      warnings: lazadaParsed.warnings,
      reconciliation: emptyReconciliation,
    };
  }

  const shopeeParsed = await detectAndParseShopeeInput(
    options.buffer,
    preloadedSheets,
  );
  if (shopeeParsed) {
    const now = new Date().toISOString();
    const fileLabel = "ไฟล์รายได้ Shopee (Shopee Settlement)";

    reportProgress?.({
      stage: "reconciling",
      percent: 45,
      message: `ตรวจพบ${fileLabel} จำนวน ${shopeeParsed.dataRowCount.toLocaleString("th-TH")} แถว (${shopeeParsed.orderCount.toLocaleString("th-TH")} คำสั่งซื้อ) กำลังบันทึกเข้าสู่ระบบ...`,
    });

    const shopeeReport: ReportSummary = {
      found: true,
      sheetName: shopeeParsed.sheetName,
      periodStart: shopeeParsed.periodStart,
      periodEnd: shopeeParsed.periodEnd,
      timezone: "UTC+7",
      currency: "THB",
      totals: {},
      raw: [],
    };
    const shopeeReconciliation: Reconciliation = {
      matched: null,
      orderCheckFailures: 0,
      metrics: [],
      reportAvailable: false,
    };

    const { importId } = await withTransaction(async (client) => {
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
          shopeeParsed.sheetName,
          shopeeParsed.headerRow,
          shopeeParsed.periodStart,
          shopeeParsed.periodEnd,
          "UTC+7",
          "THB",
          shopeeParsed.headerSignature,
          "ok",
          shopeeParsed.dataRowCount,
          shopeeParsed.transactions.length,
          shopeeParsed.orderCount,
          JSON.stringify(shopeeParsed.warnings),
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify(shopeeReport),
          JSON.stringify(shopeeReconciliation),
          shopeeParsed.fileType,
          compressFileBlob(options.buffer),
        ],
        client,
      );
      const id = Number(inserted!.id);

      reportProgress?.({
        stage: "saving",
        percent: 70,
        message: `กำลังบันทึก${fileLabel} และผูกข้อมูลร้านค้า...`,
      });

      // Batch Insert (ห้ามเขียน DB ทีละแถว — AGENTS.md ข้อ 3): ลบแถว Shopee settlement เดิมของ external_id เดียวกัน
      // แล้ว insert ก้อนละ 300 แถว — ขอบเขต channel='Shopee' เท่านั้น (Strict Platform Financial Isolation)
      const touchedShopeePaidDates = new Set<string>();
      const BATCH_SIZE = 300;
      for (
        let start = 0;
        start < shopeeParsed.transactions.length;
        start += BATCH_SIZE
      ) {
        const chunk = shopeeParsed.transactions.slice(start, start + BATCH_SIZE);
        const extIds = chunk.map((t) => t.externalId);

        // แถวที่จะถูกแทนที่ = แถวรายได้ Shopee เดิม + placeholder OMS ของคำสั่งซื้อเดียวกัน
        // placeholder OMS เป็น is_order=1 ตัวเดียวกับบิล จึงชน ux_transactions_order ถ้าไม่ลบก่อน insert
        // และต้องยกชื่อ/เลขภาษี/ที่อยู่ผู้ซื้อที่ผู้ใช้กรอกไว้ในแถว OMS มาด้วย ไม่งั้นใบกำกับฯ ของ Shopee จะหายข้อมูลผู้ซื้อ
        const replacedRows = await query<{
          external_id: string;
          paid_date: string | null;
          buyer_name: string | null;
          buyer_tax_id: string | null;
          buyer_address: string | null;
        }>(
          `SELECT external_id, paid_date, buyer_name, buyer_tax_id, buyer_address
           FROM transactions
           WHERE channel = 'Shopee'
             AND external_id = ANY($1::text[])
             AND (transaction_type <> 'คำสั่งซื้อ (OMS)' OR is_order = 1)`,
          [extIds],
          client,
        );
        const buyerByExternalId = new Map<
          string,
          { name: string | null; tax: string | null; address: string | null }
        >();
        for (const r of replacedRows) {
          if (r.paid_date) touchedShopeePaidDates.add(String(r.paid_date));
          const prev = buyerByExternalId.get(r.external_id) ?? {
            name: null,
            tax: null,
            address: null,
          };
          buyerByExternalId.set(r.external_id, {
            name: prev.name ?? r.buyer_name ?? null,
            tax: prev.tax ?? r.buyer_tax_id ?? null,
            address: prev.address ?? r.buyer_address ?? null,
          });
        }

        const params: unknown[] = [];
        const placeholders: string[] = [];
        for (let i = 0; i < chunk.length; i++) {
          const tx = chunk[i]!;
          const base = i * 26;
          placeholders.push(
            `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16}::jsonb,$${base + 17}::jsonb,$${base + 18}::jsonb,$${base + 19},$${base + 20},$${base + 21},$${base + 22},$${base + 23},$${base + 24},$${base + 25},$${base + 26})`,
          );
          params.push(
            id,
            tx.externalId,
            tx.transactionType,
            tx.isOrder ? 1 : 0,
            tx.createdAt,
            tx.paidAt,
            "THB",
            round2(Number(tx.fields.incomeTotal ?? 0)),
            round2(Number(tx.fields.feeTotal ?? 0)),
            round2(Number(tx.fields.adjustment ?? 0)),
            round2(Number(tx.fields.payout ?? 0)),
            typeof tx.fields.relatedOrderId === "string"
              ? tx.fields.relatedOrderId
              : null,
            // product_detail/น้ำหนัก มาจาก oms_order_items ผ่าน step 6 ของ reconcileAndSyncThreeFiles
            null,
            null,
            null,
            JSON.stringify(tx.checks),
            JSON.stringify(tx.warnings),
            JSON.stringify({ ...tx, raw: {} }),
            now,
            "Shopee",
            null,
            null,
            shopeeParsed.shopName,
            buyerByExternalId.get(tx.externalId)?.name ?? null,
            buyerByExternalId.get(tx.externalId)?.tax ?? null,
            buyerByExternalId.get(tx.externalId)?.address ?? null,
          );
          if (tx.paidAt) touchedShopeePaidDates.add(tx.paidAt);
        }

        await query(
          `DELETE FROM transactions
           WHERE channel = 'Shopee'
             AND external_id = ANY($1::text[])
             AND (transaction_type <> 'คำสั่งซื้อ (OMS)' OR is_order = 1)`,
          [extIds],
          client,
        );

        await query(
          `INSERT INTO transactions (
            import_id, external_id, transaction_type, is_order, created_date, paid_date,
            currency, income, fee_total, adjustment, payout, related_order_id,
            product_detail, weight_estimated, weight_charged, checks_json, warnings_json,
            normalized_json, created_at, channel, order_code, oms_order_uid, shop_name,
            buyer_name, buyer_tax_id, buyer_address
          ) VALUES ${placeholders.join(", ")}`,
          params,
          client,
        );
      }

      if (shopeeParsed.transactions.length > 0) {
        await reconcileAndSyncThreeFiles(client, id, now);
        if (touchedShopeePaidDates.size > 0) {
          await refreshSummaryTables(client, {
            dates: [...touchedShopeePaidDates],
          });
        }
      }

      return { importId: id };
    });

    reportProgress?.({
      stage: "done",
      percent: 100,
      message: `นำเข้า${fileLabel} สำเร็จ (${shopeeParsed.dataRowCount.toLocaleString("th-TH")} แถว · ${shopeeParsed.orderCount.toLocaleString("th-TH")} คำสั่งซื้อ)`,
      current: shopeeParsed.dataRowCount,
      total: shopeeParsed.dataRowCount,
    });

    const systemOrderCount = await readSystemOrderCount();

    return {
      importId,
      duplicate: false,
      filename: options.filename,
      fileType: shopeeParsed.fileType,
      status: "ok",
      rowCount: shopeeParsed.dataRowCount,
      orderCount: shopeeParsed.orderCount,
      transactionCount: shopeeParsed.transactions.length,
      systemOrderCount,
      periodStart: shopeeParsed.periodStart,
      periodEnd: shopeeParsed.periodEnd,
      headerSignature: shopeeParsed.headerSignature,
      newFormat: false,
      warnings: shopeeParsed.warnings,
      reconciliation: shopeeReconciliation,
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
          "ไม่รู้จักชื่อคอลัมน์ในไฟล์นี้ กรุณาจับคู่คอลัมน์เองเพื่อนำเข้า",
          rawHeaders,
        );
      }
    }
    throw err;
  }
  const warnings = [...parsed.warnings];
  const activeCompanyIdForSettlement = await getActiveCompanyId();
  const settlementCrossWarn = detectCrossCompanyWarning(
    activeCompanyIdForSettlement,
    options.filename,
    [],
  );
  if (settlementCrossWarn) {
    warnings.unshift(settlementCrossWarn);
  }

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
        const existingOrderRows = await query<{
          external_id: string;
          import_id: number | null;
          transaction_type: string;
          paid_date: string | null;
          income: string | number;
          fee_total: string | number;
          adjustment: string | number;
          payout: string | number;
          buyer_name: string | null;
          buyer_tax_id: string | null;
          buyer_address: string | null;
          oms_order_uid: string | null;
          order_code: string | null;
          shop_name: string | null;
          normalized_json: unknown;
        }>(
          `SELECT external_id, import_id, transaction_type, paid_date,
                  income, fee_total, adjustment, payout,
                  buyer_name, buyer_tax_id, buyer_address,
                  oms_order_uid, order_code, shop_name, normalized_json
           FROM transactions
           WHERE external_id = ANY($1::text[]) AND is_order = 1`,
          [orderExternalIds],
          client,
        );
        const existingByExt = new Map(
          existingOrderRows.map((r) => [String(r.external_id), r]),
        );

        const extIdsToDelete = new Set<string>();
        const effectiveOrderChunk: Array<{
          tx: NormalizedTransaction;
          buyerName: string | null;
          buyerTaxId: string | null;
          buyerAddress: string | null;
          omsOrderUid: string | null;
          orderCode: string | null;
          shopName: string | null;
        }> = [];

        for (let i = 0; i < orderChunk.length; i++) {
          let tx = orderChunk[i]!;
          const prev = existingByExt.get(tx.externalId);
          let buyerName: string | null = null;
          let buyerTaxId: string | null = null;
          let buyerAddress: string | null = null;
          let omsOrderUid: string | null = null;
          let orderCode: string | null = null;
          let shopName: string | null = null;

          if (prev) {
            const prevYm = String(prev.paid_date ?? "").slice(0, 7);
            const currYm = String(tx.paidAt ?? "").slice(0, 7);
            const isPrevSettlement = prev.transaction_type !== "คำสั่งซื้อ (OMS)";

            if (isPrevSettlement && prevYm && currYm && prevYm !== currYm) {
              // Guard #16a: Cross-month settlement adjustment/refund for an order already settled in a different month.
              // Keep the original month's locked sale/invoice untouched and record this month's row as an adjustment.
              const origExtId = tx.externalId;
              const dateSuffix = String(tx.paidAt || currYm).replace(/[^0-9A-Za-z]/g, "");
              const adjExtId = `${origExtId}-ADJ-${dateSuffix}`;
              extIdsToDelete.add(adjExtId);
              tx = {
                ...tx,
                externalId: adjExtId,
                fields: {
                  ...tx.fields,
                  orderId: adjExtId,
                  relatedOrderId: origExtId,
                },
              };
              orderCode = prev.order_code ?? origExtId;
              shopName = prev.shop_name ?? null;
            } else {
              extIdsToDelete.add(tx.externalId);
              buyerName = prev.buyer_name ?? null;
              buyerTaxId = prev.buyer_tax_id ?? null;
              buyerAddress = prev.buyer_address ?? null;
              omsOrderUid = prev.oms_order_uid ?? null;
              orderCode = prev.order_code ?? null;
              shopName = prev.shop_name ?? null;

              // Guard #16b: Same-month split settlement files (e.g. Week 1 positive sale + Week 2 partial refund/adjustment)
              const prevIncome = Number(prev.income ?? 0);
              const currIncome = Number(tx.fields.incomeTotal ?? 0);
              if (
                isPrevSettlement &&
                Number(prev.import_id ?? 0) !== id &&
                ((prevIncome > 0 && currIncome <= 0) || (prevIncome <= 0 && currIncome > 0))
              ) {
                const prevNorm =
                  typeof prev.normalized_json === "string"
                    ? (JSON.parse(prev.normalized_json) as NormalizedTransaction)
                    : ((prev.normalized_json as NormalizedTransaction) ?? null);
                if (prevNorm && prevNorm.fields) {
                  const mergedFields: Record<string, string | number> = {
                    ...prevNorm.fields,
                  };
                  for (const [k, v] of Object.entries(tx.fields)) {
                    if (typeof v === "number") {
                      const prevNum =
                        typeof mergedFields[k] === "number" ? (mergedFields[k] as number) : 0;
                      mergedFields[k] = round2(prevNum + v);
                    } else if (typeof v === "string" && v !== "") {
                      mergedFields[k] = v;
                    }
                  }
                  tx = {
                    ...tx,
                    createdAt: prevNorm.createdAt || tx.createdAt,
                    paidAt: tx.paidAt || prevNorm.paidAt,
                    fields: mergedFields,
                    unknownValues: [
                      ...(prevNorm.unknownValues ?? []),
                      ...(tx.unknownValues ?? []),
                    ],
                  };
                }
              }
            }
          } else {
            extIdsToDelete.add(tx.externalId);
          }

          effectiveOrderChunk.push({
            tx,
            buyerName,
            buyerTaxId,
            buyerAddress,
            omsOrderUid,
            orderCode,
            shopName,
          });
        }

        if (extIdsToDelete.size > 0) {
          await query(
            "DELETE FROM transactions WHERE external_id = ANY($1::text[]) AND is_order = 1",
            [[...extIdsToDelete]],
            client,
          );
        }

        const orderParams: unknown[] = [];
        const orderPlaceholders: string[] = [];

        for (let i = 0; i < effectiveOrderChunk.length; i++) {
          const item = effectiveOrderChunk[i]!;
          const transaction = item.tx;
          const base = i * 26;
          orderPlaceholders.push(
            `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16}::jsonb,$${base + 17}::jsonb,$${base + 18}::jsonb,$${base + 19},$${base + 20},$${base + 21},$${base + 22},$${base + 23},$${base + 24},$${base + 25},$${base + 26})`,
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
            item.buyerName,
            item.buyerTaxId,
            item.buyerAddress,
            item.omsOrderUid,
            item.orderCode,
            item.shopName,
          );
        }

        await query(
          `INSERT INTO transactions (
            import_id, external_id, transaction_type, is_order, created_date, paid_date,
            currency, income, fee_total, adjustment, payout, related_order_id,
            product_detail, weight_estimated, weight_charged, checks_json, warnings_json,
            normalized_json, created_at, channel,
            buyer_name, buyer_tax_id, buyer_address, oms_order_uid, order_code, shop_name
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

export async function toggleImportAccountingMode(
  importId: number,
  targetIsAccounting?: boolean,
): Promise<{
  id: number;
  filename: string;
  fileType: string;
  isAccounting: boolean;
} | null> {
  const { decompressFileBlob } = await import("../file-blob");
  const row = await queryOne<{
    id: number | string;
    filename: string;
    file_type: string;
    is_accounting: number | string;
    file_blob: unknown;
  }>(
    `SELECT id, filename, COALESCE(file_type, 'settlement') AS file_type,
            COALESCE(is_accounting, 0) AS is_accounting, file_blob
     FROM imports WHERE id = $1`,
    [importId],
  );
  if (!row) return null;
  if (row.file_type !== "oms_orders") {
    throw new IngestError(
      "UNSUPPORTED_CATEGORY_TOGGLE",
      "สามารถสลับโหมดไฟล์ปกติ ⇄ ไฟล์บัญชี ได้เฉพาะไฟล์ออเดอร์เท่านั้น",
    );
  }

  const prevIsAccounting = Number(row.is_accounting ?? 0) === 1;
  const nextIsAccounting =
    targetIsAccounting !== undefined ? Boolean(targetIsAccounting) : !prevIsAccounting;
  const now = new Date().toISOString();

  await withTransaction(async (client) => {
    await query(
      "UPDATE imports SET is_accounting = $1 WHERE id = $2",
      [nextIsAccounting ? 1 : 0, importId],
      client,
    );

    if (nextIsAccounting) {
      // เปลี่ยนจากไฟล์ปกติ -> ไฟล์สรุปจากฝ่ายบัญชี
      const buf = decompressFileBlob(row.file_blob);
      if (buf && buf.length > 0) {
        const savedRules = await getColumnMappingRules();
        const reParsed = await detectAndParseOmsInput(
          buf,
          savedRules.headerToFieldKey,
        );
        if (reParsed && reParsed.orders.length > 0) {
          await saveOmsOrdersBatch(reParsed.orders, importId, client, {
            isAccounting: true,
          });
          await query(
            "UPDATE imports SET order_count = $1, warnings_json = $2 WHERE id = $3",
            [reParsed.orders.length, JSON.stringify(reParsed.warnings), importId],
            client,
          );
        }
      }
      await query(
        `UPDATE oms_orders
         SET accounting_import_id = $1,
             accounting_sales_amount = sales_amount,
             updated_at = now()
         WHERE import_id = $1
           AND channel IN ('LINE', 'Facebook')`,
        [importId],
        client,
      );
    } else {
      // เปลี่ยนจากไฟล์บัญชี -> ไฟล์ออเดอร์ Shipnity ปกติ (#20: sync both columns and normalized_json)
      const affectedOrders = await query<{ order_uid: string; paid_date: string | null }>(
        `UPDATE oms_orders o
         SET accounting_import_id = NULL,
             accounting_sales_amount = NULL,
             sales_amount = COALESCE(
               (SELECT MAX(i.order_sales_amount) FROM oms_order_items i WHERE i.order_uid = o.order_uid AND i.order_sales_amount > 0),
               o.sales_amount
             ),
             updated_at = now()
         WHERE o.accounting_import_id = $1 OR o.import_id = $1
         RETURNING o.order_uid, o.paid_date`,
        [importId],
        client,
      );
      const affectedUids = affectedOrders.map((r) => r.order_uid);
      if (affectedUids.length > 0) {
        await query(
          `UPDATE transactions t
           SET income = o.sales_amount,
               payout = ROUND((o.sales_amount - ABS(COALESCE(o.shipping_fee_seller, 0)))::numeric, 2),
               normalized_json = CASE
                 WHEN t.normalized_json IS NOT NULL AND jsonb_typeof(t.normalized_json) = 'object' THEN
                   jsonb_set(
                     jsonb_set(
                       jsonb_set(
                         jsonb_set(
                           jsonb_set(
                             t.normalized_json,
                             '{fields,incomeTotal}',
                             to_jsonb(ROUND(o.sales_amount::numeric, 2)),
                             true
                           ),
                           '{fields,customerPayment}',
                           to_jsonb(ROUND(o.sales_amount::numeric, 2)),
                           true
                         ),
                         '{fields,productAfterDiscount}',
                         to_jsonb(ROUND(GREATEST(0, o.sales_amount - COALESCE(o.shipping_fee_customer, 0))::numeric, 2)),
                         true
                       ),
                       '{fields,productBeforeDiscount}',
                       to_jsonb(ROUND((GREATEST(0, o.sales_amount - COALESCE(o.shipping_fee_customer, 0)) + ABS(COALESCE(o.discount_total, 0)))::numeric, 2)),
                       true
                     ),
                     '{fields,payout}',
                     to_jsonb(ROUND((o.sales_amount - ABS(COALESCE(o.shipping_fee_seller, 0)))::numeric, 2)),
                     true
                   )
                 ELSE t.normalized_json
               END
           FROM oms_orders o
           WHERE t.oms_order_uid = o.order_uid
             AND t.transaction_type = 'คำสั่งซื้อ (OMS)'
             AND o.order_uid = ANY($1::text[])`,
          [affectedUids],
          client,
        );
      }
      const affectedDates = affectedOrders
        .map((r) => String(r.paid_date ?? ""))
        .filter((d) => d && d !== "unknown");
      if (affectedDates.length > 0) {
        await refreshSummaryTables(client, { dates: affectedDates });
      }
    }

    await reconcileAndSyncThreeFiles(client, importId, now);
  });

  return {
    id: Number(row.id),
    filename: String(row.filename),
    fileType: String(row.file_type),
    isAccounting: nextIsAccounting,
  };
}
