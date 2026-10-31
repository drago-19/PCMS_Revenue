import { query, queryOne, withTransaction, type Queryable } from "./db";

export interface ExpenseCategory {
  id: number;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: string;
}

export interface ExpenseRecord {
  id: number;
  entryDate: string;
  yearMonth: string;
  categoryId: number;
  categoryName: string;
  amount: number;
  title: string;
  note: string | null;
  createdAt: string;
}

export interface MonthlyPlatformRevenue {
  yearMonth: string;
  orderCount: number;
  tiktokPayout: number;
  shopeePayout: number;
  facebookPayout: number;
  totalPlatformPayout: number;
  totalIncome: number;
}

export interface MonthlyExpenseRow {
  yearMonth: string;
  orderCount: number;
  tiktokPayout: number;
  shopeePayout: number;
  facebookPayout: number;
  totalPlatformPayout: number;
  totalIncome: number;
  // Category amounts: mapping from categoryId to effective total amount (direct + itemized)
  categoryAmounts: Record<number, number>;
  // Direct monthly amounts (from monthly_expenses table)
  directAmounts: Record<number, number>;
  // Itemized record counts
  categoryItemCounts: Record<number, number>;
  // Total expenses for the month
  totalExpenses: number;
  // Net remaining (Total platform payout - total expenses)
  netRemaining: number;
  // Profit margin percentage (Net remaining / total platform payout * 100)
  profitMarginPercent: number | null;
}

export interface ExpensesOverviewData {
  categories: ExpenseCategory[];
  rows: MonthlyExpenseRow[];
  totalStats: {
    totalPlatformPayout: number;
    totalExpenses: number;
    netRemaining: number;
    profitMarginPercent: number | null;
    monthsCount: number;
  };
  availableYears: string[];
}

export async function listExpenseCategories(db?: Queryable): Promise<ExpenseCategory[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT id, name, color, sort_order, created_at
     FROM expense_categories
     ORDER BY sort_order ASC, id ASC`,
    [],
    db,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    color: String(r.color || "slate"),
    sortOrder: Number(r.sort_order || 0),
    createdAt: String(r.created_at),
  }));
}

export async function createExpenseCategory(
  name: string,
  color = "slate",
  db?: Queryable,
): Promise<ExpenseCategory> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("กรุณาระบุชื่อคอลัมน์รายจ่าย");
  }
  if (trimmed.length > 80) {
    throw new Error("ชื่อคอลัมน์ต้องมีความยาวไม่เกิน 80 ตัวอักษร");
  }

  // Get max sort_order
  const maxRow = await queryOne<{ max_sort: number }>(
    `SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM expense_categories`,
    [],
    db,
  );
  const nextSort = Number(maxRow?.max_sort || 0) + 1;

  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO expense_categories (name, color, sort_order)
     VALUES ($1, $2, $3)
     RETURNING id, name, color, sort_order, created_at`,
    [trimmed, color, nextSort],
    db,
  );

  if (!row) {
    throw new Error("ไม่สามารถสร้างคอลัมน์รายจ่ายได้");
  }

  return {
    id: Number(row.id),
    name: String(row.name),
    color: String(row.color),
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at),
  };
}

export async function updateExpenseCategory(
  id: number,
  name: string,
  color?: string,
  db?: Queryable,
): Promise<ExpenseCategory | null> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("กรุณาระบุชื่อคอลัมน์รายจ่าย");
  }
  if (trimmed.length > 80) {
    throw new Error("ชื่อคอลัมน์ต้องมีความยาวไม่เกิน 80 ตัวอักษร");
  }

  const row = await queryOne<Record<string, unknown>>(
    `UPDATE expense_categories
     SET name = $1, color = COALESCE($2, color)
     WHERE id = $3
     RETURNING id, name, color, sort_order, created_at`,
    [trimmed, color ?? null, id],
    db,
  );

  if (!row) return null;

  return {
    id: Number(row.id),
    name: String(row.name),
    color: String(row.color),
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at),
  };
}

export async function deleteExpenseCategory(id: number, db?: Queryable): Promise<boolean> {
  return withTransaction(async (client) => {
    // Delete category - cascade deletes monthly_expenses and expense_records
    const res = await client.query(
      `DELETE FROM expense_categories WHERE id = $1`,
      [id],
    );
    return (res.rowCount ?? 0) > 0;
  });
}

