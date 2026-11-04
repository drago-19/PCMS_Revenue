import { createHash } from "node:crypto";
import { normalizeHeader } from "./catalog";
import {
  parseDateValue,
  readInputSheets,
  toNumber,
  type IngestWarning,
  type MappingEntry,
  type NormalizedTransaction,
  type Primitive,
} from "./parse";
import { buildOmsOrderUid, type ParsedOmsItem, type ParsedOmsOrder } from "./oms-parse";
import { round2 } from "../format";

export interface LazadaNormalizedTransaction extends NormalizedTransaction {
  omsOrderUid: string;
  shopName?: string;
}

export type LazadaFileSubtype =
  | "statement_detailed"
  | "statement_summary"
  | "order_export"
  | "balance_transactions";

export interface ParsedLazadaWorkbook {
  fileType: "lazada_orders";
  lazadaSubtype: LazadaFileSubtype;
  sheetName: string;
  headerRow: number;
  headers: string[];
  mapping: MappingEntry[];
  orders: ParsedOmsOrder[];
  items: ParsedOmsItem[];
  transactions: LazadaNormalizedTransaction[];
  warnings: IngestWarning[];
  headerSignature: string;
  dataRowCount: number;
  periodStart: string | null;
  periodEnd: string | null;
}

const LAZADA_ALIASES: Record<string, string[]> = {
  orderId: [
    "หมายเลขคำสั่งซื้อ",
    "order number",
    "order no",
    "order no.",
    "ordernumber",
    "orderno",
    "order id",
    "orderid",
  ],
  orderItemId: [
    "รหัสสินค้าในคำสั่งซื้อ",
    "order item no",
    "order item no.",
    "order item id",
    "orderitemid",
    "orderitemno",
  ],
  createdDate: [
    "วันที่สร้างคำสั่งซื้อ",
    "order creation date",
    "created at",
    "createtime",
    "create time",
  ],
  transactionDate: ["วันที่ทำรายการ", "transaction date", "transaction time"],
  paidDate: [
    "วันที่ปรับปรุงเข้ายอดของฉัน",
    "paid date",
    "payout date",
    "delivereddate",
    "delivered date",
    "updatetime",
    "update time",
  ],
  statementPeriod: ["ระยะเวลาใบแจ้งยอด", "statement period", "statement"],
  statementCode: ["รหัสรอบบิล", "statement number", "statement code"],
  transactionName: [
    "ชื่อรายการธุรกรรม",
    "fee name",
    "feename",
    "transaction name",
  ],
  transactionTypeGroup: ["transaction type", "type"],
  subType: ["sub type", "subtype"],
  transactionNumber: ["transaction number", "transactionnumber"],
  amountInclTax: [
    "จำนวนเงิน(รวมภาษี)",
    "จำนวนเงิน (รวมภาษี)",
    "amount(include tax)",
    "amount (include tax)",
    "amount",
  ],
  paidPrice: ["paidprice", "paid price"],
  unitPrice: ["unitprice", "unit price"],
  shippingFee: ["shippingfee", "shipping fee"],
  sellerDiscountTotal: ["sellerdiscounttotal", "seller discount total"],
  vatAmount: ["vat amount", "vat in amount", "vat"],
  whtAmount: ["wht amount", "wht"],
  payoutStatus: ["สถานะการโอนเงิน", "paid status", "payout status"],
  orderStatus: ["สถานะคำสั่งซื้อ", "order status", "order item status", "status"],
  productName: ["ชื่อสินค้า", "details", "product name", "item name", "itemname"],
  variation: ["variation"],
  sellerSku: ["sku ร้านค้า", "seller sku", "sellersku"],
  lazadaSku: ["lazada sku", "lazada sku code", "lazadasku"],
  shortCode: ["short code", "shortcode", "shop short code"],
  comment: ["ความคิดเห็น", "comment", "remark", "remarks", "sellernote"],
  customerName: ["customername", "customer name", "shippingname", "billingname"],
  customerPhone: ["shippingphone", "billingphone", "customerphone"],
  shippingAddress: ["shippingaddress", "billingaddr"],
  shippingCity: ["shippingcity", "billingcity"],
  shippingPostCode: ["shippingpostcode", "billingpostcode"],
  shippingProvider: ["shippingprovider", "shipping provider"],
  trackingCode: ["trackingcode", "tracking code"],
};

