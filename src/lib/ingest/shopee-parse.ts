import { createHash } from "node:crypto";
import { round2 } from "../format";
import {
  parseDateValue,
  readInputSheets,
  type IngestWarning,
  type Primitive,
  type UnknownValue,
} from "./parse";

/**
 * Parser ไฟล์รายได้ Shopee (Shopee Settlement / "รายงานรายรับของฉัน")
 * เช่น `Income.โอนเงินสำเร็จ.th.20261001_20261031.xlsx`
 *
 * โครงสร้างไฟล์ (ตรวจสอบกับไฟล์จริงเดือน 10/2026 — residual รายแถว = 0 ทุกแถว):
 * - Summary      : ชื่อผู้ใช้ (ผู้ขาย), ชื่อในบัญชีธนาคาร, จาก/ถึง (ช่วงรายงาน)
 * - Income       : หัวตารางอยู่แถวที่ 6, ข้อมูลเริ่มแถว 7 — 1 แถวต่อคำสั่งซื้อ
 * - Service Fee Details : เป็นแค่ breakdown ของคอลัมน์ "ค่าบริการ" ในชีต Income — ห้ามนำเข้าซ้ำ (จะนับเงินซ้อน)
 * - Adjustment   : รายการหัก/คืนเงินนอกคำสั่งซื้อ (เช่น การคืนเงินหลังคำสั่งซื้อสำเร็จ)
 *
 * อัตลักษณ์ทางการเงินรายแถว (ยืนยันด้วยข้อมูลจริง 161 แถว):
 *   income + refund + feeTotal = payout   (ทุกค่า "แสดงตามไฟล์เฉยๆ" ห้ามกลับเครื่องหมาย)
 * โดย refund (จำนวนเงินที่ทำการคืนให้ผู้ซื้อ) และค่าธรรมเนียมทุกคอลัมน์ ติดลบตามไฟล์จริง
 * และ payout (จำนวนเงินทั้งหมดที่โอนแล้ว) ติดลบได้จริงตามไฟล์ของ Shopee
 *
 * การจับคู่กับ oms_orders: เฉพาะ exact-ID เท่านั้น (marketplace_order_norm = external_id)
 * — ห้ามเดาด้วยยอดเงิน+วันที่ (ต่างจาก TikTok ที่มี prefix fallback)
 */

const SHOPEE_ORDER_TYPE = "คำสั่งซื้อ";
const SHOPEE_ADJ_ID_SUFFIX = "-ADJ-";

const HEADER_ORDER_ID = "หมายเลขคำสั่งซื้อ";
const HEADER_PAYOUT_PREFIX = "จำนวนเงินทั้งหมดที่โอนแล้ว";
const HEADER_PAID_DATE = "วันที่โอนชำระเงินสำเร็จ";
const HEADER_CREATED_DATE = "วันที่ทำการสั่งซื้อ";
const SUMMARY_MARKER = "รายงานรายรับของฉัน";

// คอลัมน์รายได้ (ส่วนลดผู้ขายติดลบตามจริงในไฟล์)
const INCOME_HEADERS = [
  "สินค้าราคาปกติ",
  "ส่วนลดสินค้าจากผู้ขาย",
  "ค่าจัดส่งที่ชำระโดยผู้ซื้อ",
  "ค่าจัดส่งสินค้าที่ออกโดย Shopee",
  "ค่าบริการติดตั้งที่ชำระโดยผู้ซื้อ",
  "ค่าบริการติดตั้งจริงจากผู้ให้บริการ",
  "ค่าชดเชยที่หายไป",
] as const;

// คอลัมน์รายได้ที่แมปเป็นฟิลด์มาตรฐานของบิลโดยตรง (ที่เหลือส่งเป็น unknownValues หมวด income)
const MAPPED_INCOME_HEADERS = new Set<string>([
  "สินค้าราคาปกติ",
  "ส่วนลดสินค้าจากผู้ขาย",
  "ค่าจัดส่งที่ชำระโดยผู้ซื้อ",
]);

