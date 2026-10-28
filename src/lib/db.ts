import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  type CompanyId,
} from "./session-token";

const SCHEMA_VERSION = "2026-10-28-v10";

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
  try {
    const { cookies, headers } = await import("next/headers");
    const hdrs = await headers();
    const fromHeader = hdrs.get("x-auth-company");
    if (fromHeader === "seeheng" || fromHeader === "dragon19") {
      return fromHeader;
    }
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
        await client.query("SET search_path TO public");
        await client.query(SCHEMA_SQL);
        await client.query("CREATE SCHEMA IF NOT EXISTS seeheng");
        await client.query("SET search_path TO seeheng, public");
        await client.query(SCHEMA_SQL);
        await client.query("SET search_path TO public");
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

ALTER TABLE imports ADD COLUMN IF NOT EXISTS file_type TEXT NOT NULL DEFAULT 'settlement';
ALTER TABLE imports ADD COLUMN IF NOT EXISTS file_blob BYTEA;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'TikTok';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS order_code TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS buyer_name TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS buyer_tax_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS buyer_address TEXT;

CREATE INDEX IF NOT EXISTS ix_transactions_channel ON transactions(channel);
CREATE INDEX IF NOT EXISTS ix_transactions_order_code ON transactions(order_code);

CREATE TABLE IF NOT EXISTS oms_orders (
  order_code TEXT PRIMARY KEY,
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
  UNIQUE(order_code, line_no)
);

CREATE INDEX IF NOT EXISTS ix_oms_items_order_code ON oms_order_items(order_code);
CREATE INDEX IF NOT EXISTS ix_oms_items_sku_code ON oms_order_items(sku_code);
CREATE INDEX IF NOT EXISTS ix_oms_items_import ON oms_order_items(import_id);

CREATE TABLE IF NOT EXISTS products (
  sku_code TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  default_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS linked_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS oms_only_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS unlinked_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS mismatch_count INTEGER NOT NULL DEFAULT 0;

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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS ix_transactions_order_paid_ext
  ON transactions(paid_date DESC, external_id DESC)
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_order_paid_priority_ext
  ON transactions(
    paid_date DESC,
    (
      CASE
        WHEN (order_code IS NOT NULL AND order_code <> '' AND transaction_type <> 'คำสั่งซื้อ (OMS)') THEN 0
        WHEN (order_code IS NOT NULL AND order_code <> '') THEN 1
        ELSE 2
      END
    ) ASC,
    external_id DESC
  )
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_channel_paid_ext
  ON transactions(channel, paid_date DESC, external_id DESC)
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_unlinked_created_date
  ON transactions(paid_date, created_date DESC)
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

  -- Fast check on pre-aggregated summary tables only (never full-scan billion-row tables on startup)
  IF EXISTS (
    SELECT 1 FROM daily_summaries WHERE facebook_count > 0
  ) OR EXISTS (
    SELECT 1 FROM daily_summaries WHERE order_count > 0 AND linked_count = 0 AND oms_only_count = 0 AND unlinked_count = 0
  ) OR EXISTS (
    SELECT 1 FROM sku_summaries WHERE facebook_qty > 0
  ) THEN
    DELETE FROM oms_order_items WHERE COALESCE(NULLIF(channel, ''), 'TikTok') NOT IN ('TikTok', 'Shopee');
    DELETE FROM oms_orders WHERE COALESCE(NULLIF(channel, ''), 'TikTok') NOT IN ('TikTok', 'Shopee');
    DELETE FROM transactions WHERE COALESCE(NULLIF(channel, ''), 'TikTok') NOT IN ('TikTok', 'Shopee');

    DELETE FROM products p
    WHERE NOT EXISTS (
      SELECT 1 FROM oms_order_items i WHERE i.sku_code = p.sku_code
    );

    DELETE FROM invoice_registry r
    WHERE NOT EXISTS (
      SELECT 1 FROM transactions t WHERE t.external_id = r.order_id AND t.is_order = 1
    );

    DELETE FROM daily_summaries;
    INSERT INTO daily_summaries (
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
    WHERE paid_date <> '' AND paid_date <> 'unknown'
      AND COALESCE(NULLIF(channel, ''), 'TikTok') IN ('TikTok', 'Shopee')
    GROUP BY paid_date;

    DELETE FROM sku_summaries;
    INSERT INTO sku_summaries (
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
    WHERE COALESCE(NULLIF(i.channel, ''), 'TikTok') IN ('TikTok', 'Shopee')
    GROUP BY i.sku_code;
  END IF;
END $$;
`;
