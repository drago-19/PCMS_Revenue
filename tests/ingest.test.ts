import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { parseWorkbook, parseDateValue, toNumber } from "../src/lib/ingest/parse";
import { bahtText } from "../src/lib/format";

async function buildXlsx(
  sheets: { name: string; rows: (string | number | null)[][] }[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    for (const row of sheet.rows) worksheet.addRow(row);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function orderRow(overrides: Record<string, string | number | null> = {}) {
  const base: Record<string, string | number | null> = {
    "หมายเลขคำสั่งซื้อ/การปรับ": "1000000000000000001",
    "ประเภทธุรกรรม": "คำสั่งซื้อ",
    "เวลาที่สร้างคำสั่งซื้อ": "2026/10/01",
    "เวลาที่ชำระคำสั่งซื้อ": "2026/10/01",
    "สกุลเงิน": "THB",
    "ยอดการชำระเงินทั้งหมด": "135",
    "รายได้ทั้งหมด": "150",
    "ยอดรวมค่าสินค้าหลังหักส่วนลดจากผู้ขาย": "150",
    "ยอดรวมค่าสินค้าก่อนหักส่วนลด": "200",
    "ส่วนลดจากร้านค้า": "-50",
    "ค่าธรรมเนียมทั้งหมด": "-15",
    "ค่าธรรมเนียมคำสั่งซื้อ": "-15",
    "ค่าคอมมิชชั่น TikTok Shop": "0",
    "ยอดรวมค่าจัดส่งที่ร้านค้าจ่ายจริง": "0",
    "หมายเลขคำสั่งซื้อที่เกี่ยวข้อง": "1000000000000000001",
    "รายละเอียดสินค้าที่ขายได้": "1737619511125837091 * 2;",
  };
  return { ...base, ...overrides };
}

function asRow(values: Record<string, string | number | null>, headers: string[]): (string | number | null)[] {
  return headers.map((header) => values[header] ?? "");
}

test("parses the real TikTok export with exact reconciliation", async () => {
  const sample = path.resolve(process.cwd(), "samples", "income_20261021134525.xlsx");
  if (!fs.existsSync(sample)) {
    assert.fail("sample file missing — copy it to samples/ before running tests");
  }
  const parsed = await parseWorkbook(fs.readFileSync(sample));
  assert.equal(parsed.transactions.length, 125);
  assert.equal(parsed.transactions.filter((t) => t.isOrder).length, 124);
  assert.equal(parsed.unknownColumns.length, 0);
  assert.equal(parsed.report.found, true);
  for (const transaction of parsed.transactions) {
    const { incomeDiff, feeDiff, payoutDiff } = transaction.checks;
    assert.ok(Math.abs(incomeDiff) < 0.01, `income diff ${transaction.externalId}`);
    assert.ok(Math.abs(feeDiff) < 0.01, `fee diff ${transaction.externalId}`);
    assert.ok(Math.abs(payoutDiff) < 0.01, `payout diff ${transaction.externalId}`);
  }
});

test("maps English headers, title row, reordered columns and flags a new fee column", async () => {
  const rows: (string | number | null)[][] = [
    ["TikTok Shop Income Report", null, null],
    [],
    [
      "Total income",
      "Order ID",
      "Seller discount",
      "Total product amount before discount",
      "Total product amount after seller discount",
      "Transaction type",
      "Order created time",
      "Order settled time",
      "Currency",
      "Total settlement amount",
      "Total fees",
      "Order fee",
      "TikTok Shop commission",
      "Total actual shipping fee paid by seller",
      "NEW FEE COLUMN",
    ],
    [
      "150",
      "1000000000000000001",
      "-50",
      "200",
      "150",
      "Order",
      "2026/10/01",
      "2026/10/01",
      "THB",
      "128",
      "-22",
      "-10",
      "-5",
      "-5",
      "-2",
    ],
  ];
  const buffer = await buildXlsx([{ name: "Sheet1", rows }]);
  const parsed = await parseWorkbook(buffer);
  assert.equal(parsed.transactions.length, 1);
  const transaction = parsed.transactions[0];
  assert.equal(transaction.isOrder, true);
  assert.equal(transaction.externalId, "1000000000000000001");
  assert.equal(transaction.fields.payout, 128);
  assert.equal(transaction.fields.incomeTotal, 150);
  assert.deepEqual(
    parsed.unknownColumns.map((column) => column.header),
    ["NEW FEE COLUMN"],
  );
  // fee groups cover -15, unknown column -2 → residual -2
  assert.equal(transaction.checks.feeDiff, -2);
});

test("strips Thai (โดยประมาณ)/(%) suffix and falls back to fee children when parent total is missing", async () => {
  const headers = [
    "หมายเลขคำสั่งซื้อ/การปรับ",
    "ประเภทธุรกรรม",
    "เวลาที่ชำระคำสั่งซื้อ",
    "ยอดการชำระเงินทั้งหมด",
    "รายได้ทั้งหมด",
    "ยอดรวมค่าสินค้าหลังหักส่วนลดจากผู้ขาย",
    "ค่าธรรมเนียมทั้งหมด",
    "ค่าธรรมเนียมคำสั่งซื้อ (โดยประมาณ) (3.21%)",
    "ค่าคอมมิชชั่น TikTok Shop (โดยประมาณ)",
    "ค่าธรรมเนียมการจัดส่งจริง",
    "ส่วนลดค่าธรรมเนียมการจัดส่งจากแพลตฟอร์ม",
  ];
  const values: Record<string, string | number | null> = {
    "หมายเลขคำสั่งซื้อ/การปรับ": "1000000000000000002",
    "ประเภทธุรกรรม": "คำสั่งซื้อ",
    "เวลาที่ชำระคำสั่งซื้อ": "2026/10/01",
    "ยอดการชำระเงินทั้งหมด": "65",
    "รายได้ทั้งหมด": "100",
    "ยอดรวมค่าสินค้าหลังหักส่วนลดจากผู้ขาย": "100",
    "ค่าธรรมเนียมทั้งหมด": "-35",
    "ค่าธรรมเนียมคำสั่งซื้อ (โดยประมาณ) (3.21%)": "-10",
    "ค่าคอมมิชชั่น TikTok Shop (โดยประมาณ)": "-20",
    "ค่าธรรมเนียมการจัดส่งจริง": "-8",
    "ส่วนลดค่าธรรมเนียมการจัดส่งจากแพลตฟอร์ม": "3",
  };
  const buffer = await buildXlsx([
    { name: "รายละเอียดคำสั่งซื้อ", rows: [headers, asRow(values, headers)] },
  ]);
  const parsed = await parseWorkbook(buffer);
  const transaction = parsed.transactions[0];
  assert.equal(transaction.checks.feeDiff, 0);
  const shipping = transaction.feeGroups["shipping"];
  assert.ok(shipping, "shipping group should exist");
  assert.equal(shipping.total, -5);
  assert.equal(transaction.fields.orderFee, -10);
});

test("parses DD/MM/YYYY (ambiguous) and comma-formatted numbers", () => {
  assert.deepEqual(parseDateValue("2026/10/01"), { iso: "2026-10-01", ambiguous: false });
  const dmy = parseDateValue("01/10/2026");
  assert.equal(dmy.iso, "2026-10-01");
  assert.equal(dmy.ambiguous, true);
  assert.equal(toNumber("1,234.56"), 1234.56);
  assert.equal(toNumber("-1,234.56"), -1234.56);
  assert.equal(toNumber("(50)"), -50);
});

test("aggregates multiple rows of the same order into one bill", async () => {
  const headers = [
    "หมายเลขคำสั่งซื้อ/การปรับ",
    "ประเภทธุรกรรม",
    "เวลาที่ชำระคำสั่งซื้อ",
    "ยอดการชำระเงินทั้งหมด",
    "รายได้ทั้งหมด",
    "ยอดรวมค่าสินค้าหลังหักส่วนลดจากผู้ขาย",
    "ค่าธรรมเนียมทั้งหมด",
    "ค่าธรรมเนียมคำสั่งซื้อ",
    "ค่าคอมมิชชั่น TikTok Shop",
  ];
  const row1 = asRow(
    { ...orderRow(), "หมายเลขคำสั่งซื้อ/การปรับ": "1000000000000000009" },
    headers,
  );
  const row2 = asRow(
    { ...orderRow(), "หมายเลขคำสั่งซื้อ/การปรับ": "1000000000000000009" },
    headers,
  );
  const buffer = await buildXlsx([{ name: "Sheet1", rows: [headers, row1, row2] }]);
  const parsed = await parseWorkbook(buffer);
  assert.equal(parsed.transactions.length, 1);
  const transaction = parsed.transactions[0];
  assert.equal(transaction.sourceRows, 2);
  assert.equal(transaction.fields.payout, 270);
  assert.equal(transaction.fields.incomeTotal, 300);
});

test("converts amounts to Thai baht text and formats THB with negative sign before currency symbol", async () => {
  const { formatTHB } = await import("../src/lib/format");
  assert.equal(bahtText(100), "หนึ่งร้อยบาทถ้วน");
  assert.equal(bahtText(21), "ยี่สิบเอ็ดบาทถ้วน");
  assert.equal(bahtText(450.5), "สี่ร้อยห้าสิบบาทห้าสิบสตางค์");
  assert.equal(bahtText(0), "ศูนย์บาทถ้วน");
  assert.equal(bahtText(1500), "หนึ่งพันห้าร้อยบาทถ้วน");
  assert.equal(formatTHB(645), "฿645.00");
  assert.equal(formatTHB(-149.48), "-฿149.48");
  assert.equal(formatTHB(0), "฿0.00");
});

test("POST /api/imports validates missing/non-xlsx/empty files before touching DB", async () => {
  const { POST } = await import("../src/app/api/imports/route");
  const { createSessionToken, SESSION_COOKIE_NAME } = await import(
    "../src/lib/session-token"
  );

  // Unauthenticated / missing Origin request must be blocked first
  const unauthForm = new FormData();
  const resUnauth = await POST(
    new Request("http://localhost:3001/api/imports?stream=1", {
      method: "POST",
      body: unauthForm,
    }),
  );
  assert.equal(resUnauth.status, 403);

  const authHeaders = {
    host: "localhost:3001",
    origin: "http://localhost:3001",
    cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(
      createSessionToken({ username: "admin", role: "admin" }),
    )}`,
  };

  const emptyForm = new FormData();
  const resNoFile = await POST(
    new Request("http://localhost:3001/api/imports?stream=1", {
      method: "POST",
      headers: authHeaders,
      body: emptyForm,
    }),
  );
  assert.equal(resNoFile.status, 400);
  const bodyNoFile = (await resNoFile.json()) as { error: string };
  assert.match(bodyNoFile.error, /ไม่พบไฟล์/);

  const badExtForm = new FormData();
  badExtForm.append("file", new File(["hello"], "report.txt", { type: "text/plain" }));
  const resBadExt = await POST(
    new Request("http://localhost:3001/api/imports?stream=1", {
      method: "POST",
      headers: authHeaders,
      body: badExtForm,
    }),
  );
  assert.equal(resBadExt.status, 400);
  const bodyBadExt = (await resBadExt.json()) as { error: string };
  assert.match(bodyBadExt.error, /\.xlsx/);

  const zeroForm = new FormData();
  zeroForm.append("file", new File([], "empty.xlsx"));
  const resZero = await POST(
    new Request("http://localhost:3001/api/imports?stream=1", {
      method: "POST",
      headers: authHeaders,
      body: zeroForm,
    }),
  );
  assert.equal(resZero.status, 400);
  const bodyZero = (await resZero.json()) as { error: string };
  assert.match(bodyZero.error, /ไฟล์ว่าง/);
});

test("detects and parses OMS orders, OMS items, and CSV settlement with 15-digit scientific notation matching", async () => {
  const { detectAndParseOmsInput, normalizeMarketplaceId } = await import(
    "../src/lib/ingest/oms-parse"
  );
  const { buildInvoice } = await import("../src/lib/invoice");

  const normSci = normalizeMarketplaceId("5.8635928059415936e+17");
  assert.equal(normSci.prefix, "586359280594159");
  assert.equal(normSci.norm, "586359280594159360");

  const omsOrdersCsv = [
    "เลขที่ออเดอร์,ชื่อ,เบอร์โทร,ช่องทางติดต่อ,ชื่อตามช่องทางติดต่อ,ขนส่ง,ค่าส่งที่เก็บลูกค้า,จังหวัด,ธนาคาร,เลขพัสดุ,ค่าส่งที่ร้านจ่าย,หมายเหตุ,สร้างโดย,วันที่สร้าง,วันที่โอนเงิน,วันที่พิมพ์,เลขที่บน Marketplace,รหัสส่วนลด,ส่วนลดรวม,จำนวนรวม,ยอดขาย,กำไร",
    "OF37,ดาริกา บุตรพรม,0631954616,TikTok,TikTok,J&T (Pick Up),0.0,ชัยภูมิ,PromptPay,755093165214,0,,P&C,01/10/2026 11:25,01/10/2026 00:00,01/10/2026 11:25,5.86356565637268e+17,,100.0,1,150.0,150.0",
    "OF33,สายฝน,0827564556,Shopee,Shopee,Shopee Xpress (Pick Up),37.0,ชลบุรี,เงินโอน,TH263097252167Z,0,,P&C,01/10/2026 09:05,01/10/2026 00:00,01/10/2026 09:05,261001GH52V0JW,,171.0,2,266.0,266.0",
  ].join("\n");

  const parsedOrders = await detectAndParseOmsInput(Buffer.from(omsOrdersCsv, "utf8"));
  assert.ok(parsedOrders);
  assert.equal(parsedOrders.fileType, "oms_orders");
  assert.equal(parsedOrders.orders.length, 1);
  assert.equal(parsedOrders.orders[0].orderCode, "OF37");
  assert.equal(parsedOrders.orders[0].channel, "TikTok");
  assert.equal(parsedOrders.orders[0].marketplaceOrderPrefix, "586356565637268");

  const omsItemsCsv = [
    "รหัสสินค้า,สินค้า,ราคา,จำนวน,เลขที่ออเดอร์,ยอดขายออเดอร์,ค่าส่งที่เก็บลูกค้า,ผู้ส่ง,ชื่อ,ที่อยู่,รหัสไปรษณีย์,เบอร์โทร,วันที่โอนเงิน,สร้างโดย,ขนส่ง,ช่องทางติดต่อ,ธนาคารที่โอนเงิน,หมายเหตุ,เลขพัสดุ,วันที่สร้าง",
    "SET21,ไฟเบอร์1กล่องแถมตรีผลา1ห่อ,250.0,1,OF37,150.0,0.0,แบรนด์ P&C,ดาริกา บุตรพรม,27 ม.9 ต.บ้านหัน อ.เกษตรสมบูรณ์ จ.ชัยภูมิ 36120,36120,0631954616,01/10/2026 00:00,P&C,J&T (Pick Up),TikTok,PromptPay,,755093165214,01/10/2026 11:25",
  ].join("\n");

  const parsedItems = await detectAndParseOmsInput(Buffer.from(omsItemsCsv, "utf8"));
  assert.ok(parsedItems);
  assert.equal(parsedItems.fileType, "oms_items");
  assert.equal(parsedItems.items.length, 1);
  assert.equal(parsedItems.items[0].skuCode, "SET21");
  assert.equal(parsedItems.items[0].productName, "ไฟเบอร์1กล่องแถมตรีผลา1ห่อ");
  assert.equal(parsedItems.items[0].orderCode, "OF37");

  const invoice = buildInvoice({
    id: 1,
    importId: 1,
    externalId: "586356565637268989",
    transactionType: "คำสั่งซื้อ",
    isOrder: true,
    createdDate: "2026-10-01",
    paidDate: "2026-10-01",
    currency: "THB",
    income: 150,
    feeTotal: -17.39,
    adjustment: 0,
    payout: 132.61,
    productDetail: "SET21 · ไฟเบอร์1กล่องแถมตรีผลา1ห่อ × 1",
    weightEstimated: 200,
    weightCharged: 200,
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    normalized: {
      externalId: "586356565637268989",
      transactionType: "คำสั่งซื้อ",
      isOrder: true,
      createdAt: "2026-10-01",
      paidAt: "2026-10-01",
      currency: "THB",
      fields: { productAfterDiscount: 150, shippingCustomerFee: 0 },
      mappedFields: [],
      feeGroups: {},
      unknownValues: [],
      checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
      warnings: [],
      raw: {},
      sourceRows: 1,
      firstRow: 2,
      rowIndexes: [2],
    },
    createdAt: "2026-10-01",
    invoiceNo: "TT26100100001",
    channel: "TikTok",
    orderCode: "OF37",
    customerName: "ดาริกา บุตรพรม",
    customerPhone: "0631954616",
    customerAddress: "27 ม.9 ต.บ้านหัน อ.เกษตรสมบูรณ์ จ.ชัยภูมิ 36120",
    postalCode: "36120",
    province: "ชัยภูมิ",
    trackingNo: "755093165214",
    courier: "J&T (Pick Up)",
    discountTotal: 100,
    shippingFeeCustomer: 0,
    omsItems: [
      {
        skuCode: "SET21",
        productName: "ไฟเบอร์1กล่องแถมตรีผลา1ห่อ",
        unitPrice: 250,
        quantity: 1,
      },
    ],
  });

  assert.equal(invoice.orderCode, "OF37");
  assert.equal(invoice.channel, "TikTok");
  assert.equal(invoice.items.length, 1);
  assert.equal(invoice.items[0].sku, "SET21");
  assert.equal(invoice.items[0].name, "ไฟเบอร์1กล่องแถมตรีผลา1ห่อ");
  assert.equal(invoice.grossItemsTotal, 250);
  assert.equal(invoice.discountTotal, 100);
  assert.equal(invoice.customerTotal, 150);
  assert.equal(invoice.total, 132.61);
  assert.equal(invoice.preVatAmount, 123.93);
  assert.equal(invoice.vatAmount, 8.68);
  assert.equal(invoice.receiptSubtotal, 250);
  assert.equal(invoice.receiptCoupon, 100);
  assert.equal(invoice.shippingGross, 0);
  assert.equal(invoice.shippingCoupon, 0);
  assert.equal(invoice.receiptTotal, 132.61);
  assert.equal(invoice.receiptPreVatAmount, 123.93);
  assert.equal(invoice.receiptVatAmount, 8.68);

  // Test TikTok receipt breakdown pulling actual shipping & coupon values from imported Settlement fields (e.g. 29 baht vs 35 baht)
  const receipt29 = buildInvoice({
    id: 2,
    importId: 61,
    externalId: "586279384076945309",
    transactionType: "คำสั่งซื้อ",
    isOrder: true,
    createdDate: "2026-09-27",
    paidDate: "2026-10-01",
    currency: "THB",
    income: 450,
    feeTotal: -114.24,
    adjustment: 0,
    payout: 335.76,
    productDetail: "JENNIE-SET · JENNIE SET เซ็ต3ชิ้น เสื้อฮู้ดแขนยาว × 1",
    weightEstimated: 500,
    weightCharged: 500,
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    normalized: {
      externalId: "586279384076945309",
      transactionType: "คำสั่งซื้อ",
      isOrder: true,
      createdAt: "2026-09-27",
      paidAt: "2026-10-01",
      currency: "THB",
      fields: {
        productBeforeDiscount: 690,
        storeDiscount: -240,
        productAfterDiscount: 450,
        shippingActual: -29,
        shippingPlatformDiscount: 29,
        shippingCustomerFee: 0,
        platformDiscount: 96.6,
        customerPayment: 353.4,
      },
      mappedFields: [],
      feeGroups: {},
      unknownValues: [],
      checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
      warnings: [],
      raw: {},
      sourceRows: 1,
      firstRow: 10,
      rowIndexes: [10],
    },
    createdAt: "2026-10-01",
    invoiceNo: "TT2610/00010",
    channel: "TikTok",
    orderCode: null,
  });

  assert.equal(receipt29.receiptNo, "20261001-586279384076945309");
  assert.equal(receipt29.createdDate, "2026-09-27");
  assert.equal(receipt29.grossItemsTotal, 690);
  assert.equal(receipt29.storeDiscount, 240);
  assert.equal(receipt29.receiptSubtotal, 450);
  assert.equal(receipt29.shippingGross, 29);
  assert.equal(receipt29.shippingCoupon, 29);
  assert.equal(receipt29.receiptCoupon, 96.6);
  assert.equal(receipt29.customerTotal, 353.4);
  assert.equal(receipt29.receiptTotal, 335.76);
  assert.equal(receipt29.receiptPreVatAmount, 313.79);
  assert.equal(receipt29.receiptVatAmount, 21.97);
});

test("deleteImport removes orphaned invoice_registry rows and resets invoice_seq when empty", async () => {
  const { deleteImport } = await import("../src/lib/queries");
  const executedSql: string[] = [];

  const mockDb = {
    query: async (sql: string) => {
      executedSql.push(sql.replace(/\s+/g, " ").trim());
      if (sql.includes("DELETE FROM imports")) {
        return { rows: [{ id: 99 }] };
      }
      if (sql.includes("SELECT COUNT(*) AS c FROM invoice_registry")) {
        return { rows: [{ c: 0 }] };
      }
      return { rows: [] };
    },
  };

  const ok = await deleteImport(99, mockDb as never);
  assert.equal(ok, true);
  assert.ok(
    executedSql.some((s) => s.includes("DELETE FROM imports WHERE id = $1")),
    "should delete from imports",
  );
  assert.ok(
    executedSql.some((s) => s.includes("DELETE FROM products p WHERE NOT EXISTS")),
    "should delete orphaned products rows",
  );
  assert.ok(
    executedSql.some((s) => s.includes("DELETE FROM invoice_registry r WHERE NOT EXISTS")),
    "should delete orphaned invoice_registry rows",
  );
  assert.ok(
    executedSql.some((s) => s.includes("ALTER SEQUENCE invoice_seq RESTART WITH 1")),
    "should reset invoice_seq when invoice_registry is empty",
  );
});

test("supports custom column mapping for arbitrary Synnity/Shopee headers", async () => {
  const { detectAndParseOmsInput } = await import("../src/lib/ingest/oms-parse");
  const customCsv = [
    "Bill_Ref,Item_SKU_ID,Item_Title,Price_Each,Qty_Sold,Pay_Date,Platform_Source",
    "SYN-9001,SKU-HERB-01,สมุนไพรตรีผลาสกัด,290,2,2026-10-05,TikTok",
  ].join("\n");

  const parsed = await detectAndParseOmsInput(Buffer.from(customCsv, "utf8"), {
    Bill_Ref: "orderCode",
    Item_SKU_ID: "skuCode",
    Item_Title: "productName",
    Price_Each: "unitPrice",
    Qty_Sold: "quantity",
    Pay_Date: "paidDate",
    Platform_Source: "channel",
  });

  assert.ok(parsed);
  assert.equal(parsed.fileType, "oms_items");
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].orderCode, "SYN-9001");
  assert.equal(parsed.items[0].skuCode, "SKU-HERB-01");
  assert.equal(parsed.items[0].productName, "สมุนไพรตรีผลาสกัด");
  assert.equal(parsed.items[0].unitPrice, 290);
  assert.equal(parsed.items[0].quantity, 2);
  assert.equal(parsed.items[0].channel, "TikTok");
});

test("listBills uses pre-aggregated daily_summaries fast path without scanning transactions COUNT/SUM", async () => {
  const { listBills } = await import("../src/lib/queries");
  const executedSql: string[] = [];

  const mockDb = {
    query: async (sql: string) => {
      const clean = sql.replace(/\s+/g, " ").trim();
      executedSql.push(clean);
      if (clean.includes("FROM daily_summaries")) {
        return {
          rows: [
            {
              order_count: 1000000000,
              order_income: 250000000000,
              order_fees: -15000000000,
              order_payout: 235000000000,
              tiktok_count: 700000000,
              shopee_count: 250000000,
              facebook_count: 50000000,
              min_paid_date: "2020-01-01",
              max_paid_date: "2026-10-22",
              distinct_dates: 2480,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const result = await listBills({ page: 1, pageSize: 20 }, mockDb as never);
  assert.equal(result.total, 1000000000);
  assert.equal(result.summary.income, 250000000000);
  assert.equal(result.channelCounts.TikTok, 1000000000);
  assert.equal(result.channelCounts.all, 1000000000);
  assert.ok(
    !executedSql.some((s) => s.includes("SELECT COUNT(*) AS count") && s.includes("FROM transactions")),
    "should not run full COUNT/SUM scan on transactions table when fast path applies",
  );
});

test("getImportSpreadsheetData reads original Excel file_blob and falls back to database reconstruction", async () => {
  const { getImportSpreadsheetData } = await import("../src/lib/queries");

  const xlsxBuf = await buildXlsx([
    {
      name: "Order details",
      rows: [
        ["Order ID", "Product Name", "Amount"],
        ["ORD-001", "สมุนไพรตรีผลา", 250],
        ["ORD-002", "ไฟเบอร์ดีท็อกซ์", 450],
      ],
    },
    {
      name: "Reports",
      rows: [
        ["Total settlement amount", 700],
      ],
    },
  ]);

  const mockBlobDb = {
    query: async () => ({
      rows: [
        {
          id: 10,
          filename: "sample_with_blob.xlsx",
          file_size: xlsxBuf.length,
          imported_at: "2026-10-22T03:00:00Z",
          source: "upload",
          file_type: "settlement",
          sheet_name: "Order details",
          header_row: 1,
          status: "ok",
          row_count: 2,
          transaction_count: 2,
          order_count: 2,
          warnings_json: "[]",
          mapping_json: "[]",
          unknown_columns_json: "[]",
          report_json: "{}",
          reconciliation_json: "{}",
          file_blob: xlsxBuf,
        },
      ],
    }),
  };

  const blobData = await getImportSpreadsheetData(10, mockBlobDb as never);
  assert.ok(blobData);
  assert.equal(blobData.sourceMode, "original_file");
  assert.equal(blobData.hasOriginalFile, true);
  assert.equal(blobData.sheets.length, 2);
  assert.equal(blobData.sheets[0].name, "Order details");
  assert.deepEqual(blobData.sheets[0].headers, ["Order ID", "Product Name", "Amount"]);
  assert.equal(blobData.sheets[0].rows.length, 3);
  assert.equal(blobData.sheets[0].rows[1][1], "สมุนไพรตรีผลา");
  assert.equal(blobData.sheets[0].rows[2][2], 450);

  // Fallback reconstruction when file_blob is null (legacy import)
  const mockFallbackDb = {
    query: async (sql: string) => {
      if (sql.includes("FROM imports")) {
        return {
          rows: [
            {
              id: 11,
              filename: "Data_21-10-2026.xlsx",
              file_size: 136000,
              imported_at: "2026-10-22T03:01:00Z",
              source: "upload",
              file_type: "oms_orders",
              sheet_name: "Orders",
              header_row: 1,
              status: "ok",
              row_count: 1,
              transaction_count: 1,
              order_count: 1,
              warnings_json: "[]",
              mapping_json: JSON.stringify([
                { col: 0, header: "เลขที่ออเดอร์", fieldKey: "orderCode", label: "เลขที่ออเดอร์", kind: "text", confidence: "exact", nonEmpty: 1 },
                { col: 1, header: "ชื่อ", fieldKey: "customerName", label: "ชื่อ", kind: "text", confidence: "exact", nonEmpty: 1 },
                { col: 2, header: "ยอดขาย", fieldKey: "salesAmount", label: "ยอดขาย", kind: "text", confidence: "exact", nonEmpty: 1 },
              ]),
              unknown_columns_json: "[]",
              report_json: "{}",
              reconciliation_json: "{}",
              file_blob: null,
            },
          ],
        };
      }
      if (sql.includes("FROM oms_orders")) {
        return {
          rows: [
            {
              order_code: "OF39",
              customer_name: "สมชาย ใจดี",
              sales_amount: 450,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const fallbackData = await getImportSpreadsheetData(11, mockFallbackDb as never);
  assert.ok(fallbackData);
  assert.equal(fallbackData.sourceMode, "database_reconstructed");
  assert.equal(fallbackData.hasOriginalFile, false);
  assert.equal(fallbackData.sheets.length, 1);
  assert.deepEqual(fallbackData.sheets[0].headers, ["เลขที่ออเดอร์", "ชื่อ", "ยอดขาย"]);
  assert.deepEqual(fallbackData.sheets[0].rows[1], ["OF39", "สมชาย ใจดี", 450]);
});

test("normalizeSellerSettings, buildInvoice VAT base toggle, and getOrderLinkStatus", async () => {
  const { normalizeSellerSettings } = await import("../src/lib/settings");
  const { buildInvoice } = await import("../src/lib/invoice");
  const { getOrderLinkStatus } = await import("../src/lib/queries");

  const normalized = normalizeSellerSettings({
    name: "  บริษัท ชีเฮง จำกัด (สาขาใหม่) ",
    taxId: "065-5568002694",
    vatRate: 7,
    invoicePrefix: "ch",
    vatCalculationBase: "customer_paid",
    defaultPaperSize: "80mm",
    showSkuInAbbreviated: true,
    footerNote: "ขอบคุณที่ใช้บริการ",
  });

  assert.equal(normalized.name, "บริษัท ชีเฮง จำกัด (สาขาใหม่)");
  assert.equal(normalized.invoicePrefix, "CH");
  assert.equal(normalized.vatCalculationBase, "customer_paid");
  assert.equal(normalized.defaultPaperSize, "80mm");
  assert.equal(normalized.showSkuInAbbreviated, true);
  assert.equal(normalized.footerNote, "ขอบคุณที่ใช้บริการ");

  const sampleRow = {
    id: 99,
    importId: 1,
    externalId: "586694353227777627",
    transactionType: "คำสั่งซื้อ",
    isOrder: true,
    createdDate: "2026-10-20",
    paidDate: "2026-10-26",
    currency: "THB",
    income: 693,
    feeTotal: -184.79,
    adjustment: 0,
    payout: 508.21,
    productDetail: null,
    weightEstimated: null,
    weightCharged: null,
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    normalized: {
      externalId: "586694353227777627",
      transactionType: "คำสั่งซื้อ",
      isOrder: true,
      createdAt: "2026-10-20",
      paidAt: "2026-10-26",
      currency: "THB",
      fields: {
        productBeforeDiscount: 1750,
        productAfterDiscount: 693,
        storeDiscount: -1057,
        platformDiscount: -138.6,
        customerPayment: 554.4,
        shippingCustomerFee: 0,
        shippingPlatformDiscount: 55,
        feeTotal: -184.79,
        payout: 508.21,
      },
      mappedFields: [],
      feeGroups: {},
      unknownValues: [],
      checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
      warnings: [],
      raw: {},
      sourceRows: 1,
      firstRow: 1,
      rowIndexes: [1],
    },
    createdAt: "2026-10-26T00:00:00Z",
    invoiceNo: "TT2610/00422",
    channel: "TikTok",
    orderCode: "DI27",
  };

  // Default payout base (508.21)
  const invPayout = buildInvoice(sampleRow as never);
  assert.equal(invPayout.receiptTotal, 508.21);
  assert.equal(invPayout.receiptPreVatAmount, 474.96);
  assert.equal(invPayout.receiptVatAmount, 33.25);

  // Customer paid base (554.40)
  const invCustomerPaid = buildInvoice(sampleRow as never, normalized);
  assert.equal(invCustomerPaid.receiptTotal, 554.4);
  assert.equal(invCustomerPaid.receiptPreVatAmount, 518.13);
  assert.equal(invCustomerPaid.receiptVatAmount, 36.27);

  // Link status classification
  assert.equal(getOrderLinkStatus(sampleRow as never), "linked");
  assert.equal(
    getOrderLinkStatus({ ...sampleRow, orderCode: null } as never),
    "unlinked",
  );
  assert.equal(
    getOrderLinkStatus({
      ...sampleRow,
      transactionType: "คำสั่งซื้อ (OMS)",
      channel: "TikTok",
    } as never),
    "oms_only",
  );

  const { buildBill } = await import("../src/lib/bill");
  const billWithSlash = buildBill({
    ...sampleRow.normalized,
    fields: {
      ...sampleRow.normalized.fields,
      productDetail: "/",
    },
    rowIndexes: [42],
  });
  assert.equal(billWithSlash.productDetail, null);
  assert.deepEqual(billWithSlash.rowIndexes, [42]);

  // Saved buyer info for Full Tax Invoice overrides OMS customer info and persists taxId
  const invWithSavedBuyer = buildInvoice({
    ...sampleRow,
    customerName: "ลูกค้าเดิม",
    customerAddress: "ที่อยู่เดิม",
    buyerName: "บริษัท ทดสอบใบกำกับ จำกัด",
    buyerTaxId: "0105566778899",
    buyerAddress: "99/9 ถนนสุขุมวิท เขตวัฒนา กรุงเทพฯ 10110",
  } as never);
  assert.equal(invWithSavedBuyer.customer.name, "บริษัท ทดสอบใบกำกับ จำกัด");
  assert.equal(invWithSavedBuyer.customer.taxId, "0105566778899");
  assert.equal(
    invWithSavedBuyer.customer.address,
    "99/9 ถนนสุขุมวิท เขตวัฒนา กรุงเทพฯ 10110",
  );
});

test("supports custom column mappings for Shipnity and classifies new TikTok columns into income/fee/adjustment", async () => {
  const { detectAndParseOmsInput } = await import("../src/lib/ingest/oms-parse");
  const { recalculateTransactionWithRules } = await import("../src/lib/ingest/parse");
  const { buildBill } = await import("../src/lib/bill");

  // 1. Shipnity file with completely renamed columns
  const customShipnityRows: (string | number | null)[][] = [
    ["รหัสใบงานใหม่", "รหัสสต็อกใหม่", "ชื่อรายการใหม่", "ราคาต่อหน่วยใหม่", "จำนวนเบิก"],
    ["SHP-9901", "SKU-NEW-01", "เซรั่มสูตรใหม่", 390, 2],
  ];
  const shipnityBuffer = await buildXlsx([{ name: "Sheet1", rows: customShipnityRows }]);

  // Without custom mapping -> null
  const unmappedResult = await detectAndParseOmsInput(shipnityBuffer);
  assert.equal(unmappedResult, null);

  // With saved custom mapping -> parses as oms_items
  const mappedResult = await detectAndParseOmsInput(shipnityBuffer, {
    "รหัสใบงานใหม่": "orderCode",
    "รหัสสต็อกใหม่": "skuCode",
    "ชื่อรายการใหม่": "productName",
    "ราคาต่อหน่วยใหม่": "unitPrice",
    "จำนวนเบิก": "quantity",
  });
  assert.ok(mappedResult, "should parse Shipnity items with custom mapping");
  assert.equal(mappedResult.fileType, "oms_items");
  assert.equal(mappedResult.items.length, 1);
  assert.equal(mappedResult.items[0]?.orderCode, "SHP-9901");
  assert.equal(mappedResult.items[0]?.skuCode, "SKU-NEW-01");
  assert.equal(mappedResult.items[0]?.productName, "เซรั่มสูตรใหม่");
  assert.equal(mappedResult.items[0]?.unitPrice, 390);
  assert.equal(mappedResult.items[0]?.quantity, 2);

  // 2. TikTok Settlement file with a brand-new fee column ("ค่าธรรมเนียม AI พิเศษ" = -7)
  const tiktokRows: (string | number | null)[][] = [
    [
      "หมายเลขคำสั่งซื้อ/การปรับ",
      "ประเภทธุรกรรม",
      "เวลาที่สร้างคำสั่งซื้อ",
      "เวลาที่ชำระคำสั่งซื้อ",
      "สกุลเงิน",
      "ยอดการชำระเงินทั้งหมด",
      "รายได้ทั้งหมด",
      "ยอดรวมค่าสินค้าหลังหักส่วนลดจากผู้ขาย",
      "ค่าธรรมเนียมทั้งหมด",
      "ค่าธรรมเนียมคำสั่งซื้อ",
      "ค่าธรรมเนียม AI พิเศษ",
    ],
    [
      "588999000111222333",
      "คำสั่งซื้อ",
      "2026/10/05",
      "2026/10/05",
      "THB",
      "133",
      "150",
      "150",
      "-17",
      "-10",
      "-7",
    ],
  ];
  const tiktokBuffer = await buildXlsx([{ name: "Order details", rows: tiktokRows }]);

  // Before classifying "ค่าธรรมเนียม AI พิเศษ": feeDiff is -7, bill.checks.ok is false
  const parsedBefore = await parseWorkbook(tiktokBuffer);
  const txBefore = parsedBefore.transactions[0]!;
  assert.equal(txBefore.checks.feeDiff, -7);
  const billBefore = buildBill(txBefore);
  assert.equal(billBefore.checks.ok, false);
  assert.equal(parsedBefore.warnings.some((w) => w.code === "UNKNOWN_COLUMNS"), true);

  // After classifying "ค่าธรรมเนียม AI พิเศษ" as "fee": feeDiff becomes 0, bill.checks.ok becomes true
  const txAfter = recalculateTransactionWithRules(txBefore, {
    "ค่าธรรมเนียม AI พิเศษ": "fee",
  });
  assert.equal(txAfter.checks.feeDiff, 0);
  assert.equal(txAfter.checks.incomeDiff, 0);
  assert.equal(txAfter.checks.payoutDiff, 0);

  const billAfter = buildBill(txAfter);
  assert.equal(billAfter.checks.ok, true);
  assert.equal(
    billAfter.feeGroups.some(
      (g) => g.label === "ค่าธรรมเนียม AI พิเศษ" && g.amount === -7,
    ),
    true,
  );
  assert.equal(billAfter.unknownMoneyColumns.length, 0);
});

test("saveColumnMappingRules and getColumnMappingRules persist rules in app_settings and API enforces auth", async () => {
  const {
    getColumnMappingRules,
    saveColumnMappingRules,
  } = await import("../src/lib/column-mapping-settings");
  const { GET, PUT } = await import(
    "../src/app/api/settings/column-mappings/route"
  );

  let storedJson: string | null = null;
  const mockDb = {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes("SELECT value_json FROM app_settings")) {
        return { rows: storedJson ? [{ value_json: storedJson }] : [] };
      }
      if (sql.includes("INSERT INTO app_settings")) {
        storedJson = String(params?.[1] ?? "{}");
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  // Save custom header mapping and unknown column category
  const saved = await saveColumnMappingRules(
    {
      headerToFieldKey: { "รหัสใบสั่งซื้อ_ทดสอบ": "orderCode" },
      unknownColumnCategories: { "ค่าธรรมเนียม_ทดสอบ_AI": "fee" },
    },
    "admin",
    mockDb as never,
  );
  assert.equal(saved.headerToFieldKey["รหัสใบสั่งซื้อ_ทดสอบ"], "orderCode");
  assert.equal(saved.unknownColumnCategories["ค่าธรรมเนียม_ทดสอบ_AI"], "fee");

  // Read back from mockDb
  const loaded = await getColumnMappingRules(mockDb as never);
  assert.equal(loaded.headerToFieldKey["รหัสใบสั่งซื้อ_ทดสอบ"], "orderCode");
  assert.equal(loaded.unknownColumnCategories["ค่าธรรมเนียม_ทดสอบ_AI"], "fee");

  // Delete rule by setting empty string
  const afterDelete = await saveColumnMappingRules(
    {
      headerToFieldKey: { "รหัสใบสั่งซื้อ_ทดสอบ": "" },
      unknownColumnCategories: { "ค่าธรรมเนียม_ทดสอบ_AI": "" },
    },
    "admin",
    mockDb as never,
  );
  assert.equal(afterDelete.headerToFieldKey["รหัสใบสั่งซื้อ_ทดสอบ"], undefined);
  assert.equal(
    afterDelete.unknownColumnCategories["ค่าธรรมเนียม_ทดสอบ_AI"],
    undefined,
  );

  // Unauthenticated API requests are rejected
  const unauthGet = await GET(
    new Request("http://localhost:3001/api/settings/column-mappings"),
  );
  assert.equal(unauthGet.status, 401);

  const unauthPut = await PUT(
    new Request("http://localhost:3001/api/settings/column-mappings", {
      method: "PUT",
      headers: {
        host: "localhost:3001",
        origin: "http://localhost:3001",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    }),
  );
  assert.equal(unauthPut.status, 401);
});

test("buildBill aligns customer payment and settlement breakdown with TikTok Seller Center", async () => {
  const { buildBill } = await import("../src/lib/bill");
  const bill = buildBill({
    externalId: "586689341698966685",
    transactionType: "คำสั่งซื้อ",
    isOrder: true,
    createdAt: "2026-10-20",
    paidAt: "2026-10-26",
    currency: "THB",
    fields: {
      incomeTotal: 396,
      productAfterDiscount: 396,
      productBeforeDiscount: 1000,
      storeDiscount: -604,
      platformDiscount: 79.2,
      customerPayment: 316.8,
      feeTotal: -104.9,
      orderFee: -12.71,
      commission: -46.61,
      shippingTotal: 0,
      shippingActual: -48,
      shippingPlatformDiscount: 48,
      shippingCustomerFee: 0,
      shippingDiscountStore: 0,
      shippingSubsidy: 0,
      liveCoupon: -12.71,
      growth: -31.8,
      infrastructure: -1.07,
      payout: 291.1,
      weightEstimated: 2000,
      weightCharged: 2000,
    },
    mappedFields: [],
    feeGroups: {
      order_fee: { total: -12.71, children: {} },
      commission: { total: -46.61, children: {} },
      shipping: {
        total: 0,
        children: {
          shippingActual: -48,
          shippingPlatformDiscount: 48,
          shippingCustomerFee: 0,
        },
      },
      live_coupon: { total: -12.71, children: {} },
      growth: { total: -31.8, children: {} },
      infrastructure: { total: -1.07, children: {} },
    },
    unknownValues: [],
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    raw: {},
    sourceRows: 1,
    firstRow: 353,
    rowIndexes: [353],
  });

  // 1. Customer Payment Breakdown matches TikTok Seller Center (-79.20, -48.00)
  assert.equal(bill.customerPaymentBreakdown.productSubtotalAfterDiscount, 316.8);
  assert.equal(bill.customerPaymentBreakdown.productSubtotalBeforeDiscount, 1000);
  assert.equal(bill.customerPaymentBreakdown.sellerProductDiscount, -604);
  assert.equal(bill.customerPaymentBreakdown.tiktokProductDiscount, -79.2);
  assert.equal(bill.customerPaymentBreakdown.shippingAfterDiscount, 0);
  assert.equal(bill.customerPaymentBreakdown.shippingBeforeDiscount, 48);
  assert.equal(bill.customerPaymentBreakdown.sellerShippingDiscount, -0);
  assert.equal(bill.customerPaymentBreakdown.tiktokShippingDiscount, -48);
  assert.equal(bill.customerPaymentBreakdown.total, 316.8);

  // 2. Income lines contain only seller product revenue (396, 1000, -604)
  assert.deepEqual(
    bill.incomeLines.map((l) => ({ key: l.key, amount: l.amount })),
    [
      { key: "productAfterDiscount", amount: 396 },
      { key: "productBeforeDiscount", amount: 1000 },
      { key: "storeDiscount", amount: -604 },
    ],
  );

  // 3. Shipping fee group matches TikTok wording & includes weight + customer shipping sub-items
  const shipGroup = bill.feeGroups.find((g) => g.key === "shipping");
  assert.ok(shipGroup);
  assert.equal(shipGroup.label, "ยอดรวมค่าจัดส่งที่ร้านค้าจ่ายจริง");
  assert.equal(
    shipGroup.children[0].label,
    "ค่าธรรมเนียมการจัดส่งจริง (น้ำหนักที่เรียกเก็บเงิน: 2000 ก.)",
  );
  assert.equal(shipGroup.children[0].amount, -48);
  assert.equal(
    shipGroup.children[2].label,
    "ค่าธรรมเนียมการจัดส่งของลูกค้า (น้ำหนักพัสดุโดยประมาณ: 2000 ก.)",
  );
  assert.equal(shipGroup.children[2].amount, 0);
  assert.equal(shipGroup.children[3].label, "ค่าจัดส่งของลูกค้าก่อนหักส่วนลด");
  assert.equal(shipGroup.children[3].amount, 48);
  assert.equal(shipGroup.children[5].label, "ส่วนลดค่าจัดส่งจาก TikTok Shop");
  assert.equal(shipGroup.children[5].amount, -48);
});
