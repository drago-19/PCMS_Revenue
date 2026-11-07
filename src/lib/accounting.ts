import {
  getActiveCompanyId,
  query,
  queryOne,
  withTransaction,
  type Queryable,
} from "./db";
import {
  ACCOUNT_TYPE_META,
  calculateAccountEndingBalance,
  DEFAULT_CHART_OF_ACCOUNTS,
  inferAccountTypeFromCode,
  inferNormalBalance,
  validateJournalEntryLines,
  type AccountType,
  type AccountingCategoryCounts,
  type AccountingOverviewData,
  type ChartOfAccount,
  type GeneralLedgerAccountRow,
  type JournalBookCounts,
  type JournalBookType,
  type JournalEntryLine,
  type JournalEntryStatus,
  type JournalVoucher,
  type LedgerMovementItem,
  type NormalBalance,
} from "./accounting-types";
import { listExpenseCategories, listExpenseRecords } from "./expenses";
import { BILLABLE_ORDER_OR_COMPENSATION_SQL } from "./invoice-eligibility";

export {
  ACCOUNT_TYPE_META,
  calculateAccountEndingBalance,
  DEFAULT_CHART_OF_ACCOUNTS,
  inferAccountTypeFromCode,
  inferNormalBalance,
  validateJournalEntryLines,
  type AccountType,
  type AccountingCategoryCounts,
  type AccountingOverviewData,
  type ChartOfAccount,
  type GeneralLedgerAccountRow,
  type JournalBookCounts,
  type JournalBookType,
  type JournalEntryLine,
  type JournalEntryStatus,
  type JournalVoucher,
  type LedgerMovementItem,
  type NormalBalance,
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizeAccountType(raw: unknown, code = ""): AccountType {
  const s = String(raw || "").trim().toLowerCase();
  if (
    s === "asset" ||
    s === "liability" ||
    s === "equity" ||
    s === "revenue" ||
    s === "expense"
  ) {
    return s;
  }
  return inferAccountTypeFromCode(code);
}

function normalizeNormalBalance(
  raw: unknown,
  type: AccountType,
): NormalBalance {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "debit" || s === "credit") return s;
  return inferNormalBalance(type);
}

function normalizeJournalType(raw: unknown): JournalBookType {
  const s = String(raw || "").trim().toUpperCase();
  if (s === "JV" || s === "UV" || s === "SV" || s === "PV" || s === "RV") {
    return s;
  }
  return "JV";
}

function normalizeJournalStatus(raw: unknown): JournalEntryStatus {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "approved" || s === "pending" || s === "void") return s;
  return "approved";
}

function mapChartOfAccountRow(r: Record<string, unknown>): ChartOfAccount {
  const code = String(r.account_code || "").trim();
  const accountType = normalizeAccountType(r.account_type, code);
  const meta = ACCOUNT_TYPE_META[accountType];
  return {
    id: Number(r.id),
    accountCode: code,
    accountName: String(r.account_name || ""),
    description: String(r.description || ""),
    accountType,
    primaryGroup:
      String(r.primary_group || "").trim() || meta.defaultPrimaryGroup,
    secondaryGroup:
      String(r.secondary_group || "").trim() || meta.defaultSecondaryGroup,
    normalBalance: normalizeNormalBalance(r.normal_balance, accountType),
    isSystem: Boolean(r.is_system),
    sortOrder: Number(r.sort_order || 0),
    createdAt: String(r.created_at || ""),
  };
}

const coaSyncedByCompany = new Set<string>();
const monthlySalesAggCache = new Map<
  string,
  { ts: number; data: MonthlyChannelSalesAgg[] }
>();

export function invalidateAccountingCache(): void {
  coaSyncedByCompany.clear();
  monthlySalesAggCache.clear();
}

export async function ensureDefaultChartOfAccounts(
  db?: Queryable,
): Promise<void> {
  const companyId = await getActiveCompanyId();
  // Fast-path when already synced for this company in this server process
  if (!db && coaSyncedByCompany.has(companyId)) {
    return;
  }

  const codes: string[] = [];
  const names: string[] = [];
  const descriptions: string[] = [];
  const types: string[] = [];
  const primaryGroups: string[] = [];
  const secondaryGroups: string[] = [];
  const balances: string[] = [];
  const orders: number[] = [];

  for (const item of DEFAULT_CHART_OF_ACCOUNTS) {
    codes.push(item.accountCode);
    names.push(item.accountName);
    descriptions.push(item.description);
    types.push(item.accountType);
    primaryGroups.push(item.primaryGroup);
    secondaryGroups.push(item.secondaryGroup);
    balances.push(item.normalBalance);
    orders.push(item.sortOrder);
  }

  await query(
    `INSERT INTO chart_of_accounts (
       account_code, account_name, description, account_type,
       primary_group, secondary_group, normal_balance, is_system, sort_order
     )
     SELECT
       u.code, u.name, u.descr, u.atype,
       u.pgroup, u.sgroup, u.nbal, TRUE, u.sorder
     FROM unnest(
       $1::text[], $2::text[], $3::text[], $4::text[],
       $5::text[], $6::text[], $7::text[], $8::int[]
     ) AS u(code, name, descr, atype, pgroup, sgroup, nbal, sorder)
     ON CONFLICT (account_code) DO UPDATE
     SET account_name = EXCLUDED.account_name,
         description = EXCLUDED.description,
         primary_group = EXCLUDED.primary_group,
         secondary_group = EXCLUDED.secondary_group
     WHERE chart_of_accounts.is_system = TRUE`,
    [
      codes,
      names,
      descriptions,
      types,
      primaryGroups,
      secondaryGroups,
      balances,
      orders,
    ],
    db,
  );

  // Clean any English parenthetical suffixes on existing expense_categories and leftover test COA rows
  await query(
    `UPDATE expense_categories
     SET name = trim(regexp_replace(name, '\\s*\\([A-Za-z][^)]*\\)', '', 'g'))
     WHERE name ~ '\\([A-Za-z]'`,
    [],
    db,
  );
  await query(
    `DELETE FROM chart_of_accounts
     WHERE is_system = FALSE
       AND (account_name LIKE 'ค่าแอดทดสอบ_%' OR account_name LIKE 'ค่าเช่าทดสอบ_%')`,
    [],
    db,
  );
  await query(
    `UPDATE chart_of_accounts
     SET description = regexp_replace(description, '\\(([^)]+)\\)', '\\1', 'g')
     WHERE description LIKE 'เชื่อมอัตโนมัติจากหมวดหมู่รายจ่าย (%'`,
    [],
    db,
  );

  // Batch sync custom expense_categories with account_code into chart_of_accounts in 1 query
  const expenseCategories = await listExpenseCategories(db);
  const catCodes: string[] = [];
  const catNames: string[] = [];
  const catDescrs: string[] = [];
  const catTypes: string[] = [];
  const catPGroups: string[] = [];
  const catSGroups: string[] = [];
  const catBalances: string[] = [];
  const catOrders: number[] = [];

  for (const cat of expenseCategories) {
    const code = cat.accountCode.trim();
    if (!code) continue;
    const inferredType = inferAccountTypeFromCode(code);
    const meta = ACCOUNT_TYPE_META[inferredType];
    catCodes.push(code);
    catNames.push(cat.name);
    catDescrs.push(`เชื่อมอัตโนมัติจากหมวดหมู่รายจ่าย ${cat.name}`);
    catTypes.push(inferredType);
    catPGroups.push(meta.defaultPrimaryGroup);
    catSGroups.push(meta.defaultSecondaryGroup);
    catBalances.push(meta.normalBalance);
    catOrders.push(550 + cat.sortOrder);
  }

  if (catCodes.length > 0) {
    await query(
      `INSERT INTO chart_of_accounts (
         account_code, account_name, description, account_type,
         primary_group, secondary_group, normal_balance, is_system, sort_order
       )
       SELECT
         u.code, u.name, u.descr, u.atype,
         u.pgroup, u.sgroup, u.nbal, FALSE, u.sorder
       FROM unnest(
         $1::text[], $2::text[], $3::text[], $4::text[],
         $5::text[], $6::text[], $7::text[], $8::int[]
       ) AS u(code, name, descr, atype, pgroup, sgroup, nbal, sorder)
       ON CONFLICT (account_code) DO NOTHING`,
      [
        catCodes,
        catNames,
        catDescrs,
        catTypes,
        catPGroups,
        catSGroups,
        catBalances,
        catOrders,
      ],
      db,
    );
  }

  if (!db) {
    coaSyncedByCompany.add(companyId);
  }
}