export async function getMonthlyPlatformRevenues(db?: Queryable): Promise<MonthlyPlatformRevenue[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT 
       SUBSTRING(paid_date FROM 1 FOR 7) AS ym,
       ROUND(COALESCE(SUM(CASE WHEN channel = 'TikTok' THEN payout ELSE 0 END), 0)::numeric, 2) AS tiktok_payout,
       ROUND(COALESCE(SUM(CASE WHEN channel = 'Shopee' THEN payout ELSE 0 END), 0)::numeric, 2) AS shopee_payout,
       ROUND(COALESCE(SUM(CASE WHEN channel = 'Facebook' THEN payout ELSE 0 END), 0)::numeric, 2) AS facebook_payout,
       ROUND(COALESCE(SUM(payout), 0)::numeric, 2) AS total_payout,
       ROUND(COALESCE(SUM(income), 0)::numeric, 2) AS total_income,
       COUNT(*)::int AS order_count
     FROM transactions
     WHERE is_order = 1 AND paid_date <> '' AND paid_date <> 'unknown'
     GROUP BY ym
     ORDER BY ym DESC`,
    [],
    db,
  );

  return rows.map((r) => ({
    yearMonth: String(r.ym),
    orderCount: Number(r.order_count || 0),
    tiktokPayout: Number(r.tiktok_payout || 0),
    shopeePayout: Number(r.shopee_payout || 0),
    facebookPayout: Number(r.facebook_payout || 0),
    totalPlatformPayout: Number(r.total_payout || 0),
    totalIncome: Number(r.total_income || 0),
  }));
}

export async function getExpensesOverview(
  yearFilter?: string,
  db?: Queryable,
): Promise<ExpensesOverviewData> {
  const [categories, platformRevenues, monthlyDirectRows, itemizedRows] = await Promise.all([
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
       GROUP BY year_month, category_id`,
      [],
      db,
    ),
  ]);

  // Map platform revenues by ym
  const platformMap = new Map<string, MonthlyPlatformRevenue>();
  for (const p of platformRevenues) {
    platformMap.set(p.yearMonth, p);
  }

  // Direct monthly amounts map: ym -> { catId: amount }
  const directMap = new Map<string, Record<number, number>>();
  for (const m of monthlyDirectRows) {
    const ym = String(m.year_month);
    const catId = Number(m.category_id);
    const amt = Number(m.amount || 0);
    if (!directMap.has(ym)) directMap.set(ym, {});
    directMap.get(ym)![catId] = amt;
  }

  // Itemized records map: ym -> { catId: { sum: number, count: number } }
  const itemizedMap = new Map<string, Record<number, { sum: number; count: number }>>();
  for (const it of itemizedRows) {
    const ym = String(it.year_month);
    const catId = Number(it.category_id);
    const sum = Number(it.sum_amount || 0);
    const count = Number(it.item_count || 0);
    if (!itemizedMap.has(ym)) itemizedMap.set(ym, {});
    itemizedMap.get(ym)![catId] = { sum, count };
  }

  // Collect all distinct months
  const allMonthsSet = new Set<string>();
  for (const ym of platformMap.keys()) allMonthsSet.add(ym);
  for (const ym of directMap.keys()) allMonthsSet.add(ym);
  for (const ym of itemizedMap.keys()) allMonthsSet.add(ym);

  // Available years
  const availableYears = Array.from(
    new Set(Array.from(allMonthsSet).map((ym) => ym.slice(0, 4))),
  ).sort((a, b) => b.localeCompare(a));

  // Filter months by year if specified
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

      const effectiveTotal = Math.round((direct + itemized) * 100) / 100;
      categoryAmounts[cat.id] = effectiveTotal;
      directAmounts[cat.id] = direct;
      categoryItemCounts[cat.id] = count;
      totalExpenses += effectiveTotal;
    }

    totalExpenses = Math.round(totalExpenses * 100) / 100;
    const netRemaining = Math.round((platform.totalPlatformPayout - totalExpenses) * 100) / 100;
    const profitMarginPercent =
      platform.totalPlatformPayout > 0
        ? Math.round((netRemaining / platform.totalPlatformPayout) * 10000) / 100
        : null;

    grandTotalPlatformPayout += platform.totalPlatformPayout;
    grandTotalExpenses += totalExpenses;

    return {
      yearMonth: ym,
      orderCount: platform.orderCount,
      tiktokPayout: platform.tiktokPayout,
      shopeePayout: platform.shopeePayout,
      facebookPayout: platform.facebookPayout,
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

  grandTotalPlatformPayout = Math.round(grandTotalPlatformPayout * 100) / 100;
  grandTotalExpenses = Math.round(grandTotalExpenses * 100) / 100;
  const grandNetRemaining = Math.round((grandTotalPlatformPayout - grandTotalExpenses) * 100) / 100;
  const grandProfitMargin =
    grandTotalPlatformPayout > 0
      ? Math.round((grandNetRemaining / grandTotalPlatformPayout) * 10000) / 100
      : null;

  return {
    categories,
    rows,
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
  const cleanAmount = Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;

  await query(
    `INSERT INTO monthly_expenses (year_month, category_id, amount, note, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (year_month, category_id)
     DO UPDATE SET amount = EXCLUDED.amount, note = EXCLUDED.note, updated_at = now()`,
    [yearMonth, categoryId, cleanAmount, note],
    db,
  );
}

export async function listExpenseRecords(
  yearMonth?: string,
  categoryId?: number,
  db?: Queryable,
): Promise<ExpenseRecord[]> {
  const whereClauses: string[] = [];
  const params: unknown[] = [];

  if (yearMonth) {
    params.push(yearMonth);
    whereClauses.push(`r.year_month = $${params.length}`);
  }
  if (categoryId) {
    params.push(categoryId);
    whereClauses.push(`r.category_id = $${params.length}`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const rows = await query<Record<string, unknown>>(
    `SELECT r.id, r.entry_date, r.year_month, r.category_id,
            c.name AS category_name, r.amount, r.title, r.note, r.created_at
     FROM expense_records r
     JOIN expense_categories c ON c.id = r.category_id
     ${whereSql}
     ORDER BY r.entry_date DESC, r.id DESC`,
    params,
    db,
  );

  return rows.map((r) => ({
    id: Number(r.id),
    entryDate: String(r.entry_date),
    yearMonth: String(r.year_month),
    categoryId: Number(r.category_id),
    categoryName: String(r.category_name),
    amount: Number(r.amount || 0),
    title: String(r.title || ""),
    note: r.note ? String(r.note) : null,
    createdAt: String(r.created_at),
  }));
}

export async function createExpenseRecord(
  entry: {
    entryDate: string;
    categoryId: number;
    amount: number;
    title: string;
    note?: string;
  },
  db?: Queryable,
): Promise<ExpenseRecord> {
  const dateMatch = /^\d{4}-\d{2}-\d{2}$/.exec(entry.entryDate);
  if (!dateMatch) {
    throw new Error("วันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)");
  }
  const yearMonth = entry.entryDate.slice(0, 7);
  const cleanAmount = Number.isFinite(entry.amount) ? Math.max(0, Math.round(entry.amount * 100) / 100) : 0;
  const cleanTitle = (entry.title || "").trim();
  const cleanNote = (entry.note || "").trim();

  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO expense_records (entry_date, year_month, category_id, amount, title, note)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, entry_date, year_month, category_id, amount, title, note, created_at`,
    [entry.entryDate, yearMonth, entry.categoryId, cleanAmount, cleanTitle, cleanNote || null],
    db,
  );

  if (!row) {
    throw new Error("ไม่สามารถบันทึกรายการรายจ่ายได้");
  }

  // Get category name
  const cat = await queryOne<{ name: string }>(
    `SELECT name FROM expense_categories WHERE id = $1`,
    [entry.categoryId],
    db,
  );

  return {
    id: Number(row.id),
    entryDate: String(row.entry_date),
    yearMonth: String(row.year_month),
    categoryId: Number(row.category_id),
    categoryName: String(cat?.name || "ไม่ทราบหมวดหมู่"),
    amount: Number(row.amount || 0),
    title: String(row.title || ""),
    note: row.note ? String(row.note) : null,
    createdAt: String(row.created_at),
  };
}

export async function deleteExpenseRecord(id: number, db?: Queryable): Promise<boolean> {
  const res = await query(
    `DELETE FROM expense_records WHERE id = $1`,
    [id],
    db,
  );
  return res.length >= 0; // query executes successfully
}
