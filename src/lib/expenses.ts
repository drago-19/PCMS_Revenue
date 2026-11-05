import {
  getActiveCompanyId,
  query,
  queryOne,
  withTransaction,
  type Queryable,
} from "./db";
import {
  calculateExpenseTaxAmounts,
  DEFAULT_ACCOUNTING_CATEGORIES,
  normalizePaymentMethod,
  normalizePaymentStatus,
  normalizeVatType,
  type ExpenseCategory,
  type ExpenseLedgerStats,
  type ExpensePaymentMethod,
  type ExpensePaymentStatus,
  type ExpenseRecord,
  type ExpensesOverviewData,
  type ExpenseVatType,
  type MonthlyExpenseRow,
  type MonthlyPlatformRevenue,
} from "./expense-math";
import { BILLABLE_ORDER_OR_COMPENSATION_SQL } from "./invoice-eligibility";

export {
  calculateExpenseTaxAmounts,
  DEFAULT_ACCOUNTING_CATEGORIES,
  normalizePaymentMethod,
  normalizePaymentStatus,
  normalizeVatType,
  type ExpenseCategory,
  type ExpenseLedgerStats,
  type ExpensePaymentMethod,
  type ExpensePaymentStatus,
  type ExpenseRecord,
  type ExpensesOverviewData,
  type ExpenseVatType,
  type MonthlyExpenseRow,
  type MonthlyPlatformRevenue,
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export async function listExpenseCategories(
  db?: Queryable,
): Promise<ExpenseCategory[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT id, name, account_code, color, sort_order, created_at
     FROM expense_categories
     ORDER BY sort_order ASC, id ASC`,
    [],
    db,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    accountCode: String(r.account_code || ""),
    color: String(r.color || "slate"),
    sortOrder: Number(r.sort_order || 0),
    createdAt: String(r.created_at),
  }));
}

export async function createExpenseCategory(
  name: string,
  color = "slate",
  accountCode = "",
  db?: Queryable,
): Promise<ExpenseCategory> {
  const trimmed = name.trim();
  const cleanCode = accountCode.trim().slice(0, 30);
  if (!trimmed) {
    throw new Error("กรุณาระบุชื่อคอลัมน์รายจ่าย");
  }
  if (trimmed.length > 80) {
    throw new Error("ชื่อคอลัมน์ต้องมีความยาวไม่เกิน 80 ตัวอักษร");
  }

  const maxRow = await queryOne<{ max_sort: number }>(
    `SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM expense_categories`,
    [],
    db,
  );
  const nextSort = Number(maxRow?.max_sort || 0) + 1;

  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO expense_categories (name, account_code, color, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, account_code, color, sort_order, created_at`,
    [trimmed, cleanCode, color || "slate", nextSort],
    db,
  );

  if (!row) {
    throw new Error("ไม่สามารถสร้างคอลัมน์รายจ่ายได้");
  }

  return {
    id: Number(row.id),
    name: String(row.name),
    accountCode: String(row.account_code || ""),
    color: String(row.color),
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at),
  };
}

export async function seedDefaultExpenseCategories(
  db?: Queryable,
): Promise<ExpenseCategory[]> {
  const maxRow = await queryOne<{ max_sort: number }>(
    `SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM expense_categories`,
    [],
    db,
  );
  let nextSort = Number(maxRow?.max_sort || 0) + 1;

  for (const item of DEFAULT_ACCOUNTING_CATEGORIES) {
    await query(
      `INSERT INTO expense_categories (name, account_code, color, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE SET
         account_code = CASE
           WHEN expense_categories.account_code = '' THEN EXCLUDED.account_code
           ELSE expense_categories.account_code
         END,
         color = CASE
           WHEN expense_categories.color = 'slate' THEN EXCLUDED.color
           ELSE expense_categories.color
         END`,
      [item.name, item.accountCode, item.color, nextSort++],
      db,
    );
  }

  return listExpenseCategories(db);
}

