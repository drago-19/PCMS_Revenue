import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  type CompanyId,
} from "./session-token";

// เวอร์ชัน schema — ต้อง bump ทุกครั้งที่เพิ่ม/แก้ DDL ไม่งั้นระบบจะข้ามการสร้างตาราง
const SCHEMA_VERSION = "2026-11-13-v60";

export type { CompanyId };

export const companyContextStorage = new AsyncLocalStorage<CompanyId>();

export function runWithCompany<T>(companyId: CompanyId, fn: () => T): T {
  return companyContextStorage.run(companyId, fn);
}

export async function getActiveCompanyId(): Promise<CompanyId> {
  const fromStorage = companyContextStorage.getStore();
  if (fromStorage === "seeheng" || fromStorage === "dragon19") {
    return fromStorage;
  }
  // บริษัทที่ใช้งานต้องมาจาก session ที่เซ็นชื่อเท่านั้น — ห้ามเชื่อ header จาก client
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const session = verifySessionToken(token);
    if (session?.companyId === "seeheng") {
      return "seeheng";
    }
  } catch {
    // Outside Next.js request context (e.g., CLI or unit tests)
  }
  return "dragon19";
}

function getSchemaSearchPathSql(companyId: CompanyId): string {
  return companyId === "seeheng"
    ? "SET LOCAL search_path TO seeheng, public"
    : "SET LOCAL search_path TO public";
}

const globalForDb = globalThis as unknown as {
  __pcmsRevenuePool?: Pool;
  __pcmsRevenueSchema?: Promise<void>;
  __pcmsRevenueSchemaVersion?: string;
};

type Queryable = Pool | PoolClient;

export type { Queryable };

function connectionConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return {
    host: process.env.PGHOST ?? "127.0.0.1",
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER ?? "postgres",
    password:
      process.env.PGPASSWORD ?? process.env.SUPABASE_POSTGRES_PASSWORD ?? "",
    database: process.env.PGDATABASE ?? "pcms_revenue",
  };
}

export function getPool(): Pool {
  if (!globalForDb.__pcmsRevenuePool) {
    const pool = new Pool({ ...connectionConfig(), max: 10 });
    pool.on("error", (error) => {
      console.error("postgres pool error", error);
    });
    globalForDb.__pcmsRevenuePool = pool;
  }
  return globalForDb.__pcmsRevenuePool;
}

