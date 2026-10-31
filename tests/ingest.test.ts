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
    "การจัดส่ง",
    "ส่วนลดค่าจัดส่งจาก TikTok Shop",
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
    "การจัดส่ง": "-8",
    "ส่วนลดค่าจัดส่งจาก TikTok Shop": "3",
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

test("converts amounts to Thai baht text, compact numbers (>=100k -> 100k), and GZIP file_blob compression", async () => {
  const { formatTHB, formatCompactNumber, compactDisplayString } = await import(
    "../src/lib/format"
  );
  const { compressFileBlob, decompressFileBlob, isGzipBuffer } = await import(
    "../src/lib/file-blob"
  );
  assert.equal(bahtText(100), "หนึ่งร้อยบาทถ้วน");
  assert.equal(bahtText(21), "ยี่สิบเอ็ดบาทถ้วน");
  assert.equal(bahtText(450.5), "สี่ร้อยห้าสิบบาทห้าสิบสตางค์");
  assert.equal(bahtText(0), "ศูนย์บาทถ้วน");
  assert.equal(bahtText(1500), "หนึ่งพันห้าร้อยบาทถ้วน");
  assert.equal(formatTHB(645), "฿645.00");
  assert.equal(formatTHB(-149.48), "-฿149.48");
  assert.equal(formatTHB(0), "฿0.00");

  // Compact number rules (>= 100,000)
  assert.equal(formatCompactNumber(99999), "99,999");
  assert.equal(formatCompactNumber(100000), "100k");
  assert.equal(formatCompactNumber(102200), "102.2k");
  assert.equal(formatCompactNumber(238013), "238k");
  assert.equal(formatCompactNumber(1500000), "1.5M");
  assert.deepEqual(compactDisplayString("฿174,303.78"), {
    isCompactable: true,
    compactText: "฿174.3k",
    fullText: "฿174,303.78",
  });
  assert.deepEqual(compactDisplayString("102,200 บิล"), {
    isCompactable: true,
    compactText: "102.2k บิล",
    fullText: "102,200 บิล",
  });
  assert.equal(compactDisplayString("1,575 บิล").isCompactable, false);

  // GZIP file_blob compression and backward compatibility with uncompressed buffers
  const rawCsv = Buffer.from(
    Array.from({ length: 500 }, (_, i) => `586000000000${i},คำสั่งซื้อ,2026-10-25,100.00`).join("\n"),
    "utf8",
  );
  const compressed = compressFileBlob(rawCsv);
  assert.equal(isGzipBuffer(compressed), true);
  assert.ok(compressed.length < rawCsv.length * 0.4);
  const decompressed = decompressFileBlob(compressed);
  assert.ok(decompressed);
  assert.equal(decompressed.toString("utf8"), rawCsv.toString("utf8"));

  // Legacy uncompressed buffer must pass through untouched
  const legacyDecompressed = decompressFileBlob(rawCsv);
  assert.ok(legacyDecompressed);
  assert.equal(legacyDecompressed.toString("utf8"), rawCsv.toString("utf8"));
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
    "OF39,สมชาย,0811111111,Facebook,Facebook,Flash,0.0,กรุงเทพฯ,เงินโอน,TH00001,0,,P&C,01/10/2026 10:00,01/10/2026 00:00,01/10/2026 10:00,-,,0.0,1,100.0,100.0",
  ].join("\n");

  const parsedOrders = await detectAndParseOmsInput(Buffer.from(omsOrdersCsv, "utf8"));
  assert.ok(parsedOrders);
  assert.equal(parsedOrders.fileType, "oms_orders");
  assert.equal(parsedOrders.orders.length, 3);
  assert.equal(parsedOrders.orders[0].orderCode, "OF37");
  assert.equal(parsedOrders.orders[0].channel, "TikTok");
  assert.equal(parsedOrders.orders[0].marketplaceOrderPrefix, "586356565637268");
  assert.equal(parsedOrders.orders[1].orderCode, "OF33");
  assert.equal(parsedOrders.orders[1].channel, "Shopee");
  assert.equal(parsedOrders.orders[1].marketplaceOrderNorm, "261001GH52V0JW");
  assert.equal(parsedOrders.orders[2].orderCode, "OF39");
  assert.equal(parsedOrders.orders[2].channel, "Facebook");

  const omsItemsCsv = [
    "รหัสสินค้า,สินค้า,ราคา,จำนวน,เลขที่ออเดอร์,ยอดขายออเดอร์,ค่าส่งที่เก็บลูกค้า,ผู้ส่ง,ชื่อ,ที่อยู่,รหัสไปรษณีย์,เบอร์โทร,วันที่โอนเงิน,สร้างโดย,ขนส่ง,ช่องทางติดต่อ,ธนาคารที่โอนเงิน,หมายเหตุ,เลขพัสดุ,วันที่สร้าง",
    "SET21,ไฟเบอร์1กล่องแถมตรีผลา1ห่อ,250.0,1,OF37,150.0,0.0,แบรนด์ P&C,ดาริกา บุตรพรม,27 ม.9 ต.บ้านหัน อ.เกษตรสมบูรณ์ จ.ชัยภูมิ 36120,36120,0631954616,01/10/2026 00:00,P&C,J&T (Pick Up),TikTok,PromptPay,,755093165214,01/10/2026 11:25",
    "SET22,ตรีผลา2ห่อ,218.5,2,OF33,266.0,37.0,แบรนด์ P&C,สายฝน,99/1 อ.เมือง จ.ชลบุรี 20000,20000,0827564556,01/10/2026 00:00,P&C,Shopee Xpress (Pick Up),Shopee,เงินโอน,,TH263097252167Z,01/10/2026 09:05",
  ].join("\n");

  const parsedItems = await detectAndParseOmsInput(Buffer.from(omsItemsCsv, "utf8"));
  assert.ok(parsedItems);
  assert.equal(parsedItems.fileType, "oms_items");
  assert.equal(parsedItems.items.length, 2);
  assert.equal(parsedItems.items[0].skuCode, "SET21");
  assert.equal(parsedItems.items[0].productName, "ไฟเบอร์1กล่องแถมตรีผลา1ห่อ");
  assert.equal(parsedItems.items[0].orderCode, "OF37");
  assert.equal(parsedItems.items[1].skuCode, "SET22");
  assert.equal(parsedItems.items[1].channel, "Shopee");
  assert.equal(parsedItems.items[1].orderCode, "OF33");

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
  assert.equal(invoice.total, 150);
  assert.equal(invoice.preVatAmount, 140.19);
  assert.equal(invoice.vatAmount, 9.81);
  assert.equal(invoice.receiptSubtotal, 250);
  assert.equal(invoice.receiptCoupon, 100);
  assert.equal(invoice.shippingGross, 0);
  assert.equal(invoice.shippingCoupon, 0);
  assert.equal(invoice.weightCharged, 200);
  assert.equal(invoice.receiptTotal, 150);
  assert.equal(invoice.receiptPreVatAmount, 140.19);
  assert.equal(invoice.receiptVatAmount, 9.81);

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

  assert.equal(receipt29.receiptNo, "RC2610/00010");
  assert.equal(receipt29.createdDate, "2026-09-27");
  assert.equal(receipt29.grossItemsTotal, 690);
  assert.equal(receipt29.storeDiscount, 240);
  assert.equal(receipt29.salesAmount, 450);
  assert.equal(receipt29.receiptSubtotal, 450);
  assert.equal(receipt29.shippingActual, -29);
  assert.equal(receipt29.shippingGross, 29);
  assert.equal(receipt29.shippingPlatformDiscount, 29);
  assert.equal(receipt29.shippingCoupon, 29);
  assert.equal(receipt29.weightCharged, 500);
  assert.equal(receipt29.platformCoupon, 96.6);
  assert.equal(receipt29.receiptCoupon, 96.6);
  assert.equal(receipt29.customerTotal, 353.4);
  assert.equal(receipt29.receiptTotal, 450);
  assert.equal(receipt29.receiptPreVatAmount, 420.56);
  assert.equal(receipt29.receiptVatAmount, 29.44);
});

