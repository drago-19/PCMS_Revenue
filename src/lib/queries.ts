import { query, queryOne, withTransaction, type Queryable } from "./db";
import { decompressFileBlob } from "./file-blob";
import { formatInvoiceNoWithPrefix, type SellerInfo } from "./seller";
import { getDocumentSettings } from "./settings";
import {
  readInputSheets,
  type IngestWarning,
  type MappingEntry,
  type NormalizedTransaction,
  type Primitive,
  type ReportSummary,
  type TransactionChecks,
  type UnknownColumn,
} from "./ingest/parse";
import type { Reconciliation } from "./ingest/import-service";

export interface ImportSpreadsheetSheet {
  name: string;
  headerRowIndex: number;
  headers: string[];
  rows: (string | number | null)[][];
  totalRows: number;
}

export interface ImportSpreadsheetData {
  importId: number;
  filename: string;
  fileType: string;
  sourceMode: "original_file" | "database_reconstructed";
  hasOriginalFile: boolean;
  sheets: ImportSpreadsheetSheet[];
}

const IMPORT_META_COLS = `
  id, filename, file_hash, file_size, imported_at, source, file_type,
  sheet_name, header_row, period_start, period_end, timezone, currency,
  header_signature, status, row_count, transaction_count, order_count,
  warnings_json, mapping_json, unknown_columns_json, report_json, reconciliation_json
`;

export interface ImportRow {
  id: number;
  filename: string;
  fileSize: number;
  importedAt: string;
  source: string;
  fileType: string;
  sheetName: string | null;
  headerRow: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  timezone: string | null;
  currency: string | null;
  headerSignature: string | null;
  status: string;
  rowCount: number;
  transactionCount: number;
  orderCount: number;
  warnings: IngestWarning[];
  mapping: MappingEntry[];
  unknownColumns: UnknownColumn[];
  report: ReportSummary;
  reconciliation: Reconciliation;
}

export interface OmsLineItem {
  skuCode: string;
  productName: string;
  unitPrice: number;
  quantity: number;
}

export interface TransactionRow {
  id: number;
  importId: number;
  externalId: string;
  transactionType: string;
  isOrder: boolean;
  createdDate: string;
  paidDate: string;
  currency: string;
  income: number;
  feeTotal: number;
  adjustment: number;
  payout: number;
  productDetail: string | null;
  weightEstimated: number | null;
  weightCharged: number | null;
  checks: TransactionChecks;
  warnings: IngestWarning[];
  normalized: NormalizedTransaction;
  createdAt: string;
  invoiceNo: string | null;
  importFilename?: string;
  importImportedAt?: string;
  channel: string;
  orderCode: string | null;
  buyerName?: string | null;
  buyerTaxId?: string | null;
  buyerAddress?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  postalCode?: string | null;
  province?: string | null;
  trackingNo?: string | null;
  courier?: string | null;
  discountCode?: string | null;
  discountTotal?: number;
  shippingFeeCustomer?: number;
  shippingFeeSeller?: number;
  marketplaceOrderRaw?: string | null;
  omsItems?: OmsLineItem[];
  sellerSettings?: SellerInfo;
}

export type OrderLinkStatus = "linked" | "unlinked" | "oms_only";

export function getOrderLinkStatus(row: TransactionRow): OrderLinkStatus {
  const hasOmsCode = Boolean(row.orderCode && row.orderCode.trim() !== "");
  if (!hasOmsCode) {
    return "unlinked";
  }
  if (row.transactionType === "คำสั่งซื้อ (OMS)") {
    return "oms_only";
  }
  return "linked";
}

export interface BillLinkCounts {
  all: number;
  linked: number;
  unlinked: number;
  omsOnly: number;
  missingOmsCreatedDates: string[];
}

export interface DailyBatchRow {
  date: string;
  orderCount: number;
  transactionCount: number;
  orderPayout: number;
  orderIncome: number;
  orderFees: number;
  otherCount: number;
  otherPayout: number;
  totalPayout: number;
  adjustment: number;
}

export interface DailyBatch {
  date: string;
  summary: DailyBatchRow;
  orders: TransactionRow[];
  others: TransactionRow[];
}

export type BillCategoryKey = "normal" | "refund_fee" | "zero";

export interface BillCategoryCounts {
  normal: number;
  refundFee: number;
  zero: number;
  refundFeePayout: number;
}

export interface BillListResult {
  rows: TransactionRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  category: BillCategoryKey;
  categoryCounts: BillCategoryCounts;
  summary: {
    income: number;
    fees: number;
    payout: number;
    count: number;
  };
  dateScope: {
    minPaidDate: string | null;
    maxPaidDate: string | null;
    distinctDates: number;
  };
  channelCounts: Record<string, number>;
  linkCounts: BillLinkCounts;
}

export interface OverallStats {
  importCount: number;
  orderCount: number;
  totalPayout: number;
  totalIncome: number;
  totalFees: number;
  latestPaidDate: string | null;
}

function parseJson<T>(value: unknown, fallback: T): T {
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

const REPORT_FALLBACK: ReportSummary = {
  found: false,
  sheetName: null,
  periodStart: null,
  periodEnd: null,
  timezone: null,
  currency: null,
  totals: {},
  raw: [],
};

function mapImport(row: Record<string, unknown>): ImportRow {
  return {
    id: Number(row.id),
    filename: String(row.filename ?? ""),
    fileSize: Number(row.file_size ?? 0),
    importedAt: String(row.imported_at ?? ""),
    source: String(row.source ?? "upload"),
    fileType: row.file_type ? String(row.file_type) : "settlement",
    sheetName: row.sheet_name ? String(row.sheet_name) : null,
    headerRow:
      row.header_row === null || row.header_row === undefined
        ? null
        : Number(row.header_row),
    periodStart: row.period_start ? String(row.period_start) : null,
    periodEnd: row.period_end ? String(row.period_end) : null,
    timezone: row.timezone ? String(row.timezone) : null,
    currency: row.currency ? String(row.currency) : null,
    headerSignature: row.header_signature ? String(row.header_signature) : null,
    status: String(row.status ?? "ok"),
    rowCount: Number(row.row_count ?? 0),
    transactionCount: Number(row.transaction_count ?? 0),
    orderCount: Number(row.order_count ?? 0),
    warnings: parseJson<IngestWarning[]>(row.warnings_json, []),
    mapping: parseJson<MappingEntry[]>(row.mapping_json, []),
    unknownColumns: parseJson<UnknownColumn[]>(row.unknown_columns_json, []),
    report: parseJson<ReportSummary>(row.report_json, REPORT_FALLBACK),
    reconciliation: parseJson<Reconciliation>(row.reconciliation_json, {
      matched: null,
      orderCheckFailures: 0,
      metrics: [],
      reportAvailable: false,
    }),
  };
}

export function mapTransaction(row: Record<string, unknown>): TransactionRow {
  const normalized = parseJson<NormalizedTransaction>(row.normalized_json, {
    externalId: String(row.external_id ?? ""),
    transactionType: String(row.transaction_type ?? ""),
    isOrder: Number(row.is_order ?? 0) === 1,
    createdAt: String(row.created_date ?? ""),
    paidAt: String(row.paid_date ?? ""),
    currency: String(row.currency ?? "THB"),
    fields: {},
    mappedFields: [],
    feeGroups: {},
    unknownValues: [],
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    raw: {},
    sourceRows: 1,
    firstRow: 0,
    rowIndexes: [],
  });
  const txType = String(row.transaction_type ?? "");
  const txIncome = Number(row.income ?? 0);
  const txPayout = Number(row.payout ?? 0);
  const isZeroRevenueSettlement =
    Number(row.is_order ?? 0) === 1 &&
    txType !== "คำสั่งซื้อ (OMS)" &&
    txIncome <= 0 &&
    txPayout <= 0;
  return {
    id: Number(row.id),
    importId: Number(row.import_id),
    externalId: String(row.external_id ?? ""),
    transactionType: txType,
    isOrder: Number(row.is_order ?? 0) === 1,
    createdDate: String(row.created_date ?? ""),
    paidDate: String(row.paid_date ?? ""),
    currency: String(row.currency ?? "THB"),
    income: txIncome,
    feeTotal: Number(row.fee_total ?? 0),
    adjustment: Number(row.adjustment ?? 0),
    payout: txPayout,
    productDetail: row.product_detail ? String(row.product_detail) : null,
    weightEstimated:
      row.weight_estimated === null || row.weight_estimated === undefined
        ? null
        : Number(row.weight_estimated),
    weightCharged:
      row.weight_charged === null || row.weight_charged === undefined
        ? null
        : Number(row.weight_charged),
    checks: parseJson<TransactionChecks>(row.checks_json, {
      incomeDiff: 0,
      feeDiff: 0,
      payoutDiff: 0,
    }),
    warnings: parseJson<IngestWarning[]>(row.warnings_json, []),
    normalized,
    createdAt: String(row.created_at ?? ""),
    invoiceNo:
      !isZeroRevenueSettlement && row.invoice_no ? String(row.invoice_no) : null,
    importFilename: row.import_filename ? String(row.import_filename) : undefined,
    importImportedAt: row.import_imported_at ? String(row.import_imported_at) : undefined,
    channel: row.channel ? String(row.channel) : "TikTok",
    orderCode: row.order_code ? String(row.order_code) : null,
    buyerName: row.buyer_name ? String(row.buyer_name) : null,
    buyerTaxId: row.buyer_tax_id ? String(row.buyer_tax_id) : null,
    buyerAddress: row.buyer_address ? String(row.buyer_address) : null,
  };
}

async function enrichTransactionsWithOms(
  txRows: TransactionRow[],
  db?: Queryable,
): Promise<TransactionRow[]> {
  const sellerSettings = await getDocumentSettings(db);
  const orderCodes = [
    ...new Set(
      txRows
        .map((r) => r.orderCode)
        .filter((code): code is string => Boolean(code)),
    ),
  ];
  if (orderCodes.length === 0) {
    return txRows.map((tx) => ({
      ...tx,
      invoiceNo: formatInvoiceNoWithPrefix(
        tx.invoiceNo,
        sellerSettings.invoicePrefix,
        tx.paidDate || tx.createdDate,
      ),
      sellerSettings,
    }));
  }

  const [orderMetaRows, itemRows] = await Promise.all([
    query<Record<string, unknown>>(
      "SELECT * FROM oms_orders WHERE order_code = ANY($1::text[])",
      [orderCodes],
      db,
    ),
    query<Record<string, unknown>>(
      "SELECT * FROM oms_order_items WHERE order_code = ANY($1::text[]) ORDER BY order_code ASC, line_no ASC",
      [orderCodes],
      db,
    ),
  ]);

  const orderMap = new Map<string, Record<string, unknown>>();
  for (const o of orderMetaRows) {
    orderMap.set(String(o.order_code), o);
  }

  const itemMap = new Map<
    string,
    {
      items: OmsLineItem[];
      address: string | null;
      postalCode: string | null;
      phone: string | null;
      name: string | null;
      trackingNo: string | null;
      courier: string | null;
    }
  >();

  for (const it of itemRows) {
    const code = String(it.order_code);
    let entry = itemMap.get(code);
    if (!entry) {
      entry = {
        items: [],
        address: null,
        postalCode: null,
        phone: null,
        name: null,
        trackingNo: null,
        courier: null,
      };
      itemMap.set(code, entry);
    }
    entry.items.push({
      skuCode: String(it.sku_code ?? ""),
      productName: String(it.product_name ?? ""),
      unitPrice: Number(it.unit_price ?? 0),
      quantity: Number(it.quantity ?? 1),
    });
    if (!entry.address && it.customer_address) entry.address = String(it.customer_address);
    if (!entry.postalCode && it.postal_code) entry.postalCode = String(it.postal_code);
    if (!entry.phone && it.customer_phone) entry.phone = String(it.customer_phone);
    if (!entry.name && it.customer_name) entry.name = String(it.customer_name);
    if (!entry.trackingNo && it.tracking_no) entry.trackingNo = String(it.tracking_no);
    if (!entry.courier && it.courier) entry.courier = String(it.courier);
  }

  return txRows.map((tx) => {
    const formattedInvoiceNo = formatInvoiceNoWithPrefix(
      tx.invoiceNo,
      sellerSettings.invoicePrefix,
      tx.paidDate || tx.createdDate,
    );
    if (!tx.orderCode) {
      return { ...tx, invoiceNo: formattedInvoiceNo, sellerSettings };
    }
    const o = orderMap.get(tx.orderCode);
    const it = itemMap.get(tx.orderCode);
    return {
      ...tx,
      invoiceNo: formattedInvoiceNo,
      sellerSettings,
      channel: o?.channel ? String(o.channel) : tx.channel,
      customerName: (o?.customer_name ? String(o.customer_name) : null) ?? it?.name ?? null,
      customerPhone: (o?.customer_phone ? String(o.customer_phone) : null) ?? it?.phone ?? null,
      customerAddress: it?.address ?? null,
      postalCode: it?.postalCode ?? null,
      province: o?.province && o.province !== "Unknown" ? String(o.province) : null,
      trackingNo: (o?.tracking_no ? String(o.tracking_no) : null) ?? it?.trackingNo ?? null,
      courier: (o?.courier ? String(o.courier) : null) ?? it?.courier ?? null,
      discountCode:
        o?.discount_code && String(o.discount_code) !== "-"
          ? String(o.discount_code)
          : null,
      discountTotal: o?.discount_total !== undefined ? Number(o.discount_total) : undefined,
      shippingFeeCustomer:
        o?.shipping_fee_customer !== undefined ? Number(o.shipping_fee_customer) : undefined,
      shippingFeeSeller:
        o?.shipping_fee_seller !== undefined ? Number(o.shipping_fee_seller) : undefined,
      marketplaceOrderRaw:
        o?.marketplace_order_raw && String(o.marketplace_order_raw) !== "-"
          ? String(o.marketplace_order_raw)
          : null,
      omsItems: it?.items ?? [],
    };
  });
}

export async function listImports(
  limit = 100,
  db?: Queryable,
): Promise<ImportRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT ${IMPORT_META_COLS} FROM imports ORDER BY id DESC LIMIT $1`,
    [limit],
    db,
  );
  return rows.map(mapImport);
}

export async function listImportsPaged(
  options: { page?: number; pageSize?: number } = {},
  db?: Queryable,
): Promise<{
  rows: ImportRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}> {
  const pageSize = Math.min(200, Math.max(10, options.pageSize ?? 20));
  const rawPage = Math.max(1, options.page ?? 1);
  const countRow = await queryOne<{ c: string | number }>(
    "SELECT COUNT(*) AS c FROM imports",
    [],
    db,
  );
  const total = Number(countRow?.c ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(rawPage, pageCount);
  const rows = await query<Record<string, unknown>>(
    `SELECT ${IMPORT_META_COLS} FROM imports ORDER BY id DESC LIMIT $1 OFFSET $2`,
    [pageSize, (page - 1) * pageSize],
    db,
  );
  return {
    rows: rows.map(mapImport),
    total,
    page,
    pageSize,
    pageCount,
  };
}

export async function getImport(
  id: number,
  db?: Queryable,
): Promise<ImportRow | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT ${IMPORT_META_COLS} FROM imports WHERE id = $1`,
    [id],
    db,
  );
  return row ? mapImport(row) : null;
}