export function ensureSchema(): Promise<void> {
  if (
    !globalForDb.__pcmsRevenueSchema ||
    globalForDb.__pcmsRevenueSchemaVersion !== SCHEMA_VERSION
  ) {
    globalForDb.__pcmsRevenueSchemaVersion = SCHEMA_VERSION;
    globalForDb.__pcmsRevenueSchema = (async () => {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("SELECT pg_advisory_lock(88192842)");
        try {
          // Fast-path: ตรวจสอบ version ในฐานข้อมูลเพื่อหลีกเลี่ยงการรัน DDL 1,200 บรรทัดซ้ำทุกครั้งที่สตาร์ท
          await client.query(`
            CREATE TABLE IF NOT EXISTS app_schema_version (
              schema_name TEXT PRIMARY KEY,
              version TEXT NOT NULL,
              applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
          `);
          const { rows } = await client.query<{
            schema_name: string;
            version: string;
          }>(
            `SELECT schema_name, version FROM app_schema_version WHERE schema_name IN ('public', 'seeheng')`,
          );
          const publicVer = rows.find((r) => r.schema_name === "public")?.version;
          const seehengVer = rows.find((r) => r.schema_name === "seeheng")?.version;
          const { rows: tableCheck } = await client.query<{ has_coa: boolean }>(
            `SELECT (
               EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chart_of_accounts')
               AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'seeheng' AND table_name = 'chart_of_accounts')
             ) AS has_coa`,
          );
          if (
            publicVer === SCHEMA_VERSION &&
            seehengVer === SCHEMA_VERSION &&
            tableCheck[0]?.has_coa
          ) {
            return;
          }

        await client.query("SET search_path TO public");
        await client.query(SCHEMA_SQL);
        const { reconcileAndSyncThreeFiles, refreshSummaryTables, saveOmsOrdersBatch } = await import("./ingest/import-service");
        const { detectAndParseOmsInput } = await import("./ingest/oms-parse");
        const { decompressFileBlob } = await import("./file-blob");
        const accImportsPublic = await client.query<{
          id: number;
          filename: string;
          file_blob: Buffer | null;
        }>(
          `SELECT id, filename, file_blob
           FROM imports
           WHERE (filename ILIKE '%line%ปี%' OR filename ILIKE '%บัญชี%')
             AND (is_accounting = 0 OR order_count = 0 OR NOT EXISTS (
               SELECT 1 FROM oms_orders o WHERE o.accounting_import_id = imports.id
             ))`,
        );
        for (const imp of accImportsPublic.rows) {
          if (imp.file_blob) {
            const buf = decompressFileBlob(imp.file_blob);
            if (buf) {
              const reParsed = await detectAndParseOmsInput(buf);
              if (reParsed && reParsed.fileType === "oms_orders" && reParsed.orders.length > 0) {
                const paidDates = reParsed.orders
                  .map((o) => o.paidDate || o.createdDate || o.printedDate)
                  .filter(Boolean)
                  .sort();
                const periodStart = paidDates[0] ?? null;
                const periodEnd = paidDates[paidDates.length - 1] ?? null;
                await client.query(
                  `UPDATE imports
                   SET is_accounting = 1,
                       row_count = $2,
                       order_count = $2,
                       period_start = COALESCE($3, period_start),
                       period_end = COALESCE($4, period_end),
                       status = 'ok'
                   WHERE id = $1`,
                  [imp.id, reParsed.orders.length, periodStart, periodEnd],
                );
                await saveOmsOrdersBatch(reParsed.orders, Number(imp.id), client, {
                  isAccounting: true,
                });
                await reconcileAndSyncThreeFiles(client, Number(imp.id), new Date().toISOString());
              } else {
                await client.query(`UPDATE imports SET is_accounting = 1 WHERE id = $1`, [imp.id]);
              }
            } else {
              await client.query(`UPDATE imports SET is_accounting = 1 WHERE id = $1`, [imp.id]);
            }
          } else {
            await client.query(`UPDATE imports SET is_accounting = 1 WHERE id = $1`, [imp.id]);
          }
        }
        const misclassifiedLineFromFb = await client.query<{
          order_uid: string;
          paid_date: string;
        }>(
          `UPDATE oms_orders o
           SET channel = 'LINE',
               updated_at = now()
           WHERE o.channel = 'Facebook'
             AND o.accounting_import_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM imports imp
               WHERE imp.id = o.accounting_import_id
                 AND imp.filename ILIKE '%line%'
             )
             AND o.note IS NOT NULL
             AND LOWER(BTRIM(o.note)) LIKE 'line%'
           RETURNING o.order_uid, o.paid_date`,
        );
        if (misclassifiedLineFromFb.rows.length > 0) {
          const fixedUids = misclassifiedLineFromFb.rows.map((r) => String(r.order_uid));
          await client.query(
            `UPDATE oms_order_items SET channel = 'LINE' WHERE order_uid = ANY($1::text[]) AND channel <> 'LINE'`,
            [fixedUids],
          );
          await client.query(
            `UPDATE transactions SET channel = 'LINE' WHERE oms_order_uid = ANY($1::text[]) AND is_order = 1 AND channel <> 'LINE'`,
            [fixedUids],
          );
          await client.query(
            `UPDATE invoice_registry SET seq = NULL WHERE order_id = ANY($1::text[]) AND channel <> 'LINE'`,
            [fixedUids],
          );
          await reconcileAndSyncThreeFiles(client, 0, new Date().toISOString());
          await refreshSummaryTables(client, {
            dates: misclassifiedLineFromFb.rows.map((r) => String(r.paid_date)).filter(Boolean),
          });
        }

        const missingSyncPublic = await client.query<{ paid_date: string }>(
          `SELECT DISTINCT o.paid_date
           FROM oms_orders o
           WHERE o.channel = 'Facebook'
             AND o.sales_amount > 0
             AND o.paid_date IS NOT NULL AND o.paid_date <> ''
             AND NOT EXISTS (
               SELECT 1 FROM transactions t
               WHERE t.is_order = 1 AND t.oms_order_uid = o.order_uid
             )
           UNION
           SELECT DISTINCT t.paid_date
           FROM transactions t
           WHERE t.is_order = 1
             AND t.channel = 'LINE'
             AND t.income > 0
             AND (t.link_priority = 1 OR t.shop_name IS NULL OR t.shop_name = '')`,
        );
        if (missingSyncPublic.rows.length > 0) {
          await reconcileAndSyncThreeFiles(client, 0, new Date().toISOString());
          await refreshSummaryTables(client, {
            dates: missingSyncPublic.rows.map((r) => String(r.paid_date)).filter(Boolean),
          });
        }

        // LINE OA & Facebook: อนุญาตให้ออกใบกำกับภาษีเฉพาะออเดอร์ที่มีชื่ออยู่ในไฟล์สรุปจากฝ่ายบัญชี (accounting_import_id IS NOT NULL) เท่านั้น
        const cleanupPendingAccInvoices = async () => {
          await client.query(
            `UPDATE invoice_registry r
             SET status = 'void',
                 voided_at = now(),
                 void_reason = 'รอไฟล์สรุปจากฝ่ายบัญชีอนุมัติ'
             WHERE r.channel IN ('LINE', 'Facebook')
               AND r.status = 'active'
               AND NOT EXISTS (
                 SELECT 1 FROM transactions t
                 JOIN oms_orders oa ON oa.order_uid = t.oms_order_uid
                 WHERE t.external_id = r.order_id
                   AND oa.accounting_import_id IS NOT NULL
               )`,
          );
        };
        await cleanupPendingAccInvoices();

        await client.query(
          `INSERT INTO app_schema_version (schema_name, version, applied_at)
           VALUES ('public', $1, now())
           ON CONFLICT (schema_name) DO UPDATE SET version = EXCLUDED.version, applied_at = now()`,
          [SCHEMA_VERSION],
        );

        await client.query("CREATE SCHEMA IF NOT EXISTS seeheng");
        await client.query("SET search_path TO seeheng, public");
        await client.query(SCHEMA_SQL);
        const missingSyncSeeheng = await client.query<{ paid_date: string }>(
          `SELECT DISTINCT o.paid_date
           FROM oms_orders o
           WHERE o.channel = 'Facebook'
             AND o.sales_amount > 0
             AND o.paid_date IS NOT NULL AND o.paid_date <> ''
             AND NOT EXISTS (
               SELECT 1 FROM transactions t
               WHERE t.is_order = 1 AND t.oms_order_uid = o.order_uid
             )
           UNION
           SELECT DISTINCT t.paid_date
           FROM transactions t
           WHERE t.is_order = 1
             AND t.channel = 'LINE'
             AND t.income > 0
             AND (t.link_priority = 1 OR t.shop_name IS NULL OR t.shop_name = '')`,
        );
        if (missingSyncSeeheng.rows.length > 0) {
          await reconcileAndSyncThreeFiles(client, 0, new Date().toISOString());
          await refreshSummaryTables(client, {
            dates: missingSyncSeeheng.rows.map((r) => String(r.paid_date)).filter(Boolean),
          });
        }
        await cleanupPendingAccInvoices();
        await client.query(
          `INSERT INTO public.app_schema_version (schema_name, version, applied_at)
           VALUES ('seeheng', $1, now())
           ON CONFLICT (schema_name) DO UPDATE SET version = EXCLUDED.version, applied_at = now()`,
          [SCHEMA_VERSION],
        );

        await client.query("SET search_path TO public");
        } finally {
          await client.query("SELECT pg_advisory_unlock(88192842)").catch(() => {});
        }
      } finally {
        client.release();
      }
    })().catch((err) => {
      globalForDb.__pcmsRevenueSchema = undefined;
      globalForDb.__pcmsRevenueSchemaVersion = undefined;
      throw err;
    });
  }
  return globalForDb.__pcmsRevenueSchema;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  db?: Queryable,
): Promise<T[]> {
  if (!db) {
    await ensureSchema();
  }
  const target = db ?? getPool();
  if (target === getPool()) {
    const companyId = await getActiveCompanyId();
    if (companyId === "seeheng") {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await client.query(getSchemaSearchPathSql("seeheng"));
        const result = await client.query<T>(text, params as never[]);
        await client.query("COMMIT");
        return result.rows;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }
  }
  const result = await target.query<T>(text, params as never[]);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  db?: Queryable,
): Promise<T | null> {
  const rows = await query<T>(text, params, db);
  return rows[0] ?? null;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  companyOverride?: CompanyId,
): Promise<T> {
  await ensureSchema();
  const companyId = companyOverride ?? (await getActiveCompanyId());
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(getSchemaSearchPathSql(companyId));
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function buildOrderShippingPositiveSql(alias = "t"): string {
  const p = alias ? `${alias}.` : "";
  return `(
    CASE
      WHEN ${p}is_order <> 1 THEN 0
      WHEN ${p}channel IN ('Shopee', 'Facebook', 'Lazada', 'LINE', 'Other') THEN
        GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'shippingCustomerFee')::numeric, 0))
      ELSE
        GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'shippingCustomerFee')::numeric, 0))
        + GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'shippingPlatformDiscount')::numeric, 0))
        + GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'shippingSubsidy')::numeric, 0))
        + GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'guaranteeReimbursement')::numeric, 0))
        + GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'exchangeShipping')::numeric, 0))
        + GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'replacementShipping')::numeric, 0))
        + GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'shippingRefund')::numeric, 0))
        + CASE
            WHEN ${p}transaction_type <> 'คำสั่งซื้อ (OMS)' THEN
              GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'shippingActual')::numeric, 0))
              + GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'returnShippingActual')::numeric, 0))
            ELSE 0
          END
    END
  )`;
}

export function buildOrderShippingNegativeSql(alias = "t"): string {
  const p = alias ? `${alias}.` : "";
  return `(
    CASE
      WHEN ${p}is_order <> 1 OR ${p}channel IN ('Shopee', 'Facebook', 'Lazada', 'LINE', 'Other') THEN 0
      ELSE
        LEAST(0, COALESCE((${p}normalized_json->'fields'->>'shippingCustomerFee')::numeric, 0))
        + LEAST(0, COALESCE((${p}normalized_json->'fields'->>'shippingPlatformDiscount')::numeric, 0))
        + LEAST(0, COALESCE((${p}normalized_json->'fields'->>'shippingSubsidy')::numeric, 0))
        + LEAST(0, COALESCE((${p}normalized_json->'fields'->>'guaranteeReimbursement')::numeric, 0))
        + LEAST(0, COALESCE((${p}normalized_json->'fields'->>'exchangeShipping')::numeric, 0))
        + LEAST(0, COALESCE((${p}normalized_json->'fields'->>'replacementShipping')::numeric, 0))
        + LEAST(0, COALESCE((${p}normalized_json->'fields'->>'shippingRefund')::numeric, 0))
        + CASE
            WHEN ${p}transaction_type <> 'คำสั่งซื้อ (OMS)' THEN
              LEAST(0, COALESCE((${p}normalized_json->'fields'->>'shippingActual')::numeric, 0))
              + LEAST(0, COALESCE((${p}normalized_json->'fields'->>'returnShippingActual')::numeric, 0))
            ELSE 0
          END
    END
  )`;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS imports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  filename TEXT NOT NULL,
  file_hash TEXT NOT NULL UNIQUE,
  file_size INTEGER NOT NULL DEFAULT 0,
  imported_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL DEFAULT 'upload',
  sheet_name TEXT,
  header_row INTEGER,
  period_start TEXT,
  period_end TEXT,
  timezone TEXT,
  currency TEXT,
  header_signature TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  row_count INTEGER NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  warnings_json JSONB NOT NULL DEFAULT '[]',
  mapping_json JSONB NOT NULL DEFAULT '[]',
  unknown_columns_json JSONB NOT NULL DEFAULT '[]',
  report_json JSONB NOT NULL DEFAULT '{}',
  reconciliation_json JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id BIGINT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  is_order INTEGER NOT NULL DEFAULT 0,
  created_date TEXT NOT NULL DEFAULT '',
  paid_date TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'THB',
  income DOUBLE PRECISION NOT NULL DEFAULT 0,
  fee_total DOUBLE PRECISION NOT NULL DEFAULT 0,
  adjustment DOUBLE PRECISION NOT NULL DEFAULT 0,
  payout DOUBLE PRECISION NOT NULL DEFAULT 0,
  related_order_id TEXT,
  product_detail TEXT,
  weight_estimated DOUBLE PRECISION,
  weight_charged DOUBLE PRECISION,
  checks_json JSONB NOT NULL DEFAULT '{}',
  warnings_json JSONB NOT NULL DEFAULT '[]',
  normalized_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_transactions_key
  ON transactions(external_id, transaction_type, paid_date);
CREATE UNIQUE INDEX IF NOT EXISTS ux_transactions_order
  ON transactions(external_id) WHERE is_order = 1;
CREATE INDEX IF NOT EXISTS ix_transactions_paid_date ON transactions(paid_date);
CREATE INDEX IF NOT EXISTS ix_transactions_import ON transactions(import_id);

CREATE SEQUENCE IF NOT EXISTS invoice_seq;

CREATE TABLE IF NOT EXISTS invoice_registry (
  order_id TEXT PRIMARY KEY,
  invoice_no TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ล็อกเลขที่ใบกำกับฯ (ออกแล้วห้ามเปลี่ยน): เก็บ yymm/seq เป็นคอลัมน์จริง + สถานะ void แทนการลบ (Backward Compatible: nullable ก่อน)
ALTER TABLE invoice_registry ADD COLUMN IF NOT EXISTS yymm TEXT;
ALTER TABLE invoice_registry ADD COLUMN IF NOT EXISTS seq BIGINT;
ALTER TABLE invoice_registry ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'TikTok';
ALTER TABLE invoice_registry ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE invoice_registry ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE invoice_registry ADD COLUMN IF NOT EXISTS void_reason TEXT;
UPDATE invoice_registry
SET yymm = SUBSTRING(invoice_no FROM 5 FOR 4),
    seq = SUBSTRING(invoice_no FROM 10)::bigint
WHERE seq IS NULL AND invoice_no ~ '^SEQ/[0-9]{4}/[0-9]{1,15}$';
UPDATE invoice_registry SET channel = 'TikTok' WHERE channel IS NULL OR channel = '';
DROP INDEX IF EXISTS ux_invoice_registry_yymm_seq;
CREATE INDEX IF NOT EXISTS ix_invoice_registry_print
  ON invoice_registry (yymm, status, channel, seq) INCLUDE (order_id);
CREATE INDEX IF NOT EXISTS ix_invoice_registry_print_all
  ON invoice_registry (yymm, status, seq) INCLUDE (order_id, channel);
CREATE TABLE IF NOT EXISTS invoice_registry_audit (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  invoice_no TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  import_id INTEGER,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_invoice_registry_audit_order ON invoice_registry_audit (order_id);

ALTER TABLE imports ADD COLUMN IF NOT EXISTS file_type TEXT NOT NULL DEFAULT 'settlement';
ALTER TABLE imports ADD COLUMN IF NOT EXISTS file_blob BYTEA;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS is_accounting INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'TikTok';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS order_code TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS oms_order_uid TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS buyer_name TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS buyer_tax_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS buyer_address TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shop_name TEXT;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM transactions
    WHERE (
      is_order = 1
      AND channel = 'Facebook'
      AND COALESCE((normalized_json->'fields'->>'productAfterDiscount')::numeric, 0) <= 0
      AND COALESCE((normalized_json->'fields'->>'productBeforeDiscount')::numeric, 0) <= 0
      AND link_priority = 0
    ) OR (
      is_order = 0
      AND transaction_type IN ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์')
      AND payout > 0
      AND link_priority <> 0
    )
    LIMIT 1
  ) OR EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = 'transactions'::regclass
      AND a.attname = 'link_priority'
      AND pg_get_expr(d.adbin, d.adrelid) NOT LIKE '%4%'
  ) THEN
    ALTER TABLE transactions DROP COLUMN link_priority;
  END IF;
EXCEPTION WHEN undefined_column THEN
  NULL;
END $$;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS link_priority SMALLINT GENERATED ALWAYS AS (
  CASE
    WHEN (
      channel = 'Facebook'
      AND COALESCE((normalized_json->'fields'->>'productAfterDiscount')::numeric, 0) <= 0
      AND COALESCE((normalized_json->'fields'->>'productBeforeDiscount')::numeric, 0) <= 0
    ) THEN 3
    WHEN (
      is_order = 0
      AND transaction_type IN ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์')
      AND payout > 0
    ) THEN 0
    WHEN (
      order_code IS NOT NULL AND order_code <> ''
      AND (
        (transaction_type <> 'คำสั่งซื้อ (OMS)' AND product_detail LIKE '%·%')
        OR (channel = 'Lazada' AND NULLIF(product_detail, '') IS NOT NULL AND product_detail <> '/')
        OR (channel IN ('Shopee', 'Facebook', 'LINE', 'Other') AND product_detail LIKE '%·%')
      )
    ) THEN 0
    WHEN (
      order_code IS NOT NULL AND order_code <> ''
      AND (transaction_type = 'คำสั่งซื้อ (OMS)' AND channel IN ('TikTok', 'LINE'))
    ) THEN 1
    WHEN (
      order_code IS NOT NULL AND order_code <> ''
    ) THEN 4
    ELSE 2
  END
) STORED;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipping_positive DOUBLE PRECISION GENERATED ALWAYS AS (
  ${buildOrderShippingPositiveSql("")}
) STORED;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipping_negative DOUBLE PRECISION GENERATED ALWAYS AS (
  ${buildOrderShippingNegativeSql("")}
) STORED;

CREATE INDEX IF NOT EXISTS ix_transactions_channel ON transactions(channel);
CREATE INDEX IF NOT EXISTS ix_transactions_order_code ON transactions(order_code);
CREATE INDEX IF NOT EXISTS ix_transactions_oms_order_uid ON transactions(oms_order_uid);
CREATE INDEX IF NOT EXISTS ix_transactions_shop_name ON transactions(shop_name);
CREATE INDEX IF NOT EXISTS ix_transactions_shop_order ON transactions(shop_name, is_order);

CREATE TABLE IF NOT EXISTS oms_orders (
  order_uid TEXT PRIMARY KEY,
  order_code TEXT NOT NULL,
  import_id BIGINT REFERENCES imports(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'TikTok',
  customer_name TEXT,
  customer_phone TEXT,
  contact_name TEXT,
  courier TEXT,
  shipping_fee_customer DOUBLE PRECISION NOT NULL DEFAULT 0,
  shipping_fee_seller DOUBLE PRECISION NOT NULL DEFAULT 0,
  province TEXT,
  bank TEXT,
  tracking_no TEXT,
  note TEXT,
  created_by TEXT,
  created_date TEXT NOT NULL DEFAULT '',
  paid_date TEXT NOT NULL DEFAULT '',
  printed_date TEXT NOT NULL DEFAULT '',
  marketplace_order_raw TEXT,
  marketplace_order_norm TEXT,
  marketplace_order_prefix TEXT,
  marketplace_order_float DOUBLE PRECISION,
  discount_code TEXT,
  discount_total DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_qty INTEGER NOT NULL DEFAULT 0,
  sales_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  profit_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  matched_external_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE oms_orders ADD COLUMN IF NOT EXISTS order_uid TEXT;
ALTER TABLE oms_orders ADD COLUMN IF NOT EXISTS shop_name TEXT;
ALTER TABLE oms_orders ADD COLUMN IF NOT EXISTS accounting_import_id BIGINT;
ALTER TABLE oms_orders ADD COLUMN IF NOT EXISTS accounting_sales_amount DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS ix_oms_orders_acc_import ON oms_orders(accounting_import_id) WHERE accounting_import_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_oms_orders_order_code ON oms_orders(order_code);
CREATE INDEX IF NOT EXISTS ix_oms_orders_shop_name ON oms_orders(shop_name);
CREATE INDEX IF NOT EXISTS ix_oms_orders_mp_norm ON oms_orders(marketplace_order_norm);
CREATE INDEX IF NOT EXISTS ix_oms_orders_mp_prefix ON oms_orders(marketplace_order_prefix);
CREATE INDEX IF NOT EXISTS ix_oms_orders_matched_ext ON oms_orders(matched_external_id);
CREATE INDEX IF NOT EXISTS ix_oms_orders_paid_date ON oms_orders(paid_date);
CREATE INDEX IF NOT EXISTS ix_oms_orders_channel ON oms_orders(channel);
CREATE INDEX IF NOT EXISTS ix_oms_orders_import ON oms_orders(import_id);
CREATE INDEX IF NOT EXISTS ix_oms_orders_unmatched ON oms_orders(order_code)
  WHERE matched_external_id IS NULL;

CREATE TABLE IF NOT EXISTS oms_order_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id BIGINT REFERENCES imports(id) ON DELETE CASCADE,
  order_uid TEXT NOT NULL DEFAULT '',
  order_code TEXT NOT NULL,
  line_no INTEGER NOT NULL DEFAULT 1,
  sku_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  order_sales_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  shipping_fee_customer DOUBLE PRECISION NOT NULL DEFAULT 0,
  sender_name TEXT,
  customer_name TEXT,
  customer_address TEXT,
  postal_code TEXT,
  customer_phone TEXT,
  paid_date TEXT NOT NULL DEFAULT '',
  created_date TEXT NOT NULL DEFAULT '',
  courier TEXT,
  channel TEXT NOT NULL DEFAULT 'TikTok',
  bank TEXT,
  note TEXT,
  tracking_no TEXT,
  UNIQUE(order_uid, line_no)
);

ALTER TABLE oms_order_items ADD COLUMN IF NOT EXISTS order_uid TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS ix_oms_items_order_uid ON oms_order_items(order_uid);
CREATE INDEX IF NOT EXISTS ix_oms_items_order_code ON oms_order_items(order_code);
CREATE INDEX IF NOT EXISTS ix_oms_items_sku_code ON oms_order_items(sku_code);
CREATE INDEX IF NOT EXISTS ix_oms_items_import ON oms_order_items(import_id);
CREATE INDEX IF NOT EXISTS ix_oms_items_paid_date ON oms_order_items(paid_date);
CREATE INDEX IF NOT EXISTS ix_oms_items_created_date ON oms_order_items(created_date);

CREATE TABLE IF NOT EXISTS products (
  sku_code TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  default_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS initial_stock INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGSERIAL PRIMARY KEY,
  sku_code TEXT NOT NULL REFERENCES products(sku_code) ON DELETE CASCADE,
  movement_type TEXT NOT NULL DEFAULT 'in',
  quantity INTEGER NOT NULL DEFAULT 0,
  cost_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  movement_date TEXT NOT NULL DEFAULT '',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_stock_movements_sku ON stock_movements(sku_code);
CREATE INDEX IF NOT EXISTS ix_stock_movements_date ON stock_movements(movement_date);

CREATE TABLE IF NOT EXISTS daily_summaries (
  paid_date TEXT PRIMARY KEY,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  order_payout DOUBLE PRECISION NOT NULL DEFAULT 0,
  order_income DOUBLE PRECISION NOT NULL DEFAULT 0,
  order_fees DOUBLE PRECISION NOT NULL DEFAULT 0,
  other_count INTEGER NOT NULL DEFAULT 0,
  other_payout DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_payout DOUBLE PRECISION NOT NULL DEFAULT 0,
  adjustment DOUBLE PRECISION NOT NULL DEFAULT 0,
  tiktok_count INTEGER NOT NULL DEFAULT 0,
  shopee_count INTEGER NOT NULL DEFAULT 0,
  facebook_count INTEGER NOT NULL DEFAULT 0,
  linked_count INTEGER NOT NULL DEFAULT 0,
  oms_only_count INTEGER NOT NULL DEFAULT 0,
  unlinked_count INTEGER NOT NULL DEFAULT 0,
  mismatch_count INTEGER NOT NULL DEFAULT 0,
  shipping_positive DOUBLE PRECISION NOT NULL DEFAULT 0,
  shipping_negative DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS linked_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS oms_only_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS unlinked_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS mismatch_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS shipping_positive DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS shipping_negative DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS line_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS lazada_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS other_channel_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS compensation_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS sku_summaries (
  sku_code TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  total_qty INTEGER NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  gross_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  net_sales_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  tiktok_qty INTEGER NOT NULL DEFAULT 0,
  shopee_qty INTEGER NOT NULL DEFAULT 0,
  facebook_qty INTEGER NOT NULL DEFAULT 0,
  lazada_qty INTEGER NOT NULL DEFAULT 0,
  line_qty INTEGER NOT NULL DEFAULT 0,
  other_qty INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sku_summaries ADD COLUMN IF NOT EXISTS lazada_qty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sku_summaries ADD COLUMN IF NOT EXISTS line_qty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sku_summaries ADD COLUMN IF NOT EXISTS other_qty INTEGER NOT NULL DEFAULT 0;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS ix_transactions_order_paid_ext
  ON transactions(paid_date DESC, external_id DESC)
  WHERE is_order = 1;

DROP INDEX IF EXISTS ix_transactions_order_paid_priority_ext;
CREATE INDEX IF NOT EXISTS ix_transactions_order_paid_priority_ext_v2
  ON transactions(paid_date DESC, link_priority ASC, external_id DESC)
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_channel_paid_priority_ext
  ON transactions(channel, paid_date DESC, link_priority ASC, external_id DESC)
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_link_paid_priority_ext
  ON transactions(link_priority, paid_date DESC, external_id DESC)
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_channel_link_paid_ext
  ON transactions(channel, link_priority, paid_date DESC, external_id DESC)
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_orders_summary_cover
  ON transactions(channel, link_priority, paid_date)
  INCLUDE (income, fee_total, payout, shipping_positive, shipping_negative)
  WHERE is_order = 1 AND income > 0;

CREATE INDEX IF NOT EXISTS ix_transactions_channel_paid_ext
  ON transactions(channel, paid_date DESC, external_id DESC)
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_unlinked_created_date
  ON transactions(paid_date, created_date DESC)
  WHERE is_order = 1
    AND (order_code IS NULL OR order_code = '')
    AND created_date <> ''
    AND created_date <> 'unknown';

CREATE INDEX IF NOT EXISTS ix_transactions_unlinked_created_date_v2
  ON transactions(created_date DESC, channel, paid_date)
  WHERE is_order = 1
    AND (order_code IS NULL OR order_code = '')
    AND created_date <> ''
    AND created_date <> 'unknown';

CREATE INDEX IF NOT EXISTS ix_transactions_order_payout
  ON transactions(payout DESC, external_id DESC)
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_order_income
  ON transactions(income DESC, external_id DESC)
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_non_positive_income
  ON transactions(paid_date, channel, income, fee_total, payout)
  WHERE is_order = 1 AND income <= 0;

CREATE INDEX IF NOT EXISTS ix_transactions_non_positive_cover
  ON transactions(paid_date, channel, link_priority)
  INCLUDE (income, fee_total, payout, shipping_positive, shipping_negative)
  WHERE is_order = 1 AND income <= 0;

CREATE INDEX IF NOT EXISTS ix_transactions_non_pos_or_payout_cover
  ON transactions(paid_date, channel, link_priority)
  INCLUDE (income, fee_total, payout, shipping_positive, shipping_negative)
  WHERE is_order = 1 AND (income <= 0 OR payout <= 0);

CREATE INDEX IF NOT EXISTS ix_transactions_shop_paid_cover
  ON transactions(paid_date, shop_name, link_priority)
  INCLUDE (income, payout, fee_total)
  WHERE (is_order = 1) OR (is_order = 0 AND transaction_type IN ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์') AND payout > 0);

CREATE INDEX IF NOT EXISTS ix_transactions_order_fee
  ON transactions(ABS(fee_total) DESC, external_id DESC)
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_order_mismatch
  ON transactions(paid_date DESC, external_id DESC)
  WHERE is_order = 1
    AND (
      ABS(COALESCE((checks_json->>'incomeDiff')::numeric, 0)) >= 0.01
      OR ABS(COALESCE((checks_json->>'feeDiff')::numeric, 0)) >= 0.01
      OR ABS(COALESCE((checks_json->>'payoutDiff')::numeric, 0)) >= 0.01
    );

CREATE INDEX IF NOT EXISTS ix_transactions_search_trgm
  ON transactions USING gin (
    (external_id || ' ' || COALESCE(order_code, '') || ' ' || COALESCE(product_detail, '')) gin_trgm_ops
  )
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_ext_prefix15
  ON transactions(LEFT(external_id, 15))
  WHERE is_order = 1 AND transaction_type <> 'คำสั่งซื้อ (OMS)';

CREATE INDEX IF NOT EXISTS ix_transactions_oms_temp
  ON transactions(order_code)
  WHERE transaction_type = 'คำสั่งซื้อ (OMS)';

CREATE INDEX IF NOT EXISTS ix_transactions_missing_product_detail
  ON transactions(order_code)
  WHERE is_order = 1
    AND order_code IS NOT NULL
    AND order_code <> ''
    AND product_detail IS NULL;

CREATE INDEX IF NOT EXISTS ix_sku_summaries_sort
  ON sku_summaries(total_qty DESC, net_sales_amount DESC, sku_code ASC);

CREATE INDEX IF NOT EXISTS ix_sku_summaries_trgm
  ON sku_summaries USING gin (
    (sku_code || ' ' || product_name) gin_trgm_ops
  );

CREATE TABLE IF NOT EXISTS app_users (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}',
  updated_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- การเชื่อมต่อแพลตฟอร์มผ่าน Open API (แยกจากตาราง transactions/oms_orders เดิมโดยสิ้นเชิง)
-- หนึ่งแถว = หนึ่งร้านที่ authorize ไว้; credential ของ app เก็บใน app_settings (คีย์ platform_api)
CREATE TABLE IF NOT EXISTS platform_accounts (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  account_key TEXT NOT NULL,
  shop_id TEXT,
  shop_cipher TEXT,
  shop_name TEXT,
  seller_name TEXT,
  region TEXT,
  access_token TEXT,
  refresh_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  granted_scopes TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  connected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, account_key)
);

-- ข้อมูลที่ดึงจากแพลตฟอร์มมาเก็บไว้ทำรายงาน (แยกจากตารางบิลเดิมโดยสิ้นเชิง)
CREATE TABLE IF NOT EXISTS platform_statements (
  platform TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  statement_id TEXT NOT NULL,
  statement_time TIMESTAMPTZ,
  settlement_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  revenue_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  fee_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  adjustment_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  payment_status TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, shop_id, statement_id)
);

CREATE TABLE IF NOT EXISTS platform_orders (
  platform TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  order_status TEXT,
  create_time TIMESTAMPTZ,
  paid_time TIMESTAMPTZ,
  shipped_time TIMESTAMPTZ,
  delivered_time TIMESTAMPTZ,
  cancelled_time TIMESTAMPTZ,
  cancel_reason TEXT,
  cancel_user TEXT,
  currency TEXT,
  total_amount NUMERIC(14,2),
  tracking_number TEXT,
  shipping_provider TEXT,
  raw_json JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, shop_id, order_id)
);

-- ข้อมูลผู้รับจาก API — TikTok ปิดชื่อ/เบอร์/บ้านเลขที่ให้ออเดอร์ที่ส่งผ่านขนส่งของ TikTok
-- แต่จังหวัดกับอำเภอยังอ่านได้เต็ม ใช้ตอบคำถาม "ลูกค้าอยู่จังหวัดไหนซื้อเยอะสุด"
ALTER TABLE platform_orders ADD COLUMN IF NOT EXISTS buyer_user_id TEXT;
ALTER TABLE platform_orders ADD COLUMN IF NOT EXISTS recipient_name TEXT;
ALTER TABLE platform_orders ADD COLUMN IF NOT EXISTS recipient_phone TEXT;
ALTER TABLE platform_orders ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE platform_orders ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE platform_orders ADD COLUMN IF NOT EXISTS postal_code TEXT;

-- เติมย้อนหลังให้แถวที่ดึงมาก่อนมีคอลัมน์ — แถวที่เติมแล้วจะถูกข้าม จึงรันซ้ำได้ทุกครั้งที่เปิดระบบ
UPDATE platform_orders SET
  buyer_user_id = raw_json->>'user_id',
  recipient_name = raw_json->'recipient_address'->>'name',
  recipient_phone = raw_json->'recipient_address'->>'phone_number',
  postal_code = raw_json->'recipient_address'->>'postal_code',
  province = (
    SELECT elem->>'address_name'
    FROM jsonb_array_elements(COALESCE(raw_json->'recipient_address'->'district_info', '[]'::jsonb)) AS elem
    WHERE elem->>'address_level' = 'L1'
    LIMIT 1
  ),
  district = (
    SELECT elem->>'address_name'
    FROM jsonb_array_elements(COALESCE(raw_json->'recipient_address'->'district_info', '[]'::jsonb)) AS elem
    WHERE elem->>'address_level' = 'L2'
    LIMIT 1
  )
WHERE province IS NULL
  AND COALESCE(raw_json->'recipient_address'->>'name', '') <> '';

CREATE TABLE IF NOT EXISTS platform_order_items (
  platform TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  line_item_id TEXT NOT NULL,
  sku_id TEXT,
  product_name TEXT,
  sku_name TEXT,
  image_url TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  sale_price NUMERIC(14,2),
  currency TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, shop_id, order_id, line_item_id)
);

CREATE TABLE IF NOT EXISTS platform_packages (
  platform TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  package_id TEXT NOT NULL,
  status TEXT,
  create_time TIMESTAMPTZ,
  update_time TIMESTAMPTZ,
  tracking_number TEXT,
  shipping_provider TEXT,
  order_ids TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, shop_id, package_id)
);

-- สต็อกสินค้าจาก TikTok (ดึงตรง ไม่ผ่าน Shipnity) + ประวัติการเปลี่ยนแปลง
CREATE TABLE IF NOT EXISTS platform_stock (
  shop_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  product_id TEXT,
  seller_sku TEXT,
  product_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  warehouses JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, sku_id)
);

CREATE TABLE IF NOT EXISTS platform_stock_movements (
  id BIGSERIAL PRIMARY KEY,
  shop_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  seller_sku TEXT,
  product_name TEXT,
  from_qty INTEGER,
  to_qty INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- เหตุการณ์พัสดุแบบละเอียดจาก Get Tracking (ถึงศูนย์คัดแยก/สาขา/นำส่ง)
CREATE TABLE IF NOT EXISTS platform_order_tracking (
  platform TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  action_code INTEGER,
  description TEXT NOT NULL,
  event_time TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, shop_id, order_id, event_time, description)
);

-- รายการเงินต่อออเดอร็จาก statement (ตัวเลขที่ใช้อ้างอิงภาษี)
CREATE TABLE IF NOT EXISTS platform_order_finance (
  platform TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  statement_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  transaction_type TEXT,
  order_create_time TIMESTAMPTZ,
  settlement_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  revenue_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  fee_and_tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  shipping_cost_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT,
  raw_json JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, shop_id, statement_id, order_id, transaction_type)
);

