import { test } from "node:test";
import assert from "node:assert/strict";
import { Pool, type PoolClient } from "pg";
import ExcelJS from "exceljs";
import { runWithCompany } from "../src/lib/db";
import {
  syncMonthlyInvoiceRegistry,
  importWorkbook,
} from "../src/lib/ingest/import-service";
import { deleteImport, deleteAllImports, getInvoiceNo } from "../src/lib/queries";
import { INVOICE_ELIGIBLE_SQL } from "../src/lib/invoice-eligibility";

// Integration test: รันกับ Postgres ในเครื่องใน schema ชั่วคราว (ไม่แตะข้อมูลจริง) แล้ว ROLLBACK ทิ้งเสมอ
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST ?? "127.0.0.1",
        port: Number(process.env.PGPORT ?? 5432),
        user: process.env.PGUSER ?? "postgres",
        password: process.env.PGPASSWORD ?? process.env.SUPABASE_POSTGRES_PASSWORD ?? "",
        database: process.env.PGDATABASE ?? "pcms_revenue",
        connectionTimeoutMillis: 3000,
      },
);

async function withTempSchema(fn: (c: PoolClient) => Promise<void>, t: { skip: (m: string) => void }) {
  let client: PoolClient;
  try {
    client = await pool.connect();
    const ok = await client.query("SELECT to_regclass('public.invoice_registry_audit') AS t");
    if (!ok.rows[0].t) {
      client.release();
      t.skip("schema ยังไม่ migrate (ไม่มี invoice_registry_audit) — ข้าม integration test");
      return;
    }
  } catch {
    t.skip("ไม่มี Postgres ในเครื่อง — ข้าม integration test");
    return;
  }
  try {
    await client.query("BEGIN");
    await client.query("CREATE SCHEMA test_invoice_lock");
    await client.query("SET LOCAL search_path TO test_invoice_lock");
    for (const table of ["transactions", "invoice_registry", "invoice_registry_audit", "oms_orders", "oms_order_items"]) {
      await client.query(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
    }
    await fn(client);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}

type Row = {
  id: string;
  channel: "TikTok" | "Shopee" | "Facebook";
  type?: string;
  link?: 0 | 1 | 2 | 3;
  income?: number;
  payout?: number;
  paid: string;
  importId?: number;
};

// link_priority เป็น GENERATED column จึงกำหนดผ่านคอลัมน์ต้นทาง:
// 0 = มี order_code (+ product_detail) · 1 = แถว OMS ที่มี order_code แต่ไม่มีสินค้า · 2 = ไม่มี order_code · 3 = Facebook ไม่มีราคาสินค้า
async function seed(c: PoolClient, rows: Row[]) {
  for (const r of rows) {
    const link = r.link ?? 0;
    const type = r.type ?? (r.channel === "TikTok" ? "คำสั่งซื้อ" : "คำสั่งซื้อ (OMS)");
    const productPrice = link === 3 ? 0 : 100;
    await c.query(
      `INSERT INTO transactions (import_id, external_id, transaction_type, is_order, created_date, paid_date, currency,
         income, fee_total, adjustment, payout, checks_json, warnings_json, normalized_json, channel,
         order_code, product_detail, created_at)
       VALUES ($1, $2, $3, 1, $4, $4, 'THB', $5, 0, 0, $6, '[]', '[]', $7::jsonb, $8, $9, $10, now())`,
      [
        r.importId ?? 1,
        r.id,
        type,
        r.paid,
        r.income ?? 100,
        r.payout ?? 90,
        JSON.stringify({ fields: { productAfterDiscount: productPrice, productBeforeDiscount: productPrice } }),
        r.channel,
        link === 2 ? null : `OC-${r.id}`,
        link === 0 ? "SKU · item × 1" : null,
      ],
    );
  }
}

async function registry(c: PoolClient) {
  const rows = (
    await c.query(`SELECT order_id, invoice_no, status FROM invoice_registry WHERE seq IS NOT NULL ORDER BY yymm, seq`)
  ).rows;
  return rows.map((r) => `${r.order_id}=${r.invoice_no}${r.status === "void" ? "(void)" : ""}`);
}

test("ออกเลขครั้งแรก: เฉพาะบิลขายปกติ เรียง TikTok → Shopee → Facebook และเดือนใหม่เริ่ม 00001", async (t) => {
  await withTempSchema(async (c) => {
    await seed(c, [
      { id: "FB1", channel: "Facebook", paid: "2026-10-01" },
      { id: "SP1", channel: "Shopee", paid: "2026-10-02" },
      { id: "TT2", channel: "TikTok", paid: "2026-10-05" },
      { id: "TT1", channel: "TikTok", paid: "2026-10-03" },
      { id: "TT_OMS", channel: "TikTok", type: "คำสั่งซื้อ (OMS)", link: 1, paid: "2026-10-01" },
      { id: "TT_UNLINKED", channel: "TikTok", link: 2, paid: "2026-10-01" },
      { id: "TT_REFUND", channel: "TikTok", income: -50, payout: -50, paid: "2026-10-01" },
      { id: "SP_RETURN", channel: "Shopee", payout: 0, paid: "2026-10-01" },
      { id: "FB_EXCHANGE", channel: "Facebook", link: 3, paid: "2026-10-01" },
      { id: "FB_CANCEL", channel: "Facebook", income: 0, payout: 0, paid: "2026-10-01" },
      { id: "TT_SEP", channel: "TikTok", paid: "2026-09-30" },
    ]);
    await syncMonthlyInvoiceRegistry(c);
    assert.deepEqual(await registry(c), [
      "TT_SEP=SEQ/2609/00001",
      "TT1=SEQ/2610/00001",
      "TT2=SEQ/2610/00002",
      "SP1=SEQ/2610/00003",
      "FB1=SEQ/2610/00004",
    ]);
    const audit = await c.query(`SELECT COUNT(*)::int AS n FROM invoice_registry_audit WHERE action = 'assign'`);
    assert.equal(audit.rows[0].n, 5);
  }, t);
});

test("เลขล็อก: อัปเดตข้อมูลออเดอร์เดิมแล้ว sync ซ้ำ → เลขเดิม · ออเดอร์ใหม่ (แม้เป็น TikTok วันก่อนหน้า) ต่อท้าย MAX+1", async (t) => {
  await withTempSchema(async (c) => {
    await seed(c, [
      { id: "A", channel: "TikTok", paid: "2026-10-05" },
      { id: "B", channel: "Shopee", paid: "2026-10-06" },
    ]);
    await syncMonthlyInvoiceRegistry(c);
    await c.query(`UPDATE transactions SET income = 150, payout = 140, import_id = 2 WHERE external_id = 'A'`);
    await seed(c, [{ id: "C", channel: "TikTok", paid: "2026-10-01", importId: 2 }]);
    await syncMonthlyInvoiceRegistry(c, 2);
    assert.deepEqual(await registry(c), [
      "A=SEQ/2610/00001",
      "B=SEQ/2610/00002",
      "C=SEQ/2610/00003",
    ]);
  }, t);
});

test("คืนเงิน/ตีกลับภายหลัง → void เก็บเลขไว้ ไม่นำกลับมาใช้ · กลับมาปกติ → ใช้เลขเดิม", async (t) => {
  await withTempSchema(async (c) => {
    await seed(c, [
      { id: "A", channel: "TikTok", paid: "2026-10-01" },
      { id: "B", channel: "TikTok", paid: "2026-10-02" },
    ]);
    await syncMonthlyInvoiceRegistry(c);
    await c.query(`UPDATE transactions SET income = -10, payout = -10, import_id = 2 WHERE external_id = 'A'`);
    await seed(c, [{ id: "N", channel: "Facebook", paid: "2026-10-03", importId: 2 }]);
    await syncMonthlyInvoiceRegistry(c, 2);
    assert.deepEqual(await registry(c), [
      "A=SEQ/2610/00001(void)",
      "B=SEQ/2610/00002",
      "N=SEQ/2610/00003",
    ]);
    await c.query(`UPDATE transactions SET income = 100, payout = 90, import_id = 3 WHERE external_id = 'A'`);
    await syncMonthlyInvoiceRegistry(c, 3);
    assert.deepEqual(await registry(c), [
      "A=SEQ/2610/00001",
      "B=SEQ/2610/00002",
      "N=SEQ/2610/00003",
    ]);
    const actions = (await c.query(`SELECT action FROM invoice_registry_audit WHERE order_id = 'A' ORDER BY id`)).rows;
    assert.deepEqual(actions.map((r) => r.action), ["assign", "void", "unvoid"]);
  }, t);
});

test("TikTok ที่ไฟล์ครบทีหลัง (link 2 → 0) ได้เลขต่อท้าย ไม่แทรกกลาง", async (t) => {
  await withTempSchema(async (c) => {
    await seed(c, [
      { id: "X", channel: "TikTok", link: 2, paid: "2026-10-01" },
      { id: "Y", channel: "TikTok", paid: "2026-10-02" },
    ]);
    await syncMonthlyInvoiceRegistry(c);
    await c.query(`UPDATE transactions SET order_code = 'OC-X', product_detail = 'SKU', import_id = 2 WHERE external_id = 'X'`);
    await syncMonthlyInvoiceRegistry(c, 2);
    assert.deepEqual(await registry(c), ["Y=SEQ/2610/00001", "X=SEQ/2610/00002"]);
  }, t);
});

test("H1: sync แบบระบุ importId แตะเฉพาะออเดอร์ของไฟล์นั้น", async (t) => {
  await withTempSchema(async (c) => {
    await seed(c, [
      { id: "OLD", channel: "TikTok", paid: "2026-10-01", importId: 1 },
      { id: "NEW", channel: "TikTok", paid: "2026-10-02", importId: 2 },
    ]);
    await syncMonthlyInvoiceRegistry(c, 2);
    assert.deepEqual(await registry(c), ["NEW=SEQ/2610/00001"]);
  }, t);
});

test("UNIQUE (yymm, seq) กันเลขซ้ำในเดือนเดียวกัน", async (t) => {
  await withTempSchema(async (c) => {
    await c.query(`INSERT INTO invoice_registry (order_id, invoice_no, yymm, seq) VALUES ('P', 'SEQ/2610/00001', '2610', 1)`);
    await c.query("SAVEPOINT dup");
    await assert.rejects(
      c.query(`INSERT INTO invoice_registry (order_id, invoice_no, yymm, seq) VALUES ('Q', 'SEQ/2610/00001b', '2610', 1)`),
    );
    await c.query("ROLLBACK TO SAVEPOINT dup");
  }, t);
});

test("INVOICE_ELIGIBLE_SQL แยกเงื่อนไขตามช่องทาง (ห้ามเหมารวม Shopee/Facebook)", () => {
  assert.match(INVOICE_ELIGIBLE_SQL, /t\.channel = 'TikTok'.*t\.link_priority = 0/);
  assert.match(INVOICE_ELIGIBLE_SQL, /t\.channel = 'Shopee'/);
  assert.match(INVOICE_ELIGIBLE_SQL, /t\.channel = 'Facebook'/);
  assert.doesNotMatch(INVOICE_ELIGIBLE_SQL, /IN \('Shopee', 'Facebook'\)/);
});

test("ห้ามมีโค้ดลบ/เรียงเลขที่ใบกำกับฯ ใหม่ (เลขล็อก)", async () => {
  const fs = await import("node:fs");
  for (const file of ["src/lib/ingest/import-service.ts", "src/lib/settings.ts", "src/lib/db.ts", "src/lib/queries.ts"]) {
    const src = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(src, /DELETE FROM invoice_registry/, `${file} ห้ามลบทะเบียนเลข`);
    assert.doesNotMatch(src, /__TMP_SEQ__/, `${file} ห้ามเรียงเลขใหม่`);
  }
});

async function makeXlsxBuffer(rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test("End-to-End importWorkbook: นำเข้าไฟล์ Excel จริง → อัปเดตใบเดิมใช้เลขเดิม · ใบใหม่รันต่อท้าย · ลบไฟล์แล้วนำเข้าใหม่ได้เลขเดิม", async (t) => {
  let checkClient: PoolClient;
  try {
    checkClient = await pool.connect();
    const res = await checkClient.query("SELECT COUNT(*)::int AS cnt FROM seeheng.transactions");
    checkClient.release();
    if (res.rows[0].cnt > 0) {
      t.skip("seeheng มีข้อมูลอยู่แล้ว — ข้าม E2E importWorkbook");
      return;
    }
  } catch {
    t.skip("ไม่มี Postgres ในเครื่อง — ข้าม E2E importWorkbook");
    return;
  }

  await runWithCompany("seeheng", async () => {
    try {
      // ล้างตารางใน seeheng ก่อนเริ่มเทสต์
      const cl = await pool.connect();
      try {
        await cl.query(
          "TRUNCATE seeheng.imports, seeheng.transactions, seeheng.oms_orders, seeheng.oms_order_items, seeheng.products, seeheng.daily_summaries, seeheng.sku_summaries, seeheng.invoice_registry, seeheng.invoice_registry_audit RESTART IDENTITY CASCADE",
        );
      } finally {
        cl.release();
      }

      // รอบที่ 1: นำเข้า 3 ไฟล์ครบชุด (ออเดอร์ Shipnity + สินค้า Shipnity + TikTok Settlement)
      // มีออเดอร์ TT_A (TikTok, 2026-10-05) และ SP_B (Shopee, 2026-10-06)
      const omsOrders1 = await makeXlsxBuffer([
        [
          "เลขที่ออเดอร์",
          "ช่องทางติดต่อ",
          "ชื่อลูกค้า",
          "เบอร์โทร",
          "ขนส่ง",
          "เลขพัสดุ",
          "วันที่สร้าง",
          "วันที่โอนเงิน",
          "วันที่พิมพ์",
          "เลขที่บน Marketplace",
          "ค่าส่งที่เก็บลูกค้า",
          "ค่าส่งที่ร้านจ่าย",
          "ส่วนลดรวม",
          "จำนวนรวม",
          "ยอดขาย",
          "กำไร",
        ],
        [
          "ORD-TT-A",
          "TikTok",
          "ลูกค้า A",
          "0811111111",
          "Flash",
          "TH0001",
          "2026-10-05",
          "2026-10-05",
          "2026-10-05",
          "580000000000000001",
          "0",
          "0",
          "0",
          "1",
          "300",
          "270",
        ],
        [
          "ORD-SP-B",
          "Shopee",
          "ลูกค้า B",
          "0822222222",
          "J&T",
          "TH0002",
          "2026-10-06",
          "2026-10-06",
          "2026-10-06",
          "261006SP0001",
          "0",
          "20",
          "0",
          "1",
          "500",
          "480",
        ],
      ]);

      const omsItems1 = await makeXlsxBuffer([
        [
          "เลขที่ออเดอร์",
          "ช่องทางติดต่อ",
          "รหัสสินค้า",
          "ชื่อสินค้า",
          "ราคา",
          "จำนวน",
          "ยอดขายออเดอร์",
          "วันที่โอนเงิน",
          "วันที่สร้าง",
          "เลขพัสดุ",
        ],
        ["ORD-TT-A", "TikTok", "SKU-01", "เสื้อยืด A", "300", "1", "300", "2026-10-05", "2026-10-05", "TH0001"],
        ["ORD-SP-B", "Shopee", "SKU-02", "กางเกง B", "500", "1", "500", "2026-10-06", "2026-10-06", "TH0002"],
      ]);

      const settlement1 = await makeXlsxBuffer([
        [
          "หมายเลขคำสั่งซื้อ/การปรับ",
          "ประเภทธุรกรรม",
          "เวลาที่สร้างคำสั่งซื้อ",
          "เวลาที่ชำระคำสั่งซื้อ",
          "สกุลเงิน",
          "ยอดการชำระเงินทั้งหมด",
          "รายได้ทั้งหมด",
          "ยอดรวมค่าสินค้าหลังหักส่วนลดจากผู้ขาย",
          "ยอดรวมค่าสินค้าก่อนหักส่วนลด",
          "ส่วนลดจากร้านค้า",
          "ค่าธรรมเนียมทั้งหมด",
          "ค่าธรรมเนียมคำสั่งซื้อ",
          "ค่าคอมมิชชั่น TikTok Shop",
          "ยอดรวมค่าจัดส่งที่ร้านค้าจ่ายจริง",
          "หมายเลขคำสั่งซื้อที่เกี่ยวข้อง",
          "รายละเอียดสินค้าที่ขายได้",
        ],
        [
          "580000000000000001",
          "คำสั่งซื้อ",
          "2026/10/05",
          "2026/10/05",
          "THB",
          "270",
          "300",
          "300",
          "300",
          "0",
          "-30",
          "-30",
          "0",
          "0",
          "580000000000000001",
          "SKU-01 * 1",
        ],
      ]);

      await importWorkbook({ filename: "oms_orders_1.xlsx", buffer: omsOrders1 });
      await importWorkbook({ filename: "oms_items_1.xlsx", buffer: omsItems1 });
      // ณ จุดนี้: SP_B (Shopee) มี 2 ไฟล์ครบแล้ว จึงได้เลข SEQ/2610/00001 ทันที!
      // ส่วน TT_A (TikTok) ยังรอไฟล์ที่ 3 (Settlement) จึงยังไม่ได้เลข (null)
      assert.equal(await getInvoiceNo("261006SP0001"), "SEQ/2610/00001");
      assert.equal(await getInvoiceNo("580000000000000001"), null);

      await importWorkbook({ filename: "settlement_1.xlsx", buffer: settlement1 });

      // พอไฟล์ที่ 3 (Settlement) ของ TikTok เข้ามา:
      // SP_B ยังล็อกเลขเดิม SEQ/2610/00001 ห้ามขยับ! และ TT_A ได้เลขต่อท้าย SEQ/2610/00002
      assert.equal(await getInvoiceNo("261006SP0001"), "SEQ/2610/00001");
      assert.equal(await getInvoiceNo("580000000000000001"), "SEQ/2610/00002");

      // รอบที่ 2: นำเข้าไฟล์ใหม่ที่:
      // 1) อัปเดตยอดเงินของออเดอร์เดิม TT_A (580000000000000001) จาก 270 -> 285
      // 2) เพิ่มออเดอร์ใหม่ TT_NEW (580000000000000002) ที่มีวันที่ย้อนหลัง 2026-10-01 (ก่อน TT_A และ SP_B!)
      const omsOrders2 = await makeXlsxBuffer([
        [
          "เลขที่ออเดอร์",
          "ช่องทางติดต่อ",
          "ชื่อลูกค้า",
          "เบอร์โทร",
          "ขนส่ง",
          "เลขพัสดุ",
          "วันที่สร้าง",
          "วันที่โอนเงิน",
          "วันที่พิมพ์",
          "เลขที่บน Marketplace",
          "ค่าส่งที่เก็บลูกค้า",
          "ค่าส่งที่ร้านจ่าย",
          "ส่วนลดรวม",
          "จำนวนรวม",
          "ยอดขาย",
          "กำไร",
        ],
        [
          "ORD-TT-NEW",
          "TikTok",
          "ลูกค้าใหม่",
          "0833333333",
          "Flash",
          "TH0003",
          "2026-10-01",
          "2026-10-01",
          "2026-10-01",
          "580000000000000002",
          "0",
          "0",
          "0",
          "1",
          "400",
          "360",
        ],
      ]);

      const omsItems2 = await makeXlsxBuffer([
        [
          "เลขที่ออเดอร์",
          "ช่องทางติดต่อ",
          "รหัสสินค้า",
          "ชื่อสินค้า",
          "ราคา",
          "จำนวน",
          "ยอดขายออเดอร์",
          "วันที่โอนเงิน",
          "วันที่สร้าง",
          "เลขพัสดุ",
        ],
        ["ORD-TT-NEW", "TikTok", "SKU-01", "เสื้อยืด A", "400", "1", "400", "2026-10-01", "2026-10-01", "TH0003"],
      ]);

      const settlement2 = await makeXlsxBuffer([
        [
          "หมายเลขคำสั่งซื้อ/การปรับ",
          "ประเภทธุรกรรม",
          "เวลาที่สร้างคำสั่งซื้อ",
          "เวลาที่ชำระคำสั่งซื้อ",
          "สกุลเงิน",
          "ยอดการชำระเงินทั้งหมด",
          "รายได้ทั้งหมด",
          "ยอดรวมค่าสินค้าหลังหักส่วนลดจากผู้ขาย",
          "ยอดรวมค่าสินค้าก่อนหักส่วนลด",
          "ส่วนลดจากร้านค้า",
          "ค่าธรรมเนียมทั้งหมด",
          "ค่าธรรมเนียมคำสั่งซื้อ",
          "ค่าคอมมิชชั่น TikTok Shop",
          "ยอดรวมค่าจัดส่งที่ร้านค้าจ่ายจริง",
          "หมายเลขคำสั่งซื้อที่เกี่ยวข้อง",
          "รายละเอียดสินค้าที่ขายได้",
        ],
        [
          "580000000000000001",
          "คำสั่งซื้อ",
          "2026/10/05",
          "2026/10/05",
          "THB",
          "285",
          "300",
          "300",
          "300",
          "0",
          "-15",
          "-15",
          "0",
          "0",
          "580000000000000001",
          "SKU-01 * 1",
        ],
        [
          "580000000000000002",
          "คำสั่งซื้อ",
          "2026/10/01",
          "2026/10/01",
          "THB",
          "360",
          "400",
          "400",
          "400",
          "0",
          "-40",
          "-40",
          "0",
          "0",
          "580000000000000002",
          "SKU-01 * 1",
        ],
      ]);

      await importWorkbook({ filename: "oms_orders_2.xlsx", buffer: omsOrders2 });
      await importWorkbook({ filename: "oms_items_2.xlsx", buffer: omsItems2 });
      const impSettlement2 = await importWorkbook({ filename: "settlement_2.xlsx", buffer: settlement2 });

      // พิสูจน์:
      // 1) ใบเดิม SP_B ยังเป็น SEQ/2610/00001 และ TT_A ยังเป็น SEQ/2610/00002 ห้ามเลื่อนเด็ดขาด!
      // 2) ใบใหม่ TT_NEW (แม้วันที่ 2026-10-01 และเป็น TikTok) ต้องได้เลขต่อท้าย SEQ/2610/00003!
      assert.equal(await getInvoiceNo("261006SP0001"), "SEQ/2610/00001", "ใบกำกับเดิม SP_B ต้องไม่ถูกแทรกจนเลขเปลี่ยน");
      assert.equal(await getInvoiceNo("580000000000000001"), "SEQ/2610/00002", "ใบกำกับเดิม TT_A ต้องใช้เลขเดิม");
      assert.equal(await getInvoiceNo("580000000000000002"), "SEQ/2610/00003", "ใบกำกับใหม่ TT_NEW ต้องรันต่อท้าย MAX+1");

      // ตรวจสอบ audit trail ของใบเดิม TT_A ว่าไม่มีการถูก void แล้ว unvoid ตอนอัปเดต Settlement ซ้ำ
      const clAudit = await pool.connect();
      try {
        const auditRows = await clAudit.query(
          "SELECT action FROM seeheng.invoice_registry_audit WHERE order_id = '580000000000000001' ORDER BY id",
        );
        assert.deepEqual(
          auditRows.rows.map((r) => r.action),
          ["assign"],
          "การอัปเดตไฟล์ Settlement ของออเดอร์เดิมต้องไม่ทำให้เกิด void/unvoid ชั่วคราว",
        );
      } finally {
        clAudit.release();
      }

      // พิสูจน์: เมื่อลบไฟล์ settlement_2.xlsx ออก → ใบที่หายไปต้องถูก void (getInvoiceNo คืน null) แต่เลขยังเก็บใน invoice_registry + มี audit 'void'
      await deleteImport(impSettlement2.importId);
      assert.equal(await getInvoiceNo("580000000000000002"), null, "หลังลบไฟล์ เลขที่ถูก void ต้องไม่แสดงเป็น active");
      const clVoid = await pool.connect();
      try {
        const voidAudit = await clVoid.query(
          "SELECT action, reason FROM seeheng.invoice_registry_audit WHERE order_id = '580000000000000002' ORDER BY id",
        );
        assert.deepEqual(
          voidAudit.rows.map((r) => r.action),
          ["assign", "void"],
          "การลบไฟล์นำเข้าต้องบันทึก audit 'void'",
        );
      } finally {
        clVoid.release();
      }
    } finally {
      const cl = await pool.connect();
      try {
        await cl.query(
          "TRUNCATE seeheng.imports, seeheng.transactions, seeheng.oms_orders, seeheng.oms_order_items, seeheng.products, seeheng.daily_summaries, seeheng.sku_summaries, seeheng.invoice_registry, seeheng.invoice_registry_audit RESTART IDENTITY CASCADE",
        );
      } finally {
        cl.release();
      }
    }
  });
});

test.after(async () => {
  await pool.end();
});