export async function updateExpenseCategory(
  id: number,
  name: string,
  color?: string,
  accountCode?: string,
  db?: Queryable,
): Promise<ExpenseCategory | null> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("กรุณาระบุชื่อคอลัมน์รายจ่าย");
  }
  if (trimmed.length > 80) {
    throw new Error("ชื่อคอลัมน์ต้องมีความยาวไม่เกิน 80 ตัวอักษร");
  }

  const cleanCode =
    typeof accountCode === "string" ? accountCode.trim().slice(0, 30) : null;

  const row = await queryOne<Record<string, unknown>>(
    `UPDATE expense_categories
     SET name = $1,
         color = COALESCE($2, color),
         account_code = COALESCE($3, account_code)
     WHERE id = $4
     RETURNING id, name, account_code, color, sort_order, created_at`,
    [trimmed, color ?? null, cleanCode, id],
    db,
  );

  if (!row) return null;

  return {
    id: Number(row.id),
    name: String(row.name),
    accountCode: String(row.account_code || ""),
    color: String(row.color),
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at),
  };
}

export async function deleteExpenseCategory(
  id: number,
  db?: Queryable,
): Promise<boolean> {
  return withTransaction(async (client) => {
    const res = await client.query(
      `DELETE FROM expense_categories WHERE id = $1`,
      [id],
    );
    return (res.rowCount ?? 0) > 0;
  });
}

const platformRevenueCache = new Map<
  string,
  { ts: number; data: MonthlyPlatformRevenue[] }
>();

export function clearPlatformRevenueCache(): void {
  platformRevenueCache.clear();
}

export async function getMonthlyPlatformRevenues(
  db?: Queryable,
): Promise<MonthlyPlatformRevenue[]> {
  const companyId = await getActiveCompanyId();
  let cacheKey: string = companyId;
  if (!db) {
    const impStamp = await queryOne<{ cnt: number; max_id: number }>(
      `SELECT COUNT(*)::int AS cnt, COALESCE(MAX(id), 0)::int AS max_id FROM imports`,
    );
    cacheKey = `${companyId}:${impStamp?.cnt ?? 0}:${impStamp?.max_id ?? 0}`;
    const cached = platformRevenueCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 300_000) {
      return cached.data;
    }
  }
  const rows = await query<Record<string, unknown>>(
    `SELECT 
       SUBSTRING(paid_date FROM 1 FOR 7) AS ym,
       ROUND(COALESCE(SUM(CASE WHEN channel = 'TikTok' THEN payout ELSE 0 END), 0)::numeric, 2) AS tiktok_payout,
       ROUND(COALESCE(SUM(CASE WHEN channel = 'Shopee' THEN payout ELSE 0 END), 0)::numeric, 2) AS shopee_payout,
       ROUND(COALESCE(SUM(CASE WHEN channel = 'Facebook' THEN payout ELSE 0 END), 0)::numeric, 2) AS facebook_payout,
       ROUND(COALESCE(SUM(CASE WHEN channel = 'Lazada' THEN payout ELSE 0 END), 0)::numeric, 2) AS lazada_payout,
       ROUND(COALESCE(SUM(CASE WHEN channel = 'LINE' THEN payout ELSE 0 END), 0)::numeric, 2) AS line_payout,
       ROUND(COALESCE(SUM(CASE WHEN channel = 'Other' THEN payout ELSE 0 END), 0)::numeric, 2) AS other_payout,
       ROUND(COALESCE(SUM(payout), 0)::numeric, 2) AS total_payout,
       ROUND(COALESCE(SUM(income), 0)::numeric, 2) AS total_income,
       COUNT(*)::int AS order_count
     FROM transactions t
     WHERE ${BILLABLE_ORDER_OR_COMPENSATION_SQL} AND t.paid_date <> '' AND t.paid_date <> 'unknown'
     GROUP BY ym
     ORDER BY ym DESC`,
    [],
    db,
  );

  const result = rows.map((r) => ({
    yearMonth: String(r.ym),
    orderCount: Number(r.order_count || 0),
    tiktokPayout: Number(r.tiktok_payout || 0),
    shopeePayout: Number(r.shopee_payout || 0),
    facebookPayout: Number(r.facebook_payout || 0),
    lazadaPayout: Number(r.lazada_payout || 0),
    linePayout: Number(r.line_payout || 0),
    otherPayout: Number(r.other_payout || 0),
    totalPlatformPayout: Number(r.total_payout || 0),
    totalIncome: Number(r.total_income || 0),
  }));

  if (!db) {
    platformRevenueCache.set(cacheKey, { ts: Date.now(), data: result });
  }
  return result;
}