CREATE INDEX IF NOT EXISTS platform_orders_shop_time_idx ON platform_orders (shop_id, create_time DESC);
CREATE INDEX IF NOT EXISTS platform_orders_status_idx ON platform_orders (order_status);
CREATE INDEX IF NOT EXISTS platform_orders_order_id_idx ON platform_orders (order_id);
CREATE INDEX IF NOT EXISTS platform_orders_buyer_idx ON platform_orders (buyer_user_id);
CREATE INDEX IF NOT EXISTS platform_orders_province_idx ON platform_orders (province);
CREATE INDEX IF NOT EXISTS platform_order_items_order_idx ON platform_order_items (order_id);
CREATE INDEX IF NOT EXISTS platform_order_finance_time_idx ON platform_order_finance (shop_id, order_create_time DESC);
CREATE INDEX IF NOT EXISTS platform_order_finance_order_idx ON platform_order_finance (order_id);
CREATE INDEX IF NOT EXISTS platform_statements_time_idx ON platform_statements (shop_id, statement_time DESC);

CREATE TABLE IF NOT EXISTS platform_sync_runs (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  kind TEXT NOT NULL,
  range_from TIMESTAMPTZ,
  range_to TIMESTAMPTZ,
  rows_written INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  ip_key TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  ip_address TEXT NOT NULL DEFAULT 'unknown',
  outcome TEXT NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}',
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_logs_action ON audit_logs(action);

