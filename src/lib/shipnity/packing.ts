// แปลงออเดอร์ดิบจาก Shipnity เป็นข้อมูลที่ใช้ตัดรอบแพ็คของได้
//
// กฎเดียวกับที่ผู้ใช้เลือก: ยึดเวลาที่ลูกค้าสั่ง — สั่งก่อน 14.00 น. เวลาไทย = รอบนี้ (ต้องแพ็คให้ทัน)
// สั่งตั้งแต่ 14.00 น. ถึงเที่ยงคืน = รอบถัดไป
// ออเดอร์ที่ยังไม่ชำระเงิน/ยกเลิก ไม่เข้าใบแพ็คของ (แพ็คไปก็ส่งไม่ได้)
// ออเดอร์ที่ปิดรายการแล้ว (ส่งแล้ว) เข้าเฉพาะเมื่อดูย้อนหลัง

import {
  bangkokDateParts,
  buildPackingRounds,
  cutoffInstant,
  daysPendingBangkok,
  parseInstant,
  type PackingItem,
  type PackingOrder,
  type PackingOrderInput,
  type PackingRounds,
} from "@/lib/packing-rounds";
import type { ShipnityOrder } from "@/lib/shipnity/client";

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** ยอดของสินค้าหนึ่ง แยกตามช่องทางขาย (TikTok/Shopee/Facebook/Line ฯลฯ) */
export interface ProductChannelRow {
  channel: string;
  quantity: number;
  orderCount: number;
}

/** หนึ่งบรรทัดของออเดอร์ที่ต้องส่งสินค้านี้ */
export interface ProductOrderLine {
  orderCode: string;
  channel: string;
  quantity: number;
  courier: string;
  customerName: string | null;
  paidAt: string;
}

/** หนึ่งบรรทัดในสรุปตามสินค้า: วันนี้ต้องส่งสินค้านี้กี่ชิ้น กระจายอยู่ในบิลไหนบ้าง */
export interface ProductPackingRow {
  name: string;
  quantity: number;
  orderCount: number;
  image?: string | null;
  orderCodes: string[];
  channels: ProductChannelRow[];
  lines: ProductOrderLine[];
}

export interface DayPackingSummary {
  isoDay: string;
  /** เวลาตัดรอบ 14.00 น. เวลาไทยของวันนั้น */
  cutoffAt: Date;
  rounds: PackingRounds;
  products: ProductPackingRow[];
  totalOrders: number;
  totalItems: number;
  waitingPaymentCount: number;
  closedCount: number;
  cancelledCount: number;
  skippedWithoutDateCount: number;
}

/** ออเดอร์ COD/จ่ายทีหลัง — เก็บเงินตอนส่งของ จึงไม่ต้องรอชำระก่อนแพ็ค */
export function isPayLaterOrder(order: ShipnityOrder): boolean {
  return (order.order_bank ?? "").trim().toLowerCase() === "pay_later";
}

/** สถานะของออเดอร์ตามที่ Shipnity ใช้ (ไล่ตามลำดับที่เกิดจริง) */
export function describeOrderStatus(order: ShipnityOrder): string {
  if (order.cancelled) return "ยกเลิกแล้ว";
  if (order.closed) return "ส่งของแล้ว";
  if (order.packed) return "แพ็คแล้ว";
  if (order.paid) {
    const label = order.printed ? "พิมพ์แล้ว · รอแพ็ค" : "ชำระแล้ว · รอพิมพ์";
    return isPayLaterOrder(order) ? `${label} · COD` : label;
  }
  if (isPayLaterOrder(order)) return "เก็บเงินปลายทาง (COD)";
  if (order.transferred) return "แจ้งโอนเงิน · รอตรวจสอบ";
  return "ยังไม่ชำระเงิน";
}

/**
 * สรุปจำนวนออเดอร์ตาม “ชิปสถานะ” ของหน้า Shipnity เพื่อให้เทียบเลขกันได้ตรง ๆ
 * ทั้งหมด / ยังไม่ชำระเงิน / ตรวจหลักฐาน / ยืนยันออเดอร์ / พิมพ์ที่อยู่ / รอส่ง
 */
export interface ShipnityStatusCounts {
  total: number;
  unpaid: number;
  checkSlip: number;
  confirmed: number;
  toPrint: number;
  ready: number;
}

