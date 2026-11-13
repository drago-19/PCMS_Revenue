// เตรียมฐานข้อมูลสำหรับระบบตัวอย่าง: สร้าง database ถ้ายังไม่มี แล้วสร้างตารางของระบบ
//
// ใช้เฉพาะกับฐานข้อมูลที่ชื่อลงท้ายด้วย _demo เท่านั้น (กันการเผลอสร้าง/แก้ฐานข้อมูลจริง)
//
// วิธีรัน: tsx --env-file-if-exists=.env scripts/demo-bootstrap.ts

import { readFileSync } from "node:fs";
import { Client } from "pg";

const DEMO_DATABASE = "pcms_revenue_demo";

function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    out[match[1]] = value;
  }
  return out;
}

const env = { ...readEnvFile(".env"), ...process.env };
const host = env.DEMO_PGHOST ?? "100.95.170.43";
const port = Number(env.DEMO_PGPORT ?? 5432);
const user = env.DEMO_PGUSER ?? "postgres";
const password = env.SUPABASE_POSTGRES_PASSWORD ?? "";

if (!DEMO_DATABASE.endsWith("_demo")) {
  throw new Error("ชื่อฐานข้อมูลต้องลงท้ายด้วย _demo");
}
if (!password) {
  throw new Error("ไม่พบ SUPABASE_POSTGRES_PASSWORD ใน .env");
}

async function ensureDatabase(): Promise<void> {
  const admin = new Client({ host, port, user, password, database: "postgres" });
  await admin.connect();
  try {
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [DEMO_DATABASE]);
    if (existing.rowCount === 0) {
      await admin.query(`CREATE DATABASE ${DEMO_DATABASE}`);
      console.log(`สร้างฐานข้อมูล ${DEMO_DATABASE} แล้ว`);
    } else {
      console.log(`ฐานข้อมูล ${DEMO_DATABASE} มีอยู่แล้ว`);
    }
  } finally {
    await admin.end();
  }
}

async function main(): Promise<void> {
  await ensureDatabase();

  const url = `postgres://${user}:${encodeURIComponent(password)}@${host}:${port}/${DEMO_DATABASE}`;
  process.env.DATABASE_URL = url;

  const { ensureSchema, getPool } = await import("../src/lib/db");
  await ensureSchema();
  console.log("สร้างตารางของระบบในฐานข้อมูล demo แล้ว");
  await getPool().end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