// คอลัมน์เงินคืนผู้ซื้อ (ติดลบตามไฟล์)
const REFUND_HEADERS = ["จำนวนเงินที่ทำการคืนให้ผู้ซื้อ"] as const;

// คอลัมน์ค่าธรรมเนียม/ค่าใช้จ่ายที่หักจากยอดโอน (ติดลบตามไฟล์)
const FEE_HEADERS = [
  "ค่าจัดส่งที่ Shopee ชำระโดยชื่อของคุณ",
  "ค่าจัดส่งสินค้าคืน",
  "ค่าจัดส่งสินค้าคืนผู้ขาย",
  "โปรแกรมประหยัดค่าจัดส่งคืนสินค้า",
  "ค่าคอมมิชชั่น AMS",
  "ค่าคอมมิชชั่น",
  "ค่าบริการ",
  "ค่าธรรมเนียมโครงสร้างพื้นฐานแพลตฟอร์ม",
  "ค่าธรรมเนียม ของโปรแกรมประหยัดค่าจัดส่ง",
  "ค่าธุรกรรมการชำระเงิน",
  "ภาษี",
  "ค่าธรรมเนียมเติมเงินโฆษณาจากเงิน Escrow",
  "โบนัสส่วนลดเครื่องเก่าแลกใหม่จากผู้ขาย",
  "โปรโมชั่นค่าจัดส่งจากผู้ขาย",
] as const;

// คอลัมน์ข้อความ/ตัวระบุ (ไม่ใช่มูลค่า) — ไม่ต้องเตือน drift
const TEXT_HEADERS = [
  "รหัสคืนสินค้า",
  "ชื่อผู้ใช้ (ผู้ซื้อ)",
  "ช่องทางการชำระเงินของผู้ซื้อ",
  "Hot Listing",
  "ช่องทางการชำระเงิน (รายละเอียด)",
  "แผนการผ่อนชำระ",
  "ค่าธรรมเนียม (%)",
  "Shipping provider",
  "ชื่อผู้ให้บริการขนส่ง",
  "undefined",
] as const;

// คอลัมน์มูลค่าที่ยังไม่ถูกนับใน income/fee/payout — ห้ามระงับ! ต้องเตือน drift (SHOPEE_UNTRACKED_COLUMN)
// เมื่อค่ารวม ≠ 0 เพราะแปลว่าสูตรไฟล์ Shopee เปลี่ยนและอัตลักษณ์ income + refund + fee = payout จะพัง
const UNTRACKED_VALUE_HEADERS = [
  "ส่วนลดสินค้าที่ออกโดย Shopee",
  "โค้ดส่วนลดที่ออกโดยผู้ขาย",
  "โค้ดส่วนลดร่วมที่ออกโดยผู้ขาย",
  "Coins Cashback ที่สนับสนุนโดยผู้ขาย",
  "Coins Cashback ร่วมที่สนับสนุนโดยผู้ขาย",
  "โค้ดส่วนลด",
  "เงินที่คืนไปยังผู้ซื้อ",
  "Shopee Coins ที่ใช้กับสินค้าที่ขอคืน",
  "โค้ดส่วนลด Shopee ที่ใช้กับสินค้าที่ขอคืน",
  "โปรโมชั่นบัตรเครดิตที่ใช้กับสินค้าที่ขอคืน",
] as const;

export interface ShopeeSettlementTransaction {
  externalId: string;
  transactionType: string;
  isOrder: boolean;
  createdAt: string;
  paidAt: string;
  currency: string;
  fields: Record<string, string | number>;
  unknownValues?: UnknownValue[];
  checks: { incomeDiff: number; feeDiff: number; payoutDiff: number };
  warnings: IngestWarning[];
  raw: Record<string, string | number>;
  sourceRows: number;
  firstRow: number;
  rowIndexes: number[];
}

