import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAndParseShopeeInput } from "../src/lib/ingest/shopee-parse";
import type { NormalizedTransaction } from "../src/lib/ingest/parse";
import { buildInvoice } from "../src/lib/invoice";
import { getOrderedInvoiceBreakdownLines } from "../src/components/InvoiceDocument";

function asNormalized(
  tx: Awaited<ReturnType<typeof parseSingleOrder>>,
): NormalizedTransaction {
  return {
    ...tx,
    unknownValues: tx.unknownValues ?? [],
    mappedFields: [],
    feeGroups: {},
  };
}

const INCOME_HEADERS = [
  "หมายเลขคำสั่งซื้อ",
  "วันที่ทำการสั่งซื้อ",
  "วันที่โอนชำระเงินสำเร็จ",
  "สินค้าราคาปกติ",
  "ส่วนลดสินค้าจากผู้ขาย",
  "จำนวนเงินที่ทำการคืนให้ผู้ซื้อ",
  "ค่าจัดส่งที่ชำระโดยผู้ซื้อ",
  "ค่าจัดส่งสินค้าที่ออกโดย Shopee",
  "ค่าจัดส่งที่ Shopee ชำระโดยชื่อของคุณ",
  "ค่าคอมมิชชั่น",
  "จำนวนเงินทั้งหมดที่โอนแล้ว (฿)",
];

// ลูกค้าจ่ายค่าส่งเอง 10 + Shopee ออกค่าส่งให้ 25 (หักคืนจากร้านเท่ากัน)
// รายได้ = 70 + 10 + 25 = 105, ค่าธรรมเนียม = -25 (ค่าส่ง) - 10 (คอมมิชชั่น) = -35, ยอดโอน = 70
const ORDER_ROW = [
  "261026KYSDP0C3",
  "2026-10-26",
  "2026-10-27",
  70,
  0,
  0,
  10,
  25,
  -25,
  -10,
  70,
];

function shopeeSheets(dataRows: (string | number)[][]) {
  return [
    {
      name: "Summary",
      rows: [
        ["รายงานรายรับของฉัน"],
        ["ชื่อผู้ใช้ (ผู้ขาย)", "sheheng"],
        ["จาก", "2026-10-01"],
        ["ถึง", "2026-10-31"],
      ],
    },
    {
      name: "Income",
      rows: [
        [],
        [],
        [],
        [],
        [],
        INCOME_HEADERS,
        ...dataRows,
      ],
    },
  ];
}

async function parseSingleOrder() {
  const parsed = await detectAndParseShopeeInput(
    Buffer.from(""),
    shopeeSheets([ORDER_ROW]),
  );
  assert.ok(parsed, "ต้องตรวจพบไฟล์รายได้ Shopee");
  assert.equal(parsed.transactions.length, 1);
  return parsed.transactions[0]!;
}

test("Shopee settlement keeps ค่าจัดส่งสินค้าที่ออกโดย Shopee as its own field", async () => {
  const tx = await parseSingleOrder();

  assert.equal(tx.fields.shippingIssuedByShopee, 25);
  assert.equal(tx.fields.shippingCustomerFee, 10);
  assert.equal(tx.fields.productAfterDiscount, 70);
  assert.equal(tx.fields.incomeTotal, 105);
  assert.equal(tx.fields.feeTotal, -35);
  assert.equal(tx.fields.payout, 70);
  // ยอดที่ลูกค้าจ่ายจริงไม่รวมค่าส่งที่ Shopee ออกให้
  assert.equal(tx.fields.customerPayment, 80);
  // อัตลักษณ์ของไฟล์ต้องยังลงตัว
  assert.equal(tx.checks.payoutDiff, 0);
});

test("Shopee invoice shows ค่าจัดส่งสินค้าที่ออกโดย Shopee and the lines add up to the total", async () => {
  const tx = await parseSingleOrder();

  const invoice = buildInvoice({
    id: 1,
    importId: 1,
    externalId: tx.externalId,
    transactionType: tx.transactionType,
    isOrder: true,
    createdDate: tx.createdAt,
    paidDate: tx.paidAt,
    currency: "THB",
    income: tx.fields.incomeTotal as number,
    feeTotal: tx.fields.feeTotal as number,
    adjustment: 0,
    payout: tx.fields.payout as number,
    productDetail: "กระบองไฟพกพง × 7",
    weightEstimated: null,
    weightCharged: null,
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    normalized: asNormalized(tx),
    createdAt: `${tx.createdAt}T00:00:00Z`,
    invoiceNo: "SEQ/2610/00076",
    channel: "Shopee",
    orderCode: "OM76",
    shippingFeeCustomer: 10,
    shippingFeeSeller: 25,
  });

  assert.equal(invoice.shippingIssuedByShopee, 25);
  assert.equal(invoice.salesAmount, 70);
  assert.equal(invoice.receiptTotal, 105);

  const lines = getOrderedInvoiceBreakdownLines(invoice).map((line) => ({
    key: line.key,
    label: line.label,
    amount: line.amount,
  }));
  assert.deepEqual(lines, [
    { key: "shippingCustomerFee", label: "ค่าธรรมเนียมการจัดส่งของลูกค้า", amount: 10 },
    { key: "shippingIssuedByShopee", label: "ค่าจัดส่งสินค้าที่ออกโดย Shopee", amount: 25 },
  ]);

  const linesTotal = lines.reduce((sum, line) => sum + line.amount, 0);
  assert.equal(invoice.salesAmount + linesTotal, invoice.receiptTotal);
});

