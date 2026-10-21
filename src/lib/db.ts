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
    port: Number(process.env.PGPORT ?? 5433),
    user: process.env.PGUSER ?? "pcms_revenue",
    password: process.env.PGPASSWORD ?? "pcms_revenue",
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
  await ensureSchema();
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
`;