function mapExpenseRecordRow(r: Record<string, unknown>): ExpenseRecord {
  const id = Number(r.id);
  const entryDate = String(r.entry_date || "");
  const amount = Number(r.amount || 0);
  const docNo =
    String(r.document_no || "").trim() ||
    `EXP${entryDate.replace(/-/g, "")}${String(id).padStart(4, "0")}`;

  return {
    id,
    documentNo: docNo,
    entryDate,
    yearMonth: String(r.year_month || entryDate.slice(0, 7)),
    categoryId: Number(r.category_id),
    categoryName: String(r.category_name || "ไม่ระบุหมวดหมู่"),
    categoryAccountCode: String(r.category_account_code || ""),
    categoryColor: String(r.category_color || "slate"),
    amount,
    subtotalAmount: Number(r.subtotal_amount || amount),
    vatType: normalizeVatType(r.vat_type),
    vatAmount: Number(r.vat_amount || 0),
    whtRate: Number(r.wht_rate || 0),
    whtAmount: Number(r.wht_amount || 0),
    netPaidAmount: Number(r.net_paid_amount || amount),
    vendorName: String(r.vendor_name || ""),
    vendorTaxId: String(r.vendor_tax_id || ""),
    taxInvoiceNo: String(r.tax_invoice_no || ""),
    paymentStatus: normalizePaymentStatus(r.payment_status),
    paymentMethod: normalizePaymentMethod(r.payment_method),
    attachmentUrl: r.attachment_url ? String(r.attachment_url) : null,
    attachmentName: r.attachment_name ? String(r.attachment_name) : null,
    title: String(r.title || ""),
    note: r.note ? String(r.note) : null,
    createdAt: String(r.created_at || ""),
    updatedAt: String(r.updated_at || r.created_at || ""),
  };
}