export async function listDuplicateOrderTransactionsForImport(
  importId: number,
  db?: Queryable,
): Promise<TransactionRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT t.*, r.invoice_no, i.filename AS import_filename, i.imported_at AS import_imported_at
     FROM transactions t
     LEFT JOIN invoice_registry r ON r.order_id = t.external_id
     LEFT JOIN imports i ON i.id = t.import_id
     WHERE t.import_id = $1
       AND COALESCE((t.normalized_json->>'sourceRows')::int, 1) > 1
     ORDER BY t.paid_date DESC, t.external_id ASC`,
    [importId],
    db,
  );
  return enrichTransactionsWithOms(rows.map(mapTransaction), db);
}

export async function getLatestImport(db?: Queryable): Promise<ImportRow | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT ${IMPORT_META_COLS} FROM imports ORDER BY id DESC LIMIT 1`,
    [],
    db,
  );
  return row ? mapImport(row) : null;
}

function primitiveToCell(val: Primitive | undefined): string | number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : String(val);
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  const str = String(val);
  return str.length > 0 ? str : null;
}

export async function getImportFileBlob(
  id: number,
  db?: Queryable,
): Promise<{ filename: string; fileType: string; buffer: Buffer | null } | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT filename, file_type, file_blob FROM imports WHERE id = $1`,
    [id],
    db,
  );
  if (!row) return null;
  const buffer = decompressFileBlob(row.file_blob);
  return {
    filename: String(row.filename ?? `import_${id}.xlsx`),
    fileType: row.file_type ? String(row.file_type) : "settlement",
    buffer: buffer && buffer.length > 0 ? buffer : null,
  };
}

export async function getImportSpreadsheetData(
  id: number,
  db?: Queryable,
): Promise<ImportSpreadsheetData | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT ${IMPORT_META_COLS}, file_blob FROM imports WHERE id = $1`,
    [id],
    db,
  );
  if (!row) return null;
  const importRow = mapImport(row);
  const buffer = decompressFileBlob(row.file_blob);

  if (buffer && buffer.length > 0) {
    try {
      const parsedSheets = await readInputSheets(buffer);
      if (parsedSheets.length > 0) {
        const sheets: ImportSpreadsheetSheet[] = parsedSheets.map((s, idx) => {
          const isPrimary =
            s.name === importRow.sheetName ||
            (idx === 0 && !parsedSheets.some((ps) => ps.name === importRow.sheetName));
          const headerRowIdx =
            isPrimary && importRow.headerRow && importRow.headerRow >= 1
              ? Math.min(importRow.headerRow - 1, Math.max(0, s.rows.length - 1))
              : 0;

          let maxCols = 0;
          for (const r of s.rows) {
            if (r.length > maxCols) maxCols = r.length;
          }
          maxCols = Math.max(maxCols, 1);

          const rawHeaderRow = s.rows[headerRowIdx] ?? [];
          const headers = Array.from({ length: maxCols }, (_, colIdx) => {
            const val = rawHeaderRow[colIdx];
            return val !== null && val !== undefined && String(val).trim() !== ""
              ? String(val).trim()
              : "";
          });

          const normalizedRows: (string | number | null)[][] = s.rows.map((r) =>
            Array.from({ length: maxCols }, (_, colIdx) => primitiveToCell(r[colIdx])),
          );

          return {
            name: s.name || `Sheet${idx + 1}`,
            headerRowIndex: headerRowIdx,
            headers,
            rows: normalizedRows,
            totalRows: normalizedRows.length,
          };
        });

        return {
          importId: importRow.id,
          filename: importRow.filename,
          fileType: importRow.fileType,
          sourceMode: "original_file",
          hasOriginalFile: true,
          sheets,
        };
      }
    } catch {
      // Fallback to database reconstruction below
    }
  }

  // Fallback reconstruction from database tables (for files imported before file_blob was stored)
  const sheets: ImportSpreadsheetSheet[] = [];

  if (importRow.fileType === "oms_orders") {
    const orderRows = await query<Record<string, unknown>>(
      `SELECT * FROM oms_orders WHERE import_id = $1 ORDER BY order_code ASC`,
      [id],
      db,
    );
    const colDefs: { key: string; header: string; get: (r: Record<string, unknown>) => string | number | null }[] = [
      { key: "orderCode", header: "เลขที่ออเดอร์", get: (r) => String(r.order_code ?? "") },
      { key: "customerName", header: "ชื่อ", get: (r) => (r.customer_name ? String(r.customer_name) : null) },
      { key: "customerPhone", header: "เบอร์โทร", get: (r) => (r.customer_phone ? String(r.customer_phone) : null) },
      { key: "channel", header: "ช่องทางติดต่อ", get: (r) => (r.channel ? String(r.channel) : null) },
      { key: "contactName", header: "ชื่อตามช่องทางติดต่อ", get: (r) => (r.contact_name ? String(r.contact_name) : null) },
      { key: "courier", header: "ขนส่ง", get: (r) => (r.courier ? String(r.courier) : null) },
      { key: "shippingFeeCustomer", header: "ค่าส่งที่เก็บลูกค้า", get: (r) => Number(r.shipping_fee_customer ?? 0) },
      { key: "province", header: "จังหวัด", get: (r) => (r.province ? String(r.province) : null) },
      { key: "bank", header: "ธนาคาร", get: (r) => (r.bank ? String(r.bank) : null) },
      { key: "trackingNo", header: "เลขพัสดุ", get: (r) => (r.tracking_no ? String(r.tracking_no) : null) },
      { key: "shippingFeeSeller", header: "ค่าส่งที่ร้านจ่าย", get: (r) => Number(r.shipping_fee_seller ?? 0) },
      { key: "note", header: "หมายเหตุ", get: (r) => (r.note ? String(r.note) : null) },
      { key: "createdBy", header: "สร้างโดย", get: (r) => (r.created_by ? String(r.created_by) : null) },
      { key: "createdDate", header: "วันที่สร้าง", get: (r) => (r.created_date ? String(r.created_date) : null) },
      { key: "paidDate", header: "วันที่โอนเงิน", get: (r) => (r.paid_date ? String(r.paid_date) : null) },
      { key: "printedDate", header: "วันที่พิมพ์", get: (r) => (r.printed_date ? String(r.printed_date) : null) },
      { key: "marketplaceOrderId", header: "เลขที่บน Marketplace", get: (r) => (r.marketplace_order_raw ? String(r.marketplace_order_raw) : null) },
      { key: "discountCode", header: "รหัสส่วนลด", get: (r) => (r.discount_code ? String(r.discount_code) : null) },
      { key: "discountTotal", header: "ส่วนลดรวม", get: (r) => Number(r.discount_total ?? 0) },
      { key: "totalQty", header: "จำนวนรวม", get: (r) => Number(r.total_qty ?? 0) },
      { key: "salesAmount", header: "ยอดขาย", get: (r) => Number(r.sales_amount ?? 0) },
      { key: "profitAmount", header: "กำไร", get: (r) => Number(r.profit_amount ?? 0) },
    ];

    const defByKey = new Map(colDefs.map((d) => [d.key, d]));
    const activeCols =
      importRow.mapping.length > 0
        ? importRow.mapping.map((m) => {
            const matched = m.fieldKey ? defByKey.get(m.fieldKey) : undefined;
            return {
              header: m.header || matched?.header || "",
              get: matched ? matched.get : () => null,
            };
          })
        : colDefs.map((d) => ({ header: d.header, get: d.get }));

    const headers = activeCols.map((c) => c.header);
    const dataRows: (string | number | null)[][] = [
      headers,
      ...orderRows.map((r) => activeCols.map((c) => c.get(r))),
    ];

    sheets.push({
      name: importRow.sheetName || "Orders",
      headerRowIndex: 0,
      headers,
      rows: dataRows,
      totalRows: dataRows.length,
    });
  } else if (importRow.fileType === "oms_items") {
    const itemRows = await query<Record<string, unknown>>(
      `SELECT * FROM oms_order_items WHERE import_id = $1 ORDER BY id ASC`,
      [id],
      db,
    );
    const colDefs: { key: string; header: string; get: (r: Record<string, unknown>) => string | number | null }[] = [
      { key: "skuCode", header: "รหัสสินค้า", get: (r) => String(r.sku_code ?? "") },
      { key: "productName", header: "สินค้า", get: (r) => String(r.product_name ?? "") },
      { key: "unitPrice", header: "ราคา", get: (r) => Number(r.unit_price ?? 0) },
      { key: "quantity", header: "จำนวน", get: (r) => Number(r.quantity ?? 1) },
      { key: "orderCode", header: "เลขที่ออเดอร์", get: (r) => String(r.order_code ?? "") },
      { key: "orderSalesAmount", header: "ยอดขายออเดอร์", get: (r) => Number(r.order_sales_amount ?? 0) },
      { key: "shippingFeeCustomer", header: "ค่าส่งที่เก็บลูกค้า", get: (r) => Number(r.shipping_fee_customer ?? 0) },
      { key: "senderName", header: "ผู้ส่ง", get: (r) => (r.sender_name ? String(r.sender_name) : null) },
      { key: "customerName", header: "ชื่อ", get: (r) => (r.customer_name ? String(r.customer_name) : null) },
      { key: "customerAddress", header: "ที่อยู่", get: (r) => (r.customer_address ? String(r.customer_address) : null) },
      { key: "postalCode", header: "รหัสไปรษณีย์", get: (r) => (r.postal_code ? String(r.postal_code) : null) },
      { key: "customerPhone", header: "เบอร์โทร", get: (r) => (r.customer_phone ? String(r.customer_phone) : null) },
      { key: "paidDate", header: "วันที่โอนเงิน", get: (r) => (r.paid_date ? String(r.paid_date) : null) },
      { key: "createdBy", header: "สร้างโดย", get: () => null },
      { key: "courier", header: "ขนส่ง", get: (r) => (r.courier ? String(r.courier) : null) },
      { key: "channel", header: "ช่องทางติดต่อ", get: (r) => (r.channel ? String(r.channel) : null) },
      { key: "bank", header: "ธนาคารที่โอนเงิน", get: (r) => (r.bank ? String(r.bank) : null) },
      { key: "note", header: "หมายเหตุ", get: (r) => (r.note ? String(r.note) : null) },
      { key: "trackingNo", header: "เลขพัสดุ", get: (r) => (r.tracking_no ? String(r.tracking_no) : null) },
      { key: "createdDate", header: "วันที่สร้าง", get: (r) => (r.created_date ? String(r.created_date) : null) },
    ];

    const defByKey = new Map(colDefs.map((d) => [d.key, d]));
    const activeCols =
      importRow.mapping.length > 0
        ? importRow.mapping.map((m) => {
            const matched = m.fieldKey ? defByKey.get(m.fieldKey) : undefined;
            return {
              header: m.header || matched?.header || "",
              get: matched ? matched.get : () => null,
            };
          })
        : colDefs.map((d) => ({ header: d.header, get: d.get }));

    const headers = activeCols.map((c) => c.header);
    const dataRows: (string | number | null)[][] = [
      headers,
      ...itemRows.map((r) => activeCols.map((c) => c.get(r))),
    ];

    sheets.push({
      name: importRow.sheetName || "Items",
      headerRowIndex: 0,
      headers,
      rows: dataRows,
      totalRows: dataRows.length,
    });
  } else {
    const txRows = await query<Record<string, unknown>>(
      `SELECT * FROM transactions
       WHERE import_id = $1 AND transaction_type <> 'คำสั่งซื้อ (OMS)'
       ORDER BY id ASC`,
      [id],
      db,
    );
    const mappedTx = txRows.map(mapTransaction);
    const activeMapping =
      importRow.mapping.length > 0
        ? importRow.mapping
        : [
            { col: 0, header: "หมายเลขคำสั่งซื้อ/การปรับ", fieldKey: "orderId", label: "หมายเลขคำสั่งซื้อ", kind: "id" as const, confidence: "exact" as const, nonEmpty: mappedTx.length },
            { col: 1, header: "ประเภทธุรกรรม", fieldKey: "transactionType", label: "ประเภทธุรกรรม", kind: "text" as const, confidence: "exact" as const, nonEmpty: mappedTx.length },
            { col: 2, header: "เวลาที่สร้างคำสั่งซื้อ", fieldKey: "createdAt", label: "เวลาที่สร้างคำสั่งซื้อ", kind: "date" as const, confidence: "exact" as const, nonEmpty: mappedTx.length },
            { col: 3, header: "เวลาที่ชำระคำสั่งซื้อ", fieldKey: "paidAt", label: "เวลาที่ชำระคำสั่งซื้อ", kind: "date" as const, confidence: "exact" as const, nonEmpty: mappedTx.length },
            { col: 4, header: "สกุลเงิน", fieldKey: "currency", label: "สกุลเงิน", kind: "text" as const, confidence: "exact" as const, nonEmpty: mappedTx.length },
            { col: 5, header: "ยอดการชำระเงินทั้งหมด", fieldKey: "payout", label: "ยอดการชำระเงินทั้งหมด", kind: "money" as const, confidence: "exact" as const, nonEmpty: mappedTx.length },
            { col: 6, header: "รายได้ทั้งหมด", fieldKey: "incomeTotal", label: "รายได้ทั้งหมด", kind: "money" as const, confidence: "exact" as const, nonEmpty: mappedTx.length },
            { col: 7, header: "ค่าธรรมเนียมทั้งหมด", fieldKey: "feeTotal", label: "ค่าธรรมเนียมทั้งหมด", kind: "money" as const, confidence: "exact" as const, nonEmpty: mappedTx.length },
            { col: 8, header: "จำนวนการปรับยอด", fieldKey: "adjustment", label: "จำนวนการปรับยอด", kind: "money" as const, confidence: "exact" as const, nonEmpty: mappedTx.length },
          ];

    const headers = activeMapping.map((m) => m.header || m.label || "");
    const getTxCell = (tx: TransactionRow, fieldKey: string | null, header: string): string | number | null => {
      if (tx.normalized.raw && header && header in tx.normalized.raw) {
        return tx.normalized.raw[header] ?? null;
      }
      if (!fieldKey) return null;
      if (fieldKey === "orderId") return tx.externalId;
      if (fieldKey === "transactionType") return tx.transactionType;
      if (fieldKey === "createdAt") return tx.createdDate;
      if (fieldKey === "paidAt") return tx.paidDate;
      if (fieldKey === "currency") return tx.currency;
      if (fieldKey === "payout") return tx.payout;
      if (fieldKey === "incomeTotal") return tx.income;
      if (fieldKey === "feeTotal") return tx.feeTotal;
      if (fieldKey === "adjustment") return tx.adjustment;
      const val = tx.normalized.fields[fieldKey];
      if (val !== undefined) return val;
      return 0;
    };

    const detailRows: (string | number | null)[][] = [
      headers,
      ...mappedTx.map((tx) =>
        activeMapping.map((m) => getTxCell(tx, m.fieldKey, m.header)),
      ),
    ];

    sheets.push({
      name: importRow.sheetName || "Order details",
      headerRowIndex: 0,
      headers,
      rows: detailRows,
      totalRows: detailRows.length,
    });

    if (importRow.report.found && importRow.report.raw.length > 0) {
      const reportHeaders = ["รายการสรุป (Report)", "จำนวนเงิน / รายละเอียด"];
      const reportRows: (string | number | null)[][] = [
        reportHeaders,
        ...importRow.report.raw.map((r) => [r.label, r.value]),
      ];
      sheets.push({
        name: importRow.report.sheetName || "Reports",
        headerRowIndex: 0,
        headers: reportHeaders,
        rows: reportRows,
        totalRows: reportRows.length,
      });
    }
  }

  return {
    importId: importRow.id,
    filename: importRow.filename,
    fileType: importRow.fileType,
    sourceMode: "database_reconstructed",
    hasOriginalFile: false,
    sheets,
  };
}