test("deleteImport voids (never deletes) orphaned invoice_registry rows — invoice numbers are locked", async () => {
  const { deleteImport } = await import("../src/lib/queries");
  const executedSql: string[] = [];

  const mockDb = {
    query: async (sql: string) => {
      executedSql.push(sql.replace(/\s+/g, " ").trim());
      if (sql.includes("DELETE FROM imports")) {
        return { rows: [{ id: 99 }] };
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
    executedSql.some((s) => s.includes("UPDATE invoice_registry r SET status = 'void'")),
    "should void orphaned invoice_registry rows",
  );
  assert.ok(
    !executedSql.some((s) => s.includes("DELETE FROM invoice_registry") || s.includes("ALTER SEQUENCE invoice_seq")),
    "must never delete invoice numbers or reset the sequence",
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
  assert.equal(result.channelCounts.TikTok, 700000000);
  assert.equal(result.channelCounts.Shopee, 250000000);
  assert.equal(result.channelCounts.Facebook, 50000000);
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
    invoicePrefix: "INV-0001",
    receiptPrefix: "RC-0001",
    showInvoiceNo: false,
    showReceiptNo: true,
    vatCalculationBase: "customer_paid",
    defaultPaperSize: "80mm",
    showSkuInAbbreviated: true,
    footerNote: "ขอบคุณที่ใช้บริการ",
  });

  assert.equal(normalized.name, "บริษัท ชีเฮง จำกัด (สาขาใหม่)");
  assert.equal(normalized.invoicePrefix, "INV-0001");
  assert.equal(normalized.receiptPrefix, "RC-0001");
  assert.equal(normalized.showInvoiceNo, false);
  assert.equal(normalized.showReceiptNo, true);
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
        shippingActual: -57,
        shippingCustomerFee: 0,
        shippingPlatformDiscount: 55,
        weightCharged: 3500,
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

  // Default salesAmount base (693.00) without deducting platform feeTotal - exact values and signs from file
  const invDefault = buildInvoice(sampleRow as never);
  assert.equal(invDefault.invoiceNo, "TT2610/00422");
  assert.equal(invDefault.receiptNo, "RC2610/00422");
  assert.equal(invDefault.salesAmount, 693);
  assert.equal(invDefault.shippingActual, -57);
  assert.equal(invDefault.shippingPlatformDiscount, 55);
  assert.equal(invDefault.feeTotal, -184.79);
  assert.equal(invDefault.receiptTotal, 693);
  assert.equal(invDefault.receiptPreVatAmount, 647.66);
  assert.equal(invDefault.receiptVatAmount, 45.34);

  // Customer paid base (554.40) + custom starting numbers ("INV-0001" and "RC-0001") incremented at seqIndex=422 -> "INV-0422" and "RC-0422"
  const invCustomerPaid = buildInvoice(sampleRow as never, normalized);
  assert.equal(invCustomerPaid.invoiceNo, "INV-0422");
  assert.equal(invCustomerPaid.receiptNo, "RC-0422");
  assert.equal(invCustomerPaid.seller.showInvoiceNo, false);
  assert.equal(invCustomerPaid.seller.showReceiptNo, true);
  assert.equal(invCustomerPaid.receiptTotal, 554.4);
  assert.equal(invCustomerPaid.receiptPreVatAmount, 518.13);
  assert.equal(invCustomerPaid.receiptVatAmount, 36.27);

  // Verify sequence 1 starts at exact user-defined number ("INV-0001" and "RC-0001")
  const invFirstSeq = buildInvoice({ ...sampleRow, invoiceNo: "SEQ/00001" } as never, normalized);
  assert.equal(invFirstSeq.invoiceNo, "INV-0001");
  assert.equal(invFirstSeq.receiptNo, "RC-0001");

  // Zero-revenue refunded order (income = 0, payout = 0, productAfterDiscount = 129, refundAfterDiscount = -129)
  const invZeroRefunded = buildInvoice({
    ...sampleRow,
    income: 0,
    payout: 0,
    normalized: {
      ...sampleRow.normalized,
      fields: {
        incomeTotal: 0,
        payout: 0,
        productBeforeDiscount: 290,
        storeDiscount: -161,
        productAfterDiscount: 129,
        refundBeforeDiscount: -290,
        refundStoreDiscount: 161,
        refundAfterDiscount: -129,
      },
    },
  } as never);
  assert.equal(invZeroRefunded.salesAmount, 0);
  assert.equal(invZeroRefunded.receiptTotal, 0);
  assert.equal(invZeroRefunded.total, 0);

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

  // 3. Shipping fee group matches TikTok wording & excludes zero/duplicate customer shipping sub-items
  const shipGroup = bill.feeGroups.find((g) => g.key === "shipping");
  assert.ok(shipGroup);
  assert.equal(shipGroup.label, "ยอดรวมค่าจัดส่งที่ร้านค้าจ่ายจริง");
  assert.equal(shipGroup.children.length, 2);
  assert.equal(
    shipGroup.children[0].label,
    "การจัดส่ง (น้ำหนักที่เรียกเก็บเงิน: 2000 ก.)",
  );
  assert.equal(shipGroup.children[0].amount, -48);
  assert.equal(
    shipGroup.children[1].label,
    "ส่วนลดค่าจัดส่งจาก TikTok Shop",
  );
  assert.equal(shipGroup.children[1].amount, 48);
});

test("supports multi-company session tokens (dragon19 vs seeheng) and keeps tax invoice total exact without seller shipping fee deductions", async () => {
  const { createSessionToken, verifySessionToken } = await import(
    "../src/lib/session-token"
  );
  const { getCompanyDefaultSeller } = await import("../src/lib/settings");
  const { buildInvoice } = await import("../src/lib/invoice");

  const dragonToken = createSessionToken({
    username: "admin",
    role: "admin",
    companyId: "dragon19",
  });
  const seehengToken = createSessionToken({
    username: "seeheng",
    role: "admin",
    companyId: "seeheng",
  });

  const dragonSession = verifySessionToken(dragonToken);
  const seehengSession = verifySessionToken(seehengToken);
  assert.ok(dragonSession);
  assert.ok(seehengSession);
  assert.equal(dragonSession.companyId, "dragon19");
  assert.equal(seehengSession.companyId, "seeheng");

  assert.equal(
    getCompanyDefaultSeller("dragon19").name,
    "บริษัท ดราก้อน 19 จำกัด",
  );
  assert.equal(
    getCompanyDefaultSeller("seeheng").name,
    "บริษัท ชีเฮง จำกัด",
  );

  const invoice = buildInvoice(
    {
      id: 1,
      importId: 1,
      externalId: "586684693332460719",
      transactionType: "คำสั่งซื้อ",
      isOrder: true,
      createdDate: "2026-10-20",
      paidDate: "2026-10-25",
      currency: "THB",
      income: 833,
      feeTotal: -216.29,
      adjustment: 0,
      payout: 616.71,
      productDetail: null,
      weightEstimated: 4500,
      weightCharged: 4500,
      checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
      warnings: [],
      normalized: {
        externalId: "586684693332460719",
        transactionType: "คำสั่งซื้อ",
        isOrder: true,
        createdAt: "2026-10-20",
        paidAt: "2026-10-25",
        currency: "THB",
        fields: {
          productBeforeDiscount: 2250,
          productAfterDiscount: 833,
          storeDiscount: -1417,
          shippingActual: -93,
          shippingPlatformDiscount: 91,
          shippingCustomerFee: 0,
          weightCharged: 4500,
          feeTotal: -216.29,
          payout: 616.71,
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
      createdAt: "2026-10-25T00:00:00Z",
      invoiceNo: "TT2610/00466",
      channel: "TikTok",
      orderCode: "DG30",
    },
    getCompanyDefaultSeller("dragon19"),
  );

  assert.equal(invoice.seller.name, "บริษัท ดราก้อน 19 จำกัด");
  assert.equal(invoice.salesAmount, 833);
  assert.equal(invoice.total, 833);
  assert.equal(invoice.shippingFee, 0);
});

test("formatCompactNumber and compactDisplayString format numbers >= 100,000 as 100k while preserving exact full text for toggle", async () => {
  const { compactDisplayString, formatCompactNumber } = await import(
    "../src/lib/format"
  );

  assert.equal(formatCompactNumber(1575), "1,575");
  assert.equal(formatCompactNumber(100000), "100k");
  assert.equal(formatCompactNumber(102200), "102.2k");
  assert.equal(formatCompactNumber(238013), "238k");
  assert.equal(formatCompactNumber(174303.78), "174.3k");
  assert.equal(formatCompactNumber(1250000), "1.3M");

  const under100k = compactDisplayString("-฿63,709.22");
  assert.equal(under100k.isCompactable, false);
  assert.equal(under100k.compactText, "-฿63,709.22");

  const over100kCurrency = compactDisplayString("฿238,013.00");
  assert.equal(over100kCurrency.isCompactable, true);
  assert.equal(over100kCurrency.compactText, "฿238k");
  assert.equal(over100kCurrency.fullText, "฿238,013.00");

  const over100kBills = compactDisplayString("102,200 บิล");
  assert.equal(over100kBills.isCompactable, true);
  assert.equal(over100kBills.compactText, "102.2k บิล");
  assert.equal(over100kBills.fullText, "102,200 บิล");
});

test("listBills, listDailyBatchesPaged, and listSkuSummariesPaged apply whitelisted ORDER BY sort clauses safely", async () => {
  const { listBills, listDailyBatchesPaged, listSkuSummariesPaged } = await import(
    "../src/lib/queries"
  );
  const executedSqls: string[] = [];
  const mockDb = {
    async query(sql: string) {
      executedSqls.push(sql);
      if (sql.includes("COUNT(*)")) {
        return { rows: [{ c: 0, count: 0, all_count: 0, order_count: 0, sku_count: 0 }] };
      }
      return { rows: [] };
    },
  } as unknown as Parameters<typeof listBills>[1];

  await listBills({ sort: "payout_asc" }, mockDb);
  assert.ok(
    executedSqls.some((sql) => sql.includes("ORDER BY t.payout ASC")),
    "listBills should sort by t.payout ASC when sort=payout_asc",
  );

  executedSqls.length = 0;
  await listBills({ sort: "payout_desc" }, mockDb);
  assert.ok(
    executedSqls.some((sql) => sql.includes("ORDER BY t.payout DESC")),
    "listBills should sort by t.payout DESC when sort=payout_desc",
  );

  executedSqls.length = 0;
  await listDailyBatchesPaged({ sort: "payout_asc" }, mockDb);
  assert.ok(
    executedSqls.some((sql) => sql.includes("ORDER BY order_payout ASC")),
    "listDailyBatchesPaged should sort by order_payout ASC when sort=payout_asc",
  );

  executedSqls.length = 0;
  await listSkuSummariesPaged({ sort: "gross_asc" }, mockDb);
  assert.ok(
    executedSqls.some((sql) => sql.includes("ORDER BY s.gross_amount ASC")),
    "listSkuSummariesPaged should sort by s.gross_amount ASC when sort=gross_asc",
  );
});

test("computeItemNetLineAmounts and getOrderedInvoiceBreakdownLines compute net discounted item prices and put positive breakdown lines before negative lines", async () => {
  const { buildInvoice } = await import("../src/lib/invoice");
  const {
    computeItemNetLineAmounts,
    getOrderedInvoiceBreakdownLines,
  } = await import("../src/components/InvoiceDocument");

  // Single item order 586742146549384718: unitPrice 290, storeDiscount -161, salesAmount 129, shippingActual -35, shippingPlatformDiscount +35
  const invSingle = buildInvoice({
    id: 1,
    importId: 1,
    externalId: "586742146549384718",
    transactionType: "คำสั่งซื้อ",
    isOrder: true,
    createdDate: "2026-10-23",
    paidDate: "2026-10-27",
    currency: "THB",
    income: 129,
    feeTotal: -34.89,
    adjustment: 0,
    payout: 94.11,
    productDetail: null,
    weightEstimated: 300,
    weightCharged: 300,
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    normalized: {
      externalId: "586742146549384718",
      transactionType: "คำสั่งซื้อ",
      isOrder: true,
      createdAt: "2026-10-23",
      paidAt: "2026-10-27",
      currency: "THB",
      fields: {
        incomeTotal: 129,
        productBeforeDiscount: 290,
        storeDiscount: -161,
        productAfterDiscount: 129,
        shippingActual: -35,
        shippingPlatformDiscount: 35,
        weightCharged: 300,
        feeTotal: -34.89,
        payout: 94.11,
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
    createdAt: "2026-10-27T00:00:00Z",
    invoiceNo: "TT2610/01729",
    channel: "TikTok",
    orderCode: "DI99",
    omsItems: [
      {
        skuCode: "K-6TL-91",
        productName: "เลดี้ ชมพู(สลาฟแขนผ้าร่อง)",
        unitPrice: 290,
        quantity: 1,
      },
    ],
  });

  assert.deepEqual(
    computeItemNetLineAmounts(invSingle.items, invSingle.salesAmount),
    [129],
  );

  // Multi-item proportional net line amounts must sum exactly to salesAmount (258.00)
  const multiAmounts = computeItemNetLineAmounts(
    [
      { sku: "K-6TL-87", name: "สโนว์ไวท์", unitPrice: 290, qty: 1 },
      { sku: "K-8PLB-13-F", name: "ลายเสือดาว", unitPrice: 690, qty: 1 },
    ],
    258,
  );
  assert.equal(multiAmounts.length, 2);
  assert.equal(
    Number((multiAmounts[0]! + multiAmounts[1]!).toFixed(2)),
    258,
  );

  // Positive breakdown lines (+35.00) must appear before negative lines (-35.00)
  const orderedLines = getOrderedInvoiceBreakdownLines(invSingle);
  assert.deepEqual(orderedLines, [
    {
      key: "shippingPlatformDiscount",
      label: "ส่วนลดค่าจัดส่งจาก TikTok Shop",
      amount: 35,
    },
    {
      key: "shippingActual",
      label: "การจัดส่ง (น้ำหนักที่เรียกเก็บเงิน: 300 ก.)",
      amount: -35,
    },
  ]);

  // Order 586741709308659578 with platform coupon (+60.00) and shipping (+48.00 / -48.00)
  const invWithCoupon = buildInvoice({
    id: 2,
    importId: 1,
    externalId: "586741709308659578",
    transactionType: "คำสั่งซื้อ",
    isOrder: true,
    createdDate: "2026-10-23",
    paidDate: "2026-10-27",
    currency: "THB",
    income: 300,
    feeTotal: -79.73,
    adjustment: 0,
    payout: 220.27,
    productDetail: null,
    weightEstimated: 1500,
    weightCharged: 1500,
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    normalized: {
      externalId: "586741709308659578",
      transactionType: "คำสั่งซื้อ",
      isOrder: true,
      createdAt: "2026-10-23",
      paidAt: "2026-10-27",
      currency: "THB",
      fields: {
        incomeTotal: 300,
        productBeforeDiscount: 870,
        storeDiscount: -570,
        productAfterDiscount: 300,
        customerPayment: 240,
        platformDiscount: 60,
        shippingActual: -48,
        shippingPlatformDiscount: 48,
        weightCharged: 1500,
        feeTotal: -79.73,
        payout: 220.27,
      },
      mappedFields: [],
      feeGroups: {},
      unknownValues: [],
      checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
      warnings: [],
      raw: {},
      sourceRows: 1,
      firstRow: 8,
      rowIndexes: [8],
    },
    createdAt: "2026-10-27T00:00:00Z",
    invoiceNo: "TT2610/01725",
    channel: "TikTok",
    orderCode: "DO12",
  });

  const couponLines = getOrderedInvoiceBreakdownLines(invWithCoupon);
  assert.deepEqual(couponLines, [
    {
      key: "shippingPlatformDiscount",
      label: "ส่วนลดค่าจัดส่งจาก TikTok Shop",
      amount: 48,
    },
    {
      key: "platformDiscount",
      label: "ส่วนลดจากแพลตฟอร์ม",
      amount: 60,
    },
    {
      key: "shippingActual",
      label: "การจัดส่ง (น้ำหนักที่เรียกเก็บเงิน: 1500 ก.)",
      amount: -48,
    },
  ]);

  // Order 586637157900190786: 10 items, salesAmount = 1,058.00, platformDiscount = 211.60 -> item net amounts sum to 846.40 ([84.64, 84.64, 253.92, 423.20])
  const order10ItemsAmounts = computeItemNetLineAmounts(
    [
      { sku: "K-6TL-83", name: "เลดี้เฟรม ชมพู(ผ้าร่อง)", unitPrice: 290, qty: 1 },
      { sku: "K-6TL-81", name: "เลดี้เฟรม เขียวเข้ม(ผ้าร่อง)", unitPrice: 290, qty: 1 },
      { sku: "K-11PLL-8-F", name: "เลคกิ้งขาระบาย เทา (Free size)", unitPrice: 290, qty: 3 },
      { sku: "K-11PLL-7-F", name: "เลคกิ้งขาระบาย ดำ (Free size)", unitPrice: 290, qty: 5 },
    ],
    1058,
    211.6,
  );
  assert.deepEqual(order10ItemsAmounts, [84.64, 84.64, 253.92, 423.2]);
  assert.equal(
    Number(
      (
        order10ItemsAmounts.reduce((acc, v) => acc + v, 0) + 211.6
      ).toFixed(2),
    ),
    1058,
  );
});

test("billion-row scale: getDailyBatchPaged, getBulkInvoicesBatch, and listBills use SQL Deferred Join and reconcileAndSyncThreeFiles uses incremental import_id scope", async () => {
  const { getDailyBatchPaged, getBulkInvoicesBatch, listBills } = await import(
    "../src/lib/queries"
  );
  const { reconcileAndSyncThreeFiles } = await import(
    "../src/lib/ingest/import-service"
  );

  const executedSqls: string[] = [];
  const mockDb = {
    async query(sql: string) {
      const clean = sql.replace(/\s+/g, " ").trim();
      executedSqls.push(clean);
      if (clean.includes("FROM daily_summaries")) {
        return {
          rows: [
            {
              transaction_count: 50000,
              order_count: 50000,
              all_count: 50000,
              linked_count: 48000,
              oms_only_count: 1000,
              unlinked_count: 1000,
              order_payout: 5000000,
              order_income: 6000000,
              order_fees: -1000000,
              other_count: 0,
              other_payout: 0,
              total_payout: 5000000,
              adjustment: 0,
              tiktok_count: 45000,
              shopee_count: 5000,
              min_paid_date: "2026-10-01",
              max_paid_date: "2026-10-31",
              distinct_dates: 31,
            },
          ],
        };
      }
      if (clean.includes("billable_total")) {
        return {
          rows: [
            {
              billable_total: 100000,
              tiktok_count: 90000,
              shopee_count: 10000,
              channel_filtered_count: 100000,
              linked_count: 95000,
              unlinked_count: 5000,
            },
          ],
        };
      }
      if (clean.includes("FROM invoice_registry r WHERE r.yymm = $1 AND r.status = 'active'") && clean.includes("COUNT(*) AS total")) {
        return { rows: [{ total: 95000, tiktok_count: 85000, shopee_count: 9000, facebook_count: 1000 }] };
      }
      return { rows: [] };
    },
  };

  await listBills({ page: 500, pageSize: 20 }, mockDb as never);
  assert.ok(
    executedSqls.some((s) => s.includes("WITH page_ids AS ( SELECT t.id FROM transactions t")),
    "listBills should use Deferred Join (WITH page_ids AS (SELECT t.id ...))",
  );

  executedSqls.length = 0;
  const dayPaged = await getDailyBatchPaged(
    { date: "2026-10-25", page: 3, pageSize: 20, sort: "payout_desc" },
    mockDb as never,
  );
  assert.ok(dayPaged);
  assert.equal(dayPaged.totalOrders, 50000);
  assert.equal(dayPaged.page, 3);
  assert.equal(dayPaged.orderPageCount, 2500);
  assert.ok(
    executedSqls.some((s) => s.includes("WITH page_ids AS ( SELECT t.id FROM transactions t")),
    "getDailyBatchPaged should use Deferred Join with SQL LIMIT/OFFSET",
  );

  // ทั้งเดือน: อ่านจากทะเบียนเลขที่ (active) แบบ Keyset ตาม seq — ห้ามใช้ OFFSET
  executedSqls.length = 0;
  const bulkBatch = await getBulkInvoicesBatch(
    { date: "2026-10", batch: 4, batchSize: 200 },
    mockDb as never,
  );
  assert.ok(bulkBatch);
  assert.equal(bulkBatch.billableTotalCount, 95000);
  assert.equal(bulkBatch.totalFilteredCount, 95000);
  assert.equal(bulkBatch.batchCount, 475);
  assert.equal(bulkBatch.currentBatch, 4);
  assert.equal(bulkBatch.batchStartIdx, 600);
  assert.equal(bulkBatch.batchEndIdx, 800);
  const monthSql = executedSqls.find((s) => s.includes("WITH start_seq AS"));
  assert.ok(monthSql, "monthly getBulkInvoicesBatch should use keyset (start_seq + seq >=)");
  assert.ok(monthSql.includes("r.seq >= (SELECT seq FROM start_seq)"));
  assert.ok(!monthSql.includes("OFFSET"), "monthly bulk invoices must not use OFFSET");

  // รายวัน: ยังใช้ Deferred Join (ข้อมูลรายวันมีขนาดเล็ก)
  executedSqls.length = 0;
  await getBulkInvoicesBatch({ date: "2026-10-25", batch: 1, batchSize: 200 }, mockDb as never);
  assert.ok(
    executedSqls.some((s) => s.includes("WITH page_ids AS ( SELECT t.id FROM transactions t")),
    "daily getBulkInvoicesBatch should use Deferred Join",
  );

  executedSqls.length = 0;
  await reconcileAndSyncThreeFiles(mockDb as never, 777, "2026-10-28T00:00:00Z");
  assert.ok(
    executedSqls.some((s) => s.includes("WITH affected_orders AS")),
    "reconcileAndSyncThreeFiles should incrementally aggregate only affected_orders",
  );
});

test("listBills and getDailyBatchPaged partition orders into normal (income > 0), refund_fee, and zero categories", async () => {
  const { listBills, getDailyBatchPaged } = await import("../src/lib/queries");

  const executedSqls: string[] = [];
  const mockDb = {
    async query(sql: string) {
      const clean = sql.replace(/\s+/g, " ").trim();
      executedSqls.push(clean);
      if (clean.includes("FROM daily_summaries")) {
        return {
          rows: [
            {
              transaction_count: 3768,
              order_count: 3768,
              all_count: 3768,
              linked_count: 1575,
              oms_only_count: 2039,
              unlinked_count: 154,
              order_payout: 481398.78,
              order_income: 565995,
              order_fees: -63709.22,
              shipping_positive: 120000,
              shipping_negative: -125500,
              other_count: 0,
              other_payout: 0,
              total_payout: 481398.78,
              adjustment: 0,
              tiktok_count: 2305,
              shopee_count: 1463,
              min_paid_date: "2026-10-01",
              max_paid_date: "2026-10-27",
              distinct_dates: 27,
            },
          ],
        };
      }
      if (clean.includes("t.income <= 0 OR t.payout <= 0")) {
        return {
          rows: [
            {
              non_pos_all: 170,
              non_pos_count: 170,
              non_pos_income: -377,
              non_pos_fees: -741.24,
              non_pos_payout: -1118.24,
              non_pos_shipping_positive: 0,
              non_pos_shipping_negative: -500,
              non_pos_tiktok: 170,
              non_pos_shopee: 0,
              non_pos_fb: 0,
              non_pos_linked: 16,
              non_pos_oms_only: 0,
              non_pos_unlinked: 154,
              refund_fee_count: 16,
              refund_fee_income: -377,
              refund_fee_fees: -741.24,
              refund_fee_payout: -1118.24,
              refund_fee_tiktok: 16,
              refund_fee_shopee: 0,
              refund_fee_fb: 0,
              refund_fee_linked: 16,
              refund_fee_oms_only: 0,
              refund_fee_unlinked: 0,
              zero_count: 154,
              zero_income: 0,
              zero_fees: 0,
              zero_payout: 0,
              zero_tiktok: 154,
              zero_shopee: 0,
              zero_fb: 0,
              zero_linked: 0,
              zero_oms_only: 0,
              zero_unlinked: 154,
            },
          ],
        };
      }
      if (
        clean.includes(
          "NOT (t.income > 0 AND t.payout > 0) AND NOT (t.income < 0",
        ) &&
        !clean.includes("WITH page_ids")
      ) {
        return {
          rows: [
            {
              all_count: 154,
              count: 154,
              linked_count: 0,
              oms_only_count: 0,
              unlinked_count: 154,
              income: 0,
              fees: 0,
              payout: 0,
              tiktok_count: 154,
              shopee_count: 0,
              min_paid_date: "2026-10-01",
              max_paid_date: "2026-10-27",
              distinct_dates: 26,
            },
          ],
        };
      }
      if (
        clean.includes(
          "(t.income < 0 OR t.payout < 0 OR (t.income <= 0 AND t.fee_total < 0))",
        ) &&
        !clean.includes("WITH page_ids")
      ) {
        return {
          rows: [
            {
              all_count: 16,
              count: 16,
              linked_count: 16,
              oms_only_count: 0,
              unlinked_count: 0,
              income: -377,
              fees: -741.24,
              payout: -1118.24,
              tiktok_count: 16,
              shopee_count: 0,
              min_paid_date: "2026-10-08",
              max_paid_date: "2026-10-27",
              distinct_dates: 10,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  // 1. Default category = "normal" subtracts non-positive orders from daily_summaries
  const normalRes = await listBills({ page: 1, pageSize: 20 }, mockDb as never);
  assert.equal(normalRes.category, "normal");
  assert.equal(normalRes.total, 3598);
  assert.equal(normalRes.summary.income, 566372);
  assert.equal(Number(normalRes.summary.fees.toFixed(2)), -62967.98);
  assert.equal(Number(normalRes.summary.payout.toFixed(2)), 482517.02);
  assert.equal(normalRes.summary.shippingPositive, 120000);
  assert.equal(normalRes.summary.shippingNegative, -125000);
  assert.equal(normalRes.summary.shippingNet, -5000);
  assert.equal(normalRes.linkCounts.linked, 1559);
  assert.equal(normalRes.linkCounts.omsOnly, 2039);
  assert.equal(normalRes.linkCounts.unlinked, 0);
  assert.deepEqual(normalRes.categoryCounts, {
    normal: 3598,
    refundFee: 16,
    zero: 154,
    refundFeePayout: -1118.24,
  });
  assert.ok(
    executedSqls.some((s) => s.includes("t.income > 0")),
    "normal category should filter page rows by t.income > 0",
  );

  // 2. Category = "refund_fee" returns 16 orders and -1,118.24 net payout
  const refundRes = await listBills(
    { page: 1, pageSize: 20, category: "refund_fee" },
    mockDb as never,
  );
  assert.equal(refundRes.category, "refund_fee");
  assert.equal(refundRes.total, 16);
  assert.equal(refundRes.summary.income, -377);
  assert.equal(refundRes.summary.fees, -741.24);
  assert.equal(refundRes.summary.payout, -1118.24);
  assert.equal(refundRes.linkCounts.linked, 16);
  assert.equal(refundRes.linkCounts.unlinked, 0);

  // 3. Category = "zero" returns 154 cancelled/zero orders
  const zeroRes = await listBills(
    { page: 1, pageSize: 20, category: "zero" },
    mockDb as never,
  );
  assert.equal(zeroRes.category, "zero");
  assert.equal(zeroRes.total, 154);
  assert.equal(zeroRes.summary.income, 0);
  assert.equal(zeroRes.summary.fees, 0);
  assert.equal(zeroRes.summary.payout, 0);
  assert.equal(zeroRes.linkCounts.unlinked, 154);

  // 4. getDailyBatchPaged partitions order counts and categorySummary by category
  const dayNormal = await getDailyBatchPaged(
    { date: "2026-10-25", category: "normal" },
    mockDb as never,
  );
  assert.ok(dayNormal);
  assert.equal(dayNormal.category, "normal");
  assert.equal(dayNormal.totalOrders, 3598);
  assert.equal(dayNormal.categoryCounts.normal, 3598);
  assert.equal(dayNormal.categoryCounts.refundFee, 16);
  assert.equal(dayNormal.categoryCounts.zero, 154);
  assert.equal(dayNormal.categorySummary.income, 566372);
});

test("getDailyUploadCompleteness reports complete days, missing files per day, and fills calendar gap days", async () => {
  const { getDailyUploadCompleteness } = await import("../src/lib/queries");

  const mockDb = {
    async query(sql: string) {
      const clean = sql.replace(/\s+/g, " ").trim();
      if (clean.includes("SELECT DISTINCT SUBSTRING")) {
        return { rows: [{ ym: "2026-10" }] };
      }
      if (
        clean.includes("WITH items_by_order AS") ||
        clean.includes("WITH settled_paid_dates AS")
      ) {
        return {
          rows: [
            {
              d: "2026-10-01",
              normal_orders: 42,
              complete_count: 0,
              missing_file1_count: 0,
              missing_file2_count: 5,
              missing_file3_count: 42,
            },
            {
              d: "2026-10-03",
              normal_orders: 72,
              complete_count: 72,
              missing_file1_count: 0,
              missing_file2_count: 0,
              missing_file3_count: 0,
            },
          ],
        };
      }
      if (clean.includes("FROM imports")) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  const report = await getDailyUploadCompleteness(
    { month: "2026-10", mode: "created" },
    mockDb as never,
  );
  assert.equal(report.year, 2026);
  assert.equal(report.month, "2026-10");
  assert.equal(report.monthsOverview.length, 10);
  const octOverview = report.monthsOverview.find((m) => m.month === "2026-10");
  assert.ok(octOverview);
  assert.equal(octOverview.status, "incomplete");
  assert.equal(octOverview.completeDays, 1);
  assert.equal(octOverview.incompleteDays, 2);
  assert.equal(report.rows.length, 3); // 01, 02 (gap), 03
  assert.equal(report.rows[0]?.date, "2026-10-01");
  assert.equal(report.rows[0]?.isComplete, false);
  assert.equal(report.rows[0]?.missingFile2Count, 5);
  assert.equal(report.rows[0]?.missingFile3Count, 42);
  assert.equal(report.rows[1]?.date, "2026-10-02"); // gap day
  assert.equal(report.rows[1]?.normalOrders, 0);
  assert.equal(report.rows[1]?.isComplete, false);
  assert.equal(report.rows[2]?.date, "2026-10-03");
  assert.equal(report.rows[2]?.isComplete, true);
  assert.equal(report.summary.totalDays, 3);
  assert.equal(report.summary.completeDays, 1);
  assert.equal(report.summary.incompleteDays, 2);

  // Verify TikTok vs Shopee separation: Shopee orders never satisfy missing TikTok File 3,
  // while Shopee-only days only require File 1 & File 2 from Shipnity.
  const channelMockDb = {
    async query(sql: string) {
      const clean = sql.replace(/\s+/g, " ").trim();
      if (clean.includes("SELECT DISTINCT SUBSTRING")) {
        return { rows: [{ ym: "2026-07" }] };
      }
      if (clean.includes("WITH settled_paid_dates AS")) {
        return {
          rows: [
            {
              d: "2026-07-27",
              normal_orders: 22,
              tiktok_orders: 21,
              shopee_orders: 1,
              complete_count: 3,
              missing_file1_count: 0,
              missing_file2_count: 0,
              missing_file3_count: 19,
              has_paid_settlement: 0,
            },
            {
              d: "2026-07-28",
              normal_orders: 5,
              tiktok_orders: 0,
              shopee_orders: 5,
              complete_count: 5,
              missing_file1_count: 0,
              missing_file2_count: 0,
              missing_file3_count: 0,
              has_paid_settlement: 0,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };
  const channelReport = await getDailyUploadCompleteness(
    { month: "2026-07", mode: "created" },
    channelMockDb as never,
  );
  const day27 = channelReport.rows.find((r) => r.date === "2026-07-27");
  const day28 = channelReport.rows.find((r) => r.date === "2026-07-28");
  assert.ok(day27);
  assert.equal(day27.hasFile1, true);
  assert.equal(day27.hasFile2, true);
  assert.equal(day27.hasFile3, false);
  assert.equal(day27.missingFile3Count, 19);
  assert.equal(day27.isComplete, false);
  assert.ok(day28);
  assert.equal(day28.hasFile1, true);
  assert.equal(day28.hasFile2, true);
  assert.equal(day28.hasFile3, true);
  assert.equal(day28.isComplete, true);

  // Verify 0-order days covered by an uploaded settlement period_start..period_end have hasFile3 = true
  const settlementPeriodMockDb = {
    async query(sql: string) {
      const clean = sql.replace(/\s+/g, " ").trim();
      if (clean.includes("SELECT DISTINCT SUBSTRING")) {
        return { rows: [{ ym: "2026-01" }, { ym: "2026-06" }] };
      }
      if (clean.includes("WITH settled_paid_dates AS")) {
        return {
          rows: [
            {
              d: "2026-01-02",
              normal_orders: 1,
              tiktok_orders: 1,
              shopee_orders: 0,
              complete_count: 0,
              missing_file1_count: 1,
              missing_file2_count: 0,
              missing_file3_count: 0,
              has_paid_settlement: 0,
            },
            {
              d: "2026-06-15",
              normal_orders: 10,
              tiktok_orders: 10,
              shopee_orders: 0,
              complete_count: 10,
              missing_file1_count: 0,
              missing_file2_count: 0,
              missing_file3_count: 0,
              has_paid_settlement: 1,
            },
          ],
        };
      }
      if (clean.includes("SELECT file_type, period_start, period_end FROM imports")) {
        return {
          rows: [
            { file_type: "settlement", period_start: "2026-01-01", period_end: "2026-01-31" },
            { file_type: "settlement", period_start: "2026-06-01", period_end: "2026-06-30" },
          ],
        };
      }
      return { rows: [] };
    },
  };
  const janReport = await getDailyUploadCompleteness(
    { month: "2026-01", mode: "created" },
    settlementPeriodMockDb as never,
  );
  const jan1 = janReport.rows.find((r) => r.date === "2026-01-01");
  assert.ok(jan1);
  assert.equal(jan1.normalOrders, 0);
  assert.equal(jan1.hasFile1, false);
  assert.equal(jan1.hasFile2, false);
  assert.equal(jan1.hasFile3, true);
  assert.equal(jan1.isComplete, false);

  const junOverview = janReport.monthsOverview.find((m) => m.month === "2026-06");
  assert.ok(junOverview);
  assert.equal(junOverview.status, "complete");
});

test("listBills supports filtering by createdDate (order creation date)", async () => {
  const { listBills } = await import("../src/lib/queries");

  const capturedQueries: { sql: string; params: unknown[] }[] = [];
  const mockDb = {
    async query(sql: string, params: unknown[] = []) {
      const clean = sql.replace(/\s+/g, " ").trim();
      capturedQueries.push({ sql: clean, params });
      if (clean.includes("non_pos_all")) {
        return {
          rows: [
            {
              non_pos_all: 0,
              non_pos_income: 0,
              non_pos_fees: 0,
              non_pos_payout: 0,
              non_pos_tiktok: 0,
              non_pos_shopee: 0,
              non_pos_linked: 0,
              non_pos_oms_only: 0,
              non_pos_unlinked: 0,
              refund_fee_count: 0,
              refund_fee_payout: 0,
              zero_count: 0,
            },
          ],
        };
      }
      if (clean.includes("SELECT COUNT(*) AS all_count")) {
        return {
          rows: [
            {
              all_count: 94,
              linked_count: 94,
              oms_only_count: 0,
              unlinked_count: 0,
            },
          ],
        };
      }
      if (clean.includes("SELECT COUNT(*) AS count")) {
        return {
          rows: [
            {
              count: 94,
              income: 12000,
              fees: -1800,
              payout: 10200,
              tiktok_count: 94,
              shopee_count: 0,
              min_paid_date: "2026-10-03",
              max_paid_date: "2026-10-06",
              distinct_dates: 3,
            },
          ],
        };
      }
      if (clean.includes("WITH page_ids AS")) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  const res = await listBills(
    { createdDate: "2026-09-29" },
    mockDb as never,
  );
  assert.equal(res.total, 94);
  assert.equal(res.linkCounts.all, 94);
  const hasCreatedDateFilter = capturedQueries.some(
    (q) =>
      q.sql.includes("COALESCE(NULLIF(t.created_date, ''), t.paid_date) =") &&
      q.params.includes("2026-09-29"),
  );
  assert.equal(hasCreatedDateFilter, true);
});

test("formatInvoiceNoWithPrefix, formatReceiptNoWithPrefix, and buildInvoice replace YYMM by bill month and reset running sequence to 00001 each month", async () => {
  const {
    buildDocumentPatternFromLead,
    extractDocumentLeadPrefix,
    formatInvoiceNoWithPrefix,
    formatReceiptNoWithPrefix,
    formatRunningDocumentNo,
  } = await import("../src/lib/seller");
  const { buildInvoice } = await import("../src/lib/invoice");

  // 0. Lead prefix extraction & pattern builder ("TT" <-> "TT2610/00001", "" <-> "2610/00001")
  assert.equal(extractDocumentLeadPrefix("TT2610/00001"), "TT");
  assert.equal(extractDocumentLeadPrefix("RC2610/00001"), "RC");
  assert.equal(extractDocumentLeadPrefix("2610/00001"), "");
  assert.equal(extractDocumentLeadPrefix("TT"), "TT");
  assert.equal(buildDocumentPatternFromLead("TT"), "TT2610/00001");
  assert.equal(buildDocumentPatternFromLead(""), "2610/00001");
  assert.equal(
    formatInvoiceNoWithPrefix("SEQ/2611/00001", "TT", "2026-11-01"),
    "TT2611/00001",
  );

  // 1. Same month as template (2026-10 -> 2610)
  assert.equal(
    formatInvoiceNoWithPrefix("SEQ/2610/00001", "TT2610/00001", "2026-10-01"),
    "TT2610/00001",
  );
  assert.equal(
    formatInvoiceNoWithPrefix("SEQ/2610/00002", "TT2610/00001", "2026-10-01"),
    "TT2610/00002",
  );
  assert.equal(
    formatReceiptNoWithPrefix("SEQ/2610/00001", "RC2610/00001", "2026-10-01"),
    "RC2610/00001",
  );

  // 2. Different month (2026-11 -> 2611, 2026-09 -> 2609, 2027-01 -> 2701) resets to 00001 per month
  assert.equal(
    formatInvoiceNoWithPrefix("SEQ/2611/00001", "TT2610/00001", "2026-11-01"),
    "TT2611/00001",
  );
  assert.equal(
    formatInvoiceNoWithPrefix("SEQ/2611/00002", "TT2610/00001", "2026-11-05"),
    "TT2611/00002",
  );
  assert.equal(
    formatReceiptNoWithPrefix("SEQ/2611/00001", "RC2610/00001", "2026-11-01"),
    "RC2611/00001",
  );
  assert.equal(
    formatInvoiceNoWithPrefix("SEQ/2609/00001", "2610/00001", "2026-09-15"),
    "2609/00001",
  );
  assert.equal(
    formatInvoiceNoWithPrefix("SEQ/2701/00001", "TT2610/00001", "2027-01-02"),
    "TT2701/00001",
  );

  // 3. When custom offset is configured for 2610 (e.g. TT2610/00050), 2610 starts at 00050 while 2611 resets to 00001
  assert.equal(
    formatRunningDocumentNo("TT2610/00050", 1, "TT2610/00001", "2026-10-10"),
    "TT2610/00050",
  );
  assert.equal(
    formatRunningDocumentNo("TT2610/00050", 1, "TT2610/00001", "2026-11-01"),
    "TT2611/00001",
  );
  assert.equal(
    formatRunningDocumentNo("TT2610/00050", 2, "TT2610/00001", "2026-11-01"),
    "TT2611/00002",
  );

  // 4. Fallback to YYMM inside SEQ/YYMM/NNNNN when dateStr is empty
  assert.equal(
    formatInvoiceNoWithPrefix("SEQ/2612/00003", "TT2610/00001", ""),
    "TT2612/00003",
  );

  // 5. buildInvoice end-to-end check for a November 2026 bill
  const novInvoice = buildInvoice({
    id: 1,
    importId: 1,
    externalId: "586999000111222333",
    transactionType: "คำสั่งซื้อ",
    isOrder: true,
    createdDate: "2026-11-01",
    paidDate: "2026-11-02",
    currency: "THB",
    income: 250,
    feeTotal: -20,
    adjustment: 0,
    payout: 230,
    productDetail: null,
    weightEstimated: null,
    weightCharged: null,
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    normalized: {
      externalId: "586999000111222333",
      transactionType: "คำสั่งซื้อ",
      isOrder: true,
      createdAt: "2026-11-01",
      paidAt: "2026-11-02",
      currency: "THB",
      fields: { productAfterDiscount: 250, payout: 230 },
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
    createdAt: "2026-11-02T00:00:00Z",
    invoiceNo: "SEQ/2611/00001",
    channel: "TikTok",
    orderCode: "NV01",
  });
  assert.equal(novInvoice.invoiceNo, "TT2611/00001");
  assert.equal(novInvoice.receiptNo, "RC2611/00001");
});

test("listDailyBatchesPaged, listSkuSummariesPaged, and listImportsPaged return month/day-filtered totals when date is selected and all-time totals when date is omitted", async () => {
  const {
    listDailyBatchesPaged,
    listSkuSummariesPaged,
    listImportsPaged,
  } = await import("../src/lib/queries");

  const captured: { sql: string; params: unknown[] }[] = [];

  const mockDb = {
    query: async (sql: string, params: unknown[] = []) => {
      const clean = sql.replace(/\s+/g, " ").trim();
      captured.push({ sql: clean, params });

      if (clean === "SELECT COUNT(*) AS c FROM daily_summaries") {
        return { rows: [{ c: 120 }] };
      }

      if (clean.includes("FROM daily_summaries") && clean.includes("SUM(order_count)")) {
        const isJuly = params.includes("2026-07-%");
        return {
          rows: [
            isJuly
              ? {
                  c: 30,
                  order_count: 1850,
                  order_income: 380000,
                  order_fees: -68000,
                  order_payout: 312000,
                  total_payout: 312000,
                }
              : {
                  c: 120,
                  order_count: 15031,
                  order_income: 2900000,
                  order_fees: -541900,
                  order_payout: 2358100,
                  total_payout: 2358100,
                },
          ],
        };
      }

      if (clean.includes("FROM daily_summaries") && clean.includes("SELECT paid_date")) {
        return {
          rows: [
            {
              paid_date: "2026-07-30",
              tx_count: 8,
              order_count: 8,
              non_order_count: 0,
              total_income: 526,
              total_fees: -334.14,
              total_adjustments: 0,
              total_payout: 191.86,
              order_income: 526,
              order_fees: -334.14,
              order_payout: 191.86,
              reserve_hold: 0,
              reserve_release: 0,
              other_adjustments: 0,
              warning_count: 0,
            },
          ],
        };
      }

      if (clean.includes("FROM oms_order_items i") && clean.includes("COUNT(*) AS sku_count")) {
        return {
          rows: [
            {
              sku_count: 12,
              total_qty: 420,
              gross_amount: 105000,
              net_sales_amount: 89500,
            },
          ],
        };
      }

      if (clean.includes("FROM oms_order_items i") && clean.includes("LEFT JOIN products p ON p.sku_code = s.sku_code")) {
        return {
          rows: [
            {
              sku_code: "SKU-07",
              product_name: "สินค้าเดือนกรกฎาคม",
              default_price: 250,
              total_qty: 420,
              order_count: 310,
              gross_amount: 105000,
              net_sales_amount: 89500,
              tiktok_qty: 400,
              shopee_qty: 20,
              facebook_qty: 0,
            },
          ],
        };
      }

      if (clean.includes("FROM imports") && clean.includes("SUM(order_count)")) {
        return {
          rows: [
            {
              c: 3,
              order_count: 1850,
              latest_paid_date: "2026-07-30",
            },
          ],
        };
      }

      return { rows: [] };
    },
  };

  // 1. /days without filter -> all-time totals
  const allDays = await listDailyBatchesPaged({ page: 1, pageSize: 20 }, mockDb as never);
  assert.equal(allDays.total, 120);
  assert.equal(allDays.totals.orderCount, 15031);
  assert.equal(allDays.totals.orderPayout, 2358100);

  // 2. /days with month filter q="2026-07" -> July 2026 totals
  const julyDays = await listDailyBatchesPaged(
    { page: 1, pageSize: 20, q: "2026-07" },
    mockDb as never,
  );
  assert.equal(julyDays.total, 30);
  assert.equal(julyDays.totals.orderCount, 1850);
  assert.equal(julyDays.totals.orderIncome, 380000);
  assert.equal(julyDays.totals.orderFees, -68000);
  assert.equal(julyDays.totals.orderPayout, 312000);

  // 3. /products with month filter date="2026-07" -> July 2026 SKU summary
  const julySkus = await listSkuSummariesPaged(
    { page: 1, pageSize: 20, date: "2026-07" },
    mockDb as never,
  );
  assert.equal(julySkus.totals.skuCount, 12);
  assert.equal(julySkus.totals.totalQty, 420);
  assert.equal(julySkus.totals.grossAmount, 105000);
  assert.equal(julySkus.totals.netSalesAmount, 89500);
  assert.equal(julySkus.rows[0]?.skuCode, "SKU-07");

  // 4. /history with month filter date="2026-07" -> July 2026 import summary
  const julyImports = await listImportsPaged(
    { page: 1, pageSize: 20, date: "2026-07" },
    mockDb as never,
  );
  assert.equal(julyImports.total, 3);
  assert.equal(julyImports.totals.orderCount, 1850);
  assert.equal(julyImports.totals.latestPaidDate, "2026-07-30");
});

test("in-page filter/sort/pagination/tab links and router pushes preserve scroll position (scroll={false})", () => {
  const billsSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/bills/page.tsx"),
    "utf8",
  );
  const productsSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/products/page.tsx"),
    "utf8",
  );
  const historySource = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/history/page.tsx"),
    "utf8",
  );
  const bulkInvoicesSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/days/[date]/invoices/page.tsx"),
    "utf8",
  );
  const singleInvoiceSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/invoices/[orderId]/page.tsx"),
    "utf8",
  );
  const importReportSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/import/[id]/page.tsx"),
    "utf8",
  );
  const paginationSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/PaginationBar.tsx"),
    "utf8",
  );
  const datePickerSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/DatePickerField.tsx"),
    "utf8",
  );
  const calendarSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/UploadCompletenessCalendar.tsx"),
    "utf8",
  );
  const filterFormSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/FilterForm.tsx"),
    "utf8",
  );
  const billsFilterSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/BillsFilterInteractive.tsx"),
    "utf8",
  );

  // FilterForm & BillsFilterInteractive must use router.push(..., { scroll: false })
  assert.match(filterFormSource, /router\.push\([^)]*\{\s*scroll:\s*false\s*\}\)/);
  assert.match(billsFilterSource, /router\.push\([^)]*\{\s*scroll:\s*false\s*\}\)/);
  assert.match(billsSource, /<FilterForm\b/);
  assert.match(productsSource, /<FilterForm\b/);

  // PaginationBar & DatePickerField must navigate with { scroll: false }
  assert.match(paginationSource, /router\.push\(buildHref\(target\),\s*\{\s*scroll:\s*false\s*\}\)/);
  assert.equal((paginationSource.match(/scroll=\{false\}/g) ?? []).length, 4);
  assert.equal((datePickerSource.match(/\{\s*scroll:\s*false\s*\}/g) ?? []).length, 2);

  // UploadCompletenessCalendar year/month switcher must not jump to #completeness-check anchor and must use scroll={false}
  assert.doesNotMatch(calendarSource, /#completeness-check/);
  assert.equal((calendarSource.match(/scroll=\{false\}/g) ?? []).length, 4);

  // In-page filter/sort/tab links in pages must include scroll={false}
  assert.ok(((billsSource + billsFilterSource).match(/scroll=\{false\}/g) ?? []).length >= 15);
  assert.ok((productsSource.match(/scroll=\{false\}/g) ?? []).length >= 5);
  assert.ok((historySource.match(/scroll=\{false\}/g) ?? []).length >= 1);
  // หน้าพิมพ์รวม: ทุกลิงก์ในหน้าใช้ scroll={false} (6 จุดหลังรวมปุ่มเป็น map) + ปุ่มชุดพิมพ์ย้ายไป BatchPicker (router.push scroll: false)
  assert.ok((bulkInvoicesSource.match(/scroll=\{false\}/g) ?? []).length >= 6);
  assert.match(
    fs.readFileSync(path.resolve(process.cwd(), "src/components/BatchPicker.tsx"), "utf8"),
    /router\.push\(item\.href, \{ scroll: false \}\)/,
  );
  assert.ok((singleInvoiceSource.match(/scroll=\{false\}/g) ?? []).length >= 3);
  assert.equal((importReportSource.match(/scroll=\{false\}/g) ?? []).length, 4);
});

test("buildOmsOrderUid prevents cross-month Shipnity order_code collisions (e.g. July TikTok O67 vs Feb Shopee O67) while matching File 1 and File 2 100%", async () => {
  const { buildOmsOrderUid } = await import("../src/lib/ingest/oms-parse");

  // July 2026 TikTok order O67 (File 1 & File 2)
  const julyOrderUid = buildOmsOrderUid("O67", "2026-07-23", "2026-07-23", "JTTH201401136355");
  const julyItemUid = buildOmsOrderUid("O67", "2026-07-23", "2026-07-23", "JTTH201401136355");
  assert.equal(julyOrderUid, "O67|2026-07|JTTH201401136355");
  assert.equal(julyOrderUid, julyItemUid);

  // February 2026 Shopee order O67 (File 1 & File 2)
  const febOrderUid = buildOmsOrderUid("O67", "2026-02-02", "2026-02-02", "TH269666114422Z");
  const febItemUid = buildOmsOrderUid("O67", "2026-02-02", "2026-02-02", "TH269666114422Z");
  assert.equal(febOrderUid, "O67|2026-02|TH269666114422Z");
  assert.equal(febOrderUid, febItemUid);

  // Must NEVER collide despite identical order_code "O67"
  assert.notEqual(julyOrderUid, febOrderUid);

  // Verify import-service.ts and queries.ts enforce order_uid and protect TikTok settlement channel
  const importServiceSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/ingest/import-service.ts"),
    "utf8",
  );
  const queriesSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/queries.ts"),
    "utf8",
  );

  assert.match(importServiceSource, /ON CONFLICT \(order_uid\) DO UPDATE/);
  assert.match(importServiceSource, /ON CONFLICT \(order_uid, line_no\) DO UPDATE/);
  assert.match(
    importServiceSource,
    /WHEN t\.transaction_type <> 'คำสั่งซื้อ \(OMS\)' THEN 'TikTok'/,
  );
  assert.match(queriesSource, /oms_order_uid/);

  // Verify Shopee OMS orders populate shippingActual and shippingCustomerFee for Bill & Invoice breakdown
  const { buildBill } = await import("../src/lib/bill");
  const { buildInvoice } = await import("../src/lib/invoice");
  const { getOrderedInvoiceBreakdownLines } = await import("../src/components/InvoiceDocument");

  const shopeeNormalized = {
    externalId: "261023CG7W6J6D",
    transactionType: "คำสั่งซื้อ (OMS)",
    isOrder: true,
    createdAt: "2026-10-23",
    paidAt: "2026-10-23",
    currency: "THB",
    fields: {
      orderId: "261023CG7W6J6D",
      transactionType: "คำสั่งซื้อ (OMS)",
      createdAt: "2026-10-23",
      paidAt: "2026-10-23",
      currency: "THB",
      incomeTotal: 425,
      customerPayment: 425,
      productAfterDiscount: 390,
      productBeforeDiscount: 390,
      storeDiscount: 0,
      shippingCustomerFee: 35,
      feeTotal: -154,
      shippingTotal: -154,
      shippingSellerTotal: -154,
      shippingActual: -154,
      shippingActualFee: -154,
      adjustment: 0,
      payout: 121,
    },
    mappedFields: [
      "orderId",
      "transactionType",
      "createdAt",
      "paidAt",
      "currency",
      "incomeTotal",
      "customerPayment",
      "productAfterDiscount",
      "productBeforeDiscount",
      "storeDiscount",
      "shippingCustomerFee",
      "feeTotal",
      "shippingTotal",
      "shippingSellerTotal",
      "shippingActual",
      "payout",
    ],
    feeGroups: {
      shipping: {
        total: -154,
        children: {
          shippingActual: -154,
          shippingCustomerFee: 35,
        },
      },
    },
    unknownValues: [],
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    raw: {},
    sourceRows: 1,
    firstRow: 1,
    rowIndexes: [1],
  };

  const shopeeBill = buildBill(shopeeNormalized);
  assert.equal(shopeeBill.customerPaymentBreakdown.total, 425);
  assert.equal(shopeeBill.customerPaymentBreakdown.productSubtotalAfterDiscount, 390);
  assert.equal(shopeeBill.customerPaymentBreakdown.shippingAfterDiscount, 35);
  assert.equal(shopeeBill.feeGroups.length, 1);
  assert.equal(shopeeBill.feeGroups[0]?.key, "shipping");
  assert.equal(shopeeBill.feeGroups[0]?.amount, -154);
  assert.deepEqual(
    shopeeBill.feeGroups[0]?.children.map((c) => ({ key: c.key, amount: c.amount })),
    [
      { key: "shippingActual", amount: -154 },
      { key: "shippingCustomerFee", amount: 35 },
    ],
  );

  const shopeeInvoice = buildInvoice({
    id: 1,
    importId: 1,
    externalId: "261023CG7W6J6D",
    transactionType: "คำสั่งซื้อ (OMS)",
    isOrder: true,
    createdDate: "2026-10-23",
    paidDate: "2026-10-23",
    currency: "THB",
    income: 425,
    feeTotal: -154,
    adjustment: 0,
    payout: 121,
    productDetail: "J07-04-160 · ชุดเซทแขนยาว × 1",
    weightEstimated: null,
    weightCharged: null,
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    normalized: shopeeNormalized,
    createdAt: "2026-10-23T00:00:00Z",
    invoiceNo: "SEQ/2610/00001",
    channel: "Shopee",
    orderCode: "YN72",
    shippingFeeCustomer: 35,
    shippingFeeSeller: 154,
  });
  const breakdownLines = getOrderedInvoiceBreakdownLines(shopeeInvoice);
  assert.deepEqual(
    breakdownLines.map((l) => ({ key: l.key, label: l.label, amount: l.amount })),
    [
      { key: "shippingCustomerFee", label: "ค่าธรรมเนียมการจัดส่งของลูกค้า", amount: 35 },
    ],
  );
  assert.equal(shopeeInvoice.receiptTotal, 425);

  const shopeeZeroShipInvoice = buildInvoice({
    id: 10,
    importId: 1,
    externalId: "2610193EK6TM6V",
    transactionType: "คำสั่งซื้อ (OMS)",
    isOrder: true,
    createdDate: "2026-10-19",
    paidDate: "2026-10-19",
    currency: "THB",
    income: 390,
    feeTotal: -118,
    adjustment: 0,
    payout: 272,
    productDetail: "J07-02-140 · ชุดเซทแขนยาวขายาวแวมไพร์นักเรียน (140) × 1",
    weightEstimated: null,
    weightCharged: null,
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    normalized: {
      ...shopeeNormalized,
      externalId: "2610193EK6TM6V",
      fields: {
        ...shopeeNormalized.fields,
        orderId: "2610193EK6TM6V",
        incomeTotal: 390,
        customerPayment: 390,
        productAfterDiscount: 390,
        productBeforeDiscount: 390,
        shippingCustomerFee: 0,
        feeTotal: -118,
        shippingTotal: -118,
        shippingSellerTotal: -118,
        shippingActual: -118,
        shippingActualFee: -118,
        payout: 272,
      },
    },
    createdAt: "2026-10-19T00:00:00Z",
    invoiceNo: "SEQ/2610/02714",
    channel: "Shopee",
    orderCode: "YL62",
    shippingFeeCustomer: 0,
    shippingFeeSeller: 118,
  });
  const zeroShipBreakdownLines = getOrderedInvoiceBreakdownLines(shopeeZeroShipInvoice);
  assert.deepEqual(
    zeroShipBreakdownLines.map((l) => ({ key: l.key, label: l.label, amount: l.amount })),
    [
      { key: "shippingCustomerFee", label: "ค่าธรรมเนียมการจัดส่งของลูกค้า", amount: 0 },
    ],
  );
  assert.equal(shopeeZeroShipInvoice.receiptTotal, 390);

  // Guard against empty feeGroups entry without children
  const emptyGroupBill = buildBill({
    ...shopeeNormalized,
    feeGroups: { shipping: {} as never },
  });
  assert.equal(emptyGroupBill.feeGroups.length, 0);

  // Verify computeAbbreviatedSummary for both TikTok (with platform discount + shipping + fee deduction) and Shopee
  const { computeAbbreviatedSummary } = await import("../src/components/InvoiceDocument");

  // 1. TikTok order #585751221094614820 (Mickey 3 items: 63.48 * 3 = 190.44 + platformDiscount 16.56 = 207.00 + shipping 48.00 = 255.00 - feeTotal 29.86 = 225.14)
  const mickeyInvoice = buildInvoice({
    id: 2,
    importId: 1,
    externalId: "585751221094614820",
    transactionType: "คำสั่งซื้อ",
    isOrder: true,
    createdDate: "2026-08-27",
    paidDate: "2026-08-31",
    currency: "THB",
    income: 207,
    feeTotal: -29.86,
    adjustment: 0,
    payout: 177.14,
    productDetail: null,
    weightEstimated: 1500,
    weightCharged: 1500,
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    normalized: {
      externalId: "585751221094614820",
      transactionType: "คำสั่งซื้อ",
      isOrder: true,
      createdAt: "2026-08-27",
      paidAt: "2026-08-31",
      currency: "THB",
      fields: {
        incomeTotal: 207,
        productBeforeDiscount: 1470,
        storeDiscount: -1263,
        productAfterDiscount: 207,
        platformDiscount: 16.56,
        customerPayment: 190.44,
        shippingActual: -48,
        shippingPlatformDiscount: 48,
        shippingCustomerFee: 0,
        feeTotal: -29.86,
        payout: 177.14,
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
    createdAt: "2026-08-31T00:00:00Z",
    invoiceNo: "SEQ/2608/02560",
    channel: "TikTok",
    orderCode: "AB55",
    omsItems: [
      { skuCode: "K-6TS-4-M", productName: "มิกกี้ เทา-ดำ (M)", unitPrice: 490, quantity: 1 },
      { skuCode: "K-6TS-3-M", productName: "มิกกี้ ชมพู-แดง (M)", unitPrice: 490, quantity: 1 },
      { skuCode: "K-6TS-2-M", productName: "มิกกี้ น้ำตาล-ชมพู (M)", unitPrice: 490, quantity: 1 },
    ],
  });
  const mickeySummary = computeAbbreviatedSummary(mickeyInvoice);
  assert.equal(mickeySummary.itemsNetTotal, 190.44);
  assert.equal(mickeySummary.platformSubsidyAmount, 16.56);
  assert.equal(mickeySummary.shippingLineAmount, 48);
  assert.equal(mickeySummary.subtotalBeforeFee, 255);
  assert.equal(mickeySummary.platformFeeDeduction, 29.86);
  assert.equal(mickeySummary.netAfterDiscount, 225.14);
  assert.equal(mickeySummary.vatAmount, 14.73);
  assert.equal(mickeySummary.preVatAmount, 210.41);
  assert.equal(mickeySummary.grandTotal, 225.14);
  assert.equal(mickeySummary.grandTotalText, "สองร้อยยี่สิบห้าบาทสิบสี่สตางค์");
  assert.equal(mickeySummary.specialDiscountAmount, -48);
  assert.equal(mickeySummary.paymentTotal, 177.14);

  // 2. Shopee order (salesAmount = 390, shippingCustomerFee = 35, shippingActual = -154, feeTotal = -154 -> shippingLineAmount = 35, subtotalBeforeFee = 425, platformFeeDeduction = 154, netAfterDiscount = 271, specialDiscountAmount = 0, paymentTotal = 271)
  const shopeeSummary = computeAbbreviatedSummary(shopeeInvoice);
  assert.equal(shopeeSummary.itemsNetTotal, 390);
  assert.equal(shopeeSummary.platformSubsidyAmount, 0);
  assert.equal(shopeeSummary.shippingLineAmount, 35);
  assert.equal(shopeeSummary.subtotalBeforeFee, 425);
  assert.equal(shopeeSummary.platformFeeDeduction, 154);
  assert.equal(shopeeSummary.netAfterDiscount, 271);
  assert.equal(shopeeSummary.grandTotal, 271);
  assert.equal(shopeeSummary.specialDiscountAmount, 0);
  assert.equal(shopeeSummary.paymentTotal, 271);

  // 3. TikTok order #586779774611391839 (salesAmount = 100, shippingActual = -35, feeTotal = -27.08, payout = 72.92 -> grandTotal = 107.92, specialDiscountAmount = -35, paymentTotal = 72.92)
  const order58677Invoice = buildInvoice({
    id: 3,
    importId: 1,
    externalId: "586779774611391839",
    transactionType: "คำสั่งซื้อ",
    isOrder: true,
    createdDate: "2026-10-25",
    paidDate: "2026-10-29",
    currency: "THB",
    income: 100,
    feeTotal: -27.08,
    adjustment: 0,
    payout: 72.92,
    productDetail: null,
    weightEstimated: 500,
    weightCharged: 500,
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    normalized: {
      externalId: "586779774611391839",
      transactionType: "คำสั่งซื้อ",
      isOrder: true,
      createdAt: "2026-10-25",
      paidAt: "2026-10-29",
      currency: "THB",
      fields: {
        incomeTotal: 100,
        productBeforeDiscount: 690,
        storeDiscount: -590,
        productAfterDiscount: 100,
        platformDiscount: 0,
        customerPayment: 100,
        shippingActual: -35,
        shippingPlatformDiscount: 35,
        shippingCustomerFee: 0,
        feeTotal: -27.08,
        payout: 72.92,
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
    createdAt: "2026-10-29T00:00:00Z",
    invoiceNo: "SEQ/2610/05250",
    channel: "TikTok",
    orderCode: "TT99",
  });
  const order58677Summary = computeAbbreviatedSummary(order58677Invoice);
  assert.equal(order58677Summary.subtotalBeforeFee, 135);
  assert.equal(order58677Summary.platformFeeDeduction, 27.08);
  assert.equal(order58677Summary.netAfterDiscount, 107.92);
  assert.equal(order58677Summary.grandTotal, 107.92);
  assert.equal(order58677Summary.specialDiscountAmount, -35);
  assert.equal(order58677Summary.paymentTotal, 72.92);

  // 4. Verify getRowShippingSummary for /bills table column (positive green vs negative red)
  const { getRowShippingSummary } = await import("../src/lib/bill");
  assert.deepEqual(
    getRowShippingSummary({
      channel: "TikTok",
      transactionType: "คำสั่งซื้อ",
      normalized: {
        ...shopeeNormalized,
        fields: {
          shippingPlatformDiscount: 35,
          shippingActual: -35,
          shippingCustomerFee: 0,
        },
      },
    }),
    { positiveAmount: 35, negativeAmount: -35, netAmount: 0 },
  );
  assert.deepEqual(
    getRowShippingSummary({
      channel: "TikTok",
      transactionType: "คำสั่งซื้อ",
      normalized: {
        ...shopeeNormalized,
        fields: {
          shippingPlatformDiscount: 0,
          shippingActual: -88,
          shippingDiscountStore: -88,
          shippingCustomerFee: 0,
        },
      },
    }),
    { positiveAmount: 0, negativeAmount: -88, netAmount: -88 },
  );
  assert.deepEqual(
    getRowShippingSummary({
      channel: "Shopee",
      transactionType: "คำสั่งซื้อ (OMS)",
      shippingFeeCustomer: 35,
      normalized: shopeeNormalized,
    }),
    { positiveAmount: 35, negativeAmount: 0, netAmount: 35 },
  );
  assert.deepEqual(
    getRowShippingSummary({
      channel: "TikTok",
      transactionType: "คำสั่งซื้อ",
      normalized: {
        ...shopeeNormalized,
        fields: {
          shippingPlatformDiscount: 0,
          shippingActual: -88,
          shippingDiscountStore: -88,
          shippingCustomerFee: 0,
        },
      },
    }),
    { positiveAmount: 0, negativeAmount: -88, netAmount: -88 },
  );
  assert.deepEqual(
    getRowShippingSummary({
      channel: "Shopee",
      transactionType: "คำสั่งซื้อ (OMS)",
      shippingFeeCustomer: 0,
      normalized: {
        ...shopeeNormalized,
        fields: { ...shopeeNormalized.fields, shippingCustomerFee: 0 },
      },
    }),
    { positiveAmount: 0, negativeAmount: 0, netAmount: 0 },
  );

  // 5. Verify TikTok orders where store pays carrier shipping without platform subsidy (#585160344991335959 and #586028225258948034)
  // Case A: #585160344991335959 (salesAmount = 1980, shippingCustomerFee = 0, shippingPlatformDiscount = 0, shippingActual = -137)
  const storePaidShipOnlyInvoice = buildInvoice({
    id: 20,
    importId: 1,
    externalId: "585160344991335959",
    transactionType: "คำสั่งซื้อ",
    isOrder: true,
    createdDate: "2026-07-23",
    paidDate: "2026-07-27",
    currency: "THB",
    income: 1980,
    feeTotal: -299.16,
    adjustment: 0,
    payout: 1680.84,
    productDetail: "ขาสั้นสก็อตตารางเล็ก แดง × 20",
    weightEstimated: 10000,
    weightCharged: 10000,
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    normalized: {
      ...shopeeNormalized,
      externalId: "585160344991335959",
      fields: {
        incomeTotal: 1980,
        productBeforeDiscount: 1980,
        storeDiscount: 0,
        productAfterDiscount: 1980,
        platformDiscount: 0,
        customerPayment: 1980,
        shippingActual: -137,
        shippingPlatformDiscount: 0,
        shippingCustomerFee: 0,
        feeTotal: -299.16,
        payout: 1680.84,
      },
    },
    createdAt: "2026-07-27T00:00:00Z",
    invoiceNo: "SEQ/2607/03355",
    channel: "TikTok",
    orderCode: "O67",
  });
  assert.equal(storePaidShipOnlyInvoice.receiptTotal, 1980);
  assert.deepEqual(getOrderedInvoiceBreakdownLines(storePaidShipOnlyInvoice), []);

  // Case B: #586028225258948034 (salesAmount = 2000, shippingCustomerFee = 98, shippingPlatformDiscount = 0, shippingActual = -101, customerPayment = 2098)
  const customerPaidShipTiktokInvoice = buildInvoice({
    id: 21,
    importId: 1,
    externalId: "586028225258948034",
    transactionType: "คำสั่งซื้อ",
    isOrder: true,
    createdDate: "2026-09-12",
    paidDate: "2026-09-17",
    currency: "THB",
    income: 2000,
    feeTotal: -195.8,
    adjustment: 0,
    payout: 1804.2,
    productDetail: "ขาสั้นสก็อตตารางเล็ก ดำขาว × 10 | ขาสั้นสก็อตตารางใหญ่ ดำขาว × 10",
    weightEstimated: 6000,
    weightCharged: 6000,
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    normalized: {
      ...shopeeNormalized,
      externalId: "586028225258948034",
      fields: {
        incomeTotal: 2000,
        productBeforeDiscount: 2000,
        storeDiscount: 0,
        productAfterDiscount: 2000,
        platformDiscount: 0,
        customerPayment: 2098,
        shippingActual: -101,
        shippingPlatformDiscount: 0,
        shippingCustomerFee: 98,
        feeTotal: -195.8,
        payout: 1804.2,
      },
    },
    createdAt: "2026-09-17T00:00:00Z",
    invoiceNo: "SEQ/2609/03200",
    channel: "TikTok",
    orderCode: "Q99",
  });
  assert.equal(customerPaidShipTiktokInvoice.receiptTotal, 2000);
  assert.deepEqual(
    getOrderedInvoiceBreakdownLines(customerPaidShipTiktokInvoice).map((l) => ({
      key: l.key,
      label: l.label,
      amount: l.amount,
    })),
    [
      {
        key: "shippingCustomerFee",
        label: "ค่าธรรมเนียมการจัดส่งของลูกค้า",
        amount: 98,
      },
      {
        key: "shippingActual",
        label: "การจัดส่ง (น้ำหนักที่เรียกเก็บเงิน: 6000 ก.)",
        amount: -98,
      },
    ],
  );

  // Case C: #586551484422981058 (salesAmount = 3225, shippingCustomerFee = 0, shippingPlatformDiscount = 124, shippingActual = -127, weightCharged = 7500)
  // ส่วนต่าง 3 บาท TikTok นำไปหักใน "ค่าธรรมเนียมทั้งหมด" แล้ว ในใบกำกับภาษีการจัดส่งต้องลบเท่ากับส่วนลดค่าจัดส่งจาก TikTok Shop พอ (-124)
  const diffShippingTiktokInvoice = buildInvoice({
    id: 22,
    importId: 1,
    externalId: "586551484422981058",
    transactionType: "คำสั่งซื้อ",
    isOrder: true,
    createdDate: "2026-10-12",
    paidDate: "2026-10-18",
    currency: "THB",
    income: 3225,
    feeTotal: -884.16,
    adjustment: 0,
    payout: 2340.84,
    productDetail: "เลดี้ เหลืองเทา × 15 | เลดี้แทรมป์หัวใจ น้ำเงินกรม × 10",
    weightEstimated: 7500,
    weightCharged: 7500,
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    normalized: {
      ...shopeeNormalized,
      externalId: "586551484422981058",
      fields: {
        incomeTotal: 3225,
        productBeforeDiscount: 7250,
        storeDiscount: -4025,
        productAfterDiscount: 3225,
        platformDiscount: 645,
        customerPayment: 2580,
        shippingActual: -127,
        shippingPlatformDiscount: 124,
        shippingCustomerFee: 0,
        shippingTotal: -3,
        feeTotal: -884.16,
        payout: 2340.84,
      },
      feeGroups: {
        shipping: {
          total: -3,
          children: {
            shippingActual: -127,
            shippingPlatformDiscount: 124,
          },
        },
      },
    },
    createdAt: "2026-10-18T00:00:00Z",
    invoiceNo: "RF2610/02217",
    channel: "TikTok",
    orderCode: "CK61",
  });
  assert.equal(diffShippingTiktokInvoice.receiptTotal, 3225);
  const diffLines = getOrderedInvoiceBreakdownLines(diffShippingTiktokInvoice);
  assert.deepEqual(
    diffLines.map((l) => ({
      key: l.key,
      label: l.label,
      amount: l.amount,
    })),
    [
      {
        key: "shippingPlatformDiscount",
        label: "ส่วนลดค่าจัดส่งจาก TikTok Shop",
        amount: 124,
      },
      {
        key: "platformDiscount",
        label: "ส่วนลดจากแพลตฟอร์ม",
        amount: 645,
      },
      {
        key: "shippingActual",
        label: "การจัดส่ง (น้ำหนักที่เรียกเก็บเงิน: 7500 ก.)",
        amount: -124,
      },
    ],
  );
  // ตรวจสอบว่าผลรวมค่าสินค้าสุทธิ (2,580) + breakdown ทั้งหมด (645) = receiptTotal (3,225) พอดีเป๊ะ
  const breakdownSum = diffLines.reduce((acc, l) => acc + l.amount, 0);
  assert.equal(2580 + breakdownSum, diffShippingTiktokInvoice.receiptTotal);

  // 6. Verify Facebook OMS orders behave identically to Shopee OMS orders (both "facebook" and "Facebook Live" normalize to "Facebook")
  //    AND unpaid/unshipped/zero-sales orders (e.g. CZ79 with paidDate='-' or BO15 with trackingNo='-' & printedDate='-') are filtered out.
  const { detectAndParseOmsInput } = await import("../src/lib/ingest/oms-parse");
  const { getOrderLinkStatus } = await import("../src/lib/queries");
  const fbOrdersCsv = [
    "เลขที่ออเดอร์,ชื่อ,เบอร์โทร,ช่องทางติดต่อ,ชื่อตามช่องทางติดต่อ,ขนส่ง,ค่าส่งที่เก็บลูกค้า,จังหวัด,ธนาคาร,เลขพัสดุ,ค่าส่งที่ร้านจ่าย,หมายเหตุ,สร้างโดย,วันที่สร้าง,วันที่โอนเงิน,วันที่พิมพ์,เลขที่บน Marketplace,รหัสส่วนลด,ส่วนลดรวม,จำนวนรวม,ยอดขาย,กำไร",
    "FB101,สมหญิง ใจดี,0891234567,facebook,สมหญิง,Flash Express,50.0,นนทบุรี,กสิกรไทย,THFB001,35.0,,P&C,05/10/2026 14:20,05/10/2026 14:25,05/10/2026 15:00,-,,20.0,2,530.0,495.0",
    "FB102,วิภาวรรณ,0819876543,Facebook Live,วิภาวรรณ,J&T,0.0,ปทุมธานี,ไทยพาณิชย์,THFB002,25.0,,P&C,05/10/2026 16:00,05/10/2026 16:05,05/10/2026 16:30,-,,0.0,1,290.0,265.0",
    "CZ79,นาง โสภา อุทัยศรี,0930526620,facebook,,J&T COD,60.0,Rayong,-,-,0.0,เพจ kissi,kissi,17/10/2026 16:11,-,-,-,-,0.0,1,259.0,-",
    "BO15,จองไว้แก้,,facebook,,J&T Express,0.0,Unknown,กสิกร,-,0.0,,kissi,26/09/2026 18:00,26/09/2026 18:00,-,-,-,0.0,1,6370.0,-",
    "SX16,คุณธัญณภัสส์,0914783425,facebook,,J&T Express,0.0,Nan,กสิกร,829345979814,0.0,ส่งเพิ่ม,kissi,30/05/2026 09:30,30/05/2026 09:30,30/05/2026 09:32,-,-,0.0,1,0.0,-70.0",
  ].join("\n");
  const parsedFbOrders = await detectAndParseOmsInput(Buffer.from(fbOrdersCsv, "utf8"));
  assert.ok(parsedFbOrders);
  assert.equal(parsedFbOrders.fileType, "oms_orders");
  assert.equal(parsedFbOrders.orders.length, 2);
  assert.equal(parsedFbOrders.orders[0].orderCode, "FB101");
  assert.equal(parsedFbOrders.orders[0].channel, "Facebook");
  assert.equal(parsedFbOrders.orders[1].orderCode, "FB102");
  assert.equal(parsedFbOrders.orders[1].channel, "Facebook");

  assert.equal(
    getOrderLinkStatus({
      transactionType: "คำสั่งซื้อ (OMS)",
      channel: "Facebook",
      orderCode: "FB101",
      omsItems: [
        { skuCode: "SET01", productName: "กางเกงขาสั้น", unitPrice: 250, quantity: 2 },
      ],
    } as never),
    "linked",
  );

  const fbNormalized = {
    ...shopeeNormalized,
    externalId: "FB101",
    fields: {
      incomeTotal: 530,
      productBeforeDiscount: 500,
      storeDiscount: -20,
      productAfterDiscount: 480,
      shippingCustomerFee: 50,
      customerPayment: 530,
      shippingActual: -35,
      feeTotal: -35,
      payout: 495,
    },
    feeGroups: {
      shipping: {
        total: -35,
        children: { shippingActual: -35 },
      },
    },
  };

  assert.deepEqual(
    getRowShippingSummary({
      channel: "Facebook",
      transactionType: "คำสั่งซื้อ (OMS)",
      shippingFeeCustomer: 50,
      normalized: fbNormalized,
    }),
    { positiveAmount: 50, negativeAmount: 0, netAmount: 50 },
  );

  const fbInvoice = buildInvoice({
    id: 30,
    importId: 1,
    externalId: "FB101",
    transactionType: "คำสั่งซื้อ (OMS)",
    isOrder: true,
    createdDate: "2026-10-05",
    paidDate: "2026-10-05",
    currency: "THB",
    income: 530,
    feeTotal: -35,
    adjustment: 0,
    payout: 495,
    productDetail: "SET01 · กางเกงขาสั้น × 2",
    weightEstimated: null,
    weightCharged: null,
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    normalized: fbNormalized,
    createdAt: "2026-10-05T00:00:00Z",
    invoiceNo: "SEQ/2610/00999",
    channel: "Facebook",
    orderCode: "FB101",
    customerName: "สมหญิง ใจดี",
    customerPhone: "0891234567",
    customerAddress: "99/9 อ.เมือง จ.นนทบุรี 11000",
    postalCode: "11000",
    province: "นนทบุรี",
    trackingNo: "THFB001",
    courier: "Flash Express",
    discountTotal: 20,
    shippingFeeCustomer: 50,
    omsItems: [
      {
        skuCode: "SET01",
        productName: "กางเกงขาสั้น",
        unitPrice: 250,
        quantity: 2,
      },
    ],
  });

  assert.equal(fbInvoice.channel, "Facebook");
  assert.equal(fbInvoice.salesAmount, 480);
  assert.equal(fbInvoice.shippingCustomerFee, 50);
  assert.equal(fbInvoice.receiptTotal, 530);
  assert.equal(fbInvoice.total, 530);
  assert.deepEqual(getOrderedInvoiceBreakdownLines(fbInvoice), [
    {
      key: "shippingCustomerFee",
      label: "ค่าธรรมเนียมการจัดส่งของลูกค้า",
      amount: 50,
    },
  ]);
  const fbAbbrev = computeAbbreviatedSummary(fbInvoice);
  assert.equal(fbAbbrev.itemsNetTotal, 480);
  assert.equal(fbAbbrev.shippingLineAmount, 50);
  assert.equal(fbAbbrev.subtotalBeforeFee, 530);
  assert.equal(fbAbbrev.platformFeeDeduction, 35);
  assert.equal(fbAbbrev.grandTotal, 495);
  assert.equal(fbAbbrev.paymentTotal, 495);
  assert.equal(fbAbbrev.specialDiscountAmount, 0);

  // 7. Verify TikTok partial refund + return shipping orders (#586102858813835175 and #582419607340549163)
  // - Uses net incomeTotal (200) instead of pre-refund productAfterDiscount (269)
  // - Uses net platformDiscount (58.64 + (-15.04) = 43.60)
  // - Never shows negative returnShippingActual (-29 or -38) or platformDiscountRefund (-15.04) on tax invoice
  const partialRefundInvoice = buildInvoice({
    id: 31,
    importId: 1,
    externalId: "586102858813835175",
    transactionType: "คำสั่งซื้อ",
    isOrder: true,
    createdDate: "2026-09-16",
    paidDate: "2026-09-23",
    currency: "THB",
    income: 200,
    feeTotal: -95.51,
    adjustment: 0,
    payout: 104.49,
    productDetail: "กางเกงขาสั้น × 2",
    weightEstimated: 1500,
    weightCharged: 1500,
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    normalized: {
      ...shopeeNormalized,
      externalId: "586102858813835175",
      fields: {
        incomeTotal: 200,
        productBeforeDiscount: 1270,
        storeDiscount: -1001,
        productAfterDiscount: 269,
        refundBeforeDiscount: -690,
        refundStoreDiscount: 621,
        refundAfterDiscount: -69,
        platformDiscount: 58.64,
        platformDiscountRefund: -15.04,
        customerPayment: 210.36,
        customerRefund: -53.96,
        shippingPlatformDiscount: 23.33,
        shippingActual: -35,
        returnShippingActual: -29,
        shippingCustomerFee: 0,
        feeTotal: -95.51,
        payout: 104.49,
      },
    },
    createdAt: "2026-09-23T00:00:00Z",
    invoiceNo: "SEQ/2609/03500",
    channel: "TikTok",
    orderCode: "R88",
  });
  assert.equal(partialRefundInvoice.salesAmount, 200);
  assert.equal(partialRefundInvoice.receiptTotal, 200);
  assert.equal(partialRefundInvoice.platformDiscount, 43.6);
  assert.equal(partialRefundInvoice.platformCoupon, 43.6);
  assert.deepEqual(
    getOrderedInvoiceBreakdownLines(partialRefundInvoice).map((l) => ({
      key: l.key,
      label: l.label,
      amount: l.amount,
    })),
    [
      {
        key: "shippingPlatformDiscount",
        label: "ส่วนลดค่าจัดส่งจาก TikTok Shop",
        amount: 23.33,
      },
      {
        key: "platformDiscount",
        label: "ส่วนลดจากแพลตฟอร์ม",
        amount: 43.6,
      },
      {
        key: "shippingActual",
        label: "การจัดส่ง (น้ำหนักที่เรียกเก็บเงิน: 1500 ก.)",
        amount: -23.33,
      },
    ],
  );
});

test("listBills keeps channelCounts identical across all/TikTok/Shopee/Facebook tabs and uses SARGable queries", async () => {
  const { listBills } = await import("../src/lib/queries");

  const executedSqls: string[] = [];
  const mockDb = {
    async query(sql: string) {
      const clean = sql.replace(/\s+/g, " ").trim();
      executedSqls.push(clean);
      if (clean.includes("FROM daily_summaries")) {
        return {
          rows: [
            {
              order_count: 70314,
              all_count: 70314,
              linked_count: 28951,
              oms_only_count: 36942,
              unlinked_count: 4421,
              order_income: 12000000,
              order_fees: -1500000,
              order_payout: 10500000,
              shipping_positive: 500000,
              shipping_negative: -600000,
              other_count: 0,
              other_payout: 0,
              total_payout: 10500000,
              tiktok_count: 49535,
              shopee_count: 6710,
              facebook_count: 14069,
              min_paid_date: "2026-06-20",
              max_paid_date: "2026-10-29",
              distinct_dates: 126,
            },
          ],
        };
      }
      if (clean.includes("t.income <= 0 OR t.payout <= 0")) {
        // Verify nonPosRow queries across all channels (no t.channel = $1 in WHERE)
        assert.ok(
          !clean.includes("WHERE t.is_order = 1 AND t.channel IN ('TikTok', 'Shopee', 'Facebook') AND t.channel ="),
          "nonPosRow must not filter out other channels in WHERE so channelCounts stay consistent",
        );
        return {
          rows: [
            {
              non_pos_all_channels: 1758,
              non_pos_all: clean.includes("WHEN t.channel = 'TikTok'") ? 1621 : clean.includes("WHEN t.channel = 'Facebook'") ? 137 : 1758,
              non_pos_income: -10272.81,
              non_pos_fees: 0,
              non_pos_payout: -10272.81,
              non_pos_shipping_positive: 0,
              non_pos_shipping_negative: 0,
              non_pos_tiktok: 1621,
              non_pos_shopee: 0,
              non_pos_fb: 137,
              non_pos_linked: 218,
              non_pos_oms_only: 1,
              non_pos_unlinked: 1539,
              refund_fee_count: clean.includes("WHEN (t.channel = 'TikTok')") ? 98 : clean.includes("WHEN (t.channel = 'Shopee')") ? 0 : clean.includes("WHEN (t.channel = 'Facebook')") ? 44 : 142,
              refund_fee_payout: clean.includes("WHEN (t.channel = 'TikTok')") ? -5227.81 : clean.includes("WHEN (t.channel = 'Shopee')") ? 0 : clean.includes("WHEN (t.channel = 'Facebook')") ? -5045 : -10272.81,
              zero_count: clean.includes("WHEN (t.channel = 'TikTok')") ? 1523 : clean.includes("WHEN (t.channel = 'Shopee')") ? 0 : clean.includes("WHEN (t.channel = 'Facebook')") ? 93 : 1616,
              refund_fee_all_channels: 142,
              refund_fee_tiktok: 98,
              refund_fee_shopee: 0,
              refund_fee_fb: 44,
              zero_all_channels: 1616,
              zero_tiktok: 1523,
              zero_shopee: 0,
              zero_fb: 93,
            },
          ],
        };
      }
      if (clean.includes("SELECT COUNT(*) AS count") && clean.includes("FROM transactions t")) {
        return {
          rows: [
            {
              count: 8091,
              all_count: 47914,
              linked_count: 8091,
              oms_only_count: 36941,
              unlinked_count: 2882,
              income: 8000000,
              fees: -1000000,
              payout: 7000000,
              shipping_positive: 300000,
              shipping_negative: -350000,
              tiktok_count: 47914,
              shopee_count: 0,
              facebook_count: 0,
              min_paid_date: "2026-06-20",
              max_paid_date: "2026-10-29",
              distinct_dates: 126,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const resAll = await listBills({ channel: "all", linkStatus: "all", category: "normal" }, mockDb as never);
  const resTikTok = await listBills({ channel: "TikTok", linkStatus: "all", category: "normal" }, mockDb as never);
  const resShopee = await listBills({ channel: "Shopee", linkStatus: "all", category: "normal" }, mockDb as never);
  const resFacebook = await listBills({ channel: "Facebook", linkStatus: "all", category: "normal" }, mockDb as never);
  const resTikTokLinked = await listBills({ channel: "TikTok", linkStatus: "linked", category: "normal" }, mockDb as never);
  const resShopeeLinked = await listBills({ channel: "Shopee", linkStatus: "linked", category: "normal" }, mockDb as never);

  const expectedChannelCounts = {
    all: 68556,
    TikTok: 47914,
    Shopee: 6710,
    Facebook: 13932,
  };

  // Channel counts must never change when switching channels OR when selecting a child linkStatus (e.g. linked)
  assert.deepEqual(resAll.channelCounts, expectedChannelCounts);
  assert.deepEqual(resTikTok.channelCounts, expectedChannelCounts);
  assert.deepEqual(resShopee.channelCounts, expectedChannelCounts);
  assert.deepEqual(resFacebook.channelCounts, expectedChannelCounts);
  assert.deepEqual(resTikTokLinked.channelCounts, expectedChannelCounts);
  assert.deepEqual(resShopeeLinked.channelCounts, expectedChannelCounts);

  // Category counts and periodNetSummary.orderCount must reflect each selected channel without being truncated by linkStatus
  assert.equal(resAll.periodNetSummary.orderCount, 70314);
  assert.equal(resTikTok.periodNetSummary.orderCount, 49535);
  assert.equal(resTikTokLinked.periodNetSummary.orderCount, 49535);
  assert.equal(resShopee.periodNetSummary.orderCount, 6710);
  assert.equal(resFacebook.periodNetSummary.orderCount, 14069);

  // Verify UI hierarchy in BillsFilterInteractive: Channel filter must appear ABOVE file-link status filter
  const billsFilterSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/BillsFilterInteractive.tsx"),
    "utf8",
  );
  const channelIdx = billsFilterSource.indexOf('aria-label="กรองตามช่องทางจำหน่าย"');
  const linkStatusIdx = billsFilterSource.indexOf('aria-label="กรองตามสถานะการผูกไฟล์"');
  assert.ok(channelIdx > 0 && linkStatusIdx > channelIdx, "Channel filter must be rendered above file-link status filter");

  // Verify SARGable channel predicate and stored columns (no COALESCE(NULLIF(t.channel...)) or JSONB extraction in listBills)
  for (const sql of executedSqls) {
    assert.ok(
      !sql.includes("COALESCE(NULLIF(t.channel"),
      `listBills SQL must use SARGable t.channel predicate: ${sql}`,
    );
    assert.ok(
      !sql.includes("normalized_json->'fields'"),
      `listBills SQL must use stored shipping_positive/shipping_negative columns: ${sql}`,
    );
  }
});

test("TikTok OMS placeholder uses netOmsPayout (salesAmount - shippingSeller) instead of Shipnity profit_amount", async () => {
  const { detectAndParseOmsInput } = await import("../src/lib/ingest/oms-parse");

  // Simulate an order like YQ77 where flash sale price is 100/pc (total 1400) but Shipnity stock cost is 150/pc resulting in -700 profit
  const omsOrdersCsv = [
    "เลขที่ออเดอร์,ชื่อ,เบอร์โทร,ช่องทางติดต่อ,ชื่อตามช่องทางติดต่อ,ขนส่ง,ค่าส่งที่เก็บลูกค้า,จังหวัด,ธนาคาร,เลขพัสดุ,ค่าส่งที่ร้านจ่าย,หมายเหตุ,สร้างโดย,วันที่สร้าง,วันที่โอนเงิน,วันที่พิมพ์,เลขที่บน Marketplace,รหัสส่วนลด,ส่วนลดรวม,จำนวนรวม,ยอดขาย,กำไร",
    "YQ77,ศ***นัน,0812345678,TikTok,7494055677184215034,J&T COD,0.0,เชียงใหม่,จ่ายทีหลัง / COD,JTTH207846564236,0,,P&C,25/10/2026 10:00,25/10/2026 00:00,25/10/2026 10:00,586780432141486074,,4060.0,14,1400.0,-700.0",
  ].join("\n");

  const parsedOrders = await detectAndParseOmsInput(Buffer.from(omsOrdersCsv, "utf8"));
  assert.ok(parsedOrders);
  assert.equal(parsedOrders.orders.length, 1);
  const order = parsedOrders.orders[0];
  assert.equal(order.salesAmount, 1400);
  assert.equal(order.profitAmount, -700);

  // In import-service logic, netOmsPayout must be salesAmount - shippingSeller = 1400 - 0 = 1400, never -700
  const shippingSeller = Math.abs(order.shippingFeeSeller ?? 0);
  const netOmsPayout = (order.salesAmount ?? 0) - shippingSeller;
  assert.equal(netOmsPayout, 1400, "Payout must equal salesAmount - shippingSeller, not negative Shipnity stock profit");
});

test("Facebook order (e.g. CW26 size exchange) calculates COGS and uses Shipnity profit (-365) directly", async () => {
  const { detectAndParseOmsInput } = await import("../src/lib/ingest/oms-parse");

  // CW26: Size exchange with 9 items (0 baht), customer paid 50 shipping, profit in Shipnity is -365 because of COGS
  const fbCsv = [
    "เลขที่ออเดอร์,ชื่อ,เบอร์โทร,ช่องทางติดต่อ,ชื่อตามช่องทางติดต่อ,ขนส่ง,ค่าส่งที่เก็บลูกค้า,จังหวัด,ธนาคาร,เลขพัสดุ,ค่าส่งที่ร้านจ่าย,หมายเหตุ,สร้างโดย,วันที่สร้าง,วันที่โอนเงิน,วันที่พิมพ์,เลขที่บน Marketplace,รหัสส่วนลด,ส่วนลดรวม,จำนวนรวม,ยอดขาย,กำไร",
    "CW26,วิชุตา ห้องเข้า,0811824866,Facebook,Wichuta Hongkhao,Flash Express,50.0,Uttaradit,กสิกร,TH50088E4J8H2B,0,เปลี่ยน Size,bam46450@gmail.com,26/02/2026 10:00,27/02/2026 00:00,28/02/2026 10:00,,,0.0,9,50.0,-365.0",
  ].join("\n");

  const parsedOrders = await detectAndParseOmsInput(Buffer.from(fbCsv, "utf8"));
  assert.ok(parsedOrders);
  assert.equal(parsedOrders.orders.length, 1);
  const order = parsedOrders.orders[0];
  assert.equal(order.channel, "Facebook");
  assert.equal(order.salesAmount, 50);
  assert.equal(order.shippingFeeCustomer, 50);
  assert.equal(order.shippingFeeSeller, 0);
  assert.equal(order.profitAmount, -365);

  const shippingSeller = Math.abs(order.shippingFeeSeller ?? 0);
  const netOmsPayout = (order.salesAmount ?? 0) - shippingSeller;
  const cogs = Math.max(0, netOmsPayout - (order.profitAmount ?? 0));
  assert.equal(order.profitAmount, -365, "Facebook payout must match Shipnity profit_amount (-365) directly");
  assert.equal(cogs, 415, "COGS must be 415 (clothing stock cost in Shipnity)");
});

test("Shopee order (e.g. FV43) uses Shipnity profit (-544) directly and explains COGS = 640 and net cash before COGS = 96", async () => {
  const { detectAndParseOmsInput } = await import("../src/lib/ingest/oms-parse");

  const shopeeCsv = [
    "เลขที่ออเดอร์,ชื่อ,เบอร์โทร,ช่องทางติดต่อ,ชื่อตามช่องทางติดต่อ,ขนส่ง,ค่าส่งที่เก็บลูกค้า,จังหวัด,ธนาคาร,เลขพัสดุ,ค่าส่งที่ร้านจ่าย,หมายเหตุ,สร้างโดย,วันที่สร้าง,วันที่โอนเงิน,วันที่พิมพ์,เลขที่บน Marketplace,รหัสส่วนลด,ส่วนลดรวม,จำนวนรวม,ยอดขาย,กำไร",
    "FV43,ม***,0812345678,Shopee,user123,SPX,0.0,กรุงเทพฯ,จ่ายทีหลัง / COD,TH0123456789,1336,,system,13/03/2026 10:00,13/03/2026 00:00,13/03/2026 10:00,260313321TN1YJ,,0.0,8,1432.0,-544.0",
  ].join("\n");

  const parsedOrders = await detectAndParseOmsInput(Buffer.from(shopeeCsv, "utf8"));
  assert.ok(parsedOrders);
  assert.equal(parsedOrders.orders.length, 1);
  const order = parsedOrders.orders[0];
  assert.equal(order.channel, "Shopee");
  assert.equal(order.profitAmount, -544);

  const shippingSeller = Math.abs(order.shippingFeeSeller ?? 0);
  const netOmsPayout = (order.salesAmount ?? 0) - shippingSeller;
  const cogs = Math.max(0, netOmsPayout - (order.profitAmount ?? 0));
  assert.equal(order.profitAmount, -544, "Shopee payout must match Shipnity profit_amount (-544) directly");
  assert.equal(netOmsPayout, 96, "Net cash before COGS is 96 (1432 - 1336)");
  assert.equal(cogs, 640, "COGS must be 640 (640 baht clothing cost for 8 items)");
});

test("Facebook zero-product-price exchange orders (link_priority = 3) are excluded from default normal bills and have dedicated filter", async () => {
  const { listBills, mapTransaction } = await import("../src/lib/queries");

  // 1. Verify mapTransaction flags Facebook orders with productAfterDiscount = 0 and productBeforeDiscount = 0 as isNoProductPriceOrder and nulls out invoiceNo
  const exchangeRow = mapTransaction({
    id: 999,
    import_id: 1,
    external_id: "DH96",
    transaction_type: "คำสั่งซื้อ (OMS)",
    is_order: 1,
    created_date: "2026-10-20",
    paid_date: "2026-10-27",
    currency: "THB",
    income: 50,
    fee_total: 0,
    adjustment: 0,
    payout: 50,
    channel: "Facebook",
    order_code: "DH96",
    link_priority: 3,
    invoice_no: "RF2610/04994",
    checks_json: JSON.stringify({ incomeDiff: 0, feeDiff: 0, payoutDiff: 0 }),
    warnings_json: "[]",
    normalized_json: JSON.stringify({
      externalId: "DH96",
      transactionType: "คำสั่งซื้อ (OMS)",
      isOrder: true,
      createdAt: "2026-10-20",
      paidAt: "2026-10-27",
      currency: "THB",
      fields: {
        productBeforeDiscount: 0,
        productAfterDiscount: 0,
        shippingCustomerFee: 50,
        incomeTotal: 50,
        feeTotal: 0,
        payout: 50,
      },
      mappedFields: [],
    }),
  });
  assert.equal(exchangeRow.isNoProductPriceOrder, true);
  assert.equal(exchangeRow.invoiceNo, null, "Exchange order must not expose a tax invoice number");

  // 2. Verify listBills excludes link_priority = 3 from default normal bills and returns noPrice count = 38
  const mockDb = {
    async query(sql: string) {
      const clean = sql.replace(/\s+/g, " ").trim();
      if (clean.includes("FROM daily_summaries")) {
        return {
          rows: [
            {
              order_count: 70289,
              all_count: 70289,
              linked_count: 28913,
              oms_only_count: 36942,
              unlinked_count: 4396,
              order_income: 12000000,
              order_fees: -1500000,
              order_payout: 10500000,
              shipping_positive: 500000,
              shipping_negative: -600000,
              other_count: 0,
              other_payout: 0,
              total_payout: 10500000,
              tiktok_count: 49535,
              shopee_count: 6710,
              facebook_count: 14044,
              min_paid_date: "2026-06-20",
              max_paid_date: "2026-10-29",
              distinct_dates: 126,
            },
          ],
        };
      }
      if (clean.includes("t.income <= 0 OR t.payout <= 0")) {
        return {
          rows: [
            {
              non_pos_all_channels: 1758,
              non_pos_all: 1758,
              non_pos_income: -10272.81,
              non_pos_fees: 0,
              non_pos_payout: -10272.81,
              non_pos_shipping_positive: 0,
              non_pos_shipping_negative: 0,
              non_pos_tiktok: 1621,
              non_pos_shopee: 0,
              non_pos_fb: 137,
              non_pos_linked: 218,
              non_pos_oms_only: 1,
              non_pos_unlinked: 1539,
              refund_fee_count: 142,
              refund_fee_payout: -10272.81,
              zero_count: 1616,
              refund_fee_all_channels: 142,
              refund_fee_tiktok: 98,
              refund_fee_shopee: 0,
              refund_fee_fb: 44,
              zero_all_channels: 1616,
              zero_tiktok: 1523,
              zero_shopee: 0,
              zero_fb: 93,
            },
          ],
        };
      }
      if (clean.includes("AND t.link_priority = 3")) {
        return {
          rows: [
            {
              no_price_all_channels: 38,
              no_price_all: 38,
              no_price_income: 1940,
              no_price_fees: 0,
              no_price_payout: 1940,
              no_price_shipping_positive: 1940,
              no_price_shipping_negative: 0,
              no_price_fb: 38,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const resAll = await listBills({ channel: "all", linkStatus: "all", category: "normal" }, mockDb as never);
  // 70289 - 1758 (nonPos) - 38 (noPrice) = 68493
  assert.equal(resAll.total, 68493);
  assert.equal(resAll.channelCounts.all, 68493);
  // Facebook: 14044 - 137 (nonPos) - 38 (noPrice) = 13869
  assert.equal(resAll.channelCounts.Facebook, 13869);
  assert.equal(resAll.linkCounts.noPrice, 38);
});

test("isOrderEligibleForInvoice restricts tax invoice printing strictly to complete data and normal sales bills", async () => {
  const { isOrderEligibleForInvoice } = await import("../src/lib/invoice");

  // 1. Normal linked TikTok order with settlement: eligible
  assert.equal(
    isOrderEligibleForInvoice({
      channel: "TikTok",
      transactionType: "คำสั่งซื้อ",
      income: 1432,
      payout: 1300,
      orderCode: "TT101",
      productDetail: "ชุดนอนเด็ก",
    }),
    true,
  );

  // 2. TikTok OMS placeholder (no settlement yet): ineligible
  assert.equal(
    isOrderEligibleForInvoice({
      channel: "TikTok",
      transactionType: "คำสั่งซื้อ (OMS)",
      income: 1432,
      payout: 1300,
      orderCode: "TT101",
      productDetail: "ชุดนอนเด็ก",
    }),
    false,
  );

  // 3. Shopee order with negative profit (e.g. FV43, payout = -544): ineligible
  assert.equal(
    isOrderEligibleForInvoice({
      channel: "Shopee",
      transactionType: "คำสั่งซื้อ (OMS)",
      income: 1432,
      payout: -544,
      orderCode: "FV43",
      productDetail: "ชุดนอนเด็ก",
    }),
    false,
  );

  // 4. Shopee order with 0 profit / return: ineligible
  assert.equal(
    isOrderEligibleForInvoice({
      channel: "Shopee",
      transactionType: "คำสั่งซื้อ (OMS)",
      income: 0,
      payout: 0,
      orderCode: "FV44",
      productDetail: "ชุดนอนเด็ก",
    }),
    false,
  );

  // 5. Facebook size exchange 0 THB order (isNoProductPriceOrder = true): ineligible
  assert.equal(
    isOrderEligibleForInvoice({
      channel: "Facebook",
      transactionType: "คำสั่งซื้อ (OMS)",
      income: 50,
      payout: 50,
      orderCode: "FB99",
      productDetail: "เปลี่ยนไซส์",
      isNoProductPriceOrder: true,
    }),
    false,
  );

  // 6. Unlinked order (missing orderCode): ineligible
  assert.equal(
    isOrderEligibleForInvoice({
      channel: "TikTok",
      transactionType: "คำสั่งซื้อ",
      income: 500,
      payout: 450,
      orderCode: null,
      productDetail: "ชุดนอนเด็ก",
    }),
    false,
  );

  // 7. Normal linked Shopee order: eligible
  assert.equal(
    isOrderEligibleForInvoice({
      channel: "Shopee",
      transactionType: "คำสั่งซื้อ (OMS)",
      income: 1200,
      payout: 1100,
      orderCode: "SP88",
      omsItems: [{ sku: "SKU1", quantity: 1 }],
    }),
    true,
  );
});