export async function listChartOfAccounts(
  db?: Queryable,
): Promise<ChartOfAccount[]> {
  await ensureDefaultChartOfAccounts(db);
  const rows = await query<Record<string, unknown>>(
    `SELECT id, account_code, account_name, description, account_type,
            primary_group, secondary_group, normal_balance, is_system, sort_order, created_at
     FROM chart_of_accounts
     ORDER BY account_code ASC, sort_order ASC, id ASC`,
    [],
    db,
  );
  return rows.map(mapChartOfAccountRow);
}

export interface UpsertChartOfAccountInput {
  accountCode: string;
  accountName: string;
  description?: string;
  accountType?: AccountType;
  primaryGroup?: string;
  secondaryGroup?: string;
  normalBalance?: NormalBalance;
}

export async function createChartOfAccount(
  input: UpsertChartOfAccountInput,
  db?: Queryable,
): Promise<ChartOfAccount> {
  const code = String(input.accountCode || "").trim().slice(0, 30);
  const name = String(input.accountName || "").trim().slice(0, 120);
  if (!code) {
    throw new Error("กรุณาระบุรหัสบัญชี เช่น 11121.02 หรือ 53032.10");
  }
  if (!name) {
    throw new Error("กรุณาระบุชื่อบัญชี");
  }

  const accountType = normalizeAccountType(input.accountType, code);
  const meta = ACCOUNT_TYPE_META[accountType];
  const primaryGroup =
    String(input.primaryGroup || "").trim().slice(0, 100) ||
    meta.defaultPrimaryGroup;
  const secondaryGroup =
    String(input.secondaryGroup || "").trim().slice(0, 120) ||
    meta.defaultSecondaryGroup;
  const description = String(input.description || "").trim().slice(0, 300);
  const normalBalance = normalizeNormalBalance(
    input.normalBalance,
    accountType,
  );

  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO chart_of_accounts (
       account_code, account_name, description, account_type,
       primary_group, secondary_group, normal_balance, is_system, sort_order
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, 900)
     ON CONFLICT (account_code) DO UPDATE SET
       account_name = EXCLUDED.account_name,
       description = EXCLUDED.description,
       account_type = EXCLUDED.account_type,
       primary_group = EXCLUDED.primary_group,
       secondary_group = EXCLUDED.secondary_group,
       normal_balance = EXCLUDED.normal_balance
     RETURNING *`,
    [
      code,
      name,
      description,
      accountType,
      primaryGroup,
      secondaryGroup,
      normalBalance,
    ],
    db,
  );

  if (!row) {
    throw new Error("ไม่สามารถบันทึกผังบัญชีได้");
  }
  coaSyncedByCompany.clear();
  return mapChartOfAccountRow(row);
}

export async function updateChartOfAccount(
  id: number,
  input: UpsertChartOfAccountInput,
  db?: Queryable,
): Promise<ChartOfAccount | null> {
  const code = String(input.accountCode || "").trim().slice(0, 30);
  const name = String(input.accountName || "").trim().slice(0, 120);
  if (!code || !name) {
    throw new Error("กรุณาระบุรหัสบัญชีและชื่อบัญชีให้ครบถ้วน");
  }

  const accountType = normalizeAccountType(input.accountType, code);
  const meta = ACCOUNT_TYPE_META[accountType];
  const primaryGroup =
    String(input.primaryGroup || "").trim().slice(0, 100) ||
    meta.defaultPrimaryGroup;
  const secondaryGroup =
    String(input.secondaryGroup || "").trim().slice(0, 120) ||
    meta.defaultSecondaryGroup;
  const description = String(input.description || "").trim().slice(0, 300);
  const normalBalance = normalizeNormalBalance(
    input.normalBalance,
    accountType,
  );

  const row = await queryOne<Record<string, unknown>>(
    `UPDATE chart_of_accounts
     SET account_code = $1,
         account_name = $2,
         description = $3,
         account_type = $4,
         primary_group = $5,
         secondary_group = $6,
         normal_balance = $7
     WHERE id = $8
     RETURNING *`,
    [
      code,
      name,
      description,
      accountType,
      primaryGroup,
      secondaryGroup,
      normalBalance,
      id,
    ],
    db,
  );

  coaSyncedByCompany.clear();
  return row ? mapChartOfAccountRow(row) : null;
}

export async function deleteChartOfAccount(
  id: number,
  db?: Queryable,
): Promise<boolean> {
  const res = await query(
    `DELETE FROM chart_of_accounts WHERE id = $1 AND is_system = FALSE RETURNING id`,
    [id],
    db,
  );
  coaSyncedByCompany.clear();
  return res.length > 0;
}

function mapManualJournalRow(r: Record<string, unknown>): JournalVoucher {
  const id = Number(r.id);
  const rawLines = Array.isArray(r.lines_json) ? r.lines_json : [];
  const lines: JournalEntryLine[] = rawLines.map((item) => {
    const obj = (item || {}) as Record<string, unknown>;
    return {
      accountCode: String(obj.accountCode || ""),
      accountName: String(obj.accountName || ""),
      debit: round2(Number(obj.debit || 0)),
      credit: round2(Number(obj.credit || 0)),
      memo: String(obj.memo || ""),
    };
  });

  const journalType = normalizeJournalType(r.journal_type);
  const entryDate = String(r.entry_date || "");

  return {
    id: `manual-${id}`,
    dbId: id,
    documentNo: String(r.document_no || `JV${entryDate.replace(/-/g, "")}${String(id).padStart(4, "0")}`),
    journalType,
    entryDate,
    yearMonth: String(r.year_month || entryDate.slice(0, 7)),
    contactName: String(r.contact_name || ""),
    referenceNo: String(r.reference_no || ""),
    description: String(r.description || ""),
    remarks: String(r.remarks || ""),
    totalDebit: round2(Number(r.total_debit || 0)),
    totalCredit: round2(Number(r.total_credit || 0)),
    status: normalizeJournalStatus(r.status),
    sourceType: "manual",
    lines,
    createdAt: String(r.created_at || ""),
  };
}

export interface CreateManualJournalInput {
  entryDate: string;
  journalType?: JournalBookType;
  documentPrefix?: "JV" | "OP" | "UV" | "SV" | "PV" | "RV";
  contactName?: string;
  referenceNo?: string;
  description: string;
  remarks?: string;
  status?: JournalEntryStatus;
  lines: JournalEntryLine[];
}

export async function createManualJournalEntry(
  input: CreateManualJournalInput,
  db?: Queryable,
): Promise<JournalVoucher> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.entryDate)) {
    throw new Error("รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)");
  }

  const cleanedLines: JournalEntryLine[] = (input.lines || [])
    .map((l) => ({
      accountCode: String(l.accountCode || "").trim(),
      accountName: String(l.accountName || "").trim(),
      debit: round2(Number(l.debit || 0)),
      credit: round2(Number(l.credit || 0)),
      memo: String(l.memo || "").trim().slice(0, 240),
    }))
    .filter((l) => l.accountCode !== "" && (l.debit > 0 || l.credit > 0));

  const validation = validateJournalEntryLines(cleanedLines);
  if (!validation.valid) {
    throw new Error(validation.error || "รายการเดบิต/เครดิตไม่สมดุล");
  }

  const rawPrefix = String(input.documentPrefix || input.journalType || "JV")
    .trim()
    .toUpperCase();
  const journalType =
    rawPrefix === "OP" ? "JV" : normalizeJournalType(rawPrefix);
  const prefix = rawPrefix === "OP" ? "OP" : journalType;
  const dateCompact = input.entryDate.replace(/-/g, "");
  const docPrefix = `${prefix}${dateCompact}`;
  const yearMonth = input.entryDate.slice(0, 7);
  const description =
    String(input.description || "").trim().slice(0, 240) ||
    "สมุดรายวันทั่วไป";
  const contactName = String(input.contactName || "").trim().slice(0, 160);
  const referenceNo = String(input.referenceNo || "").trim().slice(0, 80);
  const remarks = String(input.remarks || "").trim().slice(0, 500);
  const status = normalizeJournalStatus(input.status || "approved");

  const runInsert = async (targetDb: Queryable) => {
    const seqRow = await queryOne<{ max_seq: number }>(
      `SELECT COALESCE(MAX(
         CASE
           WHEN document_no LIKE $1 AND LENGTH(document_no) >= 14
                AND SUBSTRING(document_no FROM 11 FOR 4) ~ '^[0-9]+$'
           THEN SUBSTRING(document_no FROM 11 FOR 4)::int
           ELSE 0
         END
       ), 0) AS max_seq
       FROM journal_entries
       WHERE entry_date = $2`,
      [`${docPrefix}%`, input.entryDate],
      targetDb,
    );
    const nextSeq = Number(seqRow?.max_seq || 0) + 1;
    const documentNo = `${docPrefix}${String(nextSeq).padStart(4, "0")}`;

    const row = await queryOne<Record<string, unknown>>(
      `INSERT INTO journal_entries (
         document_no, journal_type, entry_date, year_month,
         contact_name, reference_no, description, remarks,
         total_debit, total_credit, status, lines_json
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
       RETURNING *`,
      [
        documentNo,
        journalType,
        input.entryDate,
        yearMonth,
        contactName,
        referenceNo,
        description,
        remarks,
        validation.totalDebit,
        validation.totalCredit,
        status,
        JSON.stringify(cleanedLines),
      ],
      targetDb,
    );

    if (!row) {
      throw new Error("ไม่สามารถบันทึกสมุดรายวันได้");
    }
    monthlySalesAggCache.clear();
    return mapManualJournalRow(row);
  };

  if (db) {
    return runInsert(db);
  }
  return withTransaction((client) => runInsert(client));
}

export async function updateManualJournalStatus(
  id: number,
  status: JournalEntryStatus,
  db?: Queryable,
): Promise<JournalVoucher | null> {
  const cleanStatus = normalizeJournalStatus(status);
  const row = await queryOne<Record<string, unknown>>(
    `UPDATE journal_entries
     SET status = $1, updated_at = now()
     WHERE id = $2
     RETURNING *`,
    [cleanStatus, id],
    db,
  );
  monthlySalesAggCache.clear();
  return row ? mapManualJournalRow(row) : null;
}

export async function updateManualJournalEntry(
  id: number,
  input: CreateManualJournalInput,
  db?: Queryable,
): Promise<JournalVoucher | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.entryDate)) {
    throw new Error("รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)");
  }

  const cleanedLines: JournalEntryLine[] = (input.lines || [])
    .map((l) => ({
      accountCode: String(l.accountCode || "").trim(),
      accountName: String(l.accountName || "").trim(),
      debit: round2(Number(l.debit || 0)),
      credit: round2(Number(l.credit || 0)),
      memo: String(l.memo || "").trim().slice(0, 240),
    }))
    .filter((l) => l.accountCode !== "" && (l.debit > 0 || l.credit > 0));

  const validation = validateJournalEntryLines(cleanedLines);
  if (!validation.valid) {
    throw new Error(validation.error || "รายการเดบิต/เครดิตไม่สมดุล");
  }

  const yearMonth = input.entryDate.slice(0, 7);
  const rawPrefix =
    input.documentPrefix || input.journalType
      ? String(input.documentPrefix || input.journalType)
          .trim()
          .toUpperCase()
      : undefined;
  const journalType = rawPrefix
    ? rawPrefix === "OP"
      ? "JV"
      : normalizeJournalType(rawPrefix)
    : undefined;
  const description =
    String(input.description || "").trim().slice(0, 240) || "สมุดรายวันทั่วไป";
  const contactName = String(input.contactName || "").trim().slice(0, 160);
  const referenceNo = String(input.referenceNo || "").trim().slice(0, 80);
  const remarks = String(input.remarks || "").trim().slice(0, 500);
  const status = input.status ? normalizeJournalStatus(input.status) : undefined;

  const row = await queryOne<Record<string, unknown>>(
    `UPDATE journal_entries
     SET entry_date = $1,
         year_month = $2,
         contact_name = $3,
         reference_no = $4,
         description = $5,
         remarks = $6,
         total_debit = $7,
         total_credit = $8,
         status = COALESCE($9, status),
         lines_json = $10::jsonb,
         journal_type = COALESCE($12, journal_type),
         updated_at = now()
     WHERE id = $11
     RETURNING *`,
    [
      input.entryDate,
      yearMonth,
      contactName,
      referenceNo,
      description,
      remarks,
      validation.totalDebit,
      validation.totalCredit,
      status ?? null,
      JSON.stringify(cleanedLines),
      id,
      journalType ?? null,
    ],
    db,
  );
  monthlySalesAggCache.clear();
  return row ? mapManualJournalRow(row) : null;
}

export async function deleteManualJournalEntry(
  id: number,
  db?: Queryable,
): Promise<boolean> {
  const res = await query(
    `DELETE FROM journal_entries WHERE id = $1 RETURNING id`,
    [id],
    db,
  );
  return res.length > 0;
}

interface MonthlyChannelSalesAgg {
  yearMonth: string;
  channel: string;
  orderCount: number;
  orderIncome: number;
  compensationIncome: number;
  totalPayout: number;
  lastDate: string;
}

const SALES_AGG_CACHE_TTL_MS = 300_000; // 5 นาที

export function parseAccountingPeriodFilter(selectedPeriod?: string): {
  mode: "all" | "year" | "month" | "month_range" | "date_range";
  raw: string;
  start?: string;
  end?: string;
} {
  const s = String(selectedPeriod || "all").trim();
  if (!s || s === "all") {
    return { mode: "all", raw: "all" };
  }
  if (/^\d{4}$/.test(s)) {
    return { mode: "year", raw: s, start: s, end: s };
  }
  if (/^\d{4}-\d{2}$/.test(s)) {
    return { mode: "month", raw: s, start: s, end: s };
  }
  const mRange = /^(\d{4}-\d{2})(?:_|\.\.)(\d{4}-\d{2})$/.exec(s);
  if (mRange) {
    const [a, b] = mRange[1] <= mRange[2] ? [mRange[1], mRange[2]] : [mRange[2], mRange[1]];
    return { mode: "month_range", raw: `${a}_${b}`, start: a, end: b };
  }
  const dRange = /^(\d{4}-\d{2}-\d{2})(?:_|\.\.)(\d{4}-\d{2}-\d{2})$/.exec(s);
  if (dRange) {
    const [a, b] = dRange[1] <= dRange[2] ? [dRange[1], dRange[2]] : [dRange[2], dRange[1]];
    return { mode: "date_range", raw: `${a}_${b}`, start: a, end: b };
  }
  return { mode: "all", raw: "all" };
}

function filterSalesAggByParsedPeriod(
  list: MonthlyChannelSalesAgg[],
  parsed: ReturnType<typeof parseAccountingPeriodFilter>,
): MonthlyChannelSalesAgg[] {
  if (parsed.mode === "all") return list;
  if (parsed.mode === "year" || parsed.mode === "month") {
    return list.filter((item) => item.yearMonth.startsWith(parsed.raw));
  }
  if (parsed.mode === "month_range") {
    return list.filter(
      (item) =>
        item.yearMonth >= parsed.start! && item.yearMonth <= parsed.end!,
    );
  }
  if (parsed.mode === "date_range") {
    const startYm = parsed.start!.slice(0, 7);
    const endYm = parsed.end!.slice(0, 7);
    return list.filter(
      (item) => item.yearMonth >= startYm && item.yearMonth <= endYm,
    );
  }
  return list;
}

async function getMonthlyChannelSalesAggregates(
  selectedPeriod?: string,
  db?: Queryable,
): Promise<MonthlyChannelSalesAgg[]> {
  const parsed = parseAccountingPeriodFilter(selectedPeriod);

  const companyId = await getActiveCompanyId();
  let allCacheKey = `${companyId}:all`;

  if (parsed.mode === "date_range" && parsed.start && parsed.end) {
    const rangeRows = await query<Record<string, unknown>>(
      `SELECT
         SUBSTRING(t.paid_date FROM 1 FOR 7) AS ym,
         t.channel AS ch,
         COUNT(*)::int AS order_count,
         ROUND(COALESCE(SUM(CASE WHEN t.is_order = 1 THEN t.income ELSE 0 END), 0)::numeric, 2) AS order_income,
         ROUND(COALESCE(SUM(CASE WHEN t.is_order = 0 THEN t.payout ELSE 0 END), 0)::numeric, 2) AS comp_income,
         ROUND(COALESCE(SUM(t.payout), 0)::numeric, 2) AS total_payout,
         MAX(t.paid_date) AS last_date
       FROM transactions t
       WHERE ${BILLABLE_ORDER_OR_COMPENSATION_SQL}
         AND t.paid_date >= $1 AND t.paid_date <= $2
         AND t.paid_date <> '' AND t.paid_date <> 'unknown'
       GROUP BY ym, ch
       ORDER BY ym DESC, ch ASC`,
      [parsed.start, parsed.end],
      db,
    );
    return rangeRows.map((r) => ({
      yearMonth: String(r.ym || ""),
      channel: String(r.ch || "TikTok"),
      orderCount: Number(r.order_count || 0),
      orderIncome: round2(Number(r.order_income || 0)),
      compensationIncome: round2(Number(r.comp_income || 0)),
      totalPayout: round2(Number(r.total_payout || 0)),
      lastDate: String(r.last_date || ""),
    }));
  }

  if (!db) {
    const impStamp = await queryOne<{ cnt: number; max_id: number }>(
      `SELECT COUNT(*)::int AS cnt, COALESCE(MAX(id), 0)::int AS max_id FROM imports`,
    );
    allCacheKey = `${companyId}:${impStamp?.cnt ?? 0}:${impStamp?.max_id ?? 0}`;
    const cachedAll = monthlySalesAggCache.get(allCacheKey);
    if (cachedAll && Date.now() - cachedAll.ts < SALES_AGG_CACHE_TTL_MS) {
      return filterSalesAggByParsedPeriod(cachedAll.data, parsed);
    }
  }

  const rows = await query<Record<string, unknown>>(
    `SELECT
       SUBSTRING(t.paid_date FROM 1 FOR 7) AS ym,
       t.channel AS ch,
       COUNT(*)::int AS order_count,
       ROUND(COALESCE(SUM(CASE WHEN t.is_order = 1 THEN t.income ELSE 0 END), 0)::numeric, 2) AS order_income,
       ROUND(COALESCE(SUM(CASE WHEN t.is_order = 0 THEN t.payout ELSE 0 END), 0)::numeric, 2) AS comp_income,
       ROUND(COALESCE(SUM(t.payout), 0)::numeric, 2) AS total_payout,
       MAX(t.paid_date) AS last_date
     FROM transactions t
     WHERE ${BILLABLE_ORDER_OR_COMPENSATION_SQL}
       AND t.paid_date <> '' AND t.paid_date <> 'unknown'
     GROUP BY ym, ch
     ORDER BY ym DESC, ch ASC`,
    [],
    db,
  );

  const result = rows.map((r) => ({
    yearMonth: String(r.ym || ""),
    channel: String(r.ch || "TikTok"),
    orderCount: Number(r.order_count || 0),
    orderIncome: round2(Number(r.order_income || 0)),
    compensationIncome: round2(Number(r.comp_income || 0)),
    totalPayout: round2(Number(r.total_payout || 0)),
    lastDate: String(r.last_date || ""),
  }));

  if (!db) {
    monthlySalesAggCache.set(allCacheKey, { ts: Date.now(), data: result });
  }
  return filterSalesAggByParsedPeriod(result, parsed);
}

function getRevenueAccountForChannel(channel: string): {
  code: string;
  name: string;
} {
  if (channel === "TikTok") {
    return { code: "41010.01", name: "รายได้จากการขาย - TikTok Shop" };
  } else if (channel === "Shopee") {
    return { code: "41010.02", name: "รายได้จากการขาย - Shopee" };
  } else if (channel === "Facebook") {
    return { code: "41010.03", name: "รายได้จากการขาย - Facebook" };
  } else if (channel === "Lazada") {
    return { code: "41010.04", name: "รายได้จากการขาย - Lazada" };
  } else {
    return { code: "41010.05", name: "รายได้จากการขาย - LINE / ช่องทางอื่น" };
  }
}

function getChannelShortCode(channel: string): string {
  if (channel === "TikTok") return "TT";
  if (channel === "Shopee") return "SP";
  if (channel === "Facebook") return "FB";
  if (channel === "Lazada") return "LZ";
  if (channel === "LINE") return "LN";
  return "OT";
}

export async function getAccountingOverview(
  selectedPeriod = "all",
  db?: Queryable,
): Promise<AccountingOverviewData> {
  await ensureDefaultChartOfAccounts(db);

  const parsedPeriod = parseAccountingPeriodFilter(selectedPeriod);
  const periodFilter = parsedPeriod.raw;

  const manualSqlAndParams = (() => {
    if (parsedPeriod.mode === "all") {
      return {
        sql: `SELECT * FROM journal_entries ORDER BY entry_date DESC, id DESC`,
        params: [] as unknown[],
      };
    }
    if (parsedPeriod.mode === "year" || parsedPeriod.mode === "month") {
      return {
        sql: `SELECT * FROM journal_entries WHERE entry_date LIKE $1 ORDER BY entry_date DESC, id DESC`,
        params: [`${parsedPeriod.raw}%`],
      };
    }
    if (parsedPeriod.mode === "month_range") {
      return {
        sql: `SELECT * FROM journal_entries WHERE year_month >= $1 AND year_month <= $2 ORDER BY entry_date DESC, id DESC`,
        params: [parsedPeriod.start!, parsedPeriod.end!],
      };
    }
    return {
      sql: `SELECT * FROM journal_entries WHERE entry_date >= $1 AND entry_date <= $2 ORDER BY entry_date DESC, id DESC`,
      params: [parsedPeriod.start!, parsedPeriod.end!],
    };
  })();

  const runQueries = async () => {
    const q1 = () => listChartOfAccounts(db);
    const q2 = () =>
      query<Record<string, unknown>>(
        manualSqlAndParams.sql,
        manualSqlAndParams.params,
        db,
      );
    const q3 = () =>
      listExpenseRecords(
        parsedPeriod.mode === "month" ? parsedPeriod.raw : undefined,
        undefined,
        db,
        {
          year: parsedPeriod.mode === "year" ? parsedPeriod.raw : undefined,
          dateRange:
            parsedPeriod.mode === "month_range" ||
            parsedPeriod.mode === "date_range"
              ? { start: parsedPeriod.start!, end: parsedPeriod.end! }
              : undefined,
        },
      );
    const q4 = () =>
      query<Record<string, unknown>>(
        `SELECT m.year_month, m.category_id, m.amount, m.note,
                c.name AS category_name, COALESCE(c.account_code, '') AS category_account_code
         FROM monthly_expenses m
         JOIN expense_categories c ON c.id = m.category_id
         WHERE m.amount > 0`,
        [],
        db,
      );
    const q5 = () => getMonthlyChannelSalesAggregates(periodFilter, db);
    const q6 = () =>
      query<{ ym: string }>(
        `SELECT DISTINCT SUBSTRING(paid_date FROM 1 FOR 7) AS ym
         FROM daily_summaries
         WHERE paid_date ~ '^[0-9]{4}-[0-9]{2}'
         UNION
         SELECT DISTINCT year_month AS ym FROM expense_records WHERE year_month ~ '^[0-9]{4}-[0-9]{2}'
         UNION
         SELECT DISTINCT year_month AS ym FROM monthly_expenses WHERE amount > 0 AND year_month ~ '^[0-9]{4}-[0-9]{2}'
         UNION
         SELECT DISTINCT year_month AS ym FROM journal_entries WHERE year_month ~ '^[0-9]{4}-[0-9]{2}'
         ORDER BY ym DESC`,
        [],
        db,
      );
    if (db) {
      return [await q1(), await q2(), await q3(), await q4(), await q5(), await q6()] as const;
    }
    return Promise.all([q1(), q2(), q3(), q4(), q5(), q6()]);
  };

  const [
    coaList,
    manualRows,
    expenseRecords,
    directExpenseRows,
    salesAggs,
    yearMonthRows,
  ] = await runQueries();

  const accountMap = new Map<string, ChartOfAccount>();
  for (const acc of coaList) {
    accountMap.set(acc.accountCode, acc);
  }

  const getAccountName = (code: string, fallback: string) =>
    accountMap.get(code)?.accountName || fallback;

  const journals: JournalVoucher[] = [];

  // 1. Manual Journal Entries (JV / OP / UV / SV / PV / RV)
  for (const row of manualRows) {
    const voucher = mapManualJournalRow(row);
    voucher.lines = voucher.lines.map((line) => ({
      ...line,
      accountName:
        line.accountName || getAccountName(line.accountCode, line.accountCode),
    }));
    journals.push(voucher);
  }

  // 2. Auto-generated Sales Journal (SV) & Receipt Journal (RV) per platform per month
  for (const agg of salesAggs) {
    const grossRevenue = round2(agg.orderIncome + agg.compensationIncome);
    const payout = round2(agg.totalPayout);
    if (grossRevenue <= 0 && payout === 0) continue;

    const revAcc = getRevenueAccountForChannel(agg.channel);
    const chCode = getChannelShortCode(agg.channel);
    const ymCompact = agg.yearMonth.replace("-", "");
    const entryDate = agg.lastDate || `${agg.yearMonth}-28`;

    // SV: บันทึกรายได้จากการขายตั้งลูกหนี้แพลตฟอร์ม
    if (grossRevenue > 0) {
      const svLines: JournalEntryLine[] = [
        {
          accountCode: "11311",
          accountName: getAccountName(
            "11311",
            "ลูกหนี้การค้า - ทั่วไป / แพลตฟอร์ม E-Commerce",
          ),
          debit: grossRevenue,
          credit: 0,
          memo: `ตั้งลูกหนี้การค้า ${agg.channel} (${agg.orderCount.toLocaleString("th-TH")} รายการ)`,
        },
      ];
      if (agg.orderIncome > 0) {
        svLines.push({
          accountCode: revAcc.code,
          accountName: getAccountName(revAcc.code, revAcc.name),
          debit: 0,
          credit: agg.orderIncome,
          memo: `ยอดขายสินค้า ${agg.channel} ประจำงวด ${agg.yearMonth}`,
        });
      }
      if (agg.compensationIncome > 0) {
        svLines.push({
          accountCode: "42010",
          accountName: getAccountName(
            "42010",
            "รายได้เงินชดเชยจากแพลตฟอร์มและโลจิสติกส์",
          ),
          debit: 0,
          credit: agg.compensationIncome,
          memo: `เงินชดเชยแพลตฟอร์ม ${agg.channel} ประจำงวด ${agg.yearMonth}`,
        });
      }

      journals.push({
        id: `sv-${agg.yearMonth}-${agg.channel}`,
        documentNo: `SV${ymCompact}-${chCode}`,
        journalType: "SV",
        entryDate,
        yearMonth: agg.yearMonth,
        contactName: `แพลตฟอร์ม ${agg.channel}`,
        referenceNo: `${agg.channel} (${agg.orderCount.toLocaleString("th-TH")} บิล)`,
        description: `สรุปรายได้จากการขาย ${agg.channel} ประจำเดือน ${agg.yearMonth} (${agg.orderCount.toLocaleString("th-TH")} รายการ)`,
        remarks: "สร้างอัตโนมัติจากข้อมูลบิลคำสั่งซื้อในระบบ",
        totalDebit: grossRevenue,
        totalCredit: grossRevenue,
        status: "approved",
        sourceType: "sales",
        channel: agg.channel,
        lines: svLines,
      });
    }

    // RV: บันทึกรับเงินโอนสุทธิ (Settlement Payout) และหักค่าธรรมเนียมแพลตฟอร์ม (#24: รองรับกรณี payout ติดลบเมื่อถูกหักค่าธรรมเนียม/ค่าส่งตีกลับเกินยอดขาย)
    if (grossRevenue > 0 || payout !== 0) {
      const platformFeeDeduction = round2(Math.max(0, grossRevenue - payout));
      const extraSettlementGain = round2(Math.max(0, payout - grossRevenue));
      const negativePayoutOutflow = payout < 0 ? round2(Math.abs(payout)) : 0;
      const rvTotal = round2(Math.max(grossRevenue, payout, platformFeeDeduction));

      if (rvTotal > 0) {
        const rvLines: JournalEntryLine[] = [];
        if (payout > 0) {
          rvLines.push({
            accountCode: "11121.01",
            accountName: getAccountName(
              "11121.01",
              "กสิกรไทย (บัญชีกระแสรายวัน/ออมทรัพย์หลัก)",
            ),
            debit: payout,
            credit: 0,
            memo: `รับเงินโอนสุทธิจาก ${agg.channel}`,
          });
        }
        if (platformFeeDeduction > 0) {
          rvLines.push({
            accountCode: "51020",
            accountName: getAccountName(
              "51020",
              "ค่าธรรมเนียมแพลตฟอร์มและค่าขนส่งที่ร้านรับภาระ",
            ),
            debit: platformFeeDeduction,
            credit: 0,
            memo: `หักค่าธรรมเนียม/ค่าส่งแพลตฟอร์ม ${agg.channel} ก่อนโอนสุทธิ`,
          });
        }
        if (grossRevenue > 0) {
          rvLines.push({
            accountCode: "11311",
            accountName: getAccountName(
              "11311",
              "ลูกหนี้การค้า - ทั่วไป / แพลตฟอร์ม E-Commerce",
            ),
            debit: 0,
            credit: grossRevenue,
            memo: `ล้างบัญชีลูกหนี้การค้า ${agg.channel} ประจำงวด ${agg.yearMonth}`,
          });
        }
        if (negativePayoutOutflow > 0) {
          rvLines.push({
            accountCode: "11121.01",
            accountName: getAccountName(
              "11121.01",
              "กสิกรไทย (บัญชีกระแสรายวัน/ออมทรัพย์หลัก)",
            ),
            debit: 0,
            credit: negativePayoutOutflow,
            memo: `หักชำระส่วนต่างยอดโอนติดลบ ${agg.channel} ประจำงวด ${agg.yearMonth}`,
          });
        }
        if (extraSettlementGain > 0) {
          rvLines.push({
            accountCode: "42010",
            accountName: getAccountName(
              "42010",
              "รายได้เงินชดเชยจากแพลตฟอร์มและโลจิสติกส์",
            ),
            debit: 0,
            credit: extraSettlementGain,
            memo: `ส่วนเพิ่มเงินโอนสุทธิ ${agg.channel}`,
          });
        }

        const totalDr = round2(rvLines.reduce((s, l) => s + l.debit, 0));
        const totalCr = round2(rvLines.reduce((s, l) => s + l.credit, 0));
        if (totalDr > 0 && Math.abs(totalDr - totalCr) < 0.02) {
          journals.push({
            id: `rv-${agg.yearMonth}-${agg.channel}`,
            documentNo: `RV${ymCompact}-${chCode}`,
            journalType: "RV",
            entryDate,
            yearMonth: agg.yearMonth,
            contactName: `แพลตฟอร์ม ${agg.channel}`,
            referenceNo: `งวดโอนเงิน ${agg.yearMonth}`,
            description: `รับเงินโอนสุทธิจาก ${agg.channel} ประจำเดือน ${agg.yearMonth}`,
            remarks: "สร้างอัตโนมัติจากยอดรับเงินสุทธิหลังหักค่าธรรมเนียม/ค่าส่ง",
            totalDebit: totalDr,
            totalCredit: totalCr,
            status: "approved",
            sourceType: "receipt",
            channel: agg.channel,
            lines: rvLines,
          });
        }
      }
    }
  }

  // 3. Purchase Journal (UV) & Payment Journal (PV) from Expense Records (EXP...) entered by user
  for (const exp of expenseRecords) {
    const expAccountCode =
      exp.categoryAccountCode.trim() &&
      accountMap.has(exp.categoryAccountCode.trim())
        ? exp.categoryAccountCode.trim()
        : exp.categoryAccountCode.trim() || "53032.99";
    const expAccountName = getAccountName(expAccountCode, exp.categoryName);

    const subtotal = round2(exp.subtotalAmount || exp.amount);
    const vat = round2(exp.vatAmount || 0);
    const totalAmount = round2(subtotal + vat);
    const wht = round2(exp.whtAmount || 0);
    const netPaid = round2(Math.max(0, totalAmount - wht));

    if (totalAmount <= 0) continue;

    const status: JournalEntryStatus =
      exp.paymentStatus === "void"
        ? "void"
        : exp.paymentStatus === "pending"
          ? "pending"
          : "approved";

    const docSuffix = exp.documentNo.replace(/^EXP/, "");

    // UV: สมุดรายวันซื้อ (ตั้งค่าใช้จ่าย + ภาษีซื้อ คู่กับ เจ้าหนี้การค้า)
    const uvLines: JournalEntryLine[] = [
      {
        accountCode: expAccountCode,
        accountName: expAccountName,
        debit: subtotal,
        credit: 0,
        memo: exp.title || exp.categoryName,
      },
    ];
    if (vat > 0) {
      uvLines.push({
        accountCode: "17111",
        accountName: getAccountName("17111", "ภาษีซื้อ 7%"),
        debit: vat,
        credit: 0,
        memo: exp.taxInvoiceNo
          ? `ภาษีซื้อ 7% ตามใบกำกับฯ ${exp.taxInvoiceNo}`
          : `ภาษีซื้อ 7% (${exp.documentNo})`,
      });
    }
    uvLines.push({
      accountCode: "21210",
      accountName: getAccountName("21210", "เจ้าหนี้การค้า - ทั่วไป"),
      debit: 0,
      credit: totalAmount,
      memo: `ตั้งเจ้าหนี้ ${exp.vendorName || "ผู้จำหน่ายทั่วไป"} (${exp.documentNo})`,
    });

    journals.push({
      id: `uv-${exp.id}`,
      documentNo: `UV${docSuffix}`,
      journalType: "UV",
      entryDate: exp.entryDate,
      yearMonth: exp.yearMonth,
      contactName: exp.vendorName || "ผู้จำหน่ายทั่วไป",
      referenceNo: exp.taxInvoiceNo || exp.documentNo,
      description: `${exp.title || exp.categoryName} (${exp.documentNo})`,
      remarks: exp.note || `เชื่อมอัตโนมัติจากบิลรายจ่าย ${exp.documentNo}`,
      totalDebit: totalAmount,
      totalCredit: totalAmount,
      status,
      sourceType: "expense_purchase",
      lines: uvLines,
    });

    // PV: สมุดรายวันจ่าย (เมื่อบิลรายจ่ายชำระเงินแล้ว หรือยกเลิก)
    if (exp.paymentStatus === "paid" || exp.paymentStatus === "void") {
      const cashOrBankCode =
        exp.paymentMethod === "cash" ? "11111" : "11121.01";
      const cashOrBankName =
        exp.paymentMethod === "cash"
          ? getAccountName("11111", "เงินสดในมือ")
          : getAccountName(
              "11121.01",
              "กสิกรไทย (บัญชีกระแสรายวัน/ออมทรัพย์หลัก)",
            );

      const pvLines: JournalEntryLine[] = [
        {
          accountCode: "21210",
          accountName: getAccountName("21210", "เจ้าหนี้การค้า - ทั่วไป"),
          debit: totalAmount,
          credit: 0,
          memo: `ล้างเจ้าหนี้การค้าตามบิล ${exp.documentNo}`,
        },
        {
          accountCode: cashOrBankCode,
          accountName: cashOrBankName,
          debit: 0,
          credit: netPaid,
          memo: `จ่ายชำระค่า ${exp.title || exp.categoryName}`,
        },
      ];

      if (wht > 0) {
        pvLines.push({
          accountCode: "27120",
          accountName: getAccountName(
            "27120",
            "ภาษีหัก ณ ที่จ่ายค้างจ่าย (ภ.ง.ด.1/3/53)",
          ),
          debit: 0,
          credit: wht,
          memo: `หักภาษี ณ ที่จ่าย ${exp.whtRate}% (${exp.documentNo})`,
        });
      }

      journals.push({
        id: `pv-${exp.id}`,
        documentNo: `PV${docSuffix}`,
        journalType: "PV",
        entryDate: exp.entryDate,
        yearMonth: exp.yearMonth,
        contactName: exp.vendorName || "ผู้จำหน่ายทั่วไป",
        referenceNo: exp.documentNo,
        description: `จ่ายชำระเงิน: ${exp.title || exp.categoryName} (${exp.documentNo})`,
        remarks: exp.note || `เชื่อมอัตโนมัติจากการจ่ายชำระบิล ${exp.documentNo}`,
        totalDebit: totalAmount,
        totalCredit: totalAmount,
        status: exp.paymentStatus === "void" ? "void" : "approved",
        sourceType: "expense_payment",
        lines: pvLines,
      });
    }
  }

  // 3b. Direct Monthly Expenses (`monthly_expenses` table — #26: sync with /expenses overview)
  for (const dirRow of directExpenseRows) {
    const ym = String(dirRow.year_month || "");
    if (!ym) continue;
    if (parsedPeriod.mode === "year" && !ym.startsWith(parsedPeriod.raw)) continue;
    if (parsedPeriod.mode === "month" && ym !== parsedPeriod.raw) continue;
    if (
      (parsedPeriod.mode === "month_range" || parsedPeriod.mode === "date_range") &&
      parsedPeriod.start &&
      parsedPeriod.end
    ) {
      const startYm = parsedPeriod.start.slice(0, 7);
      const endYm = parsedPeriod.end.slice(0, 7);
      if (ym < startYm || ym > endYm) continue;
    }

    const directAmount = round2(Number(dirRow.amount || 0));
    if (directAmount <= 0) continue;

    const catId = Number(dirRow.category_id || 0);
    const catName = String(dirRow.category_name || "ค่าใช้จ่ายรายเดือน");
    const rawAccCode = String(dirRow.category_account_code || "").trim();
    const expAccountCode =
      rawAccCode && accountMap.has(rawAccCode) ? rawAccCode : rawAccCode || "53032.99";
    const expAccountName = getAccountName(expAccountCode, catName);
    const ymCompact = ym.replace("-", "");
    const entryDate = `${ym}-28`;
    const docId = `${ymCompact}-M${catId}`;

    journals.push({
      id: `uv-direct-${ym}-${catId}`,
      documentNo: `UV${docId}`,
      journalType: "UV",
      entryDate,
      yearMonth: ym,
      contactName: "รายการปรับปรุงรายเดือน",
      referenceNo: `M-${ym}-${catId}`,
      description: `${catName} (ยอดรวมรายเดือน ${ym})`,
      remarks: String(dirRow.note || `เชื่อมอัตโนมัติจากตารางรายจ่ายรายเดือน (${ym})`),
      totalDebit: directAmount,
      totalCredit: directAmount,
      status: "approved",
      sourceType: "expense_purchase",
      lines: [
        {
          accountCode: expAccountCode,
          accountName: expAccountName,
          debit: directAmount,
          credit: 0,
          memo: `${catName} ประจำเดือน ${ym}`,
        },
        {
          accountCode: "21210",
          accountName: getAccountName("21210", "เจ้าหนี้การค้า - ทั่วไป"),
          debit: 0,
          credit: directAmount,
          memo: `ตั้งค่าใช้จ่ายรายเดือน ${catName}`,
        },
      ],
    });

    journals.push({
      id: `pv-direct-${ym}-${catId}`,
      documentNo: `PV${docId}`,
      journalType: "PV",
      entryDate,
      yearMonth: ym,
      contactName: "รายการปรับปรุงรายเดือน",
      referenceNo: `M-${ym}-${catId}`,
      description: `จ่ายชำระ: ${catName} (ยอดรวมรายเดือน ${ym})`,
      remarks: String(dirRow.note || `เชื่อมอัตโนมัติจากตารางรายจ่ายรายเดือน (${ym})`),
      totalDebit: directAmount,
      totalCredit: directAmount,
      status: "approved",
      sourceType: "expense_payment",
      lines: [
        {
          accountCode: "21210",
          accountName: getAccountName("21210", "เจ้าหนี้การค้า - ทั่วไป"),
          debit: directAmount,
          credit: 0,
          memo: `ล้างเจ้าหนี้รายเดือน ${catName}`,
        },
        {
          accountCode: "11121.01",
          accountName: getAccountName(
            "11121.01",
            "กสิกรไทย (บัญชีกระแสรายวัน/ออมทรัพย์หลัก)",
          ),
          debit: 0,
          credit: directAmount,
          memo: `จ่ายชำระค่า ${catName} ประจำเดือน ${ym}`,
        },
      ],
    });
  }

  // Sort all journals newest first
  journals.sort((a, b) => {
    const cmp = b.entryDate.localeCompare(a.entryDate);
    if (cmp !== 0) return cmp;
    return b.documentNo.localeCompare(a.documentNo);
  });

  // 4. Build General Ledger Movements per Account (from non-void vouchers)
  const movementsByCode = new Map<string, LedgerMovementItem[]>();
  for (const acc of coaList) {
    movementsByCode.set(acc.accountCode, []);
  }

  // Process chronologically (oldest to newest) to compute running balance accurately
  const chronologicalVouchers = [...journals]
    .filter((v) => v.status !== "void")
    .sort((a, b) => {
      const cmp = a.entryDate.localeCompare(b.entryDate);
      if (cmp !== 0) return cmp;
      return a.documentNo.localeCompare(b.documentNo);
    });

  for (const voucher of chronologicalVouchers) {
    for (const line of voucher.lines) {
      const code = line.accountCode.trim();
      if (!code) continue;
      if (!movementsByCode.has(code)) {
        movementsByCode.set(code, []);
      }
      movementsByCode.get(code)!.push({
        voucherId: voucher.id,
        documentNo: voucher.documentNo,
        journalType: voucher.journalType,
        entryDate: voucher.entryDate,
        contactName: voucher.contactName,
        description: voucher.description,
        memo: line.memo || voucher.description,
        debit: round2(line.debit),
        credit: round2(line.credit),
        runningBalance: 0,
        status: voucher.status,
      });
    }
  }

  const glAccounts: GeneralLedgerAccountRow[] = coaList.map((acc) => {
    const list = movementsByCode.get(acc.accountCode) || [];
    let runningDr = 0;
    let runningCr = 0;
    const movementsWithRunning = list.map((m) => {
      runningDr = round2(runningDr + m.debit);
      runningCr = round2(runningCr + m.credit);
      const runningBalance = calculateAccountEndingBalance(
        acc.normalBalance,
        runningDr,
        runningCr,
      );
      return {
        ...m,
        runningBalance,
      };
    });

    const endingBalance = calculateAccountEndingBalance(
      acc.normalBalance,
      runningDr,
      runningCr,
    );

    return {
      ...acc,
      totalDebit: runningDr,
      totalCredit: runningCr,
      endingBalance,
      movementCount: movementsWithRunning.length,
      movements: movementsWithRunning.reverse(), // newest first for UI display
    };
  });

  const categoryCounts: AccountingCategoryCounts = {
    all: glAccounts.length,
    asset: glAccounts.filter((a) => a.accountType === "asset").length,
    liability: glAccounts.filter((a) => a.accountType === "liability").length,
    equity: glAccounts.filter((a) => a.accountType === "equity").length,
    revenue: glAccounts.filter((a) => a.accountType === "revenue").length,
    expense: glAccounts.filter((a) => a.accountType === "expense").length,
  };

  const journalCounts: JournalBookCounts = {
    all: journals.length,
    JV: journals.filter((j) => j.journalType === "JV").length,
    UV: journals.filter((j) => j.journalType === "UV").length,
    SV: journals.filter((j) => j.journalType === "SV").length,
    PV: journals.filter((j) => j.journalType === "PV").length,
    RV: journals.filter((j) => j.journalType === "RV").length,
  };

  const totalAssets = round2(
    glAccounts
      .filter((a) => a.accountType === "asset")
      .reduce((s, a) => s + a.endingBalance, 0),
  );
  const totalLiabilities = round2(
    glAccounts
      .filter((a) => a.accountType === "liability")
      .reduce((s, a) => s + a.endingBalance, 0),
  );
  const totalEquity = round2(
    glAccounts
      .filter((a) => a.accountType === "equity")
      .reduce((s, a) => s + a.endingBalance, 0),
  );
  const totalRevenue = round2(
    glAccounts
      .filter((a) => a.accountType === "revenue")
      .reduce((s, a) => s + a.endingBalance, 0),
  );
  const totalExpense = round2(
    glAccounts
      .filter((a) => a.accountType === "expense")
      .reduce((s, a) => s + a.endingBalance, 0),
  );
  const netProfit = round2(totalRevenue - totalExpense);

  const activeJournals = journals.filter((j) => j.status !== "void");
  const totalJournalDebit = round2(
    activeJournals.reduce((s, j) => s + j.totalDebit, 0),
  );
  const totalJournalCredit = round2(
    activeJournals.reduce((s, j) => s + j.totalCredit, 0),
  );

  const availableMonths = Array.from(
    new Set(
      yearMonthRows
        .map((r) => String(r.ym || "").trim())
        .filter((ym) => /^\d{4}-\d{2}$/.test(ym)),
    ),
  ).sort((a, b) => b.localeCompare(a));

  const currentYear = String(new Date().getFullYear());
  const availableYears = Array.from(
    new Set([
      currentYear,
      ...availableMonths.map((ym) => ym.slice(0, 4)),
    ]),
  ).sort((a, b) => b.localeCompare(a));

  return {
    selectedYear: periodFilter,
    availableYears,
    availableMonths,
    accounts: glAccounts,
    journals,
    categoryCounts,
    journalCounts,
    summary: {
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalRevenue,
      totalExpense,
      netProfit,
      totalJournalDebit,
      totalJournalCredit,
    },
  };
}