export async function deleteImport(id: number, db?: Queryable): Promise<boolean> {
  const runDelete = async (target: Queryable) => {
    const affectedDateRows = await query<{ paid_date: string }>(
      `SELECT DISTINCT paid_date FROM transactions WHERE import_id = $1 AND paid_date <> '' AND paid_date <> 'unknown'
       UNION
       SELECT DISTINCT paid_date FROM oms_orders WHERE import_id = $1 AND paid_date <> '' AND paid_date <> 'unknown'`,
      [id],
      target,
    );
    const affectedDates = affectedDateRows.map((r) => String(r.paid_date)).filter(Boolean);

    const affectedSkuRows = await query<{ sku_code: string }>(
      `SELECT DISTINCT sku_code FROM oms_order_items WHERE import_id = $1`,
      [id],
      target,
    );
    const affectedSkus = affectedSkuRows.map((r) => String(r.sku_code)).filter(Boolean);

    const affectedOrderRows = await query<{ external_id: string }>(
      `SELECT external_id FROM transactions WHERE import_id = $1 AND is_order = 1`,
      [id],
      target,
    );
    const affectedOrderIds = affectedOrderRows
      .map((r) => String(r.external_id))
      .filter(Boolean);

    await query("DELETE FROM oms_orders WHERE import_id = $1", [id], target);
    await query("DELETE FROM oms_order_items WHERE import_id = $1", [id], target);

    const result = await query<{ id: number }>(
      "DELETE FROM imports WHERE id = $1 RETURNING id",
      [id],
      target,
    );
    if (result.length === 0) return false;

    await query(
      `DELETE FROM products p
       WHERE NOT EXISTS (
         SELECT 1 FROM oms_order_items i WHERE i.sku_code = p.sku_code
       )
       AND ($1::text[] IS NULL OR p.sku_code = ANY($1::text[]))`,
      [affectedSkus.length > 0 ? affectedSkus : null],
      target,
    );

    const remainingImports = await queryOne<{ c: string | number }>(
      "SELECT COUNT(*) AS c FROM imports",
      [],
      target,
    );
    if (Number(remainingImports?.c ?? 0) === 0) {
      await query("DELETE FROM transactions", [], target);
      await query("DELETE FROM oms_orders", [], target);
      await query("DELETE FROM oms_order_items", [], target);
      await query("DELETE FROM products", [], target);
      await query("DELETE FROM daily_summaries", [], target);
      await query("DELETE FROM sku_summaries", [], target);
    } else {
      if (affectedDates.length > 0) {
        await query(
          "DELETE FROM daily_summaries WHERE paid_date = ANY($1::text[])",
          [affectedDates],
          target,
        );
        await query(
          `INSERT INTO daily_summaries (
             paid_date, transaction_count, order_count, order_payout, order_income,
             order_fees, other_count, other_payout, total_payout, adjustment,
             tiktok_count, shopee_count, facebook_count,
             linked_count, oms_only_count, unlinked_count, mismatch_count, updated_at
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
             SUM(CASE WHEN is_order = 1 AND COALESCE(NULLIF(channel, ''), 'TikTok') = 'TikTok' THEN 1 ELSE 0 END)::int,
             SUM(CASE WHEN is_order = 1 AND channel = 'Shopee' THEN 1 ELSE 0 END)::int,
             0,
             SUM(CASE WHEN is_order = 1 AND order_code IS NOT NULL AND order_code <> '' AND transaction_type <> 'คำสั่งซื้อ (OMS)' THEN 1 ELSE 0 END)::int,
             SUM(CASE WHEN is_order = 1 AND order_code IS NOT NULL AND order_code <> '' AND transaction_type = 'คำสั่งซื้อ (OMS)' THEN 1 ELSE 0 END)::int,
             SUM(CASE WHEN is_order = 1 AND (order_code IS NULL OR order_code = '') THEN 1 ELSE 0 END)::int,
             SUM(CASE WHEN is_order = 1 AND (
               ABS(COALESCE((checks_json->>'incomeDiff')::numeric, 0)) >= 0.01
               OR ABS(COALESCE((checks_json->>'feeDiff')::numeric, 0)) >= 0.01
               OR ABS(COALESCE((checks_json->>'payoutDiff')::numeric, 0)) >= 0.01
             ) THEN 1 ELSE 0 END)::int,
             now()
           FROM transactions
           WHERE paid_date = ANY($1::text[])
             AND COALESCE(NULLIF(channel, ''), 'TikTok') IN ('TikTok', 'Shopee')
           GROUP BY paid_date`,
          [affectedDates],
          target,
        );
      }
      if (affectedSkus.length > 0) {
        await query(
          "DELETE FROM sku_summaries WHERE sku_code = ANY($1::text[])",
          [affectedSkus],
          target,
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
             COUNT(DISTINCT i.order_code)::int,
             ROUND(COALESCE(SUM(i.unit_price * i.quantity), 0)::numeric, 2),
             ROUND(COALESCE(SUM(i.order_sales_amount), 0)::numeric, 2),
             COALESCE(SUM(CASE WHEN COALESCE(NULLIF(i.channel, ''), 'TikTok') = 'TikTok' THEN i.quantity ELSE 0 END), 0)::int,
             COALESCE(SUM(CASE WHEN i.channel = 'Shopee' THEN i.quantity ELSE 0 END), 0)::int,
             0,
             now()
           FROM oms_order_items i
           WHERE i.sku_code = ANY($1::text[])
             AND COALESCE(NULLIF(i.channel, ''), 'TikTok') IN ('TikTok', 'Shopee')
           GROUP BY i.sku_code`,
          [affectedSkus],
          target,
        );
      }
    }

    await query(
      `DELETE FROM invoice_registry r
       WHERE NOT EXISTS (
         SELECT 1 FROM transactions t
         WHERE t.external_id = r.order_id AND t.is_order = 1
       )
       AND ($1::text[] IS NULL OR r.order_id = ANY($1::text[]))`,
      [affectedOrderIds.length > 0 ? affectedOrderIds : null],
      target,
    );

    if (Number(remainingImports?.c ?? 0) === 0) {
      await query("DELETE FROM invoice_registry", [], target);
      const remaining = await queryOne<{ c: string | number }>(
        "SELECT COUNT(*) AS c FROM invoice_registry",
        [],
        target,
      );
      if (Number(remaining?.c ?? 0) === 0) {
        await query("ALTER SEQUENCE invoice_seq RESTART WITH 1", [], target);
      }
    }

    return true;
  };

  if (db) {
    return runDelete(db);
  }
  return withTransaction((client) => runDelete(client));
}

export async function deleteAllImports(db?: Queryable): Promise<number> {
  const runClear = async (target: Queryable) => {
    const deleted = await query<{ id: number }>(
      "DELETE FROM imports RETURNING id",
      [],
      target,
    );
    await query("DELETE FROM transactions", [], target);
    await query("DELETE FROM oms_orders", [], target);
    await query("DELETE FROM oms_order_items", [], target);
    await query("DELETE FROM products", [], target);
    await query("DELETE FROM daily_summaries", [], target);
    await query("DELETE FROM sku_summaries", [], target);
    await query("DELETE FROM invoice_registry", [], target);
    await query("ALTER SEQUENCE invoice_seq RESTART WITH 1", [], target);
    return deleted.length;
  };
  if (db) return runClear(db);
  return withTransaction((client) => runClear(client));
}

export async function listDailyBatches(
  limit = 30,
  db?: Queryable,
): Promise<DailyBatchRow[]> {
  const precomputed = await query<Record<string, unknown>>(
    `SELECT
       paid_date AS date,
       transaction_count,
       order_count,
       order_payout,
       order_income,
       order_fees,
       other_count,
       other_payout,
       total_payout,
       adjustment
     FROM daily_summaries
     ORDER BY paid_date DESC
     LIMIT $1`,
    [limit],
    db,
  );
  if (precomputed.length > 0) {
    return precomputed.map((row) => ({
      date: String(row.date),
      transactionCount: Number(row.transaction_count ?? 0),
      orderCount: Number(row.order_count ?? 0),
      orderPayout: Number(row.order_payout ?? 0),
      orderIncome: Number(row.order_income ?? 0),
      orderFees: Number(row.order_fees ?? 0),
      otherCount: Number(row.other_count ?? 0),
      otherPayout: Number(row.other_payout ?? 0),
      totalPayout: Number(row.total_payout ?? 0),
      adjustment: Number(row.adjustment ?? 0),
    }));
  }

  const rows = await query<Record<string, unknown>>(
    `SELECT
      paid_date AS date,
      COUNT(*) AS transaction_count,
      SUM(CASE WHEN is_order = 1 THEN 1 ELSE 0 END) AS order_count,
      ROUND(SUM(CASE WHEN is_order = 1 THEN payout ELSE 0 END)::numeric, 2) AS order_payout,
      ROUND(SUM(CASE WHEN is_order = 1 THEN income ELSE 0 END)::numeric, 2) AS order_income,
      ROUND(SUM(CASE WHEN is_order = 1 THEN fee_total ELSE 0 END)::numeric, 2) AS order_fees,
      SUM(CASE WHEN is_order = 0 THEN 1 ELSE 0 END) AS other_count,
      ROUND(SUM(CASE WHEN is_order = 0 THEN payout ELSE 0 END)::numeric, 2) AS other_payout,
      ROUND(SUM(payout)::numeric, 2) AS total_payout,
      ROUND(SUM(adjustment)::numeric, 2) AS adjustment
    FROM transactions
    WHERE paid_date <> '' AND paid_date <> 'unknown'
    GROUP BY paid_date
    ORDER BY paid_date DESC
    LIMIT $1`,
    [limit],
    db,
  );
  return rows.map((row) => ({
    date: String(row.date),
    transactionCount: Number(row.transaction_count ?? 0),
    orderCount: Number(row.order_count ?? 0),
    orderPayout: Number(row.order_payout ?? 0),
    orderIncome: Number(row.order_income ?? 0),
    orderFees: Number(row.order_fees ?? 0),
    otherCount: Number(row.other_count ?? 0),
    otherPayout: Number(row.other_payout ?? 0),
    totalPayout: Number(row.total_payout ?? 0),
    adjustment: Number(row.adjustment ?? 0),
  }));
}

export function escapeLikePattern(raw: string): string {
  return raw
    .trim()
    .slice(0, 120)
    .replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export type DailyBatchSortKey =
  | "date_desc"
  | "date_asc"
  | "payout_desc"
  | "payout_asc"
  | "income_desc"
  | "income_asc"
  | "fees_desc"
  | "fees_asc"
  | "orders_desc"
  | "orders_asc";

const DAILY_BATCH_SORT_SQL: Record<DailyBatchSortKey, string> = {
  date_desc: "paid_date DESC",
  date_asc: "paid_date ASC",
  payout_desc: "order_payout DESC, paid_date DESC",
  payout_asc: "order_payout ASC, paid_date DESC",
  income_desc: "order_income DESC, paid_date DESC",
  income_asc: "order_income ASC, paid_date DESC",
  fees_desc: "ABS(order_fees) DESC, paid_date DESC",
  fees_asc: "ABS(order_fees) ASC, paid_date DESC",
  orders_desc: "order_count DESC, paid_date DESC",
  orders_asc: "order_count ASC, paid_date DESC",
};

export async function listDailyBatchesPaged(
  options: {
    page?: number;
    pageSize?: number;
    q?: string;
    sort?: DailyBatchSortKey;
  } = {},
  db?: Queryable,
): Promise<{
  rows: DailyBatchRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}> {
  const pageSize = Math.min(200, Math.max(10, options.pageSize ?? 20));
  const rawPage = Math.max(1, options.page ?? 1);
  const q = escapeLikePattern(options.q ?? "");
  const sortKey: DailyBatchSortKey =
    options.sort && options.sort in DAILY_BATCH_SORT_SQL
      ? options.sort
      : "date_desc";
  const orderBySql = DAILY_BATCH_SORT_SQL[sortKey];

  const summaryCountRow = await queryOne<{ c: string | number }>(
    "SELECT COUNT(*) AS c FROM daily_summaries",
    [],
    db,
  );
  if (Number(summaryCountRow?.c ?? 0) > 0) {
    const sParams: unknown[] = [];
    const sWhere = q ? "WHERE paid_date LIKE $1 ESCAPE '\\'" : "";
    if (q) sParams.push(`%${q}%`);
    const countRow = await queryOne<{ c: string | number }>(
      `SELECT COUNT(*) AS c FROM daily_summaries ${sWhere}`,
      sParams,
      db,
    );
    const total = Number(countRow?.c ?? 0);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(rawPage, pageCount);
    const rows = await query<Record<string, unknown>>(
      `SELECT
         paid_date AS date,
         transaction_count,
         order_count,
         order_payout,
         order_income,
         order_fees,
         other_count,
         other_payout,
         total_payout,
         adjustment
       FROM daily_summaries
       ${sWhere}
       ORDER BY ${orderBySql}
       LIMIT $${sParams.length + 1} OFFSET $${sParams.length + 2}`,
      [...sParams, pageSize, (page - 1) * pageSize],
      db,
    );
    return {
      rows: rows.map((row) => ({
        date: String(row.date),
        transactionCount: Number(row.transaction_count ?? 0),
        orderCount: Number(row.order_count ?? 0),
        orderPayout: Number(row.order_payout ?? 0),
        orderIncome: Number(row.order_income ?? 0),
        orderFees: Number(row.order_fees ?? 0),
        otherCount: Number(row.other_count ?? 0),
        otherPayout: Number(row.other_payout ?? 0),
        totalPayout: Number(row.total_payout ?? 0),
        adjustment: Number(row.adjustment ?? 0),
      })),
      total,
      page,
      pageSize,
      pageCount,
    };
  }

  const params: unknown[] = [];
  let dateFilter = "paid_date <> '' AND paid_date <> 'unknown'";
  if (q) {
    dateFilter += ` AND paid_date LIKE $${params.length + 1} ESCAPE '\\'`;
    params.push(`%${q}%`);
  }

  const countRow = await queryOne<{ c: string | number }>(
    `SELECT COUNT(DISTINCT paid_date) AS c FROM transactions WHERE ${dateFilter}`,
    params,
    db,
  );
  const total = Number(countRow?.c ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(rawPage, pageCount);

  const rows = await query<Record<string, unknown>>(
    `SELECT
      paid_date AS date,
      COUNT(*) AS transaction_count,
      SUM(CASE WHEN is_order = 1 THEN 1 ELSE 0 END) AS order_count,
      ROUND(SUM(CASE WHEN is_order = 1 THEN payout ELSE 0 END)::numeric, 2) AS order_payout,
      ROUND(SUM(CASE WHEN is_order = 1 THEN income ELSE 0 END)::numeric, 2) AS order_income,
      ROUND(SUM(CASE WHEN is_order = 1 THEN fee_total ELSE 0 END)::numeric, 2) AS order_fees,
      SUM(CASE WHEN is_order = 0 THEN 1 ELSE 0 END) AS other_count,
      ROUND(SUM(CASE WHEN is_order = 0 THEN payout ELSE 0 END)::numeric, 2) AS other_payout,
      ROUND(SUM(payout)::numeric, 2) AS total_payout,
      ROUND(SUM(adjustment)::numeric, 2) AS adjustment
    FROM transactions
    WHERE ${dateFilter}
    GROUP BY paid_date
    ORDER BY ${orderBySql}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, (page - 1) * pageSize],
    db,
  );

  return {
    rows: rows.map((row) => ({
      date: String(row.date),
      transactionCount: Number(row.transaction_count ?? 0),
      orderCount: Number(row.order_count ?? 0),
      orderPayout: Number(row.order_payout ?? 0),
      orderIncome: Number(row.order_income ?? 0),
      orderFees: Number(row.order_fees ?? 0),
      otherCount: Number(row.other_count ?? 0),
      otherPayout: Number(row.other_payout ?? 0),
      totalPayout: Number(row.total_payout ?? 0),
      adjustment: Number(row.adjustment ?? 0),
    })),
    total,
    page,
    pageSize,
    pageCount,
  };
}

const ORDER_LINK_PRIORITY_SQL = `(
  CASE
    WHEN (t.order_code IS NOT NULL AND t.order_code <> '' AND t.transaction_type <> 'คำสั่งซื้อ (OMS)') THEN 0
    WHEN (t.order_code IS NOT NULL AND t.order_code <> '') THEN 1
    ELSE 2
  END
)`;

export async function getDailyBatch(
  date: string,
  db?: Queryable,
): Promise<DailyBatch | null> {
  const isMonth = /^\d{4}-\d{2}$/.test(date);
  const dateWhere = isMonth ? "paid_date LIKE $1 || '-%'" : "paid_date = $1";
  const txDateWhere = isMonth ? "t.paid_date LIKE $1 || '-%'" : "t.paid_date = $1";

  let summaryRow = await queryOne<Record<string, unknown>>(
    `SELECT
       COALESCE(SUM(transaction_count), 0) AS transaction_count,
       COALESCE(SUM(order_count), 0) AS order_count,
       ROUND(COALESCE(SUM(order_payout), 0)::numeric, 2) AS order_payout,
       ROUND(COALESCE(SUM(order_income), 0)::numeric, 2) AS order_income,
       ROUND(COALESCE(SUM(order_fees), 0)::numeric, 2) AS order_fees,
       COALESCE(SUM(other_count), 0) AS other_count,
       ROUND(COALESCE(SUM(other_payout), 0)::numeric, 2) AS other_payout,
       ROUND(COALESCE(SUM(total_payout), 0)::numeric, 2) AS total_payout,
       ROUND(COALESCE(SUM(adjustment), 0)::numeric, 2) AS adjustment
     FROM daily_summaries
     WHERE ${dateWhere}`,
    [date],
    db,
  );
  if (!summaryRow || Number(summaryRow.transaction_count ?? 0) === 0) {
    summaryRow = await queryOne<Record<string, unknown>>(
      `SELECT
        COUNT(*) AS transaction_count,
        SUM(CASE WHEN is_order = 1 THEN 1 ELSE 0 END) AS order_count,
        ROUND(SUM(CASE WHEN is_order = 1 THEN payout ELSE 0 END)::numeric, 2) AS order_payout,
        ROUND(SUM(CASE WHEN is_order = 1 THEN income ELSE 0 END)::numeric, 2) AS order_income,
        ROUND(SUM(CASE WHEN is_order = 1 THEN fee_total ELSE 0 END)::numeric, 2) AS order_fees,
        SUM(CASE WHEN is_order = 0 THEN 1 ELSE 0 END) AS other_count,
        ROUND(SUM(CASE WHEN is_order = 0 THEN payout ELSE 0 END)::numeric, 2) AS other_payout,
        ROUND(SUM(payout)::numeric, 2) AS total_payout,
        ROUND(SUM(adjustment)::numeric, 2) AS adjustment
      FROM transactions
      WHERE ${dateWhere}
        AND COALESCE(NULLIF(channel, ''), 'TikTok') IN ('TikTok', 'Shopee')`,
      [date],
      db,
    );
  }
  if (!summaryRow || Number(summaryRow.transaction_count ?? 0) === 0) return null;

  const rows = await query<Record<string, unknown>>(
    `SELECT t.*, r.invoice_no, i.filename AS import_filename, i.imported_at AS import_imported_at
     FROM transactions t
     LEFT JOIN invoice_registry r ON r.order_id = t.external_id
     LEFT JOIN imports i ON i.id = t.import_id
     WHERE ${txDateWhere}
       AND COALESCE(NULLIF(t.channel, ''), 'TikTok') IN ('TikTok', 'Shopee')
     ORDER BY t.is_order DESC, t.paid_date DESC, ${ORDER_LINK_PRIORITY_SQL} ASC, t.external_id ASC`,
    [date],
    db,
  );
  const transactions = await enrichTransactionsWithOms(rows.map(mapTransaction), db);

  return {
    date,
    summary: {
      date,
      transactionCount: Number(summaryRow.transaction_count ?? 0),
      orderCount: Number(summaryRow.order_count ?? 0),
      orderPayout: Number(summaryRow.order_payout ?? 0),
      orderIncome: Number(summaryRow.order_income ?? 0),
      orderFees: Number(summaryRow.order_fees ?? 0),
      otherCount: Number(summaryRow.other_count ?? 0),
      otherPayout: Number(summaryRow.other_payout ?? 0),
      totalPayout: Number(summaryRow.total_payout ?? 0),
      adjustment: Number(summaryRow.adjustment ?? 0),
    },
    orders: transactions.filter((transaction) => transaction.isOrder),
    others: transactions.filter((transaction) => !transaction.isOrder),
  };
}

export interface DailyBatchPagedResult {
  date: string;
  summary: DailyBatchRow;
  category: BillCategoryKey;
  categoryCounts: BillCategoryCounts;
  categorySummary: {
    count: number;
    income: number;
    fees: number;
    payout: number;
  };
  orders: TransactionRow[];
  others: TransactionRow[];
  totalOrders: number;
  page: number;
  pageSize: number;
  orderPageCount: number;
}

export async function getDailyBatchPaged(
  options: {
    date: string;
    page?: number;
    pageSize?: number;
    sort?: BillSortKey;
    category?: BillCategoryKey;
  },
  db?: Queryable,
): Promise<DailyBatchPagedResult | null> {
  const { date } = options;
  const pageSize = Math.min(200, Math.max(10, options.pageSize ?? 20));
  const rawPage = Math.max(1, options.page ?? 1);
  const sortKey: BillSortKey =
    options.sort && options.sort in BILL_SORT_SQL ? options.sort : "latest";
  const orderBySql = BILL_SORT_SQL[sortKey];
  const category: BillCategoryKey =
    options.category && options.category in BILL_CATEGORY_SQL
      ? options.category
      : "normal";

  let summaryRow = await queryOne<Record<string, unknown>>(
    `SELECT
       COALESCE(SUM(transaction_count), 0) AS transaction_count,
       COALESCE(SUM(order_count), 0) AS order_count,
       ROUND(COALESCE(SUM(order_payout), 0)::numeric, 2) AS order_payout,
       ROUND(COALESCE(SUM(order_income), 0)::numeric, 2) AS order_income,
       ROUND(COALESCE(SUM(order_fees), 0)::numeric, 2) AS order_fees,
       COALESCE(SUM(other_count), 0) AS other_count,
       ROUND(COALESCE(SUM(other_payout), 0)::numeric, 2) AS other_payout,
       ROUND(COALESCE(SUM(total_payout), 0)::numeric, 2) AS total_payout,
       ROUND(COALESCE(SUM(adjustment), 0)::numeric, 2) AS adjustment
     FROM daily_summaries
     WHERE paid_date = $1`,
    [date],
    db,
  );
  if (!summaryRow || Number(summaryRow.transaction_count ?? 0) === 0) {
    summaryRow = await queryOne<Record<string, unknown>>(
      `SELECT
        COUNT(*) AS transaction_count,
        SUM(CASE WHEN is_order = 1 THEN 1 ELSE 0 END) AS order_count,
        ROUND(SUM(CASE WHEN is_order = 1 THEN payout ELSE 0 END)::numeric, 2) AS order_payout,
        ROUND(SUM(CASE WHEN is_order = 1 THEN income ELSE 0 END)::numeric, 2) AS order_income,
        ROUND(SUM(CASE WHEN is_order = 1 THEN fee_total ELSE 0 END)::numeric, 2) AS order_fees,
        SUM(CASE WHEN is_order = 0 THEN 1 ELSE 0 END) AS other_count,
        ROUND(SUM(CASE WHEN is_order = 0 THEN payout ELSE 0 END)::numeric, 2) AS other_payout,
        ROUND(SUM(payout)::numeric, 2) AS total_payout,
        ROUND(SUM(adjustment)::numeric, 2) AS adjustment
      FROM transactions
      WHERE paid_date = $1
        AND COALESCE(NULLIF(channel, ''), 'TikTok') IN ('TikTok', 'Shopee')`,
      [date],
      db,
    );
  }
  if (!summaryRow || Number(summaryRow.transaction_count ?? 0) === 0) return null;

  const nonPosRow = await queryOne<Record<string, unknown>>(
    `SELECT
       COUNT(*) AS non_pos_all,
       ROUND(COALESCE(SUM(t.income), 0)::numeric, 2) AS non_pos_income,
       ROUND(COALESCE(SUM(t.fee_total), 0)::numeric, 2) AS non_pos_fees,
       ROUND(COALESCE(SUM(t.payout), 0)::numeric, 2) AS non_pos_payout,
       SUM(CASE WHEN (t.income < 0 OR t.fee_total < 0 OR t.payout < 0) THEN 1 ELSE 0 END) AS refund_fee_count,
       ROUND(COALESCE(SUM(CASE WHEN (t.income < 0 OR t.fee_total < 0 OR t.payout < 0) THEN t.income ELSE 0 END), 0)::numeric, 2) AS refund_fee_income,
       ROUND(COALESCE(SUM(CASE WHEN (t.income < 0 OR t.fee_total < 0 OR t.payout < 0) THEN t.fee_total ELSE 0 END), 0)::numeric, 2) AS refund_fee_fees,
       ROUND(COALESCE(SUM(CASE WHEN (t.income < 0 OR t.fee_total < 0 OR t.payout < 0) THEN t.payout ELSE 0 END), 0)::numeric, 2) AS refund_fee_payout,
       SUM(CASE WHEN NOT (t.income < 0 OR t.fee_total < 0 OR t.payout < 0) THEN 1 ELSE 0 END) AS zero_count
     FROM transactions t
     WHERE t.paid_date = $1
       AND t.is_order = 1
       AND COALESCE(NULLIF(t.channel, ''), 'TikTok') IN ('TikTok', 'Shopee')
       AND t.income <= 0`,
    [date],
    db,
  );

  const allOrdersCount = Number(summaryRow.order_count ?? 0);
  const nonPosAll = Number(nonPosRow?.non_pos_all ?? 0);
  const refundFeeCount = Number(nonPosRow?.refund_fee_count ?? 0);
  const zeroCount = Number(nonPosRow?.zero_count ?? 0);
  const normalCount = Math.max(0, allOrdersCount - nonPosAll);
  const refundFeeIncome = Number(nonPosRow?.refund_fee_income ?? 0);
  const refundFeeFees = Number(nonPosRow?.refund_fee_fees ?? 0);
  const refundFeePayout = Number(nonPosRow?.refund_fee_payout ?? 0);

  const categoryCounts: BillCategoryCounts = {
    normal: normalCount,
    refundFee: refundFeeCount,
    zero: zeroCount,
    refundFeePayout,
  };

  const categorySummary =
    category === "refund_fee"
      ? {
          count: refundFeeCount,
          income: refundFeeIncome,
          fees: refundFeeFees,
          payout: refundFeePayout,
        }
      : category === "zero"
        ? {
            count: zeroCount,
            income: 0,
            fees: 0,
            payout: 0,
          }
        : {
            count: normalCount,
            income: Number(
              (
                Number(summaryRow.order_income ?? 0) -
                Number(nonPosRow?.non_pos_income ?? 0)
              ).toFixed(2),
            ),
            fees: Number(
              (
                Number(summaryRow.order_fees ?? 0) -
                Number(nonPosRow?.non_pos_fees ?? 0)
              ).toFixed(2),
            ),
            payout: Number(
              (
                Number(summaryRow.order_payout ?? 0) -
                Number(nonPosRow?.non_pos_payout ?? 0)
              ).toFixed(2),
            ),
          };

  const totalOrders = categorySummary.count;
  const otherCount = Number(summaryRow.other_count ?? 0);
  const orderPageCount = Math.max(1, Math.ceil(totalOrders / pageSize));
  const page = Math.min(rawPage, orderPageCount);

  const [orderRows, otherRows] = await Promise.all([
    query<Record<string, unknown>>(
      `WITH page_ids AS (
         SELECT t.id
         FROM transactions t
         WHERE t.paid_date = $1
           AND t.is_order = 1
           AND COALESCE(NULLIF(t.channel, ''), 'TikTok') IN ('TikTok', 'Shopee')
           AND ${BILL_CATEGORY_SQL[category]}
         ORDER BY ${orderBySql}
         LIMIT $2 OFFSET $3
       )
       SELECT t.*, r.invoice_no, i.filename AS import_filename, i.imported_at AS import_imported_at
       FROM page_ids p
       JOIN transactions t ON t.id = p.id
       LEFT JOIN invoice_registry r ON r.order_id = t.external_id
       LEFT JOIN imports i ON i.id = t.import_id
       ORDER BY ${orderBySql}`,
      [date, pageSize, (page - 1) * pageSize],
      db,
    ),
    otherCount > 0
      ? query<Record<string, unknown>>(
          `SELECT t.*, r.invoice_no, i.filename AS import_filename, i.imported_at AS import_imported_at
           FROM transactions t
           LEFT JOIN invoice_registry r ON r.order_id = t.external_id
           LEFT JOIN imports i ON i.id = t.import_id
           WHERE t.paid_date = $1
             AND t.is_order = 0
             AND COALESCE(NULLIF(t.channel, ''), 'TikTok') IN ('TikTok', 'Shopee')
           ORDER BY t.external_id ASC`,
          [date],
          db,
        )
      : Promise.resolve([]),
  ]);

  const [orders, others] = await Promise.all([
    enrichTransactionsWithOms(orderRows.map(mapTransaction), db),
    otherRows.length > 0
      ? enrichTransactionsWithOms(otherRows.map(mapTransaction), db)
      : Promise.resolve([]),
  ]);

  return {
    date,
    summary: {
      date,
      transactionCount: Number(summaryRow.transaction_count ?? 0),
      orderCount: allOrdersCount,
      orderPayout: Number(summaryRow.order_payout ?? 0),
      orderIncome: Number(summaryRow.order_income ?? 0),
      orderFees: Number(summaryRow.order_fees ?? 0),
      otherCount,
      otherPayout: Number(summaryRow.other_payout ?? 0),
      totalPayout: Number(summaryRow.total_payout ?? 0),
      adjustment: Number(summaryRow.adjustment ?? 0),
    },
    category,
    categoryCounts,
    categorySummary,
    orders,
    others,
    totalOrders,
    page,
    pageSize,
    orderPageCount,
  };
}

export interface BulkInvoicesBatchResult {
  date: string;
  billableTotalCount: number;
  tiktokOrdersCount: number;
  shopeeOrdersCount: number;
  channelFilteredCount: number;
  linkedOrdersCount: number;
  unlinkedOrdersCount: number;
  effectiveLinkFilter: "linked" | "all" | "unlinked";
  totalFilteredCount: number;
  batchSize: 100 | 200 | 500;
  batchCount: number;
  currentBatch: number;
  batchStartIdx: number;
  batchEndIdx: number;
  missingOmsDates: string[];
  orders: TransactionRow[];
}

export async function getBulkInvoicesBatch(
  options: {
    date: string;
    channelFilter?: "all" | "TikTok" | "Shopee";
    rawLink?: string;
    batch?: number;
    batchSize?: 100 | 200 | 500;
  },
  db?: Queryable,
): Promise<BulkInvoicesBatchResult | null> {
  const { date } = options;
  const channelFilter = options.channelFilter ?? "all";
  const rawLink = options.rawLink ?? "linked";
  const batchSize: 100 | 200 | 500 = options.batchSize ?? 200;
  const isMonth = /^\d{4}-\d{2}$/.test(date);
  const txDateWhere = isMonth ? "t.paid_date LIKE $1" : "t.paid_date = $1";
  const dateParam = isMonth ? `${date}-%` : date;

  const billableClause = `(t.transaction_type = 'คำสั่งซื้อ (OMS)' OR t.income > 0 OR t.payout > 0)`;
  const isLinkedSql = `(${ORDER_LINK_PRIORITY_SQL} = 0)`;
  const chMatchSql =
    channelFilter === "Shopee"
      ? `t.channel = 'Shopee'`
      : channelFilter === "TikTok"
        ? `COALESCE(NULLIF(t.channel, ''), 'TikTok') = 'TikTok'`
        : `TRUE`;

  const countsRow = await queryOne<Record<string, unknown>>(
    `SELECT
       COUNT(*) AS billable_total,
       SUM(CASE WHEN COALESCE(NULLIF(t.channel, ''), 'TikTok') = 'TikTok' THEN 1 ELSE 0 END) AS tiktok_count,
       SUM(CASE WHEN t.channel = 'Shopee' THEN 1 ELSE 0 END) AS shopee_count,
       SUM(CASE WHEN ${chMatchSql} THEN 1 ELSE 0 END) AS channel_filtered_count,
       SUM(CASE WHEN (${chMatchSql}) AND ${isLinkedSql} THEN 1 ELSE 0 END) AS linked_count,
       SUM(CASE WHEN (${chMatchSql}) AND NOT ${isLinkedSql} THEN 1 ELSE 0 END) AS unlinked_count
     FROM transactions t
     WHERE ${txDateWhere}
       AND t.is_order = 1
       AND COALESCE(NULLIF(t.channel, ''), 'TikTok') IN ('TikTok', 'Shopee')
       AND ${billableClause}`,
    [dateParam],
    db,
  );

  const billableTotalCount = Number(countsRow?.billable_total ?? 0);
  if (billableTotalCount === 0) return null;

  const tiktokOrdersCount = Number(countsRow?.tiktok_count ?? 0);
  const shopeeOrdersCount = Number(countsRow?.shopee_count ?? 0);
  const channelFilteredCount = Number(countsRow?.channel_filtered_count ?? 0);
  const linkedOrdersCount = Number(countsRow?.linked_count ?? 0);
  const unlinkedOrdersCount = Number(countsRow?.unlinked_count ?? 0);

  const effectiveLinkFilter: "linked" | "all" | "unlinked" =
    rawLink === "all"
      ? "all"
      : rawLink === "unlinked"
        ? "unlinked"
        : linkedOrdersCount > 0
          ? "linked"
          : "all";

  const totalFilteredCount =
    effectiveLinkFilter === "linked"
      ? linkedOrdersCount
      : effectiveLinkFilter === "unlinked"
        ? unlinkedOrdersCount
        : channelFilteredCount;

  const batchCount = Math.max(1, Math.ceil(totalFilteredCount / batchSize));
  const rawBatch = Number(options.batch ?? 1);
  const currentBatch =
    Number.isFinite(rawBatch) && rawBatch >= 1
      ? Math.min(Math.floor(rawBatch), batchCount)
      : 1;
  const batchStartIdx = (currentBatch - 1) * batchSize;
  const batchEndIdx = Math.min(totalFilteredCount, batchStartIdx + batchSize);

  const linkClause =
    effectiveLinkFilter === "linked"
      ? `AND ${isLinkedSql}`
      : effectiveLinkFilter === "unlinked"
        ? `AND NOT ${isLinkedSql}`
        : "";

  const [rows, missingDateRows] = await Promise.all([
    totalFilteredCount > 0
      ? query<Record<string, unknown>>(
          `WITH page_ids AS (
             SELECT t.id
             FROM transactions t
             WHERE ${txDateWhere}
               AND t.is_order = 1
               AND COALESCE(NULLIF(t.channel, ''), 'TikTok') IN ('TikTok', 'Shopee')
               AND ${billableClause}
               AND (${chMatchSql})
               ${linkClause}
             ORDER BY t.paid_date DESC, ${ORDER_LINK_PRIORITY_SQL} ASC, t.external_id ASC
             LIMIT $2 OFFSET $3
           )
           SELECT t.*, r.invoice_no, i.filename AS import_filename, i.imported_at AS import_imported_at
           FROM page_ids p
           JOIN transactions t ON t.id = p.id
           LEFT JOIN invoice_registry r ON r.order_id = t.external_id
           LEFT JOIN imports i ON i.id = t.import_id
           ORDER BY t.paid_date DESC, ${ORDER_LINK_PRIORITY_SQL} ASC, t.external_id ASC`,
          [dateParam, batchSize, batchStartIdx],
          db,
        )
      : Promise.resolve([]),
    unlinkedOrdersCount > 0
      ? query<{ created_date: string }>(
          `SELECT DISTINCT t.created_date
           FROM transactions t
           WHERE ${txDateWhere}
             AND t.is_order = 1
             AND COALESCE(NULLIF(t.channel, ''), 'TikTok') IN ('TikTok', 'Shopee')
             AND ${billableClause}
             AND (${chMatchSql})
             AND NOT ${isLinkedSql}
             AND t.created_date <> ''
             AND t.created_date <> 'unknown'
           ORDER BY t.created_date DESC
           LIMIT 4`,
          [dateParam],
          db,
        )
      : Promise.resolve([]),
  ]);

  const orders = await enrichTransactionsWithOms(rows.map(mapTransaction), db);

  return {
    date,
    billableTotalCount,
    tiktokOrdersCount,
    shopeeOrdersCount,
    channelFilteredCount,
    linkedOrdersCount,
    unlinkedOrdersCount,
    effectiveLinkFilter,
    totalFilteredCount,
    batchSize,
    batchCount,
    currentBatch,
    batchStartIdx,
    batchEndIdx,
    missingOmsDates: missingDateRows.map((r) => String(r.created_date)),
    orders,
  };
}

export type BillSortKey =
  | "latest"
  | "oldest"
  | "payout_desc"
  | "payout_asc"
  | "income_desc"
  | "income_asc"
  | "fee_desc"
  | "fee_asc";

const BILL_SORT_SQL: Record<BillSortKey, string> = {
  latest: `t.paid_date DESC, ${ORDER_LINK_PRIORITY_SQL} ASC, t.external_id DESC`,
  oldest: `t.paid_date ASC, ${ORDER_LINK_PRIORITY_SQL} ASC, t.external_id ASC`,
  payout_desc: `t.payout DESC, t.paid_date DESC, t.external_id DESC`,
  payout_asc: `t.payout ASC, t.paid_date DESC, t.external_id DESC`,
  income_desc: `t.income DESC, t.paid_date DESC, t.external_id DESC`,
  income_asc: `t.income ASC, t.paid_date DESC, t.external_id DESC`,
  fee_desc: `ABS(t.fee_total) DESC, t.paid_date DESC, t.external_id DESC`,
  fee_asc: `ABS(t.fee_total) ASC, t.paid_date DESC, t.external_id DESC`,
};

const BILL_CATEGORY_SQL: Record<BillCategoryKey, string> = {
  normal: `(t.income > 0)`,
  refund_fee: `(t.income <= 0 AND (t.income < 0 OR t.fee_total < 0 OR t.payout < 0))`,
  zero: `(t.income <= 0 AND NOT (t.income < 0 OR t.fee_total < 0 OR t.payout < 0))`,
};

export async function listBills(
  options: {
    date?: string;
    q?: string;
    channel?: string;
    status?: "all" | "ok" | "mismatch";
    linkStatus?: "all" | "linked" | "unlinked" | "oms_only";
    category?: BillCategoryKey;
    sort?: BillSortKey;
    page?: number;
    pageSize?: number;
  } = {},
  db?: Queryable,
): Promise<BillListResult> {
  const date = (options.date ?? "").trim().slice(0, 32);
  const q = escapeLikePattern(options.q ?? "");
  const channel = (options.channel ?? "all").trim().slice(0, 32);
  const status = options.status ?? "all";
  const linkStatus = options.linkStatus ?? "all";
  const category: BillCategoryKey =
    options.category && options.category in BILL_CATEGORY_SQL
      ? options.category
      : "normal";
  const sortKey: BillSortKey =
    options.sort && options.sort in BILL_SORT_SQL ? options.sort : "latest";
  const orderBySql = BILL_SORT_SQL[sortKey];
  const pageSize = Math.min(500, Math.max(10, options.pageSize ?? 20));
  const page = Math.max(1, options.page ?? 1);
  const baseClauses = [
    "t.is_order = 1",
    "COALESCE(NULLIF(t.channel, ''), 'TikTok') IN ('TikTok', 'Shopee')",
  ];
  const baseParams: unknown[] = [];
  const isMonthFilter = /^\d{4}-\d{2}$/.test(date);
  const isYearFilter = /^\d{4}$/.test(date);

  if (date) {
    if (isMonthFilter || isYearFilter) {
      baseClauses.push(`t.paid_date LIKE $${baseParams.length + 1}`);
      baseParams.push(`${date}-%`);
    } else {
      baseClauses.push(`t.paid_date = $${baseParams.length + 1}`);
      baseParams.push(date);
    }
  }
  if (q) {
    baseClauses.push(
      `(t.external_id || ' ' || COALESCE(t.order_code, '') || ' ' || COALESCE(t.product_detail, '')) ILIKE $${baseParams.length + 1} ESCAPE '\\'`,
    );
    baseParams.push(`%${q}%`);
  }
  if (status === "ok") {
    baseClauses.push(
      `ABS(COALESCE((t.checks_json->>'incomeDiff')::numeric, 0)) < 0.01 AND ABS(COALESCE((t.checks_json->>'feeDiff')::numeric, 0)) < 0.01 AND ABS(COALESCE((t.checks_json->>'payoutDiff')::numeric, 0)) < 0.01`,
    );
  } else if (status === "mismatch") {
    baseClauses.push(
      `(ABS(COALESCE((t.checks_json->>'incomeDiff')::numeric, 0)) >= 0.01 OR ABS(COALESCE((t.checks_json->>'feeDiff')::numeric, 0)) >= 0.01 OR ABS(COALESCE((t.checks_json->>'payoutDiff')::numeric, 0)) >= 0.01)`,
    );
  }

  const clausesWithoutLinkAndCat = [...baseClauses];
  const paramsWithoutLink = [...baseParams];
  if (channel === "TikTok" || channel === "Shopee") {
    clausesWithoutLinkAndCat.push(
      `COALESCE(NULLIF(t.channel, ''), 'TikTok') = $${paramsWithoutLink.length + 1}`,
    );
    paramsWithoutLink.push(channel);
  }
  const whereWithoutLinkAndCat = clausesWithoutLinkAndCat.join(" AND ");

  const linkConditionSql =
    linkStatus === "linked"
      ? `${ORDER_LINK_PRIORITY_SQL} = 0`
      : linkStatus === "oms_only"
        ? `${ORDER_LINK_PRIORITY_SQL} = 1`
        : linkStatus === "unlinked"
          ? `${ORDER_LINK_PRIORITY_SQL} = 2`
          : "TRUE";

  // Query non-positive income breakdown (hits partial index ix_transactions_non_positive_income)
  const nonPosRow = await queryOne<Record<string, unknown>>(
    `SELECT
       COUNT(*) AS non_pos_all,
       ROUND(COALESCE(SUM(t.income), 0)::numeric, 2) AS non_pos_income,
       ROUND(COALESCE(SUM(t.fee_total), 0)::numeric, 2) AS non_pos_fees,
       ROUND(COALESCE(SUM(t.payout), 0)::numeric, 2) AS non_pos_payout,
       SUM(CASE WHEN COALESCE(NULLIF(t.channel, ''), 'TikTok') = 'TikTok' THEN 1 ELSE 0 END) AS non_pos_tiktok,
       SUM(CASE WHEN t.channel = 'Shopee' THEN 1 ELSE 0 END) AS non_pos_shopee,
       SUM(CASE WHEN ${ORDER_LINK_PRIORITY_SQL} = 0 THEN 1 ELSE 0 END) AS non_pos_linked,
       SUM(CASE WHEN ${ORDER_LINK_PRIORITY_SQL} = 1 THEN 1 ELSE 0 END) AS non_pos_oms_only,
       SUM(CASE WHEN ${ORDER_LINK_PRIORITY_SQL} = 2 THEN 1 ELSE 0 END) AS non_pos_unlinked,
       SUM(CASE WHEN (${linkConditionSql}) AND (t.income < 0 OR t.fee_total < 0 OR t.payout < 0) THEN 1 ELSE 0 END) AS refund_fee_count,
       ROUND(COALESCE(SUM(CASE WHEN (${linkConditionSql}) AND (t.income < 0 OR t.fee_total < 0 OR t.payout < 0) THEN t.payout ELSE 0 END), 0)::numeric, 2) AS refund_fee_payout,
       SUM(CASE WHEN (${linkConditionSql}) AND NOT (t.income < 0 OR t.fee_total < 0 OR t.payout < 0) THEN 1 ELSE 0 END) AS zero_count
     FROM transactions t
     WHERE ${whereWithoutLinkAndCat}
       AND t.income <= 0`,
    paramsWithoutLink,
    db,
  );

  const nonPosAll = Number(nonPosRow?.non_pos_all ?? 0);
  const nonPosLinked = Number(nonPosRow?.non_pos_linked ?? 0);
  const nonPosOmsOnly = Number(nonPosRow?.non_pos_oms_only ?? 0);
  const nonPosUnlinked = Number(nonPosRow?.non_pos_unlinked ?? 0);

  const clausesWithoutLink = [
    ...clausesWithoutLinkAndCat,
    BILL_CATEGORY_SQL[category],
  ];
  const whereWithoutLink = clausesWithoutLink.join(" AND ");
  const canUseFastLinkCounts =
    category === "normal" && !q && status === "all" && channel === "all";
  let fastLinkStatsRow: Record<string, unknown> | null = null;
  if (canUseFastLinkCounts) {
    const dsLinkParams: unknown[] = [];
    let dsLinkWhere = "";
    if (date) {
      if (isMonthFilter || isYearFilter) {
        dsLinkWhere = "WHERE paid_date LIKE $1";
        dsLinkParams.push(`${date}-%`);
      } else {
        dsLinkWhere = "WHERE paid_date = $1";
        dsLinkParams.push(date);
      }
    }
    const candidate = await queryOne<Record<string, unknown>>(
      `SELECT
         COALESCE(SUM(order_count), 0) AS all_count,
         COALESCE(SUM(linked_count), 0) AS linked_count,
         COALESCE(SUM(oms_only_count), 0) AS oms_only_count,
         COALESCE(SUM(unlinked_count), 0) AS unlinked_count
       FROM daily_summaries
       ${dsLinkWhere}`,
      dsLinkParams,
      db,
    );
    const totalFromSummaries =
      Number(candidate?.linked_count ?? 0) +
      Number(candidate?.oms_only_count ?? 0) +
      Number(candidate?.unlinked_count ?? 0);
    if (
      candidate &&
      Number(candidate.all_count ?? 0) > 0 &&
      totalFromSummaries === Number(candidate.all_count ?? 0)
    ) {
      fastLinkStatsRow = {
        all_count: Math.max(0, Number(candidate.all_count ?? 0) - nonPosAll),
        linked_count: Math.max(
          0,
          Number(candidate.linked_count ?? 0) - nonPosLinked,
        ),
        oms_only_count: Math.max(
          0,
          Number(candidate.oms_only_count ?? 0) - nonPosOmsOnly,
        ),
        unlinked_count: Math.max(
          0,
          Number(candidate.unlinked_count ?? 0) - nonPosUnlinked,
        ),
      };
    }
  }

  const [linkStatsRow, missingDatesRows] = await Promise.all([
    fastLinkStatsRow
      ? Promise.resolve(fastLinkStatsRow)
      : queryOne<Record<string, unknown>>(
          `SELECT
             COUNT(*) AS all_count,
             SUM(CASE WHEN ${ORDER_LINK_PRIORITY_SQL} = 0 THEN 1 ELSE 0 END) AS linked_count,
             SUM(CASE WHEN ${ORDER_LINK_PRIORITY_SQL} = 1 THEN 1 ELSE 0 END) AS oms_only_count,
             SUM(CASE WHEN ${ORDER_LINK_PRIORITY_SQL} = 2 THEN 1 ELSE 0 END) AS unlinked_count
           FROM transactions t
           WHERE ${whereWithoutLink}`,
          paramsWithoutLink,
          db,
        ),
    fastLinkStatsRow && Number(fastLinkStatsRow.unlinked_count ?? 0) === 0
      ? Promise.resolve([])
      : query<{ created_date: string }>(
          `SELECT DISTINCT t.created_date
           FROM transactions t
           WHERE ${whereWithoutLink}
             AND ${ORDER_LINK_PRIORITY_SQL} = 2
             AND t.created_date <> ''
             AND t.created_date <> 'unknown'
           ORDER BY t.created_date DESC
           LIMIT 6`,
          paramsWithoutLink,
          db,
        ),
  ]);

  const linkCounts: BillLinkCounts = {
    all: Number(linkStatsRow?.all_count ?? 0),
    linked: Number(linkStatsRow?.linked_count ?? 0),
    omsOnly: Number(linkStatsRow?.oms_only_count ?? 0),
    unlinked: Number(linkStatsRow?.unlinked_count ?? 0),
    missingOmsCreatedDates: missingDatesRows.map((r) => String(r.created_date)),
  };

  const clauses = [...clausesWithoutLink];
  const params = [...paramsWithoutLink];
  if (linkStatus !== "all") {
    clauses.push(linkConditionSql);
  }
  const where = clauses.join(" AND ");

  // Fast Path for Billion-Row Scale: read counts, totals, channelCounts, and dateScope from pre-aggregated daily_summaries
  const canUseFastSummary =
    category === "normal" && !q && status === "all" && linkStatus === "all";
  let fastSummaryUsed = false;
  let total = 0;
  let summaryIncome = 0;
  let summaryFees = 0;
  let summaryPayout = 0;
  let minPaidDate: string | null = null;
  let maxPaidDate: string | null = null;
  let distinctDates = 0;
  const channelCounts: Record<string, number> = { all: 0, TikTok: 0, Shopee: 0 };

  if (canUseFastSummary) {
    const dsParams: unknown[] = [];
    let dsWhere = "";
    if (date) {
      if (isMonthFilter || isYearFilter) {
        dsWhere = "WHERE paid_date LIKE $1";
        dsParams.push(`${date}-%`);
      } else {
        dsWhere = "WHERE paid_date = $1";
        dsParams.push(date);
      }
    }

    const dsRow = await queryOne<Record<string, unknown>>(
      `SELECT
         COALESCE(SUM(order_count), 0) AS order_count,
         ROUND(COALESCE(SUM(order_income), 0)::numeric, 2) AS order_income,
         ROUND(COALESCE(SUM(order_fees), 0)::numeric, 2) AS order_fees,
         ROUND(COALESCE(SUM(order_payout), 0)::numeric, 2) AS order_payout,
         COALESCE(SUM(tiktok_count), 0) AS tiktok_count,
         COALESCE(SUM(shopee_count), 0) AS shopee_count,
         MIN(paid_date) AS min_paid_date,
         MAX(paid_date) AS max_paid_date,
         COUNT(*) AS distinct_dates
       FROM daily_summaries
       ${dsWhere}`,
      dsParams,
      db,
    );

    const dsOrderCount = Number(dsRow?.order_count ?? 0);
    if (dsOrderCount > 0) {
      const dsTikTokCount = Number(dsRow?.tiktok_count ?? 0);
      const dsShopeeCount = Number(dsRow?.shopee_count ?? 0);
      const rawTikTok =
        dsTikTokCount > 0 || dsShopeeCount > 0 ? dsTikTokCount : dsOrderCount;
      channelCounts.TikTok = Math.max(
        0,
        rawTikTok - Number(nonPosRow?.non_pos_tiktok ?? 0),
      );
      channelCounts.Shopee = Math.max(
        0,
        dsShopeeCount - Number(nonPosRow?.non_pos_shopee ?? 0),
      );
      channelCounts.all = Math.max(0, dsOrderCount - nonPosAll);
      if (channel === "all") {
        minPaidDate = dsRow?.min_paid_date ? String(dsRow.min_paid_date) : null;
        maxPaidDate = dsRow?.max_paid_date ? String(dsRow.max_paid_date) : null;
        distinctDates = Number(dsRow?.distinct_dates ?? 0);
        fastSummaryUsed = true;
        total = Math.max(0, dsOrderCount - nonPosAll);
        summaryIncome = Number(
          (
            Number(dsRow?.order_income ?? 0) -
            Number(nonPosRow?.non_pos_income ?? 0)
          ).toFixed(2),
        );
        summaryFees = Number(
          (
            Number(dsRow?.order_fees ?? 0) -
            Number(nonPosRow?.non_pos_fees ?? 0)
          ).toFixed(2),
        );
        summaryPayout = Number(
          (
            Number(dsRow?.order_payout ?? 0) -
            Number(nonPosRow?.non_pos_payout ?? 0)
          ).toFixed(2),
        );
      }
    }
  }

  if (!fastSummaryUsed) {
    const clausesForChannelCounts = [
      ...baseClauses,
      BILL_CATEGORY_SQL[category],
    ];
    if (linkStatus !== "all") {
      clausesForChannelCounts.push(linkConditionSql);
    }
    const whereForChannelCounts = clausesForChannelCounts.join(" AND ");

    const [summaryRow, chStatsRow] = await Promise.all([
      queryOne<Record<string, unknown>>(
        `SELECT COUNT(*) AS count,
                ROUND(SUM(t.income)::numeric, 2) AS income,
                ROUND(SUM(t.fee_total)::numeric, 2) AS fees,
                ROUND(SUM(t.payout)::numeric, 2) AS payout,
                SUM(CASE WHEN COALESCE(NULLIF(t.channel, ''), 'TikTok') = 'TikTok' THEN 1 ELSE 0 END) AS tiktok_count,
                SUM(CASE WHEN t.channel = 'Shopee' THEN 1 ELSE 0 END) AS shopee_count,
                MIN(NULLIF(NULLIF(t.paid_date, ''), 'unknown')) AS min_paid_date,
                MAX(NULLIF(NULLIF(t.paid_date, ''), 'unknown')) AS max_paid_date,
                COUNT(DISTINCT NULLIF(NULLIF(t.paid_date, ''), 'unknown')) AS distinct_dates
         FROM transactions t WHERE ${where}`,
        params,
        db,
      ),
      channel === "all" || channelCounts.all > 0
        ? Promise.resolve(null)
        : queryOne<Record<string, unknown>>(
            `SELECT COUNT(*) AS all_count,
                    SUM(CASE WHEN COALESCE(NULLIF(t.channel, ''), 'TikTok') = 'TikTok' THEN 1 ELSE 0 END) AS tiktok_count,
                    SUM(CASE WHEN t.channel = 'Shopee' THEN 1 ELSE 0 END) AS shopee_count
             FROM transactions t WHERE ${whereForChannelCounts}`,
            baseParams,
            db,
          ),
    ]);

    total = Number(summaryRow?.count ?? 0);
    summaryIncome = Number(summaryRow?.income ?? 0);
    summaryFees = Number(summaryRow?.fees ?? 0);
    summaryPayout = Number(summaryRow?.payout ?? 0);
    minPaidDate = summaryRow?.min_paid_date ? String(summaryRow.min_paid_date) : null;
    maxPaidDate = summaryRow?.max_paid_date ? String(summaryRow.max_paid_date) : null;
    distinctDates = Number(summaryRow?.distinct_dates ?? 0);
    if (channelCounts.all === 0) {
      if (chStatsRow) {
        channelCounts.all = Number(chStatsRow.all_count ?? 0);
        channelCounts.TikTok = Number(chStatsRow.tiktok_count ?? 0);
        channelCounts.Shopee = Number(chStatsRow.shopee_count ?? 0);
      } else {
        channelCounts.all = total;
        channelCounts.TikTok = Number(summaryRow?.tiktok_count ?? total);
        channelCounts.Shopee = Number(summaryRow?.shopee_count ?? 0);
      }
    }
  }

  let normalCategoryCount = total;
  if (category !== "normal") {
    const clausesForNormalCount = [...clausesWithoutLinkAndCat, BILL_CATEGORY_SQL.normal];
    if (linkStatus !== "all") {
      clausesForNormalCount.push(linkConditionSql);
    }
    const normalRow = await queryOne<{ c: string | number }>(
      `SELECT COUNT(*) AS c FROM transactions t WHERE ${clausesForNormalCount.join(" AND ")}`,
      paramsWithoutLink,
      db,
    );
    normalCategoryCount = Number(normalRow?.c ?? 0);
  }

  const categoryCounts: BillCategoryCounts = {
    normal: normalCategoryCount,
    refundFee: Number(nonPosRow?.refund_fee_count ?? 0),
    zero: Number(nonPosRow?.zero_count ?? 0),
    refundFeePayout: Number(nonPosRow?.refund_fee_payout ?? 0),
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = await query<Record<string, unknown>>(
    `WITH page_ids AS (
       SELECT t.id
       FROM transactions t
       WHERE ${where}
       ORDER BY ${orderBySql}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}
     )
     SELECT t.*, r.invoice_no, i.filename AS import_filename, i.imported_at AS import_imported_at
     FROM page_ids p
     JOIN transactions t ON t.id = p.id
     LEFT JOIN invoice_registry r ON r.order_id = t.external_id
     LEFT JOIN imports i ON i.id = t.import_id
     ORDER BY ${orderBySql}`,
    [...params, pageSize, (safePage - 1) * pageSize],
    db,
  );

  const enrichedRows = await enrichTransactionsWithOms(rows.map(mapTransaction), db);

  return {
    rows: enrichedRows,
    total,
    page: safePage,
    pageSize,
    pageCount,
    category,
    categoryCounts,
    summary: {
      count: total,
      income: summaryIncome,
      fees: summaryFees,
      payout: summaryPayout,
    },
    dateScope: {
      minPaidDate,
      maxPaidDate,
      distinctDates,
    },
    channelCounts,
    linkCounts,
  };
}

export async function getBill(
  orderId: string,
  db?: Queryable,
): Promise<TransactionRow | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT t.*, r.invoice_no, i.filename AS import_filename, i.imported_at AS import_imported_at
     FROM transactions t
     LEFT JOIN invoice_registry r ON r.order_id = t.external_id
     LEFT JOIN imports i ON i.id = t.import_id
     WHERE (t.external_id = $1 OR t.order_code = $1)
       AND t.is_order = 1
       AND COALESCE(NULLIF(t.channel, ''), 'TikTok') IN ('TikTok', 'Shopee')
     ORDER BY t.paid_date DESC LIMIT 1`,
    [orderId],
    db,
  );
  if (!row) return null;
  const [enriched] = await enrichTransactionsWithOms([mapTransaction(row)], db);
  return enriched ?? null;
}

export async function getInvoiceNo(
  orderId: string,
  db?: Queryable,
): Promise<string | null> {
  const row = await queryOne<{ invoice_no: string }>(
    "SELECT invoice_no FROM invoice_registry WHERE order_id = $1",
    [orderId],
    db,
  );
  return row ? row.invoice_no : null;
}

export async function updateOrderBuyerInfo(
  orderId: string,
  input: {
    buyerName?: string | null;
    buyerTaxId?: string | null;
    buyerAddress?: string | null;
  },
  db?: Queryable,
): Promise<{
  orderId: string;
  buyerName: string | null;
  buyerTaxId: string | null;
  buyerAddress: string | null;
} | null> {
  const cleanOrderId = String(orderId ?? "").trim();
  if (!cleanOrderId) return null;

  const cleanName = (input.buyerName ?? "").trim().slice(0, 300) || null;
  const cleanTaxId = (input.buyerTaxId ?? "").trim().slice(0, 40) || null;
  const cleanAddress = (input.buyerAddress ?? "").trim().slice(0, 600) || null;

  const rows = await query<{
    external_id: string;
    buyer_name: string | null;
    buyer_tax_id: string | null;
    buyer_address: string | null;
  }>(
    `UPDATE transactions
     SET buyer_name = $2,
         buyer_tax_id = $3,
         buyer_address = $4
     WHERE (external_id = $1 OR order_code = $1)
       AND is_order = 1
     RETURNING external_id, buyer_name, buyer_tax_id, buyer_address`,
    [cleanOrderId, cleanName, cleanTaxId, cleanAddress],
    db,
  );

  const first = rows[0];
  if (!first) return null;
  return {
    orderId: String(first.external_id),
    buyerName: first.buyer_name ? String(first.buyer_name) : null,
    buyerTaxId: first.buyer_tax_id ? String(first.buyer_tax_id) : null,
    buyerAddress: first.buyer_address ? String(first.buyer_address) : null,
  };
}

export interface SkuSummaryRow {
  skuCode: string;
  productName: string;
  defaultPrice: number;
  totalQty: number;
  orderCount: number;
  grossAmount: number;
  netSalesAmount: number;
  tiktokQty: number;
  shopeeQty: number;
  facebookQty: number;
}

export type SkuSortKey =
  | "qty_desc"
  | "qty_asc"
  | "gross_desc"
  | "gross_asc"
  | "orders_desc"
  | "orders_asc"
  | "price_desc"
  | "price_asc";

const SKU_SORT_SQL: Record<SkuSortKey, string> = {
  qty_desc: "s.total_qty DESC, s.net_sales_amount DESC, s.sku_code ASC",
  qty_asc: "s.total_qty ASC, s.net_sales_amount ASC, s.sku_code ASC",
  gross_desc: "s.gross_amount DESC, s.total_qty DESC, s.sku_code ASC",
  gross_asc: "s.gross_amount ASC, s.total_qty ASC, s.sku_code ASC",
  orders_desc: "s.order_count DESC, s.total_qty DESC, s.sku_code ASC",
  orders_asc: "s.order_count ASC, s.total_qty ASC, s.sku_code ASC",
  price_desc: "COALESCE(p.default_price, 0) DESC, s.total_qty DESC, s.sku_code ASC",
  price_asc: "COALESCE(p.default_price, 0) ASC, s.total_qty ASC, s.sku_code ASC",
};

export async function listSkuSummariesPaged(
  options: {
    page?: number;
    pageSize?: number;
    q?: string;
    channel?: string;
    sort?: SkuSortKey;
  } = {},
  db?: Queryable,
): Promise<{
  rows: SkuSummaryRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  totals: {
    skuCount: number;
    totalQty: number;
    grossAmount: number;
    netSalesAmount: number;
  };
}> {
  const pageSize = Math.min(200, Math.max(10, options.pageSize ?? 20));
  const rawPage = Math.max(1, options.page ?? 1);
  const q = escapeLikePattern(options.q ?? "");
  const channel = (options.channel ?? "all").trim().slice(0, 32);
  const sortKey: SkuSortKey =
    options.sort && options.sort in SKU_SORT_SQL ? options.sort : "qty_desc";
  const orderBySql = SKU_SORT_SQL[sortKey];

  const clauses: string[] = ["(s.tiktok_qty > 0 OR s.shopee_qty > 0)"];
  const params: unknown[] = [];
  if (channel === "TikTok") {
    clauses.push("s.tiktok_qty > 0");
  } else if (channel === "Shopee") {
    clauses.push("s.shopee_qty > 0");
  }
  if (q) {
    clauses.push(
      `(s.sku_code ILIKE $${params.length + 1} ESCAPE '\\' OR s.product_name ILIKE $${params.length + 2} ESCAPE '\\')`,
    );
    params.push(`%${q}%`, `%${q}%`);
  }
  const where = `WHERE ${clauses.join(" AND ")}`;

  const summaryRow = await queryOne<Record<string, unknown>>(
    `SELECT
       COUNT(*) AS sku_count,
       COALESCE(SUM(s.total_qty), 0) AS total_qty,
       ROUND(COALESCE(SUM(s.gross_amount), 0)::numeric, 2) AS gross_amount,
       ROUND(COALESCE(SUM(s.net_sales_amount), 0)::numeric, 2) AS net_sales_amount
     FROM sku_summaries s
     ${where}`,
    params,
    db,
  );

  const total = Number(summaryRow?.sku_count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(rawPage, pageCount);

  const rows = await query<Record<string, unknown>>(
    `SELECT
       s.*,
       COALESCE(p.default_price, 0) AS default_price
     FROM sku_summaries s
     LEFT JOIN products p ON p.sku_code = s.sku_code
     ${where}
     ORDER BY ${orderBySql}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, (page - 1) * pageSize],
    db,
  );

  return {
    rows: rows.map((r) => ({
      skuCode: String(r.sku_code ?? ""),
      productName: String(r.product_name ?? ""),
      defaultPrice: Number(r.default_price ?? 0),
      totalQty: Number(r.total_qty ?? 0),
      orderCount: Number(r.order_count ?? 0),
      grossAmount: Number(r.gross_amount ?? 0),
      netSalesAmount: Number(r.net_sales_amount ?? 0),
      tiktokQty: Number(r.tiktok_qty ?? 0),
      shopeeQty: Number(r.shopee_qty ?? 0),
      facebookQty: Number(r.facebook_qty ?? 0),
    })),
    total,
    page,
    pageSize,
    pageCount,
    totals: {
      skuCount: total,
      totalQty: Number(summaryRow?.total_qty ?? 0),
      grossAmount: Number(summaryRow?.gross_amount ?? 0),
      netSalesAmount: Number(summaryRow?.net_sales_amount ?? 0),
    },
  };
}