export interface ShopeeSettlementParseResult {
  fileType: "shopee_settlement";
  sheetName: string;
  headerRow: number;
  headers: string[];
  headerSignature: string;
  dataRowCount: number;
  orderCount: number;
  shopName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  transactions: ShopeeSettlementTransaction[];
  warnings: IngestWarning[];
}

type InputSheet = { name: string; rows: Primitive[][] };

function normHeader(text: unknown): string {
  return String(text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cellText(value: Primitive | undefined): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replace(/\u00a0/g, " ").trim();
}

function cellNumber(value: Primitive | undefined): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Date) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  const n = parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function cellDateIso(value: Primitive | undefined): string {
  if (value === null || value === undefined) return "";
  // ต้องส่งค่าดิบเข้า parseDateValue เพราะ streaming reader ของ ExcelJS อาจคืน
  // เซลล์วันที่เป็น (1) Date object, (2) Excel serial number (เช่น 46315) หรือ (3) text ISO
  // ถ้าแปลงเป็นข้อความก่อน ตัวเลข serial จะกลายเป็น "46315" ที่ parse ไม่ได้ → วันที่ว่าง
  if (value instanceof Date) return parseDateValue(value).iso ?? "";
  if (typeof value === "number") return parseDateValue(value).iso ?? "";
  const text = cellText(value);
  if (!text) return "";
  return parseDateValue(text).iso ?? "";
}

function buildHeaderIndex(
  rows: Primitive[][],
  isMatch: (byHeader: Map<string, number>) => boolean,
): { rowIndex: number; byHeader: Map<string, number>; headers: string[] } | null {
  const scanTo = Math.min(20, rows.length);
  for (let r = 0; r < scanTo; r++) {
    const byHeader = new Map<string, number>();
    const headers: string[] = [];
    const row = rows[r] ?? [];
    row.forEach((value, c) => {
      const h = normHeader(value);
      headers[c] = h;
      if (h && !byHeader.has(h)) byHeader.set(h, c);
    });
    if (isMatch(byHeader)) return { rowIndex: r, byHeader, headers };
  }
  return null;
}

function firstHeader(
  byHeader: Map<string, number>,
  candidates: readonly string[],
): number | undefined {
  for (const h of candidates) {
    const col = byHeader.get(h);
    if (col !== undefined) return col;
  }
  return undefined;
}

function parseSummarySheet(
  sheet: InputSheet | undefined,
): { shopName: string | null; periodStart: string | null; periodEnd: string | null } {
  if (!sheet) return { shopName: null, periodStart: null, periodEnd: null };
  let shopName: string | null = null;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  const scanTo = Math.min(30, sheet.rows.length);
  for (let r = 0; r < scanTo; r++) {
    const row = sheet.rows[r] ?? [];
    const label = cellText(row[0]);
    const rawValue = row[1];
    const value = cellText(rawValue);
    if (!label) continue;
    if (label === "ชื่อผู้ใช้ (ผู้ขาย)" && value) {
      shopName = value;
    } else if (label === "จาก" && value) {
      // ส่งค่าดิบเข้า cellDateIso (รองรับ Date object / Excel serial number / text ISO)
      periodStart = cellDateIso(rawValue) || value;
    } else if (label === "ถึง" && value) {
      periodEnd = cellDateIso(rawValue) || value;
    }
  }
  return { shopName, periodStart, periodEnd };
}