test("Shopee invoice without the platform shipping column keeps a single shipping line", async () => {
  const rowWithoutShipping = ["2610193EK6TM6V", "2026-10-19", "2026-10-19", 390, 0, 0, 0, 0, 0, -118, 272];
  const parsed = await detectAndParseShopeeInput(
    Buffer.from(""),
    shopeeSheets([rowWithoutShipping]),
  );
  assert.ok(parsed);
  const tx = parsed.transactions[0]!;
  assert.equal(tx.fields.shippingIssuedByShopee, 0);

  const invoice = buildInvoice({
    id: 2,
    importId: 1,
    externalId: tx.externalId,
    transactionType: tx.transactionType,
    isOrder: true,
    createdDate: tx.createdAt,
    paidDate: tx.paidAt,
    currency: "THB",
    income: tx.fields.incomeTotal as number,
    feeTotal: tx.fields.feeTotal as number,
    adjustment: 0,
    payout: tx.fields.payout as number,
    productDetail: "ชุดเซทแขนยาว × 1",
    weightEstimated: null,
    weightCharged: null,
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    normalized: asNormalized(tx),
    createdAt: `${tx.createdAt}T00:00:00Z`,
    invoiceNo: "SEQ/2610/02714",
    channel: "Shopee",
    orderCode: "YL62",
    shippingFeeCustomer: 0,
    shippingFeeSeller: 118,
  });

  assert.deepEqual(
    getOrderedInvoiceBreakdownLines(invoice).map((line) => line.key),
    ["shippingCustomerFee"],
  );
  assert.equal(invoice.receiptTotal, 390);
});

test("Shopee platform shipping never leaks into TikTok / Facebook invoices", async () => {
  const tx = await parseSingleOrder();

  for (const channel of ["TikTok", "Facebook"]) {
    const invoice = buildInvoice({
      id: 3,
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
      productDetail: "SET21 · ไฟเบอร์ 1 กล่อง × 1",
      weightEstimated: null,
      weightCharged: null,
      checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
      warnings: [],
      normalized: asNormalized(tx),
      createdAt: "2026-10-01T00:00:00Z",
      invoiceNo: "SEQ/2610/00001",
      channel,
      orderCode: "OF37",
      shippingFeeCustomer: 0,
      shippingFeeSeller: 0,
    });

    assert.equal(invoice.shippingIssuedByShopee, 0);
    assert.ok(
      !getOrderedInvoiceBreakdownLines(invoice).some(
        (line) => line.key === "shippingIssuedByShopee",
      ),
      `${channel} ต้องไม่มีบรรทัดค่าจัดส่งที่ออกโดย Shopee`,
    );
  }
});

test("Shopee invoices imported before the new field still show the line from stored unknown values", async () => {
  const tx = await parseSingleOrder();
  const legacyFields = { ...tx.fields };
  delete legacyFields.shippingIssuedByShopee;

  const invoice = buildInvoice({
    id: 4,
    importId: 1,
    externalId: tx.externalId,
    transactionType: tx.transactionType,
    isOrder: true,
    createdDate: tx.createdAt,
    paidDate: tx.paidAt,
    currency: "THB",
    income: tx.fields.incomeTotal as number,
    feeTotal: tx.fields.feeTotal as number,
    adjustment: 0,
    payout: tx.fields.payout as number,
    productDetail: "กระบองไฟพกพง × 7",
    weightEstimated: null,
    weightCharged: null,
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    normalized: {
      ...asNormalized(tx),
      fields: legacyFields,
      unknownValues: [
        {
          header: "ค่าจัดส่งสินค้าที่ออกโดย Shopee",
          amount: 25,
          moneyLike: true,
          category: "income",
        },
      ],
    },
    createdAt: `${tx.createdAt}T00:00:00Z`,
    invoiceNo: "SEQ/2610/00077",
    channel: "Shopee",
    orderCode: "OM77",
    shippingFeeCustomer: 10,
    shippingFeeSeller: 25,
  });

  assert.equal(invoice.shippingIssuedByShopee, 25);
  assert.deepEqual(
    getOrderedInvoiceBreakdownLines(invoice).map((line) => ({
      key: line.key,
      amount: line.amount,
    })),
    [
      { key: "shippingCustomerFee", amount: 10 },
      { key: "shippingIssuedByShopee", amount: 25 },
    ],
  );
  assert.equal(invoice.receiptTotal, 105);
});
