import { Pool, type PoolClient, type QueryResultRow } from "pg";

const globalForDb = globalThis as unknown as {
  __pcmsRevenuePool?: Pool;
  __pcmsRevenueSchema?: Promise<void>;
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
  if (!globalForDb.__pcmsRevenueSchema) {
    globalForDb.__pcmsRevenueSchema = getPool()
      .query(SCHEMA_SQL)
      .then(() => undefined);
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
): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS ix_transactions_channel_paid_ext
  ON transactions(channel, paid_date DESC, external_id DESC)
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_search_trgm
  ON transactions USING gin (
    (external_id || ' ' || COALESCE(order_code, '') || ' ' || COALESCE(product_detail, '')) gin_trgm_ops
  )
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_sku_summaries_sort
  ON sku_summaries(total_qty DESC, net_sales_amount DESC, sku_code ASC);

CREATE TABLE IF NOT EXISTS app_users (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
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
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_logs_immutable'
  ) THEN
    CREATE TRIGGER trg_audit_logs_immutable
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
  END IF;
END $$;
`;