function parseAdjustmentSheet(
  sheet: InputSheet | undefined,
): ShopeeSettlementTransaction[] {
  if (!sheet) return [];
  const headerIndex = buildHeaderIndex(sheet.rows, (byHeader) => {
    return (
      firstHeader(byHeader, ["ยอดที่ปรับปรุง"]) !== undefined &&
      firstHeader(byHeader, ["รหัสคำสั่งซื้อที่เกี่ยวข้อง"]) !== undefined
    );
  });
  if (!headerIndex) return [];
  const amountCol = firstHeader(headerIndex.byHeader, ["ยอดที่ปรับปรุง"])!;
  const relatedCol = firstHeader(headerIndex.byHeader, [
    "รหัสคำสั่งซื้อที่เกี่ยวข้อง",
  ])!;
  const transferCol = firstHeader(headerIndex.byHeader, ["วันที่โอนยอดเงินที่ปรับปรุง"]);
  const typeCol = firstHeader(headerIndex.byHeader, ["ประเภทการปรับปรุง | คำอธิบาย"]);

  const grouped = new Map<
    string,
    {
      amount: number;
      relatedOrder: string;
      transferDate: string;
      type: string;
      firstRow: number;
      rowIndexes: number[];
    }
  >();
  for (let r = headerIndex.rowIndex + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] ?? [];
    const amount = round2(cellNumber(row[amountCol]));
    const rowLabel = cellText(row[0]);
    if (!amount || rowLabel === "ยอดรวม") continue;
    const relatedOrder = cellText(row[relatedCol]);
    const transferDate = transferCol !== undefined ? cellDateIso(row[transferCol]) : "";
    const type = typeCol !== undefined ? cellText(row[typeCol]) : "";
    const key = `${relatedOrder}|${transferDate}|${type}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.amount = round2(existing.amount + amount);
      existing.rowIndexes.push(r);
    } else {
      grouped.set(key, {
        amount,
        relatedOrder,
        transferDate,
        type,
        firstRow: r,
        rowIndexes: [r],
      });
    }
  }

  const transactions: ShopeeSettlementTransaction[] = [];
  for (const adj of grouped.values()) {
    const externalId = `${adj.relatedOrder || "SHOPEE"}${SHOPEE_ADJ_ID_SUFFIX}${
      adj.transferDate || `R${adj.firstRow}`
    }`;
    transactions.push({
      externalId,
      transactionType: adj.type || "การปรับยอด Shopee",
      isOrder: false,
      createdAt: adj.transferDate,
      paidAt: adj.transferDate,
      currency: "THB",
      // แสดงตามไฟล์เฉยๆ: ยอดปรับปรุงติดลบ = เงินออกจากยอดโอน
      fields: {
        incomeTotal: adj.amount,
        feeTotal: 0,
        adjustment: 0,
        payout: adj.amount,
        relatedOrderId: adj.relatedOrder,
      },
      checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
      warnings: [],
      raw: { ยอดที่ปรับปรุง: adj.amount },
      sourceRows: adj.rowIndexes.length,
      firstRow: adj.firstRow,
      rowIndexes: adj.rowIndexes,
    });
  }
  return transactions;
}

export async function detectAndParseShopeeInput(
  input: Buffer,
  preloadedSheets?: InputSheet[],
): Promise<ShopeeSettlementParseResult | null> {
  const sheets = preloadedSheets?.length
    ? preloadedSheets
    : await readInputSheets(input);

  // 1) หาชีตรายละเอียด (Income): แถวหัวตารางที่มี "หมายเลขคำสั่งซื้อ" + "จำนวนเงินทั้งหมดที่โอนแล้ว…" + "วันที่โอนชำระเงินสำเร็จ"
  let detail: InputSheet | null = null;
  let detailIndex: ReturnType<typeof buildHeaderIndex> | null = null;
  for (const sheet of sheets) {
    const idx = buildHeaderIndex(sheet.rows, (byHeader) => {
      const hasPayout = [...byHeader.keys()].some((h) =>
        h.startsWith(HEADER_PAYOUT_PREFIX),
      );
      return (
        byHeader.has(HEADER_ORDER_ID) &&
        hasPayout &&
        byHeader.has(HEADER_PAID_DATE) &&
        byHeader.has(HEADER_CREATED_DATE)
      );
    });
    if (idx) {
      detail = sheet;
      detailIndex = idx;
      break;
    }
  }
  if (!detail || !detailIndex) return null;

  // 2) ต้องมีชีต Summary แบบ Shopee ("รายงานรายรับของฉัน") กัน false positive กับไฟล์แพลตฟอร์มอื่น
  const summarySheet = sheets.find(
    (s) =>
      s.rows
        .slice(0, 10)
        .some((row) => (row ?? []).some((v) => cellText(v) === SUMMARY_MARKER)),
  );
  if (!summarySheet) return null;
  const summary = parseSummarySheet(summarySheet);

  const byHeader = detailIndex.byHeader;
  const orderIdCol = byHeader.get(HEADER_ORDER_ID)!;
  const payoutCol = [...byHeader.entries()].find(([h]) =>
    h.startsWith(HEADER_PAYOUT_PREFIX),
  )![1];
  const paidDateCol = byHeader.get(HEADER_PAID_DATE)!;
  const createdDateCol = byHeader.get(HEADER_CREATED_DATE)!;
  const returnCodeCol = byHeader.get("รหัสคืนสินค้า");
  const buyerCol = byHeader.get("ชื่อผู้ใช้ (ผู้ซื้อ)");

  const incomeCols: number[] = [];
  for (const h of INCOME_HEADERS) {
    const col = byHeader.get(h);
    if (col !== undefined) incomeCols.push(col);
  }
  const refundCols: number[] = [];
  for (const h of REFUND_HEADERS) {
    const col = byHeader.get(h);
    if (col !== undefined) refundCols.push(col);
  }
  const feeCols: number[] = [];
  for (const h of FEE_HEADERS) {
    const col = byHeader.get(h);
    if (col !== undefined) feeCols.push(col);
  }
  const classifiedCols = new Set<number>([
    orderIdCol,
    payoutCol,
    paidDateCol,
    createdDateCol,
    ...incomeCols,
    ...refundCols,
    ...feeCols,
  ]);
  for (const h of TEXT_HEADERS) {
    const col = byHeader.get(h);
    if (col !== undefined) classifiedCols.add(col);
  }
  // NB: UNTRACKED_VALUE_HEADERS ต้องไม่ถูกใส่ classifiedCols — เหลือให้ drift watch เฝ้าดู

  // 3) อ่านแถวข้อมูล + รวมหลายแถวต่อคำสั่งซื้อ (defensive aggregation)
  interface Acc {
    income: number;
    refund: number;
    fees: number;
    payout: number;
    createdAt: string;
    paidAt: string;
    firstRow: number;
    rowIndexes: number[];
    perColumn: Map<number, number>;
  }
  const accs = new Map<string, Acc>();
  const untrackedSums = new Map<number, number>();
  const moneyCols = [...incomeCols, ...refundCols, ...feeCols];

  for (let r = detailIndex.rowIndex + 1; r < detail.rows.length; r++) {
    const row = detail.rows[r] ?? [];
    const orderId = cellText(row[orderIdCol]);
    if (!orderId) continue;

    const rowIncome = round2(
      incomeCols.reduce((s, c) => s + cellNumber(row[c]), 0),
    );
    const rowRefund = round2(
      refundCols.reduce((s, c) => s + cellNumber(row[c]), 0),
    );
    const rowFees = round2(
      feeCols.reduce((s, c) => s + cellNumber(row[c]), 0),
    );
    const rowPayout = round2(cellNumber(row[payoutCol]));

    // drift watch: คอลัมน์ตัวเลขที่ยังไม่ถูกจัดกลุ่ม มีค่าไม่เป็นศูนย์ → เตือน
    row.forEach((value, c) => {
      if (classifiedCols.has(c)) return;
      if (!detailIndex!.headers[c]) return;
      const v = cellNumber(value);
      if (Math.abs(v) > 0.005) {
        untrackedSums.set(c, (untrackedSums.get(c) ?? 0) + v);
      }
    });

    const createdAt = cellDateIso(row[createdDateCol]);
    const paidAt = cellDateIso(row[paidDateCol]);

    // เก็บยอดรายคอลัมน์ไว้แจกแจงในบิลให้เหมือน TikTok
    // (สินค้าก่อน/หลังส่วนลด, ค่าส่งที่ลูกค้าจ่าย, ค่าธรรมเนียมแต่ละประเภท)
    const perColumn = new Map<number, number>();
    for (const c of moneyCols) {
      const value = cellNumber(row[c]);
      if (Math.abs(value) > 0.005) perColumn.set(c, value);
    }

    const existing = accs.get(orderId);
    if (existing) {
      existing.income = round2(existing.income + rowIncome);
      existing.refund = round2(existing.refund + rowRefund);
      existing.fees = round2(existing.fees + rowFees);
      existing.payout = round2(existing.payout + rowPayout);
      for (const [col, value] of perColumn) {
        existing.perColumn.set(col, round2((existing.perColumn.get(col) ?? 0) + value));
      }
      if (createdAt && (!existing.createdAt || createdAt < existing.createdAt)) {
        existing.createdAt = createdAt;
      }
      if (paidAt && (!existing.paidAt || paidAt > existing.paidAt)) {
        existing.paidAt = paidAt;
      }
      existing.rowIndexes.push(r);
    } else {
      accs.set(orderId, {
        income: rowIncome,
        refund: rowRefund,
        fees: rowFees,
        payout: rowPayout,
        createdAt,
        paidAt,
        firstRow: r,
        rowIndexes: [r],
        perColumn,
      });
    }
  }

  const warnings: IngestWarning[] = [];
  for (const [col, sum] of untrackedSums) {
    const h = detailIndex.headers[col] ?? `คอลัมน์ที่ ${col + 1}`;
    warnings.push({
      code: "SHOPEE_UNTRACKED_COLUMN",
      message: `คอลัมน์ "${h}" มีมูลค่ารวม ${round2(sum).toLocaleString("th-TH")} ฿ ซึ่งยังไม่ถูกนับใน รายได้/ค่าธรรมเนียม/ยอดโอน — ตรวจสอบว่าสูตรไฟล์ Shopee เปลี่ยนหรือไม่`,
      severity: "warning",
    });
  }

  // 4) สร้างธุรกรรม: บิลคำสั่งซื้อ (is_order=1)
  const sumColumn = (acc: Acc, header: string): number => {
    const col = byHeader.get(header);
    return col === undefined ? 0 : round2(acc.perColumn.get(col) ?? 0);
  };

  const orderTransactions: ShopeeSettlementTransaction[] = [];
  let payoutMismatchCount = 0;
  for (const [orderId, acc] of accs) {
    const payoutDiff = round2(acc.income + acc.refund + acc.fees - acc.payout);
    if (Math.abs(payoutDiff) > 0.005) {
      payoutMismatchCount++;
    }
    const firstRowValues = detail.rows[acc.firstRow] ?? [];

    // ฟิลด์มาตรฐานสำหรับใบกำกับ: ทำให้บิลแสดงสินค้าก่อน/หลังส่วนลด, ค่าส่งที่ลูกค้าจ่าย
    // และยอดที่ลูกค้าจ่ายจริงได้เหมือนไฟล์ TikTok (เดิมมีแค่ยอดรวม บิลจึงขึ้น 0.00)
    const productBeforeDiscount = sumColumn(acc, "สินค้าราคาปกติ");
    const storeDiscount = sumColumn(acc, "ส่วนลดสินค้าจากผู้ขาย");
    const shippingCustomerFee = sumColumn(acc, "ค่าจัดส่งที่ชำระโดยผู้ซื้อ");
    // ค่าจัดส่งที่ Shopee ออกให้ (ผู้ซื้อได้ส่งฟรี) — อยู่ในกลุ่มรายได้ของไฟล์ Shopee
    // ต้องแยกเป็นฟิลด์ของตัวเองเพื่อให้ใบกำกับภาษีแสดงเป็นบรรทัดค่าจัดส่ง เหมือน TikTok
    const shippingIssuedByShopee = sumColumn(
      acc,
      "ค่าจัดส่งสินค้าที่ออกโดย Shopee",
    );
    const productAfterDiscount = round2(productBeforeDiscount + storeDiscount);

    // ค่าธรรมเนียม/รายได้ที่เหลือ: ส่งเป็น unknownValues เพื่อให้บิลแจกแจงทีละบรรทัด
    // ตามชื่อคอลัมน์จริงของ Shopee (ไม่ใช้ FEE_GROUPS ของ TikTok เพราะชื่อจะผิด)
    const unknownValues: UnknownValue[] = [];
    for (const header of INCOME_HEADERS) {
      if (MAPPED_INCOME_HEADERS.has(header)) continue;
      const amount = sumColumn(acc, header);
      if (Math.abs(amount) > 0.005) {
        unknownValues.push({ header, amount, moneyLike: true, category: "income" });
      }
    }
    for (const header of FEE_HEADERS) {
      const amount = sumColumn(acc, header);
      if (Math.abs(amount) > 0.005) {
        unknownValues.push({ header, amount, moneyLike: true, category: "fee" });
      }
    }

    orderTransactions.push({
      externalId: orderId,
      transactionType: SHOPEE_ORDER_TYPE,
      isOrder: true,
      createdAt: acc.createdAt,
      paidAt: acc.paidAt,
      currency: "THB",
      fields: {
        incomeTotal: acc.income,
        feeTotal: acc.fees,
        adjustment: acc.refund,
        payout: acc.payout,
        productBeforeDiscount,
        storeDiscount,
        productAfterDiscount,
        shippingCustomerFee,
        shippingIssuedByShopee,
        customerPayment: round2(productAfterDiscount + shippingCustomerFee),
        ...(returnCodeCol !== undefined
          ? { returnCode: cellText(firstRowValues[returnCodeCol]) }
          : {}),
        ...(buyerCol !== undefined
          ? { buyerUsername: cellText(firstRowValues[buyerCol]) }
          : {}),
      },
      unknownValues,
      checks: { incomeDiff: 0, feeDiff: 0, payoutDiff },
      warnings: [],
      raw: {},
      sourceRows: acc.rowIndexes.length,
      firstRow: acc.firstRow,
      rowIndexes: acc.rowIndexes,
    });
  }
  if (payoutMismatchCount > 0) {
    warnings.push({
      code: "SHOPEE_PAYOUT_MISMATCH",
      message: `มี ${payoutMismatchCount} คำสั่งซื้อที่ รายได้ + เงินคืน + ค่าธรรมเนียม ไม่เท่ากับ ยอดเงินที่โอนแล้ว — ระบบจะแสดงส่วนต่างในบิล`,
      severity: "warning",
    });
  }

  // 5) แถวปรับยอดนอกคำสั่งซื้อ (Adjustment) → is_order=0 แบบเดียวกับ -ADJ- ของ TikTok
  const adjTransactions = parseAdjustmentSheet(
    sheets.find((s) => s.name === "Adjustment") ??
      sheets.find((s) => /adjust/i.test(s.name)),
  );

  const allTransactions = [...orderTransactions, ...adjTransactions];
  const headers = detailIndex.headers.filter((h) => h !== undefined) as string[];
  const headerSignature = createHash("sha1")
    .update(headers.map((h) => normHeader(h)).join("|"))
    .digest("hex")
    .slice(0, 16);

  return {
    fileType: "shopee_settlement",
    sheetName: detail.name,
    headerRow: detailIndex.rowIndex + 1,
    headers,
    headerSignature,
    dataRowCount: allTransactions.length,
    orderCount: orderTransactions.length,
    shopName: summary.shopName,
    periodStart: summary.periodStart,
    periodEnd: summary.periodEnd,
    transactions: allTransactions,
    warnings,
  };
}
