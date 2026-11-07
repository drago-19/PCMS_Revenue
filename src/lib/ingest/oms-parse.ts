import { createHash } from "node:crypto";
import { normalizeHeader } from "./catalog";
import {
  detectDateColumnFormat,
  isFormulaErrorValue,
  parseDateValue,
  readInputSheets,
  toNumber,
  type IngestWarning,
  type MappingEntry,
  type Primitive,
} from "./parse";
import { round2 } from "../format";
import { lookupCustomFieldKey } from "../column-mapping-settings";

export type DetectedFileType = "settlement" | "oms_orders" | "oms_items" | "lazada_orders";

export function buildOmsOrderUid(
  orderCode: string,
  paidDate: string,
  createdDate: string,
  trackingNo: string | null | undefined,
): string {
  const code = orderCode.trim();
  const trk =
    trackingNo && trackingNo !== "-" && trackingNo !== "--"
      ? trackingNo.trim()
      : "";
  const ym = (paidDate || createdDate || "").slice(0, 7);
  return `${code}|${ym}|${trk || paidDate || createdDate}`;
}

export interface ParsedOmsOrder {
  orderUid: string;
  orderCode: string;
  channel: string;
  customerName: string | null;
  customerPhone: string | null;
  contactName: string | null;
  courier: string | null;
  shippingFeeCustomer: number;
  shippingFeeSeller: number;
  province: string | null;
  bank: string | null;
  trackingNo: string | null;
  note: string | null;
  createdBy: string | null;
  createdDate: string;
  paidDate: string;
  printedDate: string;
  marketplaceOrderRaw: string | null;
  marketplaceOrderNorm: string | null;
  marketplaceOrderPrefix: string | null;
  marketplaceOrderFloat: number | null;
  discountCode: string | null;
  discountTotal: number;
  totalQty: number;
  salesAmount: number;
  profitAmount: number;
}

export interface ParsedOmsItem {
  orderUid: string;
  orderCode: string;
  lineNo: number;
  skuCode: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  orderSalesAmount: number;
  shippingFeeCustomer: number;
  senderName: string | null;
  customerName: string | null;
  customerAddress: string | null;
  postalCode: string | null;
  customerPhone: string | null;
  paidDate: string;
  createdDate: string;
  courier: string | null;
  channel: string;
  bank: string | null;
  note: string | null;
  trackingNo: string | null;
}

export interface ParsedOmsWorkbook {
  fileType: "oms_orders" | "oms_items";
  sheetName: string;
  headerRow: number;
  headers: string[];
  mapping: MappingEntry[];
  orders: ParsedOmsOrder[];
  items: ParsedOmsItem[];
  warnings: IngestWarning[];
  headerSignature: string;
  dataRowCount: number;
  periodStart: string | null;
  periodEnd: string | null;
}

export function extractRawHeadersFromSheets(
  sheets: { name: string; rows: Primitive[][] }[],
): string[] {
  for (const sheet of sheets) {
    for (let r = 0; r < Math.min(15, sheet.rows.length); r++) {
      const row = sheet.rows[r] ?? [];
      const nonEmpty = row.map((v) => String(v ?? "").trim()).filter(Boolean);
      if (nonEmpty.length >= 3) {
        return nonEmpty;
      }
    }
  }
  return [];
}