export function countShipnityStatuses(orders: readonly ShipnityOrder[]): ShipnityStatusCounts {
  const counts: ShipnityStatusCounts = {
    total: 0,
    unpaid: 0,
    checkSlip: 0,
    confirmed: 0,
    toPrint: 0,
    ready: 0,
  };

  for (const order of orders) {
    if (order.cancelled || order.closed) continue;
    counts.total += 1;

    if (!order.paid) {
      if (order.transferred) counts.checkSlip += 1;
      else counts.unpaid += 1;
      continue;
    }
    if (order.printed) counts.ready += 1;
    else if (order.payment_accepted) counts.toPrint += 1;
    else counts.confirmed += 1;
  }

  return counts;
}

/** ออเดอร์ที่ยังไม่ชำระเงิน (ไว้ดูว่าค้างจ่ายเพราะอะไร) */
export interface WaitingPaymentOrder {
  orderCode: string;
  customerName: string | null;
  channel: string;
  courier: string;
  totalAmount: number;
  status: string;
  orderedAt: string;
  daysPending: number;
}

function purchaseItems(order: ShipnityOrder): PackingItem[] {
  return (order.purchases ?? []).map((purchase) => ({
    name: purchase.name?.trim() || purchase.code?.trim() || "ไม่ระบุสินค้า",
    quantity: Number(purchase.quantity) || 0,
    image: purchase.thumb?.trim() || null,
  }));
}

function purchaseQuantity(items: readonly PackingItem[]): number {
  return items.reduce((sum, item) => sum + (item.quantity > 0 ? item.quantity : 0), 0);
}

/**
 * เตรียมออเดอร์หนึ่งรายการสำหรับตัดรอบ
 * คืน null เมื่อออเดอร์นี้ไม่ต้องเข้าใบแพ็คของ (ยังไม่จ่าย / ปิดแล้ว / แพ็คแล้ว / ยกเลิก)
 */
export function toPackingOrderInput(order: ShipnityOrder): PackingOrderInput | null {
  // COD เก็บเงินปลายทาง — เข้าใบแพ็คได้แม้ Shipnity ยังไม่มาร์คว่าชำระ
  if (order.cancelled || order.closed || order.packed) return null;
  if (!order.paid && !isPayLaterOrder(order)) return null;

  const items = purchaseItems(order);
  const totalAmount = Number(order.price);

  return {
    orderCode: order.invoice_number,
    customerName: order.name ?? null,
    courier: order.shipping_type ?? null,
    marketplace: order.contact_method ?? order.order_bank ?? null,
    itemCount: purchaseQuantity(items),
    items,
    totalAmount: Number.isFinite(totalAmount) ? totalAmount : 0,
    status: describeOrderStatus(order),
    paidAt: order.transferred_at ?? null,
    createdAt: order.created_at ?? null,
  };
}

/** เวลาที่ใช้ตัดสินว่าออเดอร์เป็นของวันไหน: เวลาที่ลูกค้าสั่งก่อน ไม่มีจึงใช้เวลาชำระ */
/** ออเดอร์นี้สั่งในวันนั้นตามเวลาไทยหรือไม่ (ใช้แยก “ของค้างจากวันก่อน” ออกจากของวันนี้) */
export function isOrderFromDay(order: ShipnityOrder, isoDay: string): boolean {
  const cutAt = orderCutAt(order);
  return cutAt !== null && sameBangkokDay(cutAt, isoDay);
}

export function orderCutAt(order: ShipnityOrder): Date | null {
  return parseInstant(order.created_at) ?? parseInstant(order.transferred_at);
}

function sameBangkokDay(instant: Date, isoDay: string): boolean {
  const parts = bangkokDateParts(instant);
  const iso = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  return iso === isoDay;
}

/** เวลาอ้างอิงของวันนั้น (23.00 น. เวลาไทย) ใช้ตัดสินรอบ 14.00 น. ของวันเดียวกัน */
function dayAnchor(isoDay: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  if (!match) throw new Error(`รูปแบบวันที่ไม่ถูกต้อง: ${isoDay}`);
  return cutoffInstant(Number(match[1]), Number(match[2]), Number(match[3]), 23);
}

/** รวมรายการสินค้าทั้งหมดเป็นยอดต่อสินค้า: ต้องส่งกี่ชิ้น อยู่ในบิลไหนบ้าง */
interface ProductBucket {
  quantity: number;
  codes: Set<string>;
  image: string | null;
  lines: ProductOrderLine[];
}

function channelOf(order: PackingOrder): string {
  return order.marketplace?.trim() || "ไม่ระบุช่องทาง";
}