export async function listExpenseRecords(
  yearMonth?: string,
  categoryId?: number,
  db?: Queryable,
  options?: {
    year?: string;
    dateRange?: { start: string; end: string };
    paymentStatus?: string;
    search?: string;
    limit?: number;
  },
): Promise<ExpenseRecord[]> {
  const whereClauses: string[] = [];
  const params: unknown[] = [];

  if (options?.dateRange) {
    const { start, end } = options.dateRange;
    if (/^\d{4}-\d{2}$/.test(start) && /^\d{4}-\d{2}$/.test(end)) {
      params.push(start, end);
      whereClauses.push(
        `r.year_month >= $${params.length - 1} AND r.year_month <= $${params.length}`,
      );
    } else {
      params.push(start, end);
      whereClauses.push(
        `r.entry_date >= $${params.length - 1} AND r.entry_date <= $${params.length}`,
      );
    }
  } else if (yearMonth) {
    params.push(yearMonth);
    whereClauses.push(`r.year_month = $${params.length}`);
  } else if (options?.year && options.year !== "all") {
    params.push(`${options.year}-%`);
    whereClauses.push(`r.year_month LIKE $${params.length}`);
  }

  if (categoryId) {
    params.push(categoryId);
    whereClauses.push(`r.category_id = $${params.length}`);
  }

  if (options?.paymentStatus && options.paymentStatus !== "all") {
    if (options.paymentStatus === "wht") {
      whereClauses.push(`r.wht_amount > 0 AND r.payment_status <> 'void'`);
    } else if (options.paymentStatus === "vat") {
      whereClauses.push(`r.vat_amount > 0 AND r.payment_status <> 'void'`);
    } else {
      params.push(options.paymentStatus);
      whereClauses.push(`r.payment_status = $${params.length}`);
    }
  }

  if (options?.search && options.search.trim()) {
    params.push(`%${options.search.trim()}%`);
    const pIdx = params.length;
    whereClauses.push(
      `(r.document_no ILIKE $${pIdx} OR r.vendor_name ILIKE $${pIdx} OR r.title ILIKE $${pIdx} OR r.tax_invoice_no ILIKE $${pIdx} OR COALESCE(r.note, '') ILIKE $${pIdx})`,
    );
  }

  const limit = Math.min(2000, Math.max(1, options?.limit ?? 1000));
  params.push(limit);

  const whereSql =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const rows = await query<Record<string, unknown>>(
    `SELECT r.id, r.document_no, r.entry_date, r.year_month, r.category_id,
            c.name AS category_name, c.account_code AS category_account_code, c.color AS category_color,
            r.amount, r.subtotal_amount, r.vat_type, r.vat_amount,
            r.wht_rate, r.wht_amount, r.net_paid_amount,
            r.vendor_name, r.vendor_tax_id, r.tax_invoice_no,
            r.payment_status, r.payment_method,
            r.attachment_url, r.attachment_name,
            r.title, r.note, r.created_at, r.updated_at
     FROM expense_records r
     JOIN expense_categories c ON c.id = r.category_id
     ${whereSql}
     ORDER BY r.entry_date DESC, r.id DESC
     LIMIT $${params.length}`,
    params,
    db,
  );

  return rows.map(mapExpenseRecordRow);
}

export function computeExpenseLedgerStats(
  records: ExpenseRecord[],
): ExpenseLedgerStats {
  let paidCount = 0;
  let paidAmount = 0;
  let pendingCount = 0;
  let pendingAmount = 0;
  let voidCount = 0;
  let vatRecordCount = 0;
  let vatInputTotal = 0;
  let whtRecordCount = 0;
  let whtTotal = 0;

  for (const r of records) {
    if (r.paymentStatus === "void") {
      voidCount++;
      continue;
    }
    if (r.paymentStatus === "pending") {
      pendingCount++;
      pendingAmount += r.amount;
    } else {
      paidCount++;
      paidAmount += r.amount;
    }
    if (r.vatAmount > 0) {
      vatRecordCount++;
      vatInputTotal += r.vatAmount;
    }
    if (r.whtAmount > 0) {
      whtRecordCount++;
      whtTotal += r.whtAmount;
    }
  }

  return {
    totalRecordsCount: records.length,
    paidCount,
    paidAmount: round2(paidAmount),
    pendingCount,
    pendingAmount: round2(pendingAmount),
    voidCount,
    vatRecordCount,
    vatInputTotal: round2(vatInputTotal),
    whtRecordCount,
    whtTotal: round2(whtTotal),
  };
}