export async function getOverallStats(db?: Queryable): Promise<OverallStats> {
  const stats = await queryOne<{ import_count: number }>(
    "SELECT COUNT(*) AS import_count FROM imports",
    [],
    db,
  );
  const fastTotals = await queryOne<Record<string, unknown>>(
    `SELECT
       COALESCE(SUM(order_count), 0) AS order_count,
       ROUND(COALESCE(SUM(order_payout), 0)::numeric, 2) AS total_payout,
       ROUND(COALESCE(SUM(order_income), 0)::numeric, 2) AS total_income,
       ROUND(COALESCE(SUM(order_fees), 0)::numeric, 2) AS total_fees,
       MAX(paid_date) AS latest_paid_date
     FROM daily_summaries`,
    [],
    db,
  );
  if (Number(fastTotals?.order_count ?? 0) > 0) {
    return {
      importCount: Number(stats?.import_count ?? 0),
      orderCount: Number(fastTotals?.order_count ?? 0),
      totalPayout: Number(fastTotals?.total_payout ?? 0),
      totalIncome: Number(fastTotals?.total_income ?? 0),
      totalFees: Number(fastTotals?.total_fees ?? 0),
      latestPaidDate: fastTotals?.latest_paid_date
        ? String(fastTotals.latest_paid_date)
        : null,
    };
  }

  const totals = await queryOne<Record<string, unknown>>(
    `SELECT
      SUM(CASE WHEN is_order = 1 THEN 1 ELSE 0 END) AS order_count,
      ROUND(SUM(CASE WHEN is_order = 1 THEN payout ELSE 0 END)::numeric, 2) AS total_payout,
      ROUND(SUM(CASE WHEN is_order = 1 THEN income ELSE 0 END)::numeric, 2) AS total_income,
      ROUND(SUM(CASE WHEN is_order = 1 THEN fee_total ELSE 0 END)::numeric, 2) AS total_fees,
      MAX(CASE WHEN is_order = 1 THEN paid_date ELSE '' END) AS latest_paid_date
    FROM transactions`,
    [],
    db,
  );
  return {
    importCount: Number(stats?.import_count ?? 0),
    orderCount: Number(totals?.order_count ?? 0),
    totalPayout: Number(totals?.total_payout ?? 0),
    totalIncome: Number(totals?.total_income ?? 0),
    totalFees: Number(totals?.total_fees ?? 0),
    latestPaidDate: totals?.latest_paid_date ? String(totals.latest_paid_date) : null,
  };
}