function summarizeLinesByChannel(lines: readonly ProductOrderLine[]): ProductChannelRow[] {
  const buckets = new Map<string, { quantity: number; codes: Set<string> }>();
  for (const line of lines) {
    const bucket = buckets.get(line.channel) ?? { quantity: 0, codes: new Set<string>() };
    bucket.quantity += line.quantity;
    bucket.codes.add(line.orderCode);
    buckets.set(line.channel, bucket);
  }
  return [...buckets.entries()]
    .map(([channel, bucket]) => ({
      channel,
      quantity: bucket.quantity,
      orderCount: bucket.codes.size,
    }))
    .sort((a, b) => b.quantity - a.quantity || a.channel.localeCompare(b.channel, "th"));
}

function finalizeProduct(name: string, bucket: ProductBucket): ProductPackingRow {
  return {
    name,
    quantity: bucket.quantity,
    orderCount: bucket.codes.size,
    orderCodes: [...bucket.codes].sort(),
    image: bucket.image,
    channels: summarizeLinesByChannel(bucket.lines),
    lines: bucket.lines,
  };
}

function sortProducts(rows: ProductPackingRow[]): ProductPackingRow[] {
  return rows.sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "th"));
}

export function summarizeProducts(orders: readonly PackingOrder[]): ProductPackingRow[] {
  const buckets = new Map<string, ProductBucket>();

  for (const order of orders) {
    for (const item of order.items) {
      const name = item.name.trim() || "ไม่ระบุสินค้า";
      const bucket = buckets.get(name) ?? { quantity: 0, codes: new Set<string>(), image: null, lines: [] };
      const quantity = item.quantity > 0 ? item.quantity : 0;
      bucket.quantity += quantity;
      bucket.codes.add(order.orderCode);
      if (!bucket.image && item.image) bucket.image = item.image;
      const channel = channelOf(order);
      const existingLine = bucket.lines.find(
        (line) => line.orderCode === order.orderCode && line.channel === channel,
      );
      if (existingLine) {
        // ออเดอร์เดียวมีสินค้าชื่อเดียวกันหลายรายการ (เช่นหลายไซซ์) → รวมเป็นบรรทัดเดียว
        existingLine.quantity += quantity;
      } else {
        bucket.lines.push({
          orderCode: order.orderCode,
          channel,
          quantity,
          courier: order.courier,
          customerName: order.customerName,
          paidAt: order.cutAt.toISOString(),
        });
      }
      buckets.set(name, bucket);
    }
  }

  return sortProducts([...buckets.entries()].map(([name, bucket]) => finalizeProduct(name, bucket)));
}

/** สรุปยอดที่ต้องส่งของทั้งวัน แยกตามช่องทางขาย */
export function summarizeChannels(
  orders: readonly PackingOrder[],
): { channel: string; quantity: number; orderCount: number }[] {
  const buckets = new Map<string, { quantity: number; codes: Set<string> }>();
  for (const order of orders) {
    const channel = channelOf(order);
    const bucket = buckets.get(channel) ?? { quantity: 0, codes: new Set<string>() };
    bucket.quantity += order.itemCount;
    bucket.codes.add(order.orderCode);
    buckets.set(channel, bucket);
  }
  return [...buckets.entries()]
    .map(([channel, bucket]) => ({
      channel,
      quantity: bucket.quantity,
      orderCount: bucket.codes.size,
    }))
    .sort((a, b) => b.quantity - a.quantity || a.channel.localeCompare(b.channel, "th"));
}

/**
 * สรุปของวันหนึ่ง: รอบก่อน/หลัง 14.00 น. + ยอดต่อสินค้า
 *
 * includeClosed = true สำหรับดูย้อนหลัง (นับออเดอร์ที่ส่งไปแล้วของวันนั้นด้วย)
 */