CREATE TABLE IF NOT EXISTS expense_categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT 'slate',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_expense_categories_sort ON expense_categories(sort_order ASC, id ASC);

CREATE TABLE IF NOT EXISTS monthly_expenses (
  year_month TEXT NOT NULL,
  category_id BIGINT NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (year_month, category_id)
);

CREATE INDEX IF NOT EXISTS ix_monthly_expenses_ym ON monthly_expenses(year_month);

CREATE TABLE IF NOT EXISTS expense_records (
  id BIGSERIAL PRIMARY KEY,
  entry_date TEXT NOT NULL,
  year_month TEXT NOT NULL,
  category_id BIGINT NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_expense_records_ym ON expense_records(year_month);
CREATE INDEX IF NOT EXISTS ix_expense_records_date ON expense_records(entry_date DESC);
CREATE INDEX IF NOT EXISTS ix_expense_records_cat ON expense_records(category_id);

ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS account_code TEXT NOT NULL DEFAULT '';
ALTER TABLE expense_records ADD COLUMN IF NOT EXISTS document_no TEXT NOT NULL DEFAULT '';
ALTER TABLE expense_records ADD COLUMN IF NOT EXISTS subtotal_amount DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE expense_records ADD COLUMN IF NOT EXISTS vat_type TEXT NOT NULL DEFAULT 'none';
ALTER TABLE expense_records ADD COLUMN IF NOT EXISTS vat_amount DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE expense_records ADD COLUMN IF NOT EXISTS wht_rate DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE expense_records ADD COLUMN IF NOT EXISTS wht_amount DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE expense_records ADD COLUMN IF NOT EXISTS net_paid_amount DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE expense_records ADD COLUMN IF NOT EXISTS vendor_name TEXT NOT NULL DEFAULT '';
ALTER TABLE expense_records ADD COLUMN IF NOT EXISTS vendor_tax_id TEXT NOT NULL DEFAULT '';
ALTER TABLE expense_records ADD COLUMN IF NOT EXISTS tax_invoice_no TEXT NOT NULL DEFAULT '';
ALTER TABLE expense_records ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'paid';
ALTER TABLE expense_records ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'transfer';
ALTER TABLE expense_records ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE expense_records ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE expense_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE expense_records
SET document_no = 'EXP' || REPLACE(entry_date, '-', '') || LPAD(id::text, 4, '0'),
    subtotal_amount = CASE WHEN subtotal_amount = 0 AND amount > 0 THEN amount ELSE subtotal_amount END,
    net_paid_amount = CASE WHEN net_paid_amount = 0 AND amount > 0 THEN amount ELSE net_paid_amount END
WHERE document_no = '' OR document_no IS NULL;

CREATE INDEX IF NOT EXISTS ix_expense_records_status ON expense_records(payment_status, entry_date DESC);
CREATE INDEX IF NOT EXISTS ix_expense_records_doc_no ON expense_records(document_no);

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id BIGSERIAL PRIMARY KEY,
  account_code TEXT NOT NULL UNIQUE,
  account_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  account_type TEXT NOT NULL DEFAULT 'expense',
  primary_group TEXT NOT NULL DEFAULT '',
  secondary_group TEXT NOT NULL DEFAULT '',
  normal_balance TEXT NOT NULL DEFAULT 'debit',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_chart_of_accounts_type_code ON chart_of_accounts(account_type, account_code);
CREATE INDEX IF NOT EXISTS ix_chart_of_accounts_sort ON chart_of_accounts(sort_order ASC, account_code ASC);

CREATE TABLE IF NOT EXISTS journal_entries (
  id BIGSERIAL PRIMARY KEY,
  document_no TEXT NOT NULL UNIQUE,
  journal_type TEXT NOT NULL DEFAULT 'JV',
  entry_date TEXT NOT NULL,
  year_month TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  reference_no TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  remarks TEXT NOT NULL DEFAULT '',
  total_debit DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_credit DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'approved',
  lines_json JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_journal_entries_date ON journal_entries(entry_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_journal_entries_ym ON journal_entries(year_month, journal_type);
CREATE INDEX IF NOT EXISTS ix_journal_entries_status ON journal_entries(status, entry_date DESC);

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs table is append-only (UPDATE and DELETE are prohibited)';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_logs_immutable' AND tgrelid = 'audit_logs'::regclass
  ) THEN
    CREATE TRIGGER trg_audit_logs_immutable
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
  END IF;

  -- Migrate oms_orders primary key from order_code to order_uid and oms_order_items unique constraint to (order_uid, line_no)
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'oms_orders'::regclass
      AND c.contype = 'p'
      AND a.attname = 'order_code'
  ) THEN
    UPDATE oms_orders
    SET order_uid = order_code || '|' || SUBSTRING(COALESCE(NULLIF(paid_date, ''), created_date) FROM 1 FOR 7) || '|' || COALESCE(NULLIF(NULLIF(tracking_no, '-'), '--'), NULLIF(paid_date, ''), created_date)
    WHERE order_uid IS NULL OR order_uid = '';

    ALTER TABLE oms_orders ALTER COLUMN order_uid SET NOT NULL;
    ALTER TABLE oms_orders DROP CONSTRAINT oms_orders_pkey;
    ALTER TABLE oms_orders ADD PRIMARY KEY (order_uid);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'oms_order_items'::regclass
      AND c.conname = 'oms_order_items_order_code_line_no_key'
  ) THEN
    UPDATE oms_order_items
    SET order_uid = order_code || '|' || SUBSTRING(COALESCE(NULLIF(paid_date, ''), created_date) FROM 1 FOR 7) || '|' || COALESCE(NULLIF(NULLIF(tracking_no, '-'), '--'), NULLIF(paid_date, ''), created_date)
    WHERE order_uid IS NULL OR order_uid = '';

    ALTER TABLE oms_order_items DROP CONSTRAINT oms_order_items_order_code_line_no_key;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = 'oms_order_items'::regclass
        AND c.conname = 'oms_order_items_order_uid_line_no_key'
    ) THEN
      ALTER TABLE oms_order_items ADD CONSTRAINT oms_order_items_order_uid_line_no_key UNIQUE (order_uid, line_no);
    END IF;
  END IF;

  -- Fast check on pre-aggregated summary tables only (never full-scan billion-row tables on startup)
  IF EXISTS (
    SELECT 1 FROM daily_summaries WHERE order_count > 0 AND linked_count = 0 AND oms_only_count = 0 AND unlinked_count = 0
  ) OR (
    EXISTS (SELECT 1 FROM daily_summaries WHERE order_count > 0)
    AND NOT EXISTS (SELECT 1 FROM daily_summaries WHERE shipping_positive <> 0 OR shipping_negative <> 0)
  ) THEN
    DELETE FROM oms_order_items WHERE COALESCE(NULLIF(channel, ''), 'TikTok') NOT IN ('TikTok', 'Shopee', 'Facebook', 'Lazada', 'LINE', 'Other');
    DELETE FROM oms_orders WHERE COALESCE(NULLIF(channel, ''), 'TikTok') NOT IN ('TikTok', 'Shopee', 'Facebook', 'Lazada', 'LINE', 'Other');
    DELETE FROM transactions WHERE COALESCE(NULLIF(channel, ''), 'TikTok') NOT IN ('TikTok', 'Shopee', 'Facebook', 'Lazada', 'LINE', 'Other');

    DELETE FROM products p
    WHERE NOT EXISTS (
      SELECT 1 FROM oms_order_items i WHERE i.sku_code = p.sku_code
    )
    AND (p.is_manual IS NOT TRUE)
    AND p.cost_price = 0 AND p.initial_stock = 0 AND p.stock_in = 0;

    -- เลขที่ใบกำกับฯ ล็อกแล้ว: ไม่ลบ → void แทน
    UPDATE invoice_registry r
    SET status = 'void', voided_at = now(), void_reason = 'ไม่พบออเดอร์ในระบบ'
    WHERE r.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM transactions t
        WHERE t.external_id = r.order_id
          AND (t.is_order = 1 OR (t.is_order = 0 AND t.transaction_type IN ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์') AND t.payout > 0))
      );

    DELETE FROM daily_summaries;
    INSERT INTO daily_summaries (
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
      SUM(CASE WHEN is_order = 1 AND COALESCE(NULLIF(channel, ''), 'TikTok') = 'TikTok' THEN 1 ELSE 0 END)::int,
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
      ROUND(COALESCE(SUM(${buildOrderShippingPositiveSql("")}), 0)::numeric, 2),
      ROUND(COALESCE(SUM(${buildOrderShippingNegativeSql("")}), 0)::numeric, 2),
      now()
    FROM transactions
    WHERE paid_date <> '' AND paid_date <> 'unknown'
      AND COALESCE(NULLIF(channel, ''), 'TikTok') IN ('TikTok', 'Shopee', 'Facebook', 'Lazada', 'LINE', 'Other')
    GROUP BY paid_date;

    DELETE FROM sku_summaries;
    WITH order_lines AS (
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
    GROUP BY i.sku_code;
  END IF;

  -- invoice_registry: แยกลำดับเลขที่ใบกำกับภาษีตามแพลตฟอร์ม (channel) ต่อเดือน (yymm, channel, seq)
  UPDATE invoice_registry r SET channel = t.channel FROM transactions t
  WHERE (r.channel IS NULL OR r.channel = '') AND t.external_id = r.order_id
    AND (t.is_order = 1 OR (t.is_order = 0 AND t.transaction_type IN ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์') AND t.payout > 0));
  UPDATE invoice_registry SET channel = 'TikTok' WHERE channel IS NULL OR channel = '';

  IF EXISTS (
    SELECT 1 FROM invoice_registry
    WHERE channel <> 'TikTok' AND invoice_no ~ '^SEQ/[0-9]{4}/'
    LIMIT 1
  ) THEN
    UPDATE invoice_registry
    SET invoice_no = 'MIG/' || order_id,
        seq = NULL
    WHERE seq IS NOT NULL;

    WITH ranked AS (
      SELECT r.order_id,
             r.yymm,
             COALESCE(NULLIF(r.channel, ''), 'TikTok') AS ch,
             ROW_NUMBER() OVER (
               PARTITION BY r.yymm, COALESCE(NULLIF(r.channel, ''), 'TikTok')
               ORDER BY COALESCE(NULLIF(t.paid_date, ''), NULLIF(t.created_date, ''), '9999-99-99') ASC,
                        r.order_id ASC
             ) AS new_seq
      FROM invoice_registry r
      LEFT JOIN transactions t ON t.external_id = r.order_id
        AND (t.is_order = 1 OR (t.is_order = 0 AND t.transaction_type IN ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์') AND t.payout > 0))
      WHERE r.yymm IS NOT NULL
    )
    UPDATE invoice_registry r
    SET seq = rk.new_seq,
        channel = rk.ch,
        invoice_no = CASE
          WHEN rk.ch = 'TikTok' THEN 'SEQ/' || rk.yymm || '/' || LPAD(rk.new_seq::text, GREATEST(5, LENGTH(rk.new_seq::text)), '0')
          ELSE 'SEQ/' || UPPER(rk.ch) || '/' || rk.yymm || '/' || LPAD(rk.new_seq::text, GREATEST(5, LENGTH(rk.new_seq::text)), '0')
        END
    FROM ranked rk
    WHERE r.order_id = rk.order_id;
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS ux_invoice_registry_yymm_channel_seq
    ON invoice_registry (yymm, channel, seq);

  -- Migrate document_settings to include per-platform channelInvoicePrefixes (TT for TikTok, SP for Shopee, FB for Facebook, LZ for Lazada, LN for LINE, OT for Other)
  IF EXISTS (
    SELECT 1 FROM app_settings
    WHERE setting_key = 'document_settings'
      AND (value_json->'channelInvoicePrefixes') IS NULL
  ) THEN
    UPDATE app_settings
    SET value_json = jsonb_set(
      jsonb_set(
        value_json,
        '{invoicePrefix}',
        to_jsonb(
          CASE
            WHEN COALESCE(value_json->>'invoicePrefix', '') ~ '^RF[0-9]'
              THEN REGEXP_REPLACE(value_json->>'invoicePrefix', '^RF', 'TT')
            WHEN COALESCE(value_json->>'invoicePrefix', '') = ''
              THEN 'TT2610/00001'
            ELSE value_json->>'invoicePrefix'
          END
        )
      ),
      '{channelInvoicePrefixes}',
      jsonb_build_object(
        'TikTok',
        CASE
          WHEN COALESCE(value_json->>'invoicePrefix', '') ~ '^RF[0-9]'
            THEN REGEXP_REPLACE(value_json->>'invoicePrefix', '^RF', 'TT')
          WHEN COALESCE(value_json->>'invoicePrefix', '') = ''
            THEN 'TT2610/00001'
          ELSE value_json->>'invoicePrefix'
        END,
        'Shopee', 'SP2610/00001',
        'Facebook', 'FB2610/00001',
        'Lazada', 'LZ2610/00001',
        'LINE', 'LN2610/00001',
        'Other', 'OT2610/00001'
      )
    )
    WHERE setting_key = 'document_settings'
      AND (value_json->'channelInvoicePrefixes') IS NULL;
  END IF;

  -- Platform Financial Isolation (AGENTS.md Rule 3 & 4):
  -- 1. TikTok OMS placeholder rows (before Settlement): payout = income + fee_total (sales_amount - shipping_fee_seller), cogs = 0
  -- 2. Shopee & Facebook (Shipnity 2-file channels): payout = income + fee_total (sales_amount - shipping_fee_seller), cogs = GREATEST(0, income + fee_total - o.profit_amount)
  -- 3. Remove invoice_registry entries for non-billable orders (link_priority = 3 or Shopee/Facebook orders with payout <= 0)
  IF EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.is_order = 1
      AND t.transaction_type = 'คำสั่งซื้อ (OMS)'
      AND t.channel = 'TikTok'
      AND ABS(t.payout - ROUND((t.income + t.fee_total)::numeric, 2)) >= 0.01
    LIMIT 1
  ) OR EXISTS (
    SELECT 1 FROM transactions t
    JOIN oms_orders o ON o.order_uid = t.oms_order_uid
    WHERE t.is_order = 1
      AND t.transaction_type = 'คำสั่งซื้อ (OMS)'
      AND t.channel IN ('Shopee', 'Facebook')
      AND ABS(t.payout - ROUND((t.income + t.fee_total)::numeric, 2)) >= 0.01
    LIMIT 1
  ) THEN
    UPDATE transactions t
    SET payout = ROUND((t.income + t.fee_total)::numeric, 2),
        normalized_json = jsonb_set(
          jsonb_set(
            t.normalized_json,
            '{fields,payout}',
            to_jsonb(ROUND((t.income + t.fee_total)::numeric, 2))
          ),
          '{fields,cogs}',
          to_jsonb(0)
        )
    WHERE t.is_order = 1
      AND t.transaction_type = 'คำสั่งซื้อ (OMS)'
      AND t.channel = 'TikTok'
      AND ABS(t.payout - ROUND((t.income + t.fee_total)::numeric, 2)) >= 0.01;

    UPDATE transactions t
    SET payout = ROUND((t.income + t.fee_total)::numeric, 2),
        normalized_json = jsonb_set(
          jsonb_set(
            jsonb_set(
              t.normalized_json,
              '{fields,payout}',
              to_jsonb(ROUND((t.income + t.fee_total)::numeric, 2))
            ),
            '{fields,cogs}',
            to_jsonb(GREATEST(0, ROUND((t.income + t.fee_total - o.profit_amount)::numeric, 2)))
          ),
          '{fields,shipnityProfit}',
          to_jsonb(ROUND(o.profit_amount::numeric, 2))
        )
    FROM oms_orders o
    WHERE t.oms_order_uid = o.order_uid
      AND t.is_order = 1
      AND t.transaction_type = 'คำสั่งซื้อ (OMS)'
      AND t.channel IN ('Shopee', 'Facebook')
      AND (
        ABS(t.payout - ROUND((t.income + t.fee_total)::numeric, 2)) >= 0.01
        OR COALESCE((t.normalized_json->'fields'->>'cogs')::numeric, -1) IS DISTINCT FROM GREATEST(0, ROUND((t.income + t.fee_total - o.profit_amount)::numeric, 2))
      );

    -- เลขที่ใบกำกับฯ ล็อกแล้ว: ไม่ลบ → void แทน
    UPDATE invoice_registry r
    SET status = 'void', voided_at = now(), void_reason = 'ไม่เข้าเงื่อนไขบิลขายปกติ'
    WHERE r.status = 'active'
      AND EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.external_id = r.order_id
        AND t.is_order = 1
        AND (
          t.link_priority = 3
          OR (t.channel = 'Shopee' AND (t.income <= 0 OR t.payout <= 0))
          OR (t.channel = 'Facebook' AND (t.income <= 0 OR t.payout <= 0))
        )
    );

    UPDATE daily_summaries d
    SET order_payout = s.order_payout,
        total_payout = s.total_payout
    FROM (
      SELECT paid_date,
             ROUND(SUM(CASE WHEN is_order = 1 THEN payout ELSE 0 END)::numeric, 2) AS order_payout,
             ROUND(SUM(payout)::numeric, 2) AS total_payout
      FROM transactions
      WHERE paid_date <> '' AND paid_date <> 'unknown'
        AND channel IN ('TikTok', 'Shopee', 'Facebook')
      GROUP BY paid_date
    ) s
    WHERE d.paid_date = s.paid_date
      AND (d.order_payout IS DISTINCT FROM s.order_payout OR d.total_payout IS DISTINCT FROM s.total_payout);
  END IF;

  -- Backfill shop_name from oms_order_items (sender_name) by order_uid first, then order_code
  IF EXISTS (
    SELECT 1 FROM oms_orders WHERE shop_name IS NULL OR shop_name = '' LIMIT 1
  ) OR EXISTS (
    SELECT 1 FROM transactions WHERE (shop_name IS NULL OR shop_name = '') AND order_code IS NOT NULL AND order_code <> '' LIMIT 1
  ) THEN
    UPDATE oms_orders o
    SET shop_name = sub.sender_name
    FROM (
      SELECT DISTINCT ON (order_uid) order_uid, sender_name
      FROM oms_order_items
      WHERE order_uid IS NOT NULL AND order_uid <> '' AND sender_name IS NOT NULL AND sender_name <> ''
      ORDER BY order_uid, line_no ASC
    ) sub
    WHERE o.order_uid = sub.order_uid AND (o.shop_name IS NULL OR o.shop_name = '');

    UPDATE oms_orders o
    SET shop_name = sub.sender_name
    FROM (
      SELECT DISTINCT ON (order_code, ym)
        order_code,
        SUBSTRING(COALESCE(NULLIF(paid_date, ''), created_date) FROM 1 FOR 7) AS ym,
        sender_name
      FROM oms_order_items
      WHERE sender_name IS NOT NULL AND sender_name <> ''
      ORDER BY order_code, ym, line_no ASC
    ) sub
    WHERE o.order_code = sub.order_code
      AND SUBSTRING(COALESCE(NULLIF(o.paid_date, ''), o.created_date) FROM 1 FOR 7) = sub.ym
      AND (o.shop_name IS NULL OR o.shop_name = '');

    UPDATE transactions t
    SET shop_name = sub.sender_name
    FROM (
      SELECT DISTINCT ON (order_uid) order_uid, sender_name
      FROM oms_order_items
      WHERE order_uid IS NOT NULL AND order_uid <> '' AND sender_name IS NOT NULL AND sender_name <> ''
      ORDER BY order_uid, line_no ASC
    ) sub
    WHERE t.oms_order_uid = sub.order_uid AND (t.shop_name IS NULL OR t.shop_name = '');

    UPDATE transactions t
    SET shop_name = sub.sender_name
    FROM (
      SELECT DISTINCT ON (order_code, ym)
        order_code,
        SUBSTRING(COALESCE(NULLIF(paid_date, ''), created_date) FROM 1 FOR 7) AS ym,
        sender_name
      FROM oms_order_items
      WHERE sender_name IS NOT NULL AND sender_name <> ''
      ORDER BY order_code, ym, line_no ASC
    ) sub
    WHERE t.order_code = sub.order_code
      AND SUBSTRING(COALESCE(NULLIF(t.paid_date, ''), t.created_date) FROM 1 FOR 7) = sub.ym
      AND (t.shop_name IS NULL OR t.shop_name = '');

    UPDATE transactions t
    SET shop_name = o.shop_name
    FROM oms_orders o
    WHERE (
      t.oms_order_uid = o.order_uid
      OR t.external_id = o.matched_external_id
      OR t.related_order_id = o.marketplace_order_norm
      OR (
        t.order_code = o.order_code
        AND COALESCE(NULLIF(t.channel, ''), 'TikTok') = COALESCE(NULLIF(o.channel, ''), 'TikTok')
        AND SUBSTRING(COALESCE(NULLIF(t.paid_date, ''), t.created_date) FROM 1 FOR 7)
          = SUBSTRING(COALESCE(NULLIF(o.paid_date, ''), o.created_date) FROM 1 FOR 7)
      )
    )
      AND (t.shop_name IS NULL OR t.shop_name = '')
      AND o.shop_name IS NOT NULL AND o.shop_name <> '';
  END IF;

  -- Link Platform Compensation rows ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์') to oms_orders and shop_name
  IF EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.is_order = 0
      AND t.transaction_type IN ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์')
      AND t.payout > 0
      AND (t.order_code IS NULL OR t.shop_name IS NULL OR t.shop_name = '')
    LIMIT 1
  ) THEN
    UPDATE transactions t
    SET order_code = o.order_code,
        oms_order_uid = o.order_uid,
        shop_name = COALESCE(NULLIF(o.shop_name, ''), t.shop_name)
    FROM oms_orders o
    WHERE t.is_order = 0
      AND t.transaction_type IN ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์')
      AND o.marketplace_order_norm IS NOT NULL AND o.marketplace_order_norm <> ''
      AND (
        COALESCE(NULLIF(t.related_order_id, ''), t.normalized_json->'fields'->>'relatedOrderId') = o.marketplace_order_norm
        OR (
          o.marketplace_order_prefix IS NOT NULL AND LENGTH(o.marketplace_order_prefix) >= 14
          AND LEFT(COALESCE(NULLIF(t.related_order_id, ''), t.normalized_json->'fields'->>'relatedOrderId', ''), 15) = o.marketplace_order_prefix
        )
      )
      AND (t.order_code IS DISTINCT FROM o.order_code OR t.oms_order_uid IS DISTINCT FROM o.order_uid OR t.shop_name IS NULL OR t.shop_name = '');

    UPDATE transactions t
    SET shop_name = ord.shop_name
    FROM transactions ord
    WHERE t.is_order = 0
      AND t.transaction_type IN ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์')
      AND (t.shop_name IS NULL OR t.shop_name = '')
      AND ord.is_order = 1
      AND ord.shop_name IS NOT NULL AND ord.shop_name <> ''
      AND ord.external_id = COALESCE(NULLIF(t.related_order_id, ''), t.normalized_json->'fields'->>'relatedOrderId');

    -- Fallback for compensation rows in settlement workbooks where the related order has no OMS row:
    -- inherit the dominant shop_name of that settlement import workbook (or Kiddee Shop for early Kiddee files)
    UPDATE transactions t
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
      AND (t.shop_name IS NULL OR t.shop_name = '');

    UPDATE transactions t
    SET product_detail = s.summary_text
    FROM (
      SELECT i.order_uid,
             STRING_AGG(i.sku_code || ' · ' || i.product_name || ' × ' || i.quantity::text, '; ' ORDER BY i.line_no) AS summary_text
      FROM oms_order_items i
      GROUP BY i.order_uid
    ) s
    WHERE t.is_order = 0
      AND t.transaction_type IN ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์')
      AND t.oms_order_uid = s.order_uid
      AND t.product_detail IS DISTINCT FROM s.summary_text;

    UPDATE daily_summaries d
    SET compensation_count = s.comp_count
    FROM (
      SELECT paid_date,
             SUM(CASE WHEN is_order = 0 AND transaction_type IN ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์') AND payout > 0 THEN 1 ELSE 0 END)::int AS comp_count
      FROM transactions
      WHERE paid_date <> '' AND paid_date <> 'unknown'
      GROUP BY paid_date
    ) s
    WHERE d.paid_date = s.paid_date
      AND d.compensation_count IS DISTINCT FROM s.comp_count;
  END IF;

  -- Ensure daily_summaries lazada_count & order_count stay in sync if Lazada paid_date was updated across files
  IF (SELECT COALESCE(SUM(lazada_count), 0) FROM daily_summaries) IS DISTINCT FROM (SELECT COUNT(*)::int FROM transactions WHERE is_order = 1 AND channel = 'Lazada') THEN
    DELETE FROM daily_summaries d
    WHERE d.lazada_count > 0
      AND NOT EXISTS (
        SELECT 1 FROM transactions t
        WHERE t.paid_date = d.paid_date
          AND t.paid_date <> ''
          AND t.paid_date <> 'unknown'
      );

    INSERT INTO daily_summaries (
      paid_date, transaction_count, order_count, order_payout, order_income,
      order_fees, other_count, other_payout, total_payout, adjustment,
      tiktok_count, shopee_count, facebook_count, lazada_count, line_count, other_channel_count, compensation_count,
      linked_count, oms_only_count, unlinked_count, mismatch_count,
      shipping_positive, shipping_negative, updated_at
    )
    SELECT
      paid_date,
      COUNT(*)::int AS tx_count,
      SUM(CASE WHEN is_order = 1 THEN 1 ELSE 0 END)::int AS ord_count,
      ROUND(SUM(CASE WHEN is_order = 1 THEN payout ELSE 0 END)::numeric, 2) AS ord_payout,
      ROUND(SUM(CASE WHEN is_order = 1 THEN income ELSE 0 END)::numeric, 2) AS ord_income,
      ROUND(SUM(CASE WHEN is_order = 1 THEN fee_total ELSE 0 END)::numeric, 2) AS ord_fees,
      SUM(CASE WHEN is_order = 0 THEN 1 ELSE 0 END)::int AS oth_count,
      ROUND(SUM(CASE WHEN is_order = 0 THEN payout ELSE 0 END)::numeric, 2) AS oth_payout,
      ROUND(SUM(payout)::numeric, 2) AS tot_payout,
      ROUND(SUM(adjustment)::numeric, 2) AS adj_amount,
      SUM(CASE WHEN is_order = 1 AND COALESCE(NULLIF(channel, ''), 'TikTok') = 'TikTok' THEN 1 ELSE 0 END)::int AS tik_count,
      SUM(CASE WHEN is_order = 1 AND channel = 'Shopee' THEN 1 ELSE 0 END)::int AS shp_count,
      SUM(CASE WHEN is_order = 1 AND channel = 'Facebook' THEN 1 ELSE 0 END)::int AS fb_count,
      SUM(CASE WHEN is_order = 1 AND channel = 'Lazada' THEN 1 ELSE 0 END)::int AS laz_count,
      SUM(CASE WHEN is_order = 1 AND channel = 'LINE' THEN 1 ELSE 0 END)::int AS ln_count,
      SUM(CASE WHEN is_order = 1 AND channel = 'Other' THEN 1 ELSE 0 END)::int AS oth_ch_count,
      SUM(CASE WHEN is_order = 0 AND transaction_type IN ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์') AND payout > 0 THEN 1 ELSE 0 END)::int AS cmp_count,
      SUM(CASE WHEN is_order = 1 AND link_priority = 0 THEN 1 ELSE 0 END)::int AS lnk_count,
      SUM(CASE WHEN is_order = 1 AND link_priority = 1 THEN 1 ELSE 0 END)::int AS oms_count,
      SUM(CASE WHEN is_order = 1 AND link_priority = 2 THEN 1 ELSE 0 END)::int AS unlnk_count,
      SUM(CASE WHEN is_order = 1 AND (
        ABS(COALESCE((checks_json->>'incomeDiff')::numeric, 0)) >= 0.01
        OR ABS(COALESCE((checks_json->>'feeDiff')::numeric, 0)) >= 0.01
        OR ABS(COALESCE((checks_json->>'payoutDiff')::numeric, 0)) >= 0.01
      ) THEN 1 ELSE 0 END)::int AS mis_count,
      ROUND(COALESCE(SUM(${buildOrderShippingPositiveSql("")}), 0)::numeric, 2) AS shp_pos,
      ROUND(COALESCE(SUM(${buildOrderShippingNegativeSql("")}), 0)::numeric, 2) AS shp_neg,
      now()
    FROM transactions
    WHERE paid_date IN (
      SELECT paid_date FROM daily_summaries WHERE lazada_count > 0
      UNION
      SELECT DISTINCT paid_date FROM transactions WHERE is_order = 1 AND channel = 'Lazada' AND paid_date <> '' AND paid_date <> 'unknown'
    )
    GROUP BY paid_date
    ON CONFLICT (paid_date) DO UPDATE SET
      transaction_count = EXCLUDED.transaction_count,
      order_count = EXCLUDED.order_count,
      order_payout = EXCLUDED.order_payout,
      order_income = EXCLUDED.order_income,
      order_fees = EXCLUDED.order_fees,
      other_count = EXCLUDED.other_count,
      other_payout = EXCLUDED.other_payout,
      total_payout = EXCLUDED.total_payout,
      adjustment = EXCLUDED.adjustment,
      tiktok_count = EXCLUDED.tiktok_count,
      shopee_count = EXCLUDED.shopee_count,
      facebook_count = EXCLUDED.facebook_count,
      lazada_count = EXCLUDED.lazada_count,
      line_count = EXCLUDED.line_count,
      other_channel_count = EXCLUDED.other_channel_count,
      compensation_count = EXCLUDED.compensation_count,
      linked_count = EXCLUDED.linked_count,
      oms_only_count = EXCLUDED.oms_only_count,
      unlinked_count = EXCLUDED.unlinked_count,
      mismatch_count = EXCLUDED.mismatch_count,
      shipping_positive = EXCLUDED.shipping_positive,
      shipping_negative = EXCLUDED.shipping_negative,
      updated_at = now();
  END IF;

  -- Backfill product_detail from oms_order_items (by order_uid first, then order_code fallback)
  -- so cross-month order_code matches in dragon19 get their SKU/product summary and link_priority = 0
  IF EXISTS (
    SELECT 1 FROM oms_order_items LIMIT 1
  ) AND EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.is_order = 1
      AND t.order_code IS NOT NULL AND t.order_code <> ''
      AND (t.product_detail IS NULL OR t.product_detail NOT LIKE '%·%')
      AND EXISTS (
        SELECT 1 FROM oms_order_items i
        WHERE i.order_uid = t.oms_order_uid OR i.order_code = t.order_code
      )
    LIMIT 1
  ) THEN
    UPDATE transactions t
    SET product_detail = s.summary_text
    FROM (
      SELECT i.order_uid,
             STRING_AGG(i.sku_code || ' · ' || i.product_name || ' × ' || i.quantity::text, '; ' ORDER BY i.line_no) AS summary_text
      FROM oms_order_items i
      WHERE i.order_uid IS NOT NULL AND i.order_uid <> ''
      GROUP BY i.order_uid
    ) s
    WHERE t.oms_order_uid = s.order_uid
      AND (t.product_detail IS NULL OR t.product_detail NOT LIKE '%·%')
      AND t.product_detail IS DISTINCT FROM s.summary_text;

    UPDATE transactions t
    SET product_detail = s.summary_text
    FROM (
      SELECT DISTINCT ON (order_code, ym)
        order_code,
        ym,
        summary_text
      FROM (
        SELECT i.order_code,
               i.order_uid,
               SUBSTRING(COALESCE(NULLIF(i.paid_date, ''), i.created_date) FROM 1 FOR 7) AS ym,
               STRING_AGG(i.sku_code || ' · ' || i.product_name || ' × ' || i.quantity::text, '; ' ORDER BY i.line_no) AS summary_text
        FROM oms_order_items i
        WHERE i.order_code IS NOT NULL AND i.order_code <> ''
        GROUP BY i.order_code, i.order_uid, SUBSTRING(COALESCE(NULLIF(i.paid_date, ''), i.created_date) FROM 1 FOR 7)
      ) by_uid
      ORDER BY order_code, ym, order_uid DESC
    ) s
    WHERE t.order_code = s.order_code
      AND SUBSTRING(COALESCE(NULLIF(t.paid_date, ''), t.created_date) FROM 1 FOR 7) = s.ym
      AND (t.product_detail IS NULL OR t.product_detail NOT LIKE '%·%')
      AND t.product_detail IS DISTINCT FROM s.summary_text;
  END IF;

  -- Void active invoice_registry entries for orders missing File 2 (link_priority = 4) when oms_order_items is empty
  IF NOT EXISTS (SELECT 1 FROM oms_order_items LIMIT 1) AND EXISTS (
    SELECT 1 FROM invoice_registry r
    JOIN transactions t ON t.external_id = r.order_id AND t.is_order = 1
    WHERE r.status = 'active' AND t.link_priority = 4
    LIMIT 1
  ) THEN
    WITH upd AS (
      UPDATE invoice_registry r
      SET status = 'void',
          voided_at = now(),
          void_reason = 'รอไฟล์สินค้าในออเดอร์ Shipnity (ยังไม่มีชื่อสินค้า/SKU)'
      FROM transactions t
      WHERE r.order_id = t.external_id
        AND r.status = 'active'
        AND t.is_order = 1
        AND t.link_priority = 4
      RETURNING r.order_id, r.invoice_no, r.void_reason
    )
    INSERT INTO invoice_registry_audit (order_id, invoice_no, action, reason)
    SELECT order_id, invoice_no, 'void', void_reason FROM upd;
  END IF;

  -- Refresh daily_summaries.linked_count / oms_only_count / unlinked_count if out of sync with link_priority
  IF (SELECT COALESCE(SUM(linked_count), 0) FROM daily_summaries) IS DISTINCT FROM (SELECT COUNT(*)::int FROM transactions WHERE is_order = 1 AND paid_date <> '' AND paid_date <> 'unknown' AND link_priority = 0) THEN
    UPDATE daily_summaries d
    SET linked_count = s.lnk_count,
        oms_only_count = s.oms_count,
        unlinked_count = s.unlnk_count,
        updated_at = now()
    FROM (
      SELECT paid_date,
             SUM(CASE WHEN is_order = 1 AND link_priority = 0 THEN 1 ELSE 0 END)::int AS lnk_count,
             SUM(CASE WHEN is_order = 1 AND link_priority = 1 THEN 1 ELSE 0 END)::int AS oms_count,
             SUM(CASE WHEN is_order = 1 AND link_priority = 2 THEN 1 ELSE 0 END)::int AS unlnk_count
      FROM transactions
      WHERE paid_date <> '' AND paid_date <> 'unknown'
      GROUP BY paid_date
    ) s
    WHERE d.paid_date = s.paid_date
      AND (
        d.linked_count IS DISTINCT FROM s.lnk_count
        OR d.oms_only_count IS DISTINCT FROM s.oms_count
        OR d.unlinked_count IS DISTINCT FROM s.unlnk_count
      );
  END IF;

  -- Refresh sku_summaries with proportional net_sales_amount allocation (#21)
  IF EXISTS (SELECT 1 FROM oms_order_items LIMIT 1) THEN
    DELETE FROM sku_summaries;
    WITH order_lines AS (
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
    GROUP BY i.sku_code;
  END IF;
END $$;

-- ออเดอร์ Shipnity ที่ดึงมาเก็บไว้ในเซิร์ฟเวอร์ (หน้า /orders อ่านจากตารางนี้ ไม่ไล่ดึง Shipnity ตอนเปิดหน้า)
CREATE TABLE IF NOT EXISTS shipnity_orders (
  account_key TEXT NOT NULL,
  order_id BIGINT NOT NULL,
  invoice_number TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT false,
  printed BOOLEAN NOT NULL DEFAULT false,
  payment_accepted BOOLEAN NOT NULL DEFAULT false,
  transferred BOOLEAN NOT NULL DEFAULT false,
  closed BOOLEAN NOT NULL DEFAULT false,
  cancelled BOOLEAN NOT NULL DEFAULT false,
  packed BOOLEAN NOT NULL DEFAULT false,
  order_bank TEXT,
  shipping_type TEXT,
  price NUMERIC(14,2),
  content_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_key, order_id)
);
CREATE INDEX IF NOT EXISTS ix_shipnity_orders_open
  ON shipnity_orders (account_key, closed, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_shipnity_orders_created
  ON shipnity_orders (account_key, created_at DESC);

CREATE TABLE IF NOT EXISTS shipnity_sync_state (
  account_key TEXT PRIMARY KEY,
  last_sync_at TIMESTAMPTZ,
  order_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS shipnity_closed_days (
  account_key TEXT NOT NULL,
  iso_day TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_key, iso_day)
);

ANALYZE transactions;
`;
