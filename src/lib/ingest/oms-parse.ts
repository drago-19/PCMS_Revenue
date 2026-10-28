import { createHash } from "node:crypto";
import { normalizeHeader } from "./catalog";
import {
  parseDateValue,
  readInputSheets,
  toNumber,
  type IngestWarning,
  type MappingEntry,
  type Primitive,
} from "./parse";
import { round2 } from "../format";
import { lookupCustomFieldKey } from "../column-mapping-settings";

export type DetectedFileType = "settlement" | "oms_orders" | "oms_items";

export interface ParsedOmsOrder {
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
  if (lower.includes("line")) return "LINE";
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
  printedDate: ["วันที่พิมพ์", "printed date"],
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
  totalQty: ["จำนวนรวม", "จำนวนชิ้นรวม", "total quantity", "total qty"],
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

  for (const sheet of sheets) {
    const rows = sheet.rows;
    if (rows.length < 1) continue;
    const scanLimit = Math.min(20, rows.length);

    let detectedSheetType: "oms_orders" | "oms_items" | null = null;
    let headerIdx = -1;
    let colByField = new Map<string, number>();
    let headers: string[] = [];

    for (let r = 0; r < scanLimit; r++) {
      const row = rows[r] ?? [];
      const itemMap = new Map<string, number>();
      const orderMap = new Map<string, number>();

      for (let c = 0; c < row.length; c++) {
        const h = String(row[c] ?? "").trim();
        if (!h) continue;
        const customField = lookupCustomFieldKey(h, customMapping);
        if (customField) {
          if (Object.prototype.hasOwnProperty.call(OMS_ITEM_ALIASES, customField)) {
            itemMap.set(customField, c);
          }
          if (Object.prototype.hasOwnProperty.call(OMS_ORDER_ALIASES, customField)) {
            orderMap.set(customField, c);
          }
          if (
            Object.prototype.hasOwnProperty.call(OMS_ITEM_ALIASES, customField) ||
            Object.prototype.hasOwnProperty.call(OMS_ORDER_ALIASES, customField)
          ) {
            continue;
          }
        }
        const itemKey = matchAliasMap(h, OMS_ITEM_ALIASES);
        if (itemKey && !itemMap.has(itemKey)) itemMap.set(itemKey, c);
        const orderKey = matchAliasMap(h, OMS_ORDER_ALIASES);
        if (orderKey && !orderMap.has(orderKey)) orderMap.set(orderKey, c);
      }

      if (
        itemMap.has("skuCode") &&
        itemMap.has("productName") &&
        (itemMap.has("orderCode") || itemMap.has("unitPrice"))
      ) {
        detectedSheetType = "oms_items";
        headerIdx = r;
        colByField = itemMap;
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
        const customFk = lookupCustomFieldKey(h, customMapping);
        const validCustomFk =
          customFk &&
          (detectedSheetType === "oms_items"
            ? Object.prototype.hasOwnProperty.call(OMS_ITEM_ALIASES, customFk)
            : Object.prototype.hasOwnProperty.call(OMS_ORDER_ALIASES, customFk))
            ? customFk
            : null;
        const fk =
          validCustomFk ??
          (detectedSheetType === "oms_items"
            ? matchAliasMap(h, OMS_ITEM_ALIASES)
            : matchAliasMap(h, OMS_ORDER_ALIASES));
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

    if (detectedSheetType === "oms_orders") {
      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r] ?? [];
        const get = (key: string): Primitive | undefined => {
          const col = colByField.get(key);
          return col !== undefined ? row[col] : undefined;
        };
        const orderCode = cleanText(get("orderCode"));
        if (!orderCode) continue;

        const channel = normalizeChannel(get("channel"));
        if (channel !== "TikTok" && channel !== "Shopee") continue;

        totalDataRows++;
        const createdDate = parseDateValue(get("createdDate")).iso ?? "";
        const paidDate = parseDateValue(get("paidDate")).iso ?? createdDate;
        const printedDate = parseDateValue(get("printedDate")).iso ?? "";
        const mp = normalizeMarketplaceId(get("marketplaceOrderId"));

        parsedOrders.push({
          orderCode,
          channel,
          customerName: cleanText(get("customerName")),
          customerPhone: cleanText(get("customerPhone")),
          contactName: cleanText(get("contactName")),
          courier: cleanText(get("courier")),
          shippingFeeCustomer: round2(toNumber(get("shippingFeeCustomer"))),
          shippingFeeSeller: round2(toNumber(get("shippingFeeSeller"))),
          province: cleanText(get("province")),
          bank: cleanText(get("bank")),
          trackingNo: cleanText(get("trackingNo")),
          note: cleanText(get("note")),
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
          totalQty: Math.max(0, Math.round(toNumber(get("totalQty")))),
          salesAmount: round2(toNumber(get("salesAmount"))),
          profitAmount: round2(toNumber(get("profitAmount"))),
        });
      }
    } else if (detectedSheetType === "oms_items") {
      const lineCounter = new Map<string, number>();
      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r] ?? [];
        const get = (key: string): Primitive | undefined => {
          const col = colByField.get(key);
          return col !== undefined ? row[col] : undefined;
        };
        const skuCode = cleanText(get("skuCode"));
        const orderCode = cleanText(get("orderCode"));
        if (!skuCode || !orderCode) continue;

        const channel = normalizeChannel(get("channel"));
        if (channel !== "TikTok" && channel !== "Shopee") continue;

        totalDataRows++;
        const nextLine = (lineCounter.get(orderCode) ?? 0) + 1;
        lineCounter.set(orderCode, nextLine);

        const createdDate = parseDateValue(get("createdDate")).iso ?? "";
        const paidDate = parseDateValue(get("paidDate")).iso ?? createdDate;

        parsedItems.push({
          orderCode,
          lineNo: nextLine,
          skuCode,
          productName: cleanText(get("productName")) ?? skuCode,
          unitPrice: round2(toNumber(get("unitPrice"))),
          quantity: Math.max(1, Math.round(toNumber(get("quantity")) || 1)),
          orderSalesAmount: round2(toNumber(get("orderSalesAmount"))),
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
          trackingNo: cleanText(get("trackingNo")),
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