function matchLazadaAlias(header: string): string | null {
  const norm = normalizeHeader(header);
  if (!norm) return null;
  for (const [key, aliases] of Object.entries(LAZADA_ALIASES)) {
    for (const alias of aliases) {
      if (normalizeHeader(alias) === norm) return key;
    }
  }
  return null;
}

function parseStatementPeriodEndDate(periodRaw: Primitive | undefined): string {
  const text = String(periodRaw ?? "").trim();
  if (!text) return "";
  const parts = text.split("-").map((p) => p.trim()).filter(Boolean);
  const lastPart = parts[parts.length - 1] ?? text;
  return parseDateValue(lastPart).iso ?? "";
}

function cleanText(value: Primitive | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value)
    .replace(/\u00a0/g, " ")
    .trim();
  if (!text || text === "-" || text === "--") return null;
  return text;
}

export function isItemPriceTransactionName(txName: string): boolean {
  const lower = txName.toLowerCase();
  return (
    txName.includes("ยอดรวมค่าสินค้า") ||
    txName.includes("ยอดสุทธิคำสั่งซื้อ Lazada") ||
    lower.includes("item price credit") ||
    lower === "item price"
  );
}

export async function detectAndParseLazadaInput(
  input: Buffer | ArrayBuffer,
  preloadedSheets?: { name: string; rows: Primitive[][] }[],
): Promise<ParsedLazadaWorkbook | null> {
  const sheets = preloadedSheets ?? (await readInputSheets(input));

  for (const sheet of sheets) {
    const rows = sheet.rows;
    if (rows.length < 1) continue;
    const scanLimit = Math.min(15, rows.length);

    let headerIdx = -1;
    let colByField = new Map<string, number>();
    let headers: string[] = [];
    let subtype: LazadaFileSubtype | null = null;

    for (let r = 0; r < scanLimit; r++) {
      const row = rows[r] ?? [];
      const map = new Map<string, number>();
      for (let c = 0; c < row.length; c++) {
        const h = String(row[c] ?? "").trim();
        if (!h) continue;
        const fk = matchLazadaAlias(h);
        if (fk && !map.has(fk)) {
          map.set(fk, c);
        }
      }

      // 1. Balance Transactions (Wallet Deposit/Withdrawal without Order ID)
      if (
        !map.has("orderId") &&
        map.has("transactionNumber") &&
        map.has("amountInclTax") &&
        (map.has("subType") ||
          sheet.name.toLowerCase().includes("balance"))
      ) {
        headerIdx = r;
        colByField = map;
        headers = row.map((v) => String(v ?? "").trim());
        subtype = "balance_transactions";
        break;
      }

      // 2. 76-column Order Export (orderNumber + paidPrice/unitPrice + orderItemId)
      if (
        map.has("orderId") &&
        (map.has("paidPrice") || map.has("unitPrice")) &&
        map.has("orderItemId") &&
        !map.has("amountInclTax")
      ) {
        headerIdx = r;
        colByField = map;
        headers = row.map((v) => String(v ?? "").trim());
        subtype = "order_export";
        break;
      }

      // 3. Statement Detailed (18/23 cols Thai or English) or Statement Summary (11 cols)
      if (
        map.has("orderId") &&
        map.has("amountInclTax") &&
        (map.has("orderItemId") ||
          map.has("statementCode") ||
          map.has("statementPeriod"))
      ) {
        headerIdx = r;
        colByField = map;
        headers = row.map((v) => String(v ?? "").trim());
        subtype = map.has("transactionName")
          ? "statement_detailed"
          : "statement_summary";
        break;
      }
    }

    if (headerIdx < 0 || !subtype) continue;

    const mapping: MappingEntry[] = headers.map((h, idx) => {
      const fk = matchLazadaAlias(h);
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

    const headerSignature = createHash("sha256")
      .update(`lazada:${subtype}:${headers.map((h) => normalizeHeader(h)).join("|")}`)
      .digest("hex")
      .slice(0, 16);

    // Handle 3: Balance Transactions -> auto-skip without creating order bills
    if (subtype === "balance_transactions") {
      let dataRowCount = 0;
      const dates: string[] = [];
      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r] ?? [];
        const txNo = cleanText(row[colByField.get("transactionNumber") ?? -1]);
        if (!txNo) continue;
        dataRowCount++;
        const dt =
          parseDateValue(row[colByField.get("transactionDate") ?? -1]).iso ?? "";
        if (dt) dates.push(dt);
      }
      dates.sort();
      return {
        fileType: "lazada_orders",
        lazadaSubtype: "balance_transactions",
        sheetName: sheet.name,
        headerRow: headerIdx + 1,
        headers,
        mapping,
        orders: [],
        items: [],
        transactions: [],
        warnings: [
          {
            code: "LAZADA_BALANCE_SKIPPED",
            message:
              "ไฟล์นี้เป็นประวัติการฝาก-ถอนเงินกระเป๋า Lazada (Balance Transactions) ซึ่งไม่มีเลขคำสั่งซื้อ ระบบจึงข้ามการสร้างบิลคำสั่งซื้อให้อัตโนมัติ",
            severity: "info",
          },
        ],
        headerSignature,
        dataRowCount,
        periodStart: dates[0] ?? null,
        periodEnd: dates[dates.length - 1] ?? null,
      };
    }

    const isDetailedFormat = subtype === "statement_detailed";
    const isOrderExport = subtype === "order_export";

    interface LazadaLineAccum {
      orderItemId: string;
      skuCode: string;
      productName: string;
      itemPriceAmount: number;
      netLineAmount: number;
      hasItemPriceLine: boolean;
    }

    interface LazadaOrderAccum {
      orderId: string;
      createdDate: string;
      paidDate: string;
      statementCode: string | null;
      orderStatus: string | null;
      payoutStatus: string | null;
      shortCode: string | null;
      customerName: string | null;
      customerPhone: string | null;
      customerAddress: string | null;
      postalCode: string | null;
      province: string | null;
      courier: string | null;
      trackingNo: string | null;
      rowsCount: number;
      firstRow: number;
      rowIndexes: number[];
      linesByItemId: Map<string, LazadaLineAccum>;
      txBreakdown: Map<string, number>;
      positiveSum: number;
      negativeSum: number;
      netSum: number;
      vatSum: number;
    }

    const ordersMap = new Map<string, LazadaOrderAccum>();
    let dataRowCount = 0;

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const get = (key: string): Primitive | undefined => {
        const col = colByField.get(key);
        return col !== undefined ? row[col] : undefined;
      };

      const orderId = cleanText(get("orderId"));
      if (!orderId) continue;

      dataRowCount++;
      const orderItemId =
        cleanText(get("orderItemId")) ?? `${orderId}-${dataRowCount}`;
      const createdDate = parseDateValue(get("createdDate")).iso ?? "";
      const paidDate =
        parseDateValue(get("paidDate")).iso ||
        parseDateValue(get("transactionDate")).iso ||
        parseStatementPeriodEndDate(get("statementPeriod")) ||
        createdDate;

      const amount = isOrderExport
        ? round2(toNumber(get("paidPrice")) || toNumber(get("unitPrice")))
        : round2(toNumber(get("amountInclTax")));
      const vatAmt = round2(toNumber(get("vatAmount")));
      const txName = isOrderExport
        ? "ยอดรวมค่าสินค้า"
        : cleanText(get("transactionName")) ?? "ยอดสุทธิคำสั่งซื้อ Lazada";

      const baseProductName = cleanText(get("productName")) ?? "สินค้า Lazada";
      const variation = cleanText(get("variation"));
      const productName =
        variation && !baseProductName.includes(variation)
          ? `${baseProductName} (${variation})`
          : baseProductName;

      const sellerSku =
        cleanText(get("sellerSku")) ??
        cleanText(get("lazadaSku")) ??
        orderItemId;
      const statementCode = cleanText(get("statementCode"));
      const orderStatus = cleanText(get("orderStatus"));
      const payoutStatus = cleanText(get("payoutStatus"));
      const shortCode = cleanText(get("shortCode"));
      const customerName = cleanText(get("customerName"));
      const customerPhone = cleanText(get("customerPhone"));
      const customerAddress = cleanText(get("shippingAddress"));
      const postalCode = cleanText(get("shippingPostCode"));
      const province = cleanText(get("shippingCity"));
      const courier = cleanText(get("shippingProvider"));
      const trackingNo = cleanText(get("trackingCode"));

      let acc = ordersMap.get(orderId);
      if (!acc) {
        acc = {
          orderId,
          createdDate,
          paidDate,
          statementCode,
          orderStatus,
          payoutStatus,
          shortCode,
          customerName,
          customerPhone,
          customerAddress,
          postalCode,
          province,
          courier,
          trackingNo,
          rowsCount: 0,
          firstRow: r + 1,
          rowIndexes: [],
          linesByItemId: new Map(),
          txBreakdown: new Map(),
          positiveSum: 0,
          negativeSum: 0,
          netSum: 0,
          vatSum: 0,
        };
        ordersMap.set(orderId, acc);
      }

      if (!acc.createdDate && createdDate) acc.createdDate = createdDate;
      if (paidDate && (!acc.paidDate || paidDate > acc.paidDate)) {
        acc.paidDate = paidDate;
      }
      if (!acc.statementCode && statementCode) acc.statementCode = statementCode;
      if (!acc.orderStatus && orderStatus) acc.orderStatus = orderStatus;
      if (!acc.payoutStatus && payoutStatus) acc.payoutStatus = payoutStatus;
      if (!acc.shortCode && shortCode) acc.shortCode = shortCode;
      if (!acc.customerName && customerName) acc.customerName = customerName;
      if (!acc.customerPhone && customerPhone) acc.customerPhone = customerPhone;
      if (!acc.customerAddress && customerAddress) acc.customerAddress = customerAddress;
      if (!acc.postalCode && postalCode) acc.postalCode = postalCode;
      if (!acc.province && province) acc.province = province;
      if (!acc.courier && courier) acc.courier = courier;
      if (!acc.trackingNo && trackingNo) acc.trackingNo = trackingNo;

      acc.rowsCount++;
      acc.rowIndexes.push(r + 1);
      acc.netSum = round2(acc.netSum + amount);
      acc.vatSum = round2(acc.vatSum + vatAmt);
      if (amount > 0) {
        acc.positiveSum = round2(acc.positiveSum + amount);
      } else if (amount < 0) {
        acc.negativeSum = round2(acc.negativeSum + amount);
      }

      acc.txBreakdown.set(txName, round2((acc.txBreakdown.get(txName) ?? 0) + amount));

      let line = acc.linesByItemId.get(orderItemId);
      if (!line) {
        line = {
          orderItemId,
          skuCode: sellerSku,
          productName,
          itemPriceAmount: 0,
          netLineAmount: 0,
          hasItemPriceLine: false,
        };
        acc.linesByItemId.set(orderItemId, line);
      }
      if (sellerSku && line.skuCode === orderItemId) line.skuCode = sellerSku;
      if (productName && line.productName === "สินค้า Lazada") {
        line.productName = productName;
      }

      line.netLineAmount = round2(line.netLineAmount + amount);
      if (isDetailedFormat) {
        if (isItemPriceTransactionName(txName)) {
          line.itemPriceAmount = round2(line.itemPriceAmount + amount);
          line.hasItemPriceLine = true;
        }
      } else {
        line.itemPriceAmount = round2(line.itemPriceAmount + amount);
        line.hasItemPriceLine = true;
      }
    }

    const parsedOrders: ParsedOmsOrder[] = [];
    const parsedItems: ParsedOmsItem[] = [];
    const transactions: LazadaNormalizedTransaction[] = [];

    for (const acc of ordersMap.values()) {
      // Use deterministic orderUid `LAZADA|<orderId>` so Order Export, Summary CSV, and Statement Details all link to the exact same order
      const orderUid = `LAZADA|${acc.orderId}`;

      const incomeTotal = isDetailedFormat ? acc.positiveSum : acc.netSum;
      const feeTotal = isDetailedFormat ? acc.negativeSum : 0;
      const payout = acc.netSum;

      const resolvedCustomerName = acc.customerName ?? "ลูกค้า Lazada";
      const resolvedCourier = acc.courier ?? "Lazada Logistics";
      const resolvedTracking = acc.trackingNo ?? acc.statementCode;
      const resolvedShopName =
        !acc.shortCode || acc.shortCode === "TH1JWSSKAK"
          ? "Kiddee Shop"
          : acc.shortCode;

      const lines = [...acc.linesByItemId.values()];
      let lineNo = 1;
      for (const l of lines) {
        const unitPrice = l.hasItemPriceLine ? l.itemPriceAmount : l.netLineAmount;
        parsedItems.push({
          orderUid,
          orderCode: acc.orderId,
          lineNo: lineNo++,
          skuCode: l.skuCode,
          productName: l.productName,
          unitPrice,
          quantity: 1,
          orderSalesAmount: incomeTotal,
          shippingFeeCustomer: 0,
          senderName: resolvedShopName,
          customerName: resolvedCustomerName,
          customerAddress: acc.customerAddress,
          postalCode: acc.postalCode,
          customerPhone: acc.customerPhone,
          paidDate: acc.paidDate,
          createdDate: acc.createdDate,
          courier: resolvedCourier,
          channel: "Lazada",
          bank: acc.statementCode,
          note: acc.orderStatus,
          trackingNo: resolvedTracking,
        });
      }

      parsedOrders.push({
        orderUid,
        orderCode: acc.orderId,
        channel: "Lazada",
        customerName: resolvedCustomerName,
        customerPhone: acc.customerPhone,
        contactName: acc.shortCode ?? resolvedShopName,
        courier: resolvedCourier,
        shippingFeeCustomer: 0,
        shippingFeeSeller: round2(Math.abs(feeTotal)),
        province: acc.province,
        bank: acc.statementCode,
        trackingNo: resolvedTracking,
        note: acc.orderStatus,
        createdBy: "Lazada",
        createdDate: acc.createdDate,
        paidDate: acc.paidDate,
        printedDate: acc.paidDate,
        marketplaceOrderRaw: acc.orderId,
        marketplaceOrderNorm: acc.orderId,
        marketplaceOrderPrefix: acc.orderId.slice(0, 15),
        marketplaceOrderFloat: null,
        discountCode: null,
        discountTotal: 0,
        totalQty: lines.length || 1,
        salesAmount: incomeTotal,
        profitAmount: payout,
      });

      const rawBreakdown: Record<string, string | number> = {
        หมายเลขคำสั่งซื้อ: acc.orderId,
        ช่องทาง: "Lazada",
        ร้านค้า: resolvedShopName,
      };
      if (acc.statementCode) rawBreakdown["รหัสรอบบิล"] = acc.statementCode;
      if (acc.orderStatus) rawBreakdown["สถานะคำสั่งซื้อ"] = acc.orderStatus;
      if (acc.payoutStatus) rawBreakdown["สถานะการโอนเงิน"] = acc.payoutStatus;
      if (acc.trackingNo) rawBreakdown["เลขพัสดุ"] = acc.trackingNo;
      for (const [k, v] of acc.txBreakdown.entries()) {
        rawBreakdown[k] = v;
      }

      const normalized: NormalizedTransaction = {
        externalId: acc.orderId,
        transactionType: "คำสั่งซื้อ (OMS)",
        isOrder: true,
        createdAt: acc.createdDate,
        paidAt: acc.paidDate,
        currency: "THB",
        fields: {
          orderId: acc.orderId,
          transactionType: "คำสั่งซื้อ (OMS)",
          createdAt: acc.createdDate,
          paidAt: acc.paidDate,
          currency: "THB",
          incomeTotal,
          customerPayment: incomeTotal,
          productAfterDiscount: incomeTotal,
          productBeforeDiscount: incomeTotal,
          storeDiscount: 0,
          shippingCustomerFee: 0,
          feeTotal,
          adjustment: 0,
          payout,
          cogs: 0,
          shipnityProfit: payout,
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
          "feeTotal",
          "payout",
        ],
        feeGroups: {},
        unknownValues: [...acc.txBreakdown.entries()]
          .filter(([name]) => !isItemPriceTransactionName(name))
          .map(([header, amount]) => ({
            header,
            amount,
            moneyLike: true,
            category: amount < 0 ? ("fee" as const) : ("income" as const),
          })),
        checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
        warnings: [],
        raw: rawBreakdown,
        sourceRows: acc.rowsCount,
        firstRow: acc.firstRow,
        rowIndexes: acc.rowIndexes,
      };

      transactions.push({
        ...normalized,
        omsOrderUid: orderUid,
        shopName: resolvedShopName,
      });
    }

    const allDates = parsedOrders
      .map((o) => o.paidDate || o.createdDate)
      .filter(Boolean)
      .sort();

    return {
      fileType: "lazada_orders",
      lazadaSubtype: subtype,
      sheetName: sheet.name,
      headerRow: headerIdx + 1,
      headers,
      mapping,
      orders: parsedOrders,
      items: parsedItems,
      transactions,
      warnings: [],
      headerSignature,
      dataRowCount,
      periodStart: allDates[0] ?? null,
      periodEnd: allDates[allDates.length - 1] ?? null,
    };
  }

  return null;
}
