import { query, queryOne, type Queryable } from "./db";
import type {
  IngestWarning,
  MappingEntry,
  NormalizedTransaction,
  ReportSummary,
  TransactionChecks,
  UnknownColumn,
} from "./ingest/parse";
import type { Reconciliation } from "./ingest/import-service";

export interface ImportRow {
  id: number;
  filename: string;
  fileSize: number;
  importedAt: string;
  source: string;
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
  };
}

export async function listImports(
  limit = 100,
  db?: Queryable,
): Promise<ImportRow[]> {
  const rows = await query<Record<string, unknown>>(
    "SELECT * FROM imports ORDER BY id DESC LIMIT $1",
    [limit],
    db,
  );
  return rows.map(mapImport);
}

export async function getImport(
  id: number,
  db?: Queryable,
): Promise<ImportRow | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM imports WHERE id = $1",
    [id],
    db,
  );
  return row ? mapImport(row) : null;
}

export async function getLatestImport(db?: Queryable): Promise<ImportRow | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM imports ORDER BY id DESC LIMIT 1",
    [],
    db,
  );
  return row ? mapImport(row) : null;
}

export async function deleteImport(id: number, db?: Queryable): Promise<boolean> {
  const result = await query<{ id: number }>(
    "DELETE FROM imports WHERE id = $1 RETURNING id",
    [id],
    db,
  );
  return result.length > 0;
}

export async function listDailyBatches(
  limit = 30,
  db?: Queryable,
): Promise<DailyBatchRow[]> {
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

export async function getDailyBatch(
  date: string,
  db?: Queryable,
): Promise<DailyBatch | null> {
  const summaryRow = await queryOne<Record<string, unknown>>(
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
  if (!summaryRow || Number(summaryRow.transaction_count ?? 0) === 0) return null;

  const rows = await query<Record<string, unknown>>(
    `SELECT t.*, r.invoice_no
     FROM transactions t
     LEFT JOIN invoice_registry r ON r.order_id = t.external_id
     WHERE t.paid_date = $1
     ORDER BY t.is_order DESC, t.external_id ASC`,
    [date],
    db,
  );
  const transactions = rows.map(mapTransaction);

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
    status?: "all" | "ok" | "mismatch";
    page?: number;
    pageSize?: number;
  } = {},
  db?: Queryable,
): Promise<BillListResult> {
  const date = (options.date ?? "").trim();
  const q = (options.q ?? "").trim();
  const status = options.status ?? "all";
  const pageSize = Math.min(500, Math.max(10, options.pageSize ?? 50));
  const page = Math.max(1, options.page ?? 1);
  const clauses = ["t.is_order = 1"];
  const params: unknown[] = [];
  if (date) {
    clauses.push(`t.paid_date = $${params.length + 1}`);
    params.push(date);
  }
  if (q) {
    clauses.push(`(t.external_id LIKE $${params.length + 1} OR t.product_detail LIKE $${params.length + 2})`);
    params.push(`%${q}%`, `%${q}%`);
  }
  if (status === "ok") {
    clauses.push(
      `ABS(COALESCE((t.checks_json->>'incomeDiff')::numeric, 0)) < 0.01 AND ABS(COALESCE((t.checks_json->>'feeDiff')::numeric, 0)) < 0.01 AND ABS(COALESCE((t.checks_json->>'payoutDiff')::numeric, 0)) < 0.01`,
    );
  } else if (status === "mismatch") {
    clauses.push(
      `(ABS(COALESCE((t.checks_json->>'incomeDiff')::numeric, 0)) >= 0.01 OR ABS(COALESCE((t.checks_json->>'feeDiff')::numeric, 0)) >= 0.01 OR ABS(COALESCE((t.checks_json->>'payoutDiff')::numeric, 0)) >= 0.01)`,
    );
  }
  const where = clauses.join(" AND ");

  const summaryRow = await queryOne<Record<string, unknown>>(
    `SELECT COUNT(*) AS count, ROUND(SUM(t.income)::numeric, 2) AS income,
            ROUND(SUM(t.fee_total)::numeric, 2) AS fees, ROUND(SUM(t.payout)::numeric, 2) AS payout
     FROM transactions t WHERE ${where}`,
    params,
    db,
  );

  const total = Number(summaryRow?.count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = await query<Record<string, unknown>>(
    `SELECT t.*, r.invoice_no
     FROM transactions t
     LEFT JOIN invoice_registry r ON r.order_id = t.external_id
     WHERE ${where}
     ORDER BY t.paid_date DESC, t.external_id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, (safePage - 1) * pageSize],
    db,
  );

  return {
    rows: rows.map(mapTransaction),
    total,
    page: safePage,
    pageSize,
    pageCount,
    summary: {
      count: total,
      income: Number(summaryRow?.income ?? 0),
      fees: Number(summaryRow?.fees ?? 0),
      payout: Number(summaryRow?.payout ?? 0),
    },
  };
}

export async function getBill(
  orderId: string,
  db?: Queryable,
): Promise<TransactionRow | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT t.*, r.invoice_no
     FROM transactions t
     LEFT JOIN invoice_registry r ON r.order_id = t.external_id
     WHERE t.external_id = $1 AND t.is_order = 1
     ORDER BY t.paid_date DESC LIMIT 1`,
    [orderId],
    db,
  );
  return row ? mapTransaction(row) : null;
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

export async function getOverallStats(db?: Queryable): Promise<OverallStats> {
  const stats = await queryOne<{ import_count: number }>(
    "SELECT COUNT(*) AS import_count FROM imports",
    [],
    db,
  );
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