export type UploadDateMode = "created" | "paid";

export interface DailyUploadCompletenessRow {
  date: string;
  normalOrders: number;
  completeCount: number;
  missingFile1Count: number;
  missingFile2Count: number;
  missingFile3Count: number;
  hasFile1: boolean;
  hasFile2: boolean;
  hasFile3: boolean;
  isComplete: boolean;
}

export interface DailyUploadCompletenessReport {
  month: string;
  availableMonths: string[];
  mode: UploadDateMode;
  rows: DailyUploadCompletenessRow[];
  summary: {
    totalDays: number;
    completeDays: number;
    incompleteDays: number;
    totalNormalOrders: number;
    totalCompleteOrders: number;
    totalMissingFile1: number;
    totalMissingFile2: number;
    totalMissingFile3: number;
  };
  recentImports: {
    id: number;
    filename: string;
    fileType: string;
    periodStart: string | null;
    periodEnd: string | null;
    orderCount: number;
    importedAt: string;
  }[];
}

export async function getDailyUploadCompleteness(
  options?: { month?: string; mode?: UploadDateMode },
  db?: Queryable,
): Promise<DailyUploadCompletenessReport> {
  const mode: UploadDateMode = options?.mode === "paid" ? "paid" : "created";
  const dateCol =
    mode === "paid"
      ? "COALESCE(NULLIF(t.paid_date, ''), t.created_date)"
      : "COALESCE(NULLIF(t.created_date, ''), t.paid_date)";

  const monthRows = await query<{ ym: string }>(
    `SELECT DISTINCT SUBSTRING(${dateCol} FROM 1 FOR 7) AS ym
     FROM transactions t
     WHERE t.is_order = 1
       AND t.income > 0
       AND ${dateCol} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       AND ${dateCol} <> '1970-01-01'
     ORDER BY ym DESC`,
    [],
    db,
  );

  const availableMonths = monthRows
    .map((r) => String(r.ym ?? ""))
    .filter((ym) => /^\d{4}-\d{2}$/.test(ym));

  const fallbackMonth = new Date().toISOString().slice(0, 7);
  const selectedMonth =
    options?.month && /^\d{4}-\d{2}$/.test(options.month)
      ? options.month
      : availableMonths[0] ?? fallbackMonth;

  const rawRows = await query<Record<string, unknown>>(
    `WITH items_by_order AS (
       SELECT DISTINCT order_code
       FROM oms_order_items
     )
     SELECT
       ${dateCol} AS d,
       COUNT(*)::int AS normal_orders,
       SUM(
         CASE
           WHEN t.order_code IS NOT NULL
            AND t.order_code <> ''
            AND ibo.order_code IS NOT NULL
            AND (t.channel <> 'TikTok' OR t.transaction_type <> 'คำสั่งซื้อ (OMS)')
           THEN 1
           ELSE 0
         END
       )::int AS complete_count,
       SUM(
         CASE
           WHEN t.order_code IS NULL OR t.order_code = ''
           THEN 1
           ELSE 0
         END
       )::int AS missing_file1_count,
       SUM(
         CASE
           WHEN t.order_code IS NOT NULL
            AND t.order_code <> ''
            AND ibo.order_code IS NULL
           THEN 1
           ELSE 0
         END
       )::int AS missing_file2_count,
       SUM(
         CASE
           WHEN t.channel = 'TikTok' AND t.transaction_type = 'คำสั่งซื้อ (OMS)'
           THEN 1
           ELSE 0
         END
       )::int AS missing_file3_count
     FROM transactions t
     LEFT JOIN items_by_order ibo ON ibo.order_code = t.order_code
     WHERE t.is_order = 1
       AND t.income > 0
       AND ${dateCol} LIKE $1 || '-%'
       AND ${dateCol} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       AND COALESCE(NULLIF(t.channel, ''), 'TikTok') IN ('TikTok', 'Shopee')
     GROUP BY ${dateCol}
     ORDER BY ${dateCol} ASC`,
    [selectedMonth],
    db,
  );

  const byDate = new Map<string, DailyUploadCompletenessRow>();
  for (const r of rawRows) {
    const date = String(r.d ?? "");
    const normalOrders = Number(r.normal_orders ?? 0);
    const completeCount = Number(r.complete_count ?? 0);
    const missingFile1Count = Number(r.missing_file1_count ?? 0);
    const missingFile2Count = Number(r.missing_file2_count ?? 0);
    const missingFile3Count = Number(r.missing_file3_count ?? 0);
    const hasFile1 = normalOrders > 0 && missingFile1Count === 0;
    const hasFile2 = normalOrders > 0 && missingFile1Count === 0 && missingFile2Count === 0;
    const hasFile3 = normalOrders > 0 && missingFile3Count === 0;
    const isComplete =
      normalOrders > 0 &&
      missingFile1Count === 0 &&
      missingFile2Count === 0 &&
      missingFile3Count === 0;

    byDate.set(date, {
      date,
      normalOrders,
      completeCount,
      missingFile1Count,
      missingFile2Count,
      missingFile3Count,
      hasFile1,
      hasFile2,
      hasFile3,
      isComplete,
    });
  }

  // Fill calendar days from day 01 up to the max date in selectedMonth so gap days are visible
  const existingDates = Array.from(byDate.keys()).sort();
  const rows: DailyUploadCompletenessRow[] = [];
  if (existingDates.length > 0) {
    const maxDay = Number(existingDates[existingDates.length - 1]!.slice(8, 10));
    for (let day = 1; day <= maxDay; day++) {
      const dd = String(day).padStart(2, "0");
      const iso = `${selectedMonth}-${dd}`;
      const existing = byDate.get(iso);
      if (existing) {
        rows.push(existing);
      } else {
        rows.push({
          date: iso,
          normalOrders: 0,
          completeCount: 0,
          missingFile1Count: 0,
          missingFile2Count: 0,
          missingFile3Count: 0,
          hasFile1: false,
          hasFile2: false,
          hasFile3: false,
          isComplete: false,
        });
      }
    }
  }

  const recentImportRows = await query<Record<string, unknown>>(
    `SELECT id, filename, file_type, period_start, period_end, order_count, imported_at
     FROM imports
     ORDER BY id DESC
     LIMIT 6`,
    [],
    db,
  );

  const summary = rows.reduce(
    (acc, r) => {
      acc.totalDays += 1;
      if (r.isComplete) acc.completeDays += 1;
      else acc.incompleteDays += 1;
      acc.totalNormalOrders += r.normalOrders;
      acc.totalCompleteOrders += r.completeCount;
      acc.totalMissingFile1 += r.missingFile1Count;
      acc.totalMissingFile2 += r.missingFile2Count;
      acc.totalMissingFile3 += r.missingFile3Count;
      return acc;
    },
    {
      totalDays: 0,
      completeDays: 0,
      incompleteDays: 0,
      totalNormalOrders: 0,
      totalCompleteOrders: 0,
      totalMissingFile1: 0,
      totalMissingFile2: 0,
      totalMissingFile3: 0,
    },
  );

  return {
    month: selectedMonth,
    availableMonths:
      availableMonths.length > 0 ? availableMonths : [selectedMonth],
    mode,
    rows,
    summary,
    recentImports: recentImportRows.map((r) => ({
      id: Number(r.id ?? 0),
      filename: String(r.filename ?? ""),
      fileType: String(r.file_type ?? "settlement"),
      periodStart: r.period_start ? String(r.period_start) : null,
      periodEnd: r.period_end ? String(r.period_end) : null,
      orderCount: Number(r.order_count ?? 0),
      importedAt: String(r.imported_at ?? ""),
    })),
  };
}

