import { query, queryOne, withTransaction, type Queryable } from "./db";
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

export interface BillListResult {
  rows: TransactionRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
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
  return {
    id: Number(row.id),
    importId: Number(row.import_id),
    externalId: String(row.external_id ?? ""),
    transactionType: String(row.transaction_type ?? ""),
    isOrder: Number(row.is_order ?? 0) === 1,
    createdDate: String(row.created_date ?? ""),
    paidDate: String(row.paid_date ?? ""),
    currency: String(row.currency ?? "THB"),
    income: Number(row.income ?? 0),
    feeTotal: Number(row.fee_total ?? 0),
    adjustment: Number(row.adjustment ?? 0),
    payout: Number(row.payout ?? 0),
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
    invoiceNo: row.invoice_no ? String(row.invoice_no) : null,
    importFilename: row.import_filename ? String(row.import_filename) : undefined,
    importImportedAt: row.import_imported_at ? String(row.import_imported_at) : undefined,
    channel: row.channel ? String(row.channel) : "TikTok",
    orderCode: row.order_code ? String(row.order_code) : null,
  };
}

async function enrichTransactionsWithOms(
  txRows: TransactionRow[],
  db?: Queryable,
): Promise<TransactionRow[]> {
  const orderCodes = [
    ...new Set(
      txRows
        .map((r) => r.orderCode)
        .filter((code): code is string => Boolean(code)),
    ),
  ];
  if (orderCodes.length === 0) return txRows;

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
    if (!tx.orderCode) return tx;
    const o = orderMap.get(tx.orderCode);
    const it = itemMap.get(tx.orderCode);
    return {
      ...tx,
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
  const rawBlob = row.file_blob;
  const buffer =
    rawBlob instanceof Buffer
      ? rawBlob
      : rawBlob instanceof Uint8Array
        ? Buffer.from(rawBlob)
        : null;
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
  const rawBlob = row.file_blob;
  const buffer =
    rawBlob instanceof Buffer
      ? rawBlob
      : rawBlob instanceof Uint8Array
        ? Buffer.from(rawBlob)
        : null;

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
       )`,
      [],
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
             tiktok_count, shopee_count, facebook_count, updated_at
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
             SUM(CASE WHEN is_order = 1 AND channel = 'Facebook' THEN 1 ELSE 0 END)::int,
             now()
           FROM transactions
           WHERE paid_date = ANY($1::text[])
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
             COALESCE(SUM(CASE WHEN i.channel = 'Facebook' THEN i.quantity ELSE 0 END), 0)::int,
             now()
           FROM oms_order_items i
           WHERE i.sku_code = ANY($1::text[])
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
       )`,
      [],
      target,
    );

    const remaining = await queryOne<{ c: string | number }>(
      "SELECT COUNT(*) AS c FROM invoice_registry",
      [],
      target,
    );
    if (Number(remaining?.c ?? 0) === 0) {
      await query("ALTER SEQUENCE invoice_seq RESTART WITH 1", [], target);
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

export async function listDailyBatchesPaged(
  options: { page?: number; pageSize?: number; q?: string } = {},
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
  const q = (options.q ?? "").trim();

  const summaryCountRow = await queryOne<{ c: string | number }>(
    "SELECT COUNT(*) AS c FROM daily_summaries",
    [],
    db,
  );
  if (Number(summaryCountRow?.c ?? 0) > 0) {
    const sParams: unknown[] = [];
    const sWhere = q ? "WHERE paid_date LIKE $1" : "";
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
       ORDER BY paid_date DESC
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
    dateFilter += ` AND paid_date LIKE $${params.length + 1}`;
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
    ORDER BY paid_date DESC
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

export async function getDailyBatch(
  date: string,
  db?: Queryable,
): Promise<DailyBatch | null> {
  let summaryRow = await queryOne<Record<string, unknown>>(
    `SELECT
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
     WHERE paid_date = $1`,
    [date],
    db,
  );
  if (!summaryRow) {
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
      FROM transactions WHERE paid_date = $1`,
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
     WHERE t.paid_date = $1
     ORDER BY t.is_order DESC, t.external_id ASC`,
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

export async function listBills(
  options: {
    date?: string;
    q?: string;
    channel?: string;
    status?: "all" | "ok" | "mismatch";
    page?: number;
    pageSize?: number;
  } = {},
  db?: Queryable,
): Promise<BillListResult> {
  const date = (options.date ?? "").trim();
  const q = (options.q ?? "").trim();
  const channel = (options.channel ?? "all").trim();
  const status = options.status ?? "all";
  const pageSize = Math.min(500, Math.max(10, options.pageSize ?? 20));
  const page = Math.max(1, options.page ?? 1);
  const baseClauses = ["t.is_order = 1"];
  const baseParams: unknown[] = [];
  if (date) {
    baseClauses.push(`t.paid_date = $${baseParams.length + 1}`);
    baseParams.push(date);
  }
  if (q) {
    baseClauses.push(
      `(t.external_id || ' ' || COALESCE(t.order_code, '') || ' ' || COALESCE(t.product_detail, '')) ILIKE $${baseParams.length + 1}`,
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

  const clauses = [...baseClauses];
  const params = [...baseParams];
  if (channel && channel !== "all") {
    clauses.push(`COALESCE(NULLIF(t.channel, ''), 'TikTok') = $${params.length + 1}`);
    params.push(channel);
  }
  const where = clauses.join(" AND ");

  // Fast Path for Billion-Row Scale: read counts, totals, channelCounts, and dateScope from pre-aggregated daily_summaries
  const canUseFastSummary = !q && status === "all";
  let fastSummaryUsed = false;
  let total = 0;
  let summaryIncome = 0;
  let summaryFees = 0;
  let summaryPayout = 0;
  let minPaidDate: string | null = null;
  let maxPaidDate: string | null = null;
  let distinctDates = 0;
  const channelCounts: Record<string, number> = { all: 0 };

  if (canUseFastSummary) {
    const dsParams: unknown[] = [];
    const dsWhere = date ? "WHERE paid_date = $1" : "";
    if (date) dsParams.push(date);

    const dsRow = await queryOne<Record<string, unknown>>(
      `SELECT
         COALESCE(SUM(order_count), 0) AS order_count,
         ROUND(COALESCE(SUM(order_income), 0)::numeric, 2) AS order_income,
         ROUND(COALESCE(SUM(order_fees), 0)::numeric, 2) AS order_fees,
         ROUND(COALESCE(SUM(order_payout), 0)::numeric, 2) AS order_payout,
         COALESCE(SUM(tiktok_count), 0) AS tiktok_count,
         COALESCE(SUM(shopee_count), 0) AS shopee_count,
         COALESCE(SUM(facebook_count), 0) AS facebook_count,
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
      const tk = Number(dsRow?.tiktok_count ?? 0);
      const sp = Number(dsRow?.shopee_count ?? 0);
      const fb = Number(dsRow?.facebook_count ?? 0);
      if (tk > 0) channelCounts.TikTok = tk;
      if (sp > 0) channelCounts.Shopee = sp;
      if (fb > 0) channelCounts.Facebook = fb;
      channelCounts.all = dsOrderCount;
      minPaidDate = dsRow?.min_paid_date ? String(dsRow.min_paid_date) : null;
      maxPaidDate = dsRow?.max_paid_date ? String(dsRow.max_paid_date) : null;
      distinctDates = Number(dsRow?.distinct_dates ?? 0);

      if (!channel || channel === "all") {
        fastSummaryUsed = true;
        total = dsOrderCount;
        summaryIncome = Number(dsRow?.order_income ?? 0);
        summaryFees = Number(dsRow?.order_fees ?? 0);
        summaryPayout = Number(dsRow?.order_payout ?? 0);
      }
    }
  }

  if (!fastSummaryUsed) {
    if (channelCounts.all === 0) {
      const baseWhere = baseClauses.join(" AND ");
      const channelRows = await query<{ channel: string; c: string | number }>(
        `SELECT COALESCE(NULLIF(t.channel, ''), 'TikTok') AS channel, COUNT(*) AS c
         FROM transactions t
         WHERE ${baseWhere}
         GROUP BY COALESCE(NULLIF(t.channel, ''), 'TikTok')`,
        baseParams,
        db,
      );
      for (const cr of channelRows) {
        const ch = String(cr.channel || "TikTok");
        const c = Number(cr.c ?? 0);
        channelCounts[ch] = (channelCounts[ch] ?? 0) + c;
        channelCounts.all += c;
      }
    }

    const summaryRow = await queryOne<Record<string, unknown>>(
      `SELECT COUNT(*) AS count,
              ROUND(SUM(t.income)::numeric, 2) AS income,
              ROUND(SUM(t.fee_total)::numeric, 2) AS fees,
              ROUND(SUM(t.payout)::numeric, 2) AS payout,
              MIN(NULLIF(NULLIF(t.paid_date, ''), 'unknown')) AS min_paid_date,
              MAX(NULLIF(NULLIF(t.paid_date, ''), 'unknown')) AS max_paid_date,
              COUNT(DISTINCT NULLIF(NULLIF(t.paid_date, ''), 'unknown')) AS distinct_dates
       FROM transactions t WHERE ${where}`,
      params,
      db,
    );

    total = Number(summaryRow?.count ?? 0);
    summaryIncome = Number(summaryRow?.income ?? 0);
    summaryFees = Number(summaryRow?.fees ?? 0);
    summaryPayout = Number(summaryRow?.payout ?? 0);
    minPaidDate = summaryRow?.min_paid_date ? String(summaryRow.min_paid_date) : null;
    maxPaidDate = summaryRow?.max_paid_date ? String(summaryRow.max_paid_date) : null;
    distinctDates = Number(summaryRow?.distinct_dates ?? 0);
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = await query<Record<string, unknown>>(
    `SELECT t.*, r.invoice_no, i.filename AS import_filename, i.imported_at AS import_imported_at
     FROM transactions t
     LEFT JOIN invoice_registry r ON r.order_id = t.external_id
     LEFT JOIN imports i ON i.id = t.import_id
     WHERE ${where}
     ORDER BY t.paid_date DESC, t.external_id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
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
     WHERE (t.external_id = $1 OR t.order_code = $1) AND t.is_order = 1
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

export async function listSkuSummariesPaged(
  options: { page?: number; pageSize?: number; q?: string; channel?: string } = {},
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
  const q = (options.q ?? "").trim();
  const channel = (options.channel ?? "all").trim();

  const clauses: string[] = [];
  const params: unknown[] = [];
  if (q) {
    clauses.push(
      `(s.sku_code ILIKE $${params.length + 1} OR s.product_name ILIKE $${params.length + 2})`,
    );
    params.push(`%${q}%`, `%${q}%`);
  }
  if (channel === "TikTok") {
    clauses.push("s.tiktok_qty > 0");
  } else if (channel === "Shopee") {
    clauses.push("s.shopee_qty > 0");
  } else if (channel === "Facebook") {
    clauses.push("s.facebook_qty > 0");
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

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
     ORDER BY s.total_qty DESC, s.net_sales_amount DESC, s.sku_code ASC
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
