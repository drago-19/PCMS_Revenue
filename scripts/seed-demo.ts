// เตรียมข้อมูลตัวอย่างสำหรับระบบ demo ที่จะให้ Shopee เข้าไปรีวิว
//
// หลักการ: สคริปต์นี้ "ห้าม" รันกับฐานข้อมูลจริง — จะหยุดทันทีถ้าชื่อ database ไม่มีคำว่า demo
// ข้อมูลทุกแถวเป็นของสมมติ (ชื่อคน ที่อยู่ เลขคำสั่งซื้อ) ไม่คัดลอกข้อมูลลูกค้าจริงแม้แต่แถวเดียว
//
// วิธีรัน (ต้องให้แอป demo บูตสร้างตารางก่อนหนึ่งรอบ):
//   DATABASE_URL=...demo... node --experimental-strip-types scripts/seed-demo.ts --user shopee.review --out C:\path\login.txt

import { randomInt } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

const BCRYPT_COST = 12;

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || !process.argv[index + 1]) return fallback;
  return process.argv[index + 1];
}

function databaseName(connectionString: string): string {
  const withoutQuery = connectionString.split("?")[0];
  return withoutQuery.slice(withoutQuery.lastIndexOf("/") + 1);
}

function randomPassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 16; i += 1) {
    out += alphabet[randomInt(alphabet.length)];
  }
  return out;
}

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
    out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function defaultDemoUrl(): string {
  const env = { ...readEnvFile(".env"), ...process.env };
  const host = env.DEMO_PGHOST ?? "100.95.170.43";
  const port = env.DEMO_PGPORT ?? "5432";
  const user = env.DEMO_PGUSER ?? "postgres";
  const password = env.SUPABASE_POSTGRES_PASSWORD ?? "";
  const database = env.DEMO_PGDATABASE ?? "pcms_revenue_demo";
  return `postgres://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

const connectionString = process.env.DATABASE_URL ?? defaultDemoUrl();
if (!connectionString) {
  console.error("ไม่พบ DATABASE_URL");
  process.exit(1);
}

const dbName = databaseName(connectionString);
if (!/demo/i.test(dbName)) {
  console.error(`ปฏิเสธการทำงาน: ฐานข้อมูล "${dbName}" ไม่ใช่ฐานข้อมูล demo`);
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 4 });

type DemoOrder = {
  orderId: string;
  channel: "TikTok" | "Shopee";
  buyer: string;
  taxId: string | null;
  address: string;
  paidDate: string;
  income: number;
  feeTotal: number;
  payout: number;
  product: string;
  qty: number;
  unitPrice: number;
  sku: string;
};

const DEMO_ORDERS: DemoOrder[] = [
  {
    orderId: "DEMO-TK-000001",
    channel: "TikTok",
    buyer: "สมชาย ตัวอย่างดี",
    taxId: null,
    address: "99/9 หมู่ 1 ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัดขอนแก่น 40000",
    paidDate: "2026-11-02",
    income: 590,
    feeTotal: 82.6,
    payout: 507.4,
    product: "เสื้อยืดคอตตอน สีขาว (ตัวอย่าง)",
    qty: 1,
    unitPrice: 590,
    sku: "DEMO-TS-01",
  },
  {
    orderId: "DEMO-TK-000002",
    channel: "TikTok",
    buyer: "สมหญิง ใจดี",
    taxId: null,
    address: "12 ซอยตัวอย่าง ถนนตัวอย่าง เขตตัวอย่าง กรุงเทพมหานคร 10110",
    paidDate: "2026-11-04",
    income: 1180,
    feeTotal: 165.2,
    payout: 1014.8,
    product: "เสื้อเชิ้ตแขนยาว ลายทาง (ตัวอย่าง)",
    qty: 2,
    unitPrice: 590,
    sku: "DEMO-SH-01",
  },
  {
    orderId: "DEMO-TK-000003",
    channel: "TikTok",
    buyer: "บริษัท ตัวอย่างพาณิชย์ จำกัด",
    taxId: "0105566000000",
    address: "500 อาคารตัวอย่าง ชั้น 5 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพมหานคร 10310",
    paidDate: "2026-11-07",
    income: 890,
    feeTotal: 124.6,
    payout: 765.4,
    product: "กางเกงขายาว สีกรม (ตัวอย่าง)",
    qty: 1,
    unitPrice: 890,
    sku: "DEMO-PT-01",
  },
  {
    orderId: "DEMO-SP-000001",
    channel: "Shopee",
    buyer: "ปิยะ ตั้งใจเรียน",
    taxId: null,
    address: "45/6 หมู่ 3 ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัดเชียงใหม่ 50200",
    paidDate: "2026-11-03",
    income: 450,
    feeTotal: 63,
    payout: 387,
    product: "กระเป๋าผ้าแคนวาส (ตัวอย่าง)",
    qty: 1,
    unitPrice: 450,
    sku: "DEMO-BG-01",
  },
  {
    orderId: "DEMO-SP-000002",
    channel: "Shopee",
    buyer: "ธนกร รักงานขาย",
    taxId: null,
    address: "88 ถนนตัวอย่าง ตำบลตัวอย่าง อำเภอเมือง จังหวัดนครราชสีมา 30000",
    paidDate: "2026-11-06",
    income: 900,
    feeTotal: 126,
    payout: 774,
    product: "กระเป๋าผ้าแคนวาส (ตัวอย่าง)",
    qty: 2,
    unitPrice: 450,
    sku: "DEMO-BG-01",
  },
  {
    orderId: "DEMO-SP-000003",
    channel: "Shopee",
    buyer: "อรทัย สุขสวัสดิ์",
    taxId: null,
    address: "7/1 ซอยตัวอย่าง ตำบลตัวอย่าง อำเภอหาดใหญ่ จังหวัดสงขลา 90110",
    paidDate: "2026-11-09",
    income: 890,
    feeTotal: 124.6,
    payout: 765.4,
    product: "กางเกงขายาว สีกรม (ตัวอย่าง)",
    qty: 1,
    unitPrice: 890,
    sku: "DEMO-PT-01",
  },
];

const DEMO_PRODUCTS = [
  { sku: "DEMO-TS-01", name: "เสื้อยืดคอตตอน สีขาว (ตัวอย่าง)", price: 590, cost: 210, stock: 40 },
  { sku: "DEMO-SH-01", name: "เสื้อเชิ้ตแขนยาว ลายทาง (ตัวอย่าง)", price: 590, cost: 245, stock: 25 },
  { sku: "DEMO-PT-01", name: "กางเกงขายาว สีกรม (ตัวอย่าง)", price: 890, cost: 360, stock: 18 },
  { sku: "DEMO-BG-01", name: "กระเป๋าผ้าแคนวาส (ตัวอย่าง)", price: 450, cost: 150, stock: 32 },
];

async function main() {
  const client = await pool.connect();
  const username = arg("user", "shopee.review");
  const outPath = arg("out", "");
  try {
    await client.query("BEGIN");

    const tables = await client.query<{ name: string }>(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name IN ('imports', 'transactions', 'app_users')`,
    );
    if (tables.rowCount !== 3) {
      throw new Error("ยังไม่มีตารางของระบบ — ให้เปิดแอป demo หนึ่งรอบเพื่อสร้าง schema ก่อน");
    }

    await client.query("DELETE FROM oms_order_items WHERE sku_code LIKE 'DEMO-%'");
    await client.query("DELETE FROM oms_orders WHERE order_uid LIKE 'DEMO-%'");
    await client.query("DELETE FROM transactions WHERE external_id LIKE 'DEMO-%'");
    await client.query("DELETE FROM invoice_registry WHERE order_id LIKE 'DEMO-%'");
    await client.query("DELETE FROM products WHERE sku_code LIKE 'DEMO-%'");
    await client.query("DELETE FROM imports WHERE filename LIKE 'demo-%'");

    const imported = await client.query<{ id: string }>(
      `INSERT INTO imports (filename, file_hash, file_size, imported_at, source, status, row_count, transaction_count)
       VALUES ('demo-seed.xlsx', 'demo-seed-v1', 0, now(), 'demo', 'ok', $1, $1)
       RETURNING id`,
      [DEMO_ORDERS.length],
    );
    const importId = imported.rows[0].id;

    for (const order of DEMO_ORDERS) {
      const createdAt = `${order.paidDate}T10:00:00+07:00`;
      const normalized = {
        externalId: order.orderId,
        transactionType: "คำสั่งซื้อ",
        isOrder: true,
        createdAt,
        paidAt: order.paidDate,
        currency: "THB",
        fields: { productDetail: order.product },
        mappedFields: [],
        feeGroups: {},
        unknownValues: [],
        checks: {},
        warnings: [],
        raw: {},
        sourceRows: 1,
        firstRow: 2,
        rowIndexes: [2],
      };
      await client.query(
        `INSERT INTO transactions (
           import_id, external_id, transaction_type, is_order, created_date, paid_date,
           currency, income, fee_total, adjustment, payout, product_detail,
           checks_json, warnings_json, normalized_json, created_at, channel,
           order_code, oms_order_uid, shop_name, buyer_name, buyer_tax_id, buyer_address
         ) VALUES ($1,$2,'คำสั่งซื้อ',1,$3,$4,'THB',$5,$6,0,$7,$8,'{}','[]',$9,now(),$10,$2,$2,$11,$12,$13,$14)`,
        [
          importId,
          order.orderId,
          createdAt,
          order.paidDate,
          order.income,
          order.feeTotal,
          order.payout,
          order.product,
          JSON.stringify(normalized),
          order.channel,
          order.channel === "TikTok" ? "ร้านตัวอย่าง" : "ร้านตัวอย่าง Shopee",
          order.buyer,
          order.taxId,
          order.address,
        ],
      );

      await client.query(
        `INSERT INTO oms_orders (
           order_uid, order_code, import_id, channel, customer_name, customer_phone,
           shipping_fee_customer, shipping_fee_seller, province, created_date, paid_date,
           total_qty, sales_amount, profit_amount, matched_external_id, shop_name
         ) VALUES ($1,$1,$2,$3,$4,'0800000000',0,40,$5,$6,$7,$8,$9,$10,$1,$11)`,
        [
          order.orderId,
          importId,
          order.channel,
          order.buyer,
          order.address,
          createdAt,
          order.paidDate,
          order.qty,
          order.income,
          order.income - order.feeTotal,
          order.channel === "TikTok" ? "ร้านตัวอย่าง" : "ร้านตัวอย่าง Shopee",
        ],
      );

      await client.query(
        `INSERT INTO oms_order_items (
           import_id, order_uid, order_code, line_no, sku_code, product_name, unit_price,
           quantity, order_sales_amount, shipping_fee_customer, customer_name,
           customer_address, postal_code, customer_phone, paid_date, created_date, channel
         ) VALUES ($1,$2,$2,1,$3,$4,$5,$6,$7,0,$8,$9,$10,'0800000000',$11,$12,$13)`,
        [
          importId,
          order.orderId,
          order.sku,
          order.product,
          order.unitPrice,
          order.qty,
          order.income,
          order.buyer,
          order.address,
          order.address.slice(-5),
          order.paidDate,
          createdAt,
          order.channel,
        ],
      );
    }

    for (const product of DEMO_PRODUCTS) {
      await client.query(
        `INSERT INTO products (sku_code, product_name, default_price, cost_price, initial_stock, stock_in)
         VALUES ($1,$2,$3,$4,$5,0)`,
        [product.sku, product.name, product.price, product.cost, product.stock],
      );
    }

    await client.query(
      `INSERT INTO invoice_registry (order_id, invoice_no, yymm, seq, channel)
       VALUES ('DEMO-TK-000001','DEMO/2611/00001','2611',1,'TikTok'),
              ('DEMO-TK-000002','DEMO/2611/00002','2611',2,'TikTok'),
              ('DEMO-SP-000001','DEMO/2611/00003','2611',3,'Shopee')`,
    );

    const password = randomPassword();
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    await client.query(
      `INSERT INTO app_users (username, password_hash, role, updated_at)
       VALUES ($1,$2,'staff',now())
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()`,
      [username, passwordHash],
    );

    await client.query("COMMIT");

    if (outPath) {
      writeFileSync(outPath, `username: ${username}\npassword: ${password}\n`, "utf8");
      console.log(`สร้างข้อมูลตัวอย่างแล้ว — รหัสผ่านเขียนไว้ที่ ${outPath}`);
    } else {
      console.log(`สร้างข้อมูลตัวอย่างแล้ว — ผู้ใช้ ${username} (ไม่ได้ระบุ --out จึงไม่บันทึกรหัส)`);
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