export function normalizeChannel(raw: Primitive | undefined): string {
  const text = String(raw ?? "").trim();
  const lower = text.toLowerCase();
  if (!lower || lower === "-") return "TikTok";
  if (
    lower.includes("tiktok") ||
    lower.includes("tik tok") ||
    lower.includes("ติ๊กต") ||
    lower === "ตต"
  ) {
    return "TikTok";
  }
  if (
    lower.includes("shopee") ||
    lower.includes("ช้อปปี้") ||
    lower.includes("ช๊อปปี้")
  ) {
    return "Shopee";
  }
  if (lower.includes("facebook") || lower === "fb" || lower.includes("เพจ")) return "Facebook";
  if (lower.includes("lazada")) return "Lazada";
  if (lower.includes("line") || lower.includes("ไลน์")) return "LINE";
  if (lower === "other" || lower.includes("อื่นๆ") || lower.includes("อื่น ๆ")) return "Other";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function normalizeMarketplaceId(value: Primitive | undefined): {
  raw: string | null;
  norm: string | null;
  prefix: string | null;
  floatVal: number | null;
} {
  if (value === null || value === undefined) {
    return { raw: null, norm: null, prefix: null, floatVal: null };
  }
  const rawText = String(value).replace(/^'/, "").trim();
  if (!rawText || rawText === "-" || rawText === "--" || rawText === "/") {
    return { raw: null, norm: null, prefix: null, floatVal: null };
  }

  // Exact integer string (e.g. "586280727858677572")
  if (/^\d{15,22}$/.test(rawText)) {
    const floatVal = Number(rawText);
    return {
      raw: rawText,
      norm: rawText,
      prefix: rawText.slice(0, 15),
      floatVal: Number.isFinite(floatVal) ? floatVal : null,
    };
  }

  // Scientific notation (e.g. "5.8635928059415936e+17") or numeric value
  const sciMatch = /^[+]?(\d+)(?:\.(\d+))?[eE][+]?(\d+)$/.exec(rawText);
  if (sciMatch) {
    const intPart = sciMatch[1] ?? "";
    const fracPart = sciMatch[2] ?? "";
    const exp = Number(sciMatch[3] ?? 0);
    const digits = intPart + fracPart;
    if (exp >= fracPart.length && exp <= 22) {
      const expanded = digits + "0".repeat(exp - fracPart.length);
      const num = Number(rawText);
      return {
        raw: rawText,
        norm: expanded,
        prefix: digits.slice(0, 15).padEnd(15, "0"),
        floatVal: Number.isFinite(num) ? num : null,
      };
    }
  }

  if (typeof value === "number" && Number.isFinite(value) && value >= 1e14) {
    const sciStr = value.toExponential();
    const m = /^(\d+)(?:\.(\d+))?e\+(\d+)$/i.exec(sciStr);
    if (m) {
      const digits = (m[1] ?? "") + (m[2] ?? "");
      const exp = Number(m[3] ?? 0);
      const fracLen = (m[2] ?? "").length;
      const expanded =
        exp >= fracLen
          ? digits + "0".repeat(exp - fracLen)
          : BigInt(Math.round(value)).toString();
      return {
        raw: rawText,
        norm: expanded,
        prefix: digits.slice(0, 15).padEnd(15, "0"),
        floatVal: value,
      };
    }
  }

  // Alphanumeric ID (e.g. Shopee "261001GH52V0JW")
  return {
    raw: rawText,
    norm: rawText,
    prefix: rawText.slice(0, 15),
    floatVal: null,
  };
}

function cleanText(value: Primitive | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === "-" || text === "--") return null;
  return text;
}

const OMS_ORDER_ALIASES: Record<string, string[]> = {
  orderCode: [
    "เลขที่ออเดอร์",
    "รหัสออเดอร์",
    "หมายเลขคำสั่งซื้อ",
    "รหัสคำสั่งซื้อ",
    "เลขที่ใบสั่งขาย",
    "เลขที่เอกสาร",
    "order code",
    "order no",
    "order id",
    "order number",
  ],
  customerName: [
    "ชื่อ",
    "ชื่อลูกค้า",
    "ชื่อผู้รับ",
    "ชื่อผู้ซื้อ",
    "ชื่อผู้ใช้ (ผู้ซื้อ)",
    "customer name",
    "recipient name",
    "buyer name",
  ],
  customerPhone: [
    "เบอร์โทร",
    "เบอร์โทรศัพท์",
    "หมายเลขโทรศัพท์",
    "เบอร์ผู้รับ",
    "phone",
    "tel",
    "phone number",
  ],
  channel: [
    "ช่องทางติดต่อ",
    "ช่องทาง",
    "ช่องทางการขาย",
    "แพลตฟอร์ม",
    "ร้านค้า",
    "channel",
    "platform",
    "marketplace",
  ],
  contactName: ["ชื่อตามช่องทางติดต่อ", "contact name", "buyer username"],
  courier: [
    "ขนส่ง",
    "บริษัทขนส่ง",
    "ตัวเลือกการจัดส่ง",
    "ผู้ให้บริการขนส่ง",
    "courier",
    "shipping provider",
  ],
  shippingFeeCustomer: [
    "ค่าส่งที่เก็บลูกค้า",
    "ค่าจัดส่งที่เก็บลูกค้า",
    "ค่าจัดส่งที่ผู้ซื้อชำระ",
    "ค่าส่ง",
    "shipping fee paid by buyer",
  ],
  province: ["จังหวัด", "province", "state"],
  bank: ["ธนาคาร", "ธนาคารที่โอนเงิน", "ช่องทางการชำระเงิน", "bank", "payment method"],
  trackingNo: [
    "เลขพัสดุ",
    "หมายเลขพัสดุ",
    "หมายเลขติดตามพัสดุ",
    "tracking",
    "tracking no",
    "tracking number",
  ],
  shippingFeeSeller: [
    "ค่าส่งที่ร้านจ่าย",
    "ค่าจัดส่งที่ร้านจ่าย",
    "ค่าจัดส่งที่ร้านค้าจ่ายจริง",
  ],
  note: ["หมายเหตุ", "หมายเหตุจากผู้ซื้อ", "note", "remark"],
  createdBy: ["สร้างโดย", "พนักงานขาย", "created by"],
  createdDate: [
    "วันที่สร้าง",
    "เวลาที่สร้าง",
    "วันที่ทำการสั่งซื้อ",
    "เวลาการสั่งซื้อ",
    "วันที่สั่งซื้อ",
    "order creation date",
    "created at",
  ],
  paidDate: [
    "วันที่โอนเงิน",
    "วันที่ชำระเงิน",
    "เวลาการชำระเงิน",
    "วันที่โอน",
    "paid date",
    "payment time",
  ],
  printedDate: ["วันที่พิมพ์", "วันที่พิมพ์2", "printed date"],
  marketplaceOrderId: [
    "เลขที่บน marketplace",
    "เลขคำสั่งซื้อ marketplace",
    "เลขที่อ้างอิง",
    "รหัสอ้างอิงแพลตฟอร์ม",
    "marketplace order id",
    "external order id",
  ],
  discountCode: ["รหัสส่วนลด", "โค้ดส่วนลด", "discount code", "voucher code"],
  discountTotal: [
    "ส่วนลดรวม",
    "ส่วนลด",
    "ส่วนลดจากร้านค้า",
    "โค้ดส่วนลดชำระโดยผู้ขาย",
    "discount",
    "total discount",
  ],
  totalQty: ["จำนวนรวม", "จำนวนชิ้นรวม", "จำนวน", "total quantity", "total qty"],
  salesAmount: [
    "ยอดขาย",
    "ยอดขายออเดอร์",
    "ยอดรวม",
    "จำนวนเงินทั้งหมด",
    "ยอดชำระสุทธิ",
    "total amount",
    "grand total",
    "sales amount",
  ],
  profitAmount: ["กำไร", "กำไรสุทธิ", "ยอดรับสุทธิ", "net profit", "payout"],
};

const OMS_ITEM_ALIASES: Record<string, string[]> = {
  skuCode: [
    "รหัสสินค้า",
    "เลขอ้างอิง sku (sku reference no.)",
    "เลขอ้างอิง sku",
    "รหัสสินค้าหลัก",
    "sku",
    "seller sku",
    "product code",
    "item code",
    "parent sku",
  ],
  productName: [
    "สินค้า",
    "ชื่อสินค้า",
    "รายการสินค้า",
    "รายละเอียดสินค้า",
    "product name",
    "product",
    "item name",
  ],
  unitPrice: [
    "ราคา",
    "ราคาต่อชิ้น",
    "ราคาตั้งต้น",
    "ราคาขาย",
    "unit price",
    "price",
    "original price",
    "deal price",
  ],
  quantity: ["จำนวน", "จำนวนที่สั่ง", "qty", "quantity"],
  orderCode: [
    "เลขที่ออเดอร์",
    "รหัสออเดอร์",
    "หมายเลขคำสั่งซื้อ",
    "รหัสคำสั่งซื้อ",
    "เลขที่ใบสั่งขาย",
    "order code",
    "order no",
    "order id",
  ],
  orderSalesAmount: [
    "ยอดขายออเดอร์",
    "ยอดขายรวม",
    "ราคาขายสุทธิ",
    "จำนวนเงินทั้งหมด",
    "ยอดรวมค่าสินค้า",
    "order total",
    "subtotal",
  ],
  shippingFeeCustomer: ["ค่าส่งที่เก็บลูกค้า", "ค่าจัดส่งที่ผู้ซื้อชำระ"],
  senderName: ["ผู้ส่ง", "ร้านค้า", "sender"],
  customerName: ["ชื่อ", "ชื่อลูกค้า", "ชื่อผู้รับ", "ชื่อผู้ซื้อ", "recipient name"],
  customerAddress: ["ที่อยู่", "ที่อยู่จัดส่ง", "ที่อยู่ในการจัดส่ง", "shipping address", "address"],
  postalCode: ["รหัสไปรษณีย์", "ไปรษณีย์", "postal code", "zipcode", "zip code"],
  customerPhone: ["เบอร์โทร", "เบอร์โทรศัพท์", "หมายเลขโทรศัพท์", "phone"],
  paidDate: ["วันที่โอนเงิน", "วันที่ชำระเงิน", "เวลาการชำระเงิน"],
  createdBy: ["สร้างโดย", "พนักงานขาย"],
  courier: ["ขนส่ง", "ตัวเลือกการจัดส่ง", "บริษัทขนส่ง"],
  channel: ["ช่องทางติดต่อ", "ช่องทาง", "ช่องทางการขาย", "แพลตฟอร์ม"],
  bank: ["ธนาคารที่โอนเงิน", "ธนาคาร", "ช่องทางการชำระเงิน"],
  note: ["หมายเหตุ", "หมายเหตุจากผู้ซื้อ"],
  trackingNo: ["เลขพัสดุ", "หมายเลขติดตามพัสดุ", "tracking number"],
  createdDate: ["วันที่สร้าง", "วันที่ทำการสั่งซื้อ", "วันที่สั่งซื้อ"],
};

function matchAliasMap(
  header: string,
  aliasMap: Record<string, string[]>,
): string | null {
  const norm = normalizeHeader(header);
  if (!norm) return null;
  for (const [key, aliases] of Object.entries(aliasMap)) {
    for (const alias of aliases) {
      if (normalizeHeader(alias) === norm) return key;
    }
  }
  return null;
}

export async function detectAndParseOmsInput(
  input: Buffer | ArrayBuffer,
  customMapping?: Record<string, string>,
  preloadedSheets?: { name: string; rows: Primitive[][] }[],
): Promise<ParsedOmsWorkbook | null> {
  const sheets = preloadedSheets ?? (await readInputSheets(input));

  const parsedOrders: ParsedOmsOrder[] = [];
  const parsedItems: ParsedOmsItem[] = [];
  const warnings: IngestWarning[] = [];
  let primaryType: "oms_orders" | "oms_items" | null = null;
  let primarySheetName = "";
  let primaryHeaderRow = 1;
  let primaryHeaders: string[] = [];
  let primaryMapping: MappingEntry[] = [];
  let totalDataRows = 0;
  const seenCrossSheetOrderUids = new Set<string>();
  const seenCrossSheetKeylessSigs = new Set<string>();

  for (const sheet of sheets) {
    const rows = sheet.rows;
    if (rows.length < 1) continue;
    if (primaryType && /\bcopy\s+of\b|สำเนา/i.test(sheet.name.trim())) {
      warnings.push({
        code: "DUPLICATE_SHEET_IGNORED",
        message: `ข้ามชีตสำเนา "${sheet.name}" เพื่อป้องกันข้อมูลซ้ำซ้อน`,
        severity: "warning",
      });
      continue;
    }
    const scanLimit = Math.min(20, rows.length);

    let detectedSheetType: "oms_orders" | "oms_items" | null = null;
    let hasDualOrderColumns = false;
    let headerIdx = -1;
    let colByField = new Map<string, number>();
    let dualOrderColByField = new Map<string, number>();
    let headers: string[] = [];

    for (let r = 0; r < scanLimit; r++) {
      const row = rows[r] ?? [];
      const itemMap = new Map<string, number>();
      const orderMap = new Map<string, number>();

      const stdItemFieldsInRow = new Set<string>();
      const stdOrderFieldsInRow = new Set<string>();
      for (let c = 0; c < row.length; c++) {
        const h = String(row[c] ?? "").trim();
        if (!h) continue;
        const stdItem = matchAliasMap(h, OMS_ITEM_ALIASES);
        if (stdItem) stdItemFieldsInRow.add(stdItem);
        const stdOrder = matchAliasMap(h, OMS_ORDER_ALIASES);
        if (stdOrder) stdOrderFieldsInRow.add(stdOrder);
      }

      for (let c = 0; c < row.length; c++) {
        const h = String(row[c] ?? "").trim();
        if (!h) continue;
        const stdItemKey = matchAliasMap(h, OMS_ITEM_ALIASES);
        const stdOrderKey = matchAliasMap(h, OMS_ORDER_ALIASES);
        const customField = lookupCustomFieldKey(h, customMapping);
        if (customField) {
          const isValidItemCustom =
            Object.prototype.hasOwnProperty.call(OMS_ITEM_ALIASES, customField) &&
            !(stdItemKey && stdItemKey !== customField && stdItemFieldsInRow.has(customField));
          const isValidOrderCustom =
            Object.prototype.hasOwnProperty.call(OMS_ORDER_ALIASES, customField) &&
            !(stdOrderKey && stdOrderKey !== customField && stdOrderFieldsInRow.has(customField));
          if (isValidItemCustom) {
            itemMap.set(customField, c);
          }
          if (isValidOrderCustom) {
            orderMap.set(customField, c);
          }
          if (isValidItemCustom || isValidOrderCustom) {
            continue;
          }
        }
        if (stdItemKey && !itemMap.has(stdItemKey)) itemMap.set(stdItemKey, c);
        if (stdOrderKey && !orderMap.has(stdOrderKey)) orderMap.set(stdOrderKey, c);
      }

      if (
        itemMap.has("skuCode") &&
        itemMap.has("productName") &&
        (itemMap.has("orderCode") || itemMap.has("unitPrice"))
      ) {
        detectedSheetType = "oms_items";
        headerIdx = r;
        colByField = itemMap;
        dualOrderColByField = orderMap;
        hasDualOrderColumns =
          orderMap.has("orderCode") &&
          (orderMap.has("shippingFeeSeller") ||
            orderMap.has("profitAmount") ||
            orderMap.has("marketplaceOrderId") ||
            orderMap.has("discountTotal"));
        headers = row.map((v) => String(v ?? "").trim());
        break;
      }

      if (
        orderMap.has("orderCode") &&
        (orderMap.has("marketplaceOrderId") ||
          orderMap.has("profitAmount") ||
          orderMap.has("salesAmount") ||
          orderMap.has("channel"))
      ) {
        detectedSheetType = "oms_orders";
        headerIdx = r;
        colByField = orderMap;
        headers = row.map((v) => String(v ?? "").trim());
        break;
      }
    }

    if (!detectedSheetType || headerIdx < 0) continue;

    if (!primaryType) {
      primaryType = detectedSheetType;
      primarySheetName = sheet.name;
      primaryHeaderRow = headerIdx + 1;
      primaryHeaders = headers;
      primaryMapping = headers.map((h, idx) => {
        const stdFk =
          detectedSheetType === "oms_items"
            ? matchAliasMap(h, OMS_ITEM_ALIASES)
            : matchAliasMap(h, OMS_ORDER_ALIASES);
        const customFk = lookupCustomFieldKey(h, customMapping);
        const validCustomFk =
          customFk &&
          (detectedSheetType === "oms_items"
            ? Object.prototype.hasOwnProperty.call(OMS_ITEM_ALIASES, customFk)
            : Object.prototype.hasOwnProperty.call(OMS_ORDER_ALIASES, customFk)) &&
          !(stdFk && stdFk !== customFk && colByField.has(customFk) && colByField.get(customFk) !== idx)
            ? customFk
            : null;
        const fk = validCustomFk ?? stdFk;
        return {
          col: idx,
          header: h,
          fieldKey: fk,
          label: h || null,
          kind: fk ? "text" : null,
          confidence: fk ? "exact" : "unmapped",
          nonEmpty: 0,
        };
      });
    }

    const extractDateColFormat = (fieldMap: Map<string, number>, key: string): "DMY" | "MDY" => {
      const col = fieldMap.get(key);
      if (col === undefined) return "DMY";
      const vals: Primitive[] = [];
      for (let sr = headerIdx + 1; sr < rows.length; sr++) {
        vals.push(rows[sr]?.[col] ?? null);
      }
      return detectDateColumnFormat(vals);
    };

    if (detectedSheetType === "oms_orders" || hasDualOrderColumns) {
      const orderFieldMap =
        detectedSheetType === "oms_orders" ? colByField : dualOrderColByField;
      if (!orderFieldMap.has("salesAmount") && colByField.has("orderSalesAmount")) {
        orderFieldMap.set("salesAmount", colByField.get("orderSalesAmount")!);
      }
      const createdFmt = extractDateColFormat(orderFieldMap, "createdDate");
      const paidFmt = extractDateColFormat(orderFieldMap, "paidDate");
      const printedFmt = extractDateColFormat(orderFieldMap, "printedDate");

      // Pre-scan dominant channel on the sheet (e.g., Facebook or LINE accounting summary files
      // where some fee/exchange rows like "รายได้ค่าเปลี่ยนไซส์" leave orderCode and channel blank)
      let sheetDefaultChannel: string | null = null;
      const sheetNameNorm = sheet.name.toLowerCase();
      if (sheetNameNorm.includes("facebook") || sheetNameNorm.includes("เฟส")) {
        sheetDefaultChannel = "Facebook";
      } else if (sheetNameNorm.includes("line") || sheetNameNorm.includes("ไลน์")) {
        sheetDefaultChannel = "LINE";
      }
      for (let sr = headerIdx + 1; sr < rows.length; sr++) {
        const srow = rows[sr] ?? [];
        const chCol = orderFieldMap.get("channel");
        const rawCh = chCol !== undefined ? srow[chCol] : undefined;
        if (cleanText(rawCh)) {
          const ch = normalizeChannel(rawCh);
          if (ch === "Facebook" || ch === "LINE") {
            sheetDefaultChannel = ch;
            break;
          }
        }
      }
      const generatedCodeCounter = new Map<string, number>();
      const sheetOrdersByUid = new Map<string, ParsedOmsOrder>();
      const dupCodeCounter = new Map<string, number>();
      const mappedColsSet = new Set<number>(orderFieldMap.values());

      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r] ?? [];
        const excelRow = r + 1;
        const get = (key: string): Primitive | undefined => {
          const col = orderFieldMap.get(key);
          return col !== undefined ? row[col] : undefined;
        };
        let orderCode = cleanText(get("orderCode"));
        const noteText = cleanText(get("note"));
        const rawCreatedCell = get("createdDate");
        const rawPaidCell = get("paidDate");
        const rawPrintedCell = get("printedDate");
        const rawCreatedDate = parseDateValue(rawCreatedCell, createdFmt).iso ?? "";
        const rawPaidDate = parseDateValue(rawPaidCell, paidFmt).iso ?? "";
        const printedDate = parseDateValue(rawPrintedCell, printedFmt).iso ?? "";
        const rawChannelCell = get("channel");
        let channel = normalizeChannel(rawChannelCell);

        // If staff accidentally selected 'Facebook' in Shipnity, but the note explicitly states 'line oa' / 'lineoa'
        // (e.g. #PZ20 with channel='facebook' and note='line oa'), normalize channel to 'LINE'
        if (
          channel === "Facebook" &&
          noteText &&
          /\bline\s*oa\b|^line\b/i.test(noteText.trim())
        ) {
          channel = "LINE";
        }

        let isKeylessAccountingRow = false;
        if (!orderCode) {
          // Support accounting summary rows without orderCode (e.g. "รายได้ค่าเปลี่ยนไซส์" 50 THB)
          // while strictly skipping summary/total footer rows (which have no note and no dates)
          const anyDate = rawPaidDate || rawCreatedDate || printedDate;
          const fallbackChannel = cleanText(rawChannelCell)
            ? channel
            : (sheetDefaultChannel ?? channel);
          if (
            noteText &&
            noteText !== "-" &&
            anyDate &&
            (fallbackChannel === "Facebook" || fallbackChannel === "LINE")
          ) {
            channel = fallbackChannel;
            isKeylessAccountingRow = true;
            const prefix = channel === "Facebook" ? "FB" : "LN";
            const yymmdd = anyDate.replace(/-/g, "").slice(2, 8) || String(r);
            const baseCode = `${prefix}-${yymmdd}`;
            const nextSeq = (generatedCodeCounter.get(baseCode) ?? 0) + 1;
            generatedCodeCounter.set(baseCode, nextSeq);
            orderCode = nextSeq === 1 ? baseCode : `${baseCode}-${nextSeq}`;
          } else {
            continue;
          }
        }

        if (
          channel !== "TikTok" &&
          channel !== "Shopee" &&
          channel !== "Facebook" &&
          channel !== "Lazada" &&
          channel !== "LINE" &&
          channel !== "Other"
        ) {
          continue;
        }

        const rawSalesCell = get("salesAmount");
        const rawProfitCell = get("profitAmount");
        if (isFormulaErrorValue(rawSalesCell) || isFormulaErrorValue(rawProfitCell)) {
          warnings.push({
            code: "FORMULA_ERROR",
            message: `แถวที่ ${excelRow} (${orderCode}) พบข้อผิดพลาดสูตร Excel ในช่องตัวเลข ("${String(
              isFormulaErrorValue(rawSalesCell) ? rawSalesCell : rawProfitCell,
            )}")`,
            severity: "warning",
            row: excelRow,
          });
        }

        const parsedPaidDate =
          rawPaidDate ||
          ((channel === "LINE" || channel === "Facebook") && !orderFieldMap.has("paidDate")
            ? rawCreatedDate || printedDate
            : "");
        const createdDate =
          rawCreatedDate ||
          ((channel === "LINE" || channel === "Facebook") && !orderFieldMap.has("createdDate")
            ? parsedPaidDate || printedDate
            : "");
        const paidDate = parsedPaidDate || createdDate;
        const trackingNo = cleanText(get("trackingNo"));

        if (!paidDate && !createdDate) {
          const hadNonEmptyDateCell =
            (cleanText(rawPaidCell) && cleanText(rawPaidCell) !== "-") ||
            (cleanText(rawCreatedCell) && cleanText(rawCreatedCell) !== "-");
          if (hadNonEmptyDateCell) {
            warnings.push({
              code: "INVALID_OMS_DATE",
              message: `แถวที่ ${excelRow} (${orderCode}) รูปแบบวันที่ไม่ถูกต้อง ("${
                cleanText(rawPaidCell) || cleanText(rawCreatedCell)
              }") – ข้ามแถวนี้`,
              severity: "warning",
              row: excelRow,
            });
          }
        }

        const profitCol = orderFieldMap.get("profitAmount");
        const salesCol = orderFieldMap.get("salesAmount");
        const rawSalesVal = round2(toNumber(rawSalesCell));
        const nextAfterProfit = profitCol !== undefined ? row[profitCol + 1] : undefined;
        const nextColIsUnmappedOrBlankHeader =
          profitCol !== undefined &&
          !mappedColsSet.has(profitCol + 1) &&
          (!headers[profitCol + 1] || headers[profitCol + 1].trim() === "");
        const nextCellIsNumeric =
          nextAfterProfit !== null &&
          nextAfterProfit !== undefined &&
          (typeof nextAfterProfit === "number" ||
            /^\s*[+-]?\d+(?:\.\d+)?\s*$/.test(String(nextAfterProfit)));
        const isShiftedRow =
          (channel === "LINE" || channel === "Facebook") &&
          rawSalesVal === 0 &&
          profitCol !== undefined &&
          (salesCol === undefined || profitCol >= salesCol) &&
          round2(toNumber(row[profitCol])) > 0 &&
          row.length > profitCol + 1 &&
          nextColIsUnmappedOrBlankHeader &&
          nextCellIsNumeric;
        const shiftedSalesVal = isShiftedRow
          ? round2(toNumber(row[profitCol!]))
          : rawSalesVal;

        // กฎการกรองบิลแยกตามช่องทาง (Strict Platform Financial Isolation):
        if (channel === "Shopee") {
          if (!parsedPaidDate || (!trackingNo && !printedDate) || rawSalesVal <= 0) {
            continue;
          }
        } else if (channel === "Facebook") {
          const hasFbProof = Boolean(
            trackingNo ||
              printedDate ||
              !orderFieldMap.has("printedDate") ||
              !orderFieldMap.has("trackingNo") ||
              (noteText && noteText !== "-"),
          );
          if (!parsedPaidDate || !hasFbProof || shiftedSalesVal <= 0) {
            continue;
          }
        } else if (channel === "Lazada") {
          if (!parsedPaidDate || rawSalesVal <= 0) {
            continue;
          }
        } else if (channel === "LINE") {
          if (!parsedPaidDate || shiftedSalesVal <= 0) {
            continue;
          }
        } else if (channel === "Other") {
          if (!parsedPaidDate && !createdDate) {
            continue;
          }
        }

        if (detectedSheetType === "oms_orders") {
          totalDataRows++;
        }

        const mp = normalizeMarketplaceId(get("marketplaceOrderId"));
        const shippingSellerVal = round2(toNumber(get("shippingFeeSeller")));
        let resolvedSalesVal = rawSalesVal;
        let resolvedProfitVal: number;
        let resolvedTotalQty = Math.max(
          0,
          Math.round(toNumber(get("totalQty") ?? get("quantity"))),
        );

        if (isShiftedRow && profitCol !== undefined) {
          resolvedSalesVal = round2(toNumber(row[profitCol]));
          resolvedProfitVal = round2(toNumber(row[profitCol + 1]));
          if (resolvedTotalQty === 0 && profitCol >= 2) {
            resolvedTotalQty = Math.max(0, Math.round(toNumber(row[profitCol - 2])));
          }
        } else {
          const profitRawText = cleanText(rawProfitCell);
          if (!profitRawText || profitRawText === "-") {
            resolvedProfitVal = round2(resolvedSalesVal - shippingSellerVal);
          } else {
            resolvedProfitVal = round2(toNumber(rawProfitCell));
          }
        }

        if (isKeylessAccountingRow) {
          const keylessSig = `${channel}|${paidDate}|${noteText ?? ""}|${resolvedSalesVal}`;
          if (seenCrossSheetKeylessSigs.has(keylessSig) && !sheetOrdersByUid.has(buildOmsOrderUid(orderCode, paidDate, createdDate, trackingNo))) {
            continue;
          }
          seenCrossSheetKeylessSigs.add(keylessSig);
        }

        let orderUid = buildOmsOrderUid(
          orderCode,
          paidDate,
          createdDate,
          trackingNo,
        );

        if (seenCrossSheetOrderUids.has(orderUid) && !sheetOrdersByUid.has(orderUid)) {
          continue;
        }

        const existingInSheet = sheetOrdersByUid.get(orderUid);
        if (existingInSheet) {
          const newCust = cleanText(get("customerName"));
          const oldCust = existingInSheet.customerName;
          if (
            !hasDualOrderColumns &&
            oldCust &&
            newCust &&
            oldCust.toLowerCase() !== newCust.toLowerCase()
          ) {
            const nextDup = (dupCodeCounter.get(orderCode) ?? 1) + 1;
            dupCodeCounter.set(orderCode, nextDup);
            const disambiguatedCode = `${orderCode}-${nextDup}`;
            warnings.push({
              code: "DUPLICATE_ORDER_CODE_CONFLICT",
              message: `แถวที่ ${excelRow} พบเลขที่ออเดอร์ซ้ำ "${orderCode}" แต่คนละชื่อลูกค้า ("${oldCust}" vs "${newCust}") – แยกเป็น "${disambiguatedCode}" เพื่อไม่ให้ทับข้อมูลกัน`,
              severity: "warning",
              row: excelRow,
            });
            orderCode = disambiguatedCode;
            orderUid = buildOmsOrderUid(orderCode, paidDate, createdDate, trackingNo);
          } else if (!hasDualOrderColumns) {
            existingInSheet.salesAmount = round2(existingInSheet.salesAmount + resolvedSalesVal);
            existingInSheet.profitAmount = round2(existingInSheet.profitAmount + resolvedProfitVal);
            existingInSheet.shippingFeeCustomer = round2(
              existingInSheet.shippingFeeCustomer + round2(toNumber(get("shippingFeeCustomer"))),
            );
            existingInSheet.shippingFeeSeller = round2(
              existingInSheet.shippingFeeSeller + shippingSellerVal,
            );
            existingInSheet.totalQty += resolvedTotalQty;
            warnings.push({
              code: "DUPLICATE_ORDER_MERGED",
              message: `แถวที่ ${excelRow} พบเลขที่ออเดอร์ซ้ำ "${orderCode}" ในไฟล์เดียวกัน – รวมยอดให้แล้ว`,
              severity: "warning",
              row: excelRow,
            });
            continue;
          } else {
            // Dual-extraction sheet (multi-item lines for the same order): accumulate totalQty, keep order-level salesAmount
            existingInSheet.totalQty += resolvedTotalQty;
            if (resolvedSalesVal > existingInSheet.salesAmount) {
              existingInSheet.salesAmount = resolvedSalesVal;
            }
            continue;
          }
        }

        const newOrder: ParsedOmsOrder = {
          orderUid,
          orderCode,
          channel,
          customerName: cleanText(get("customerName")),
          customerPhone: cleanText(get("customerPhone")),
          contactName: cleanText(get("contactName")),
          courier: cleanText(get("courier")),
          shippingFeeCustomer: round2(toNumber(get("shippingFeeCustomer"))),
          shippingFeeSeller: shippingSellerVal,
          province: cleanText(get("province")),
          bank: cleanText(get("bank")),
          trackingNo,
          note: noteText,
          createdBy: cleanText(get("createdBy")),
          createdDate,
          paidDate,
          printedDate,
          marketplaceOrderRaw: mp.raw,
          marketplaceOrderNorm: mp.norm,
          marketplaceOrderPrefix: mp.prefix,
          marketplaceOrderFloat: mp.floatVal,
          discountCode: cleanText(get("discountCode")),
          discountTotal: round2(Math.abs(toNumber(get("discountTotal")))),
          totalQty: resolvedTotalQty,
          salesAmount: resolvedSalesVal,
          profitAmount: resolvedProfitVal,
        };
        sheetOrdersByUid.set(orderUid, newOrder);
        seenCrossSheetOrderUids.add(orderUid);
        parsedOrders.push(newOrder);
      }
    }

    if (detectedSheetType === "oms_items") {
      const itemCreatedFmt = extractDateColFormat(colByField, "createdDate");
      const itemPaidFmt = extractDateColFormat(colByField, "paidDate");
      const lineCounter = new Map<string, number>();
      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r] ?? [];
        const excelRow = r + 1;
        const get = (key: string): Primitive | undefined => {
          const col = colByField.get(key);
          return col !== undefined ? row[col] : undefined;
        };
        const skuCode = cleanText(get("skuCode"));
        const orderCode = cleanText(get("orderCode"));
        if (!skuCode || !orderCode) continue;

        let channel = normalizeChannel(get("channel"));
        const itemNoteText = cleanText(get("note"));
        if (
          channel === "Facebook" &&
          itemNoteText &&
          /\bline\s*oa\b|^line\b/i.test(itemNoteText.trim())
        ) {
          channel = "LINE";
        }
        if (
          channel !== "TikTok" &&
          channel !== "Shopee" &&
          channel !== "Facebook" &&
          channel !== "Lazada" &&
          channel !== "LINE" &&
          channel !== "Other"
        ) {
          continue;
        }

        if (isFormulaErrorValue(get("unitPrice")) || isFormulaErrorValue(get("orderSalesAmount"))) {
          warnings.push({
            code: "FORMULA_ERROR",
            message: `แถวที่ ${excelRow} (${orderCode} / ${skuCode}) พบข้อผิดพลาดสูตร Excel ในช่องราคา`,
            severity: "warning",
            row: excelRow,
          });
        }

        totalDataRows++;
        const createdDate = parseDateValue(get("createdDate"), itemCreatedFmt).iso ?? "";
        const paidDate = parseDateValue(get("paidDate"), itemPaidFmt).iso ?? createdDate;
        const trackingNo = cleanText(get("trackingNo"));
        const orderUid = buildOmsOrderUid(
          orderCode,
          paidDate,
          createdDate,
          trackingNo,
        );
        const nextLine = (lineCounter.get(orderUid) ?? 0) + 1;
        lineCounter.set(orderUid, nextLine);

        parsedItems.push({
          orderUid,
          orderCode,
          lineNo: nextLine,
          skuCode,
          productName: cleanText(get("productName")) ?? skuCode,
          unitPrice: round2(toNumber(get("unitPrice"))),
          quantity: Math.max(1, Math.round(toNumber(get("quantity")) || 1)),
          orderSalesAmount: round2(toNumber(get("orderSalesAmount") ?? get("salesAmount"))),
          shippingFeeCustomer: round2(toNumber(get("shippingFeeCustomer"))),
          senderName: cleanText(get("senderName")),
          customerName: cleanText(get("customerName")),
          customerAddress: cleanText(get("customerAddress")),
          postalCode: cleanText(get("postalCode")),
          customerPhone: cleanText(get("customerPhone")),
          paidDate,
          createdDate,
          courier: cleanText(get("courier")),
          channel,
          bank: cleanText(get("bank")),
          note: cleanText(get("note")),
          trackingNo,
        });
      }
    }
  }

  if (!primaryType) {
    return null;
  }

  if (totalDataRows === 0) {
    warnings.push({
      code: "EMPTY_OMS_FILE",
      message: "ไฟล์นี้มีเฉพาะหัวตาราง (ไม่มีรายการคำสั่งซื้อ 0 แถว) ระบบข้ามการสร้างบิลให้เรียบร้อย",
      severity: "info",
    });
  }

  const allDates = [
    ...parsedOrders.map((o) => o.paidDate || o.createdDate),
    ...parsedItems.map((i) => i.paidDate || i.createdDate),
  ]
    .filter(Boolean)
    .sort();

  const headerSignature = createHash("sha1")
    .update(primaryHeaders.map((h) => normalizeHeader(h)).join("|"))
    .digest("hex")
    .slice(0, 16);

  return {
    fileType: primaryType,
    sheetName: primarySheetName,
    headerRow: primaryHeaderRow,
    headers: primaryHeaders,
    mapping: primaryMapping,
    orders: parsedOrders,
    items: parsedItems,
    warnings,
    headerSignature,
    dataRowCount: totalDataRows,
    periodStart: allDates[0] ?? null,
    periodEnd: allDates[allDates.length - 1] ?? null,
  };
}