export async function getExpensesOverview(
  yearFilter?: string,
  db?: Queryable,
): Promise<ExpensesOverviewData> {
  const [
    initialCategories,
    platformRevenues,
    monthlyDirectRows,
    itemizedRows,
    records,
  ] = await Promise.all([
    listExpenseCategories(db),
    getMonthlyPlatformRevenues(db),
    query<Record<string, unknown>>(
      `SELECT year_month, category_id, amount
       FROM monthly_expenses`,
      [],
      db,
    ),
    query<Record<string, unknown>>(
      `SELECT year_month, category_id,
              ROUND(COALESCE(SUM(amount), 0)::numeric, 2) AS sum_amount,
              COUNT(*)::int AS item_count
       FROM expense_records
       WHERE COALESCE(payment_status, 'paid') <> 'void'
       GROUP BY year_month, category_id`,
      [],
      db,
    ),
    listExpenseRecords(undefined, undefined, db, {
      year: yearFilter,
      limit: 1000,
    }),
  ]);

  const categories =
    initialCategories.length >= DEFAULT_ACCOUNTING_CATEGORIES.length
      ? initialCategories
      : await seedDefaultExpenseCategories(db);

  const platformMap = new Map<string, MonthlyPlatformRevenue>();
  for (const p of platformRevenues) {
    platformMap.set(p.yearMonth, p);
  }

  const directMap = new Map<string, Record<number, number>>();
  for (const m of monthlyDirectRows) {
    const ym = String(m.year_month);
    const catId = Number(m.category_id);
    const amt = Number(m.amount || 0);
    if (!directMap.has(ym)) directMap.set(ym, {});
    directMap.get(ym)![catId] = amt;
  }

  const itemizedMap = new Map<
    string,
    Record<number, { sum: number; count: number }>
  >();
  for (const it of itemizedRows) {
    const ym = String(it.year_month);
    const catId = Number(it.category_id);
    const sum = Number(it.sum_amount || 0);
    const count = Number(it.item_count || 0);
    if (!itemizedMap.has(ym)) itemizedMap.set(ym, {});
    itemizedMap.get(ym)![catId] = { sum, count };
  }

  const allMonthsSet = new Set<string>();
  for (const ym of platformMap.keys()) allMonthsSet.add(ym);
  for (const ym of directMap.keys()) allMonthsSet.add(ym);
  for (const ym of itemizedMap.keys()) allMonthsSet.add(ym);

  const availableYears = Array.from(
    new Set(Array.from(allMonthsSet).map((ym) => ym.slice(0, 4))),
  ).sort((a, b) => b.localeCompare(a));

  let monthsList = Array.from(allMonthsSet).sort((a, b) => b.localeCompare(a));
  if (yearFilter && yearFilter !== "all") {
    monthsList = monthsList.filter((ym) => ym.startsWith(yearFilter));
  }

  let grandTotalPlatformPayout = 0;
  let grandTotalExpenses = 0;

  const rows: MonthlyExpenseRow[] = monthsList.map((ym) => {
    const platform = platformMap.get(ym) ?? {
      yearMonth: ym,
      orderCount: 0,
      tiktokPayout: 0,
      shopeePayout: 0,
      facebookPayout: 0,
      lazadaPayout: 0,
      linePayout: 0,
      otherPayout: 0,
      totalPlatformPayout: 0,
      totalIncome: 0,
    };

    const directForYm = directMap.get(ym) ?? {};
    const itemizedForYm = itemizedMap.get(ym) ?? {};

    const categoryAmounts: Record<number, number> = {};
    const directAmounts: Record<number, number> = {};
    const categoryItemCounts: Record<number, number> = {};

    let totalExpenses = 0;

    for (const cat of categories) {
      const direct = directForYm[cat.id] ?? 0;
      const itemized = itemizedForYm[cat.id]?.sum ?? 0;
      const count = itemizedForYm[cat.id]?.count ?? 0;

      const effectiveTotal = round2(direct + itemized);
      categoryAmounts[cat.id] = effectiveTotal;
      directAmounts[cat.id] = direct;
      categoryItemCounts[cat.id] = count;
      totalExpenses += effectiveTotal;
    }

    totalExpenses = round2(totalExpenses);
    const netRemaining = round2(platform.totalPlatformPayout - totalExpenses);
    const profitMarginPercent =
      platform.totalPlatformPayout > 0
        ? Math.round((netRemaining / platform.totalPlatformPayout) * 10000) /
          100
        : null;

    grandTotalPlatformPayout += platform.totalPlatformPayout;
    grandTotalExpenses += totalExpenses;

    return {
      yearMonth: ym,
      orderCount: platform.orderCount,
      tiktokPayout: platform.tiktokPayout,
      shopeePayout: platform.shopeePayout,
      facebookPayout: platform.facebookPayout,
      lazadaPayout: platform.lazadaPayout,
      linePayout: platform.linePayout,
      otherPayout: platform.otherPayout,
      totalPlatformPayout: platform.totalPlatformPayout,
      totalIncome: platform.totalIncome,
      categoryAmounts,
      directAmounts,
      categoryItemCounts,
      totalExpenses,
      netRemaining,
      profitMarginPercent,
    };
  });

  grandTotalPlatformPayout = round2(grandTotalPlatformPayout);
  grandTotalExpenses = round2(grandTotalExpenses);
  const grandNetRemaining = round2(
    grandTotalPlatformPayout - grandTotalExpenses,
  );
  const grandProfitMargin =
    grandTotalPlatformPayout > 0
      ? Math.round(
          (grandNetRemaining / grandTotalPlatformPayout) * 10000,
        ) / 100
      : null;

  return {
    categories,
    rows,
    records,
    ledgerStats: computeExpenseLedgerStats(records),
    totalStats: {
      totalPlatformPayout: grandTotalPlatformPayout,
      totalExpenses: grandTotalExpenses,
      netRemaining: grandNetRemaining,
      profitMarginPercent: grandProfitMargin,
      monthsCount: rows.length,
    },
    availableYears,
  };
}