export function buildDayPackingSummary(
  orders: readonly ShipnityOrder[],
  isoDay: string,
  options: { includeClosed?: boolean; carryOverOpen?: boolean } = {},
): DayPackingSummary {
  const includeClosed = options.includeClosed ?? false;
  // วันนี้ต้องเห็นออเดอร์ที่ยังไม่ส่งของวันก่อนด้วย (ของค้าง) ไม่เช่นนั้นพนักงานจะแพ็คไม่ครบ
  const carryOverOpen = options.carryOverOpen ?? false;
  const anchor = dayAnchor(isoDay);
  const packable: PackingOrderInput[] = [];

  let waitingPaymentCount = 0;
  let closedCount = 0;
  let cancelledCount = 0;
  let skippedWithoutDateCount = 0;

  for (const order of orders) {
    if (order.cancelled) {
      cancelledCount += 1;
      continue;
    }
    const cutAt = orderCutAt(order);
    if (!cutAt) {
      skippedWithoutDateCount += 1;
      continue;
    }
    const isOpenRow = !order.closed && !order.packed;
    if (!(carryOverOpen && isOpenRow) && !sameBangkokDay(cutAt, isoDay)) continue;
    if (!order.paid && !isPayLaterOrder(order)) {
      waitingPaymentCount += 1;
      continue;
    }
    if (order.closed || order.packed) {
      closedCount += 1;
      if (!includeClosed) continue;
    }

    const items = purchaseItems(order);
    const totalAmount = Number(order.price);
    packable.push({
      orderCode: order.invoice_number,
      customerName: order.name ?? null,
      courier: order.shipping_type ?? null,
      marketplace: order.contact_method ?? order.order_bank ?? null,
      itemCount: purchaseQuantity(items),
      items,
      totalAmount: Number.isFinite(totalAmount) ? totalAmount : 0,
      status: describeOrderStatus(order),
      paidAt: order.transferred_at ?? null,
      createdAt: order.created_at ?? cutAt.toISOString(),
    });
  }

  const rounds = buildPackingRounds(packable, anchor);
  const allOrders = [...rounds.current, ...rounds.next].flatMap((group) => group.orders);

  return {
    isoDay,
    cutoffAt: rounds.cutoffAt,
    rounds,
    products: summarizeProducts(allOrders),
    totalOrders: allOrders.length,
    totalItems: allOrders.reduce((sum, order) => sum + order.itemCount, 0),
    waitingPaymentCount,
    closedCount,
    cancelledCount,
    skippedWithoutDateCount,
  };
}

/**
 * รวบออเดอร์ที่ยังไม่ชำระเงินของวันนั้น (หรือรวมของค้างเมื่อ carryOverOpen)
 * เรียงของที่สั่งนานสุดขึ้นก่อน เพื่อให้เห็นว่าค้างจ่ายมานานแค่ไหน
 */
export function collectWaitingPaymentOrders(
  orders: readonly ShipnityOrder[],
  isoDay: string,
  options: { carryOverOpen?: boolean } = {},
): WaitingPaymentOrder[] {
  const carryOverOpen = options.carryOverOpen ?? false;
  const anchor = dayAnchor(isoDay);
  const rows: WaitingPaymentOrder[] = [];

  for (const order of orders) {
    // COD ไม่นับเป็น “ค้างจ่าย” — เก็บเงินตอนส่งของ
    if (order.cancelled || order.closed || order.packed || order.paid || isPayLaterOrder(order)) continue;
    const cutAt = orderCutAt(order);
    if (!cutAt) continue;
    if (!carryOverOpen && !sameBangkokDay(cutAt, isoDay)) continue;

    const total = Number(order.price);
    rows.push({
      orderCode: order.invoice_number,
      customerName: order.name ?? null,
      channel: order.contact_method ?? order.order_bank ?? "ไม่ระบุช่องทาง",
      courier: order.shipping_type ?? "ไม่ระบุขนส่ง",
      totalAmount: Number.isFinite(total) ? total : 0,
      status: describeOrderStatus(order),
      orderedAt: cutAt.toISOString(),
      daysPending: daysPendingBangkok(cutAt, anchor),
    });
  }

  return rows.sort((a, b) => a.orderedAt.localeCompare(b.orderedAt));
}

/** รวมสรุปสินค้าของหลายร้าน (หลายบัญชี Shipnity) เป็นชุดเดียว */
export function mergeProductRows(
  rowsList: readonly (readonly ProductPackingRow[])[]
): ProductPackingRow[] {
  const buckets = new Map<string, ProductBucket>();

  for (const rows of rowsList) {
    for (const row of rows) {
      const bucket = buckets.get(row.name) ?? { quantity: 0, codes: new Set<string>(), image: null, lines: [] };
      bucket.quantity += row.quantity;
      for (const code of row.orderCodes) bucket.codes.add(code);
      if (!bucket.image && row.image) bucket.image = row.image;
      bucket.lines.push(...(row.lines ?? []));
      buckets.set(row.name, bucket);
    }
  }

  return sortProducts([...buckets.entries()].map(([name, bucket]) => finalizeProduct(name, bucket)));
}
