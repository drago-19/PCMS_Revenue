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

test("converts amounts to Thai baht text", () => {
  assert.equal(bahtText(100), "หนึ่งร้อยบาทถ้วน");
  assert.equal(bahtText(21), "ยี่สิบเอ็ดบาทถ้วน");
  assert.equal(bahtText(450.5), "สี่ร้อยห้าสิบบาทห้าสิบสตางค์");
  assert.equal(bahtText(0), "ศูนย์บาทถ้วน");
  assert.equal(bahtText(1500), "หนึ่งพันห้าร้อยบาทถ้วน");
});

test("POST /api/imports validates missing/non-xlsx/empty files before touching DB", async () => {
  const { POST } = await import("../src/app/api/imports/route");

  const emptyForm = new FormData();
  const resNoFile = await POST(
    new Request("http://localhost:3001/api/imports?stream=1", {
      method: "POST",
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
  assert.equal(parsedOrders.orders.length, 2);
  assert.equal(parsedOrders.orders[0].orderCode, "OF37");
  assert.equal(parsedOrders.orders[0].channel, "TikTok");
  assert.equal(parsedOrders.orders[0].marketplaceOrderPrefix, "586356565637268");
  assert.equal(parsedOrders.orders[1].orderCode, "OF33");
  assert.equal(parsedOrders.orders[1].channel, "Shopee");
  assert.equal(parsedOrders.orders[1].marketplaceOrderNorm, "261001GH52V0JW");

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
  assert.equal(invoice.total, 150);
  assert.equal(invoice.preVatAmount, 140.19);
  assert.equal(invoice.vatAmount, 9.81);
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
    "SYN-9001,SKU-HERB-01,สมุนไพรตรีผลาสกัด,290,2,2026-10-05,Shopee",
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
  assert.equal(parsed.items[0].channel, "Shopee");
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