export async function upsertMonthlyExpense(
  yearMonth: string,
  categoryId: number,
  amount: number,
  note = "",
  db?: Queryable,
): Promise<void> {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    throw new Error("รูปแบบเดือนไม่ถูกต้อง (ต้องเป็น YYYY-MM)");
  }
  const cleanAmount = Number.isFinite(amount)
    ? Math.max(0, round2(amount))
    : 0;

  await query(
    `INSERT INTO monthly_expenses (year_month, category_id, amount, note, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (year_month, category_id)
     DO UPDATE SET amount = EXCLUDED.amount, note = EXCLUDED.note, updated_at = now()`,
    [yearMonth, categoryId, cleanAmount, note],
    db,
  );
}

async function generateExpenseDocumentNo(
  entryDate: string,
  db?: Queryable,
): Promise<string> {
  const dateCompact = entryDate.replace(/-/g, "");
  const prefix = `EXP${dateCompact}`;
  const row = await queryOne<{ max_seq: number }>(
    `SELECT COALESCE(MAX(
       CASE
         WHEN document_no ~ ('^' || $1 || '[0-9]{4}$')
         THEN RIGHT(document_no, 4)::int
         ELSE 0
       END
     ), 0) AS max_seq
     FROM expense_records
     WHERE entry_date = $2 OR document_no LIKE ($1 || '%')`,
    [prefix, entryDate],
    db,
  );
  const nextSeq = Number(row?.max_seq || 0) + 1;
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

export interface CreateExpenseRecordInput {
  entryDate: string;
  categoryId: number;
  amount: number;
  title: string;
  note?: string;
  documentNo?: string;
  vendorName?: string;
  vendorTaxId?: string;
  taxInvoiceNo?: string;
  vatType?: ExpenseVatType;
  whtRate?: number;
  paymentStatus?: ExpensePaymentStatus;
  paymentMethod?: ExpensePaymentMethod;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
}

export async function createExpenseRecord(
  entry: CreateExpenseRecordInput,
  db?: Queryable,
): Promise<ExpenseRecord> {
  const dateMatch = /^\d{4}-\d{2}-\d{2}$/.exec(entry.entryDate);
  if (!dateMatch) {
    throw new Error("วันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)");
  }
  const yearMonth = entry.entryDate.slice(0, 7);
  const rawInputAmount = Number.isFinite(entry.amount)
    ? Math.max(0, round2(entry.amount))
    : 0;
  if (rawInputAmount <= 0) {
    throw new Error("ยอดเงินต้องเป็นตัวเลขที่มากกว่า 0");
  }

  const vatType = normalizeVatType(entry.vatType);
  const whtRate = Number.isFinite(entry.whtRate) ? Number(entry.whtRate) : 0;
  const taxCalc = calculateExpenseTaxAmounts(rawInputAmount, vatType, whtRate);

  const cleanVendorName = (entry.vendorName || "").trim().slice(0, 160);
  const cleanVendorTaxId = (entry.vendorTaxId || "").trim().slice(0, 30);
  const cleanTaxInvoiceNo = (entry.taxInvoiceNo || "").trim().slice(0, 60);
  const cleanTitle = (entry.title || cleanVendorName || "").trim().slice(0, 240);
  if (!cleanTitle) {
    throw new Error("กรุณาระบุรายละเอียดหรือชื่อผู้จำหน่าย");
  }
  const cleanNote = (entry.note || "").trim().slice(0, 500);
  const paymentStatus = normalizePaymentStatus(entry.paymentStatus);
  const paymentMethod = normalizePaymentMethod(entry.paymentMethod);

  const docNo =
    (entry.documentNo || "").trim() ||
    (await generateExpenseDocumentNo(entry.entryDate, db));

  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO expense_records (
       document_no, entry_date, year_month, category_id,
       amount, subtotal_amount, vat_type, vat_amount,
       wht_rate, wht_amount, net_paid_amount,
       vendor_name, vendor_tax_id, tax_invoice_no,
       payment_status, payment_method,
       attachment_url, attachment_name,
       title, note, created_at, updated_at
     )
     VALUES (
       $1, $2, $3, $4,
       $5, $6, $7, $8,
       $9, $10, $11,
       $12, $13, $14,
       $15, $16,
       $17, $18,
       $19, $20, now(), now()
     )
     RETURNING *`,
    [
      docNo,
      entry.entryDate,
      yearMonth,
      entry.categoryId,
      taxCalc.totalAmount,
      taxCalc.subtotalAmount,
      vatType,
      taxCalc.vatAmount,
      taxCalc.whtRate,
      taxCalc.whtAmount,
      taxCalc.netPaidAmount,
      cleanVendorName,
      cleanVendorTaxId,
      cleanTaxInvoiceNo,
      paymentStatus,
      paymentMethod,
      entry.attachmentUrl || null,
      entry.attachmentName || null,
      cleanTitle,
      cleanNote || null,
    ],
    db,
  );

  if (!row) {
    throw new Error("ไม่สามารถบันทึกรายการรายจ่ายได้");
  }

  const cat = await queryOne<{
    name: string;
    account_code: string;
    color: string;
  }>(
    `SELECT name, account_code, color FROM expense_categories WHERE id = $1`,
    [entry.categoryId],
    db,
  );

  return mapExpenseRecordRow({
    ...row,
    category_name: cat?.name || "ไม่ทราบหมวดหมู่",
    category_account_code: cat?.account_code || "",
    category_color: cat?.color || "slate",
  });
}

export interface UpdateExpenseRecordInput {
  entryDate?: string;
  categoryId?: number;
  amount?: number;
  title?: string;
  note?: string | null;
  vendorName?: string;
  vendorTaxId?: string;
  taxInvoiceNo?: string;
  vatType?: ExpenseVatType;
  whtRate?: number;
  paymentStatus?: ExpensePaymentStatus;
  paymentMethod?: ExpensePaymentMethod;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
}

export async function updateExpenseRecord(
  id: number,
  patch: UpdateExpenseRecordInput,
  db?: Queryable,
): Promise<ExpenseRecord | null> {
  const existingRows = await query<Record<string, unknown>>(
    `SELECT r.*, c.name AS category_name, c.account_code AS category_account_code, c.color AS category_color
     FROM expense_records r
     JOIN expense_categories c ON c.id = r.category_id
     WHERE r.id = $1`,
    [id],
    db,
  );
  if (existingRows.length === 0) return null;
  const current = mapExpenseRecordRow(existingRows[0]);

  const entryDate =
    patch.entryDate && /^\d{4}-\d{2}-\d{2}$/.test(patch.entryDate)
      ? patch.entryDate
      : current.entryDate;
  const yearMonth = entryDate.slice(0, 7);
  const categoryId =
    patch.categoryId && patch.categoryId > 0
      ? patch.categoryId
      : current.categoryId;

  const vatType =
    patch.vatType !== undefined
      ? normalizeVatType(patch.vatType)
      : current.vatType;
  const whtRate =
    patch.whtRate !== undefined ? Number(patch.whtRate) : current.whtRate;

  // If amount is patched, calculate tax from it; otherwise if vatType or whtRate changed, recalculate from base
  const rawInputAmount =
    patch.amount !== undefined && Number.isFinite(patch.amount) && patch.amount > 0
      ? patch.amount
      : current.vatType === "exclude"
        ? current.subtotalAmount
        : current.amount;

  const taxCalc = calculateExpenseTaxAmounts(rawInputAmount, vatType, whtRate);

  const vendorName =
    patch.vendorName !== undefined
      ? patch.vendorName.trim().slice(0, 160)
      : current.vendorName;
  const vendorTaxId =
    patch.vendorTaxId !== undefined
      ? patch.vendorTaxId.trim().slice(0, 30)
      : current.vendorTaxId;
  const taxInvoiceNo =
    patch.taxInvoiceNo !== undefined
      ? patch.taxInvoiceNo.trim().slice(0, 60)
      : current.taxInvoiceNo;
  const title =
    patch.title !== undefined
      ? (patch.title.trim() || vendorName || current.title).slice(0, 240)
      : current.title;
  const note =
    patch.note !== undefined
      ? patch.note
        ? patch.note.trim().slice(0, 500)
        : null
      : current.note;
  const paymentStatus =
    patch.paymentStatus !== undefined
      ? normalizePaymentStatus(patch.paymentStatus)
      : current.paymentStatus;
  const paymentMethod =
    patch.paymentMethod !== undefined
      ? normalizePaymentMethod(patch.paymentMethod)
      : current.paymentMethod;
  const attachmentUrl =
    patch.attachmentUrl !== undefined
      ? patch.attachmentUrl
      : current.attachmentUrl;
  const attachmentName =
    patch.attachmentName !== undefined
      ? patch.attachmentName
      : current.attachmentName;

  const row = await queryOne<Record<string, unknown>>(
    `UPDATE expense_records
     SET entry_date = $1,
         year_month = $2,
         category_id = $3,
         amount = $4,
         subtotal_amount = $5,
         vat_type = $6,
         vat_amount = $7,
         wht_rate = $8,
         wht_amount = $9,
         net_paid_amount = $10,
         vendor_name = $11,
         vendor_tax_id = $12,
         tax_invoice_no = $13,
         payment_status = $14,
         payment_method = $15,
         attachment_url = $16,
         attachment_name = $17,
         title = $18,
         note = $19,
         updated_at = now()
     WHERE id = $20
     RETURNING *`,
    [
      entryDate,
      yearMonth,
      categoryId,
      taxCalc.totalAmount,
      taxCalc.subtotalAmount,
      vatType,
      taxCalc.vatAmount,
      taxCalc.whtRate,
      taxCalc.whtAmount,
      taxCalc.netPaidAmount,
      vendorName,
      vendorTaxId,
      taxInvoiceNo,
      paymentStatus,
      paymentMethod,
      attachmentUrl,
      attachmentName,
      title,
      note,
      id,
    ],
    db,
  );

  if (!row) return null;

  const cat = await queryOne<{
    name: string;
    account_code: string;
    color: string;
  }>(
    `SELECT name, account_code, color FROM expense_categories WHERE id = $1`,
    [categoryId],
    db,
  );

  return mapExpenseRecordRow({
    ...row,
    category_name: cat?.name || "ไม่ทราบหมวดหมู่",
    category_account_code: cat?.account_code || "",
    category_color: cat?.color || "slate",
  });
}

export async function deleteExpenseRecord(
  id: number,
  db?: Queryable,
): Promise<boolean> {
  const res = await query(
    `DELETE FROM expense_records WHERE id = $1`,
    [id],
    db,
  );
  return res.length >= 0;
}
