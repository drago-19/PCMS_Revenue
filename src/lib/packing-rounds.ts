// ตรรกะตัดรอบแพ็คของของออเดอร์ Shipnity ("รอบก่อนบ่ายสอง" = 14.00 น. เวลาไทย)
//
// ฟังก์ชันในนี้เป็น pure function ล้วน ไม่แตะ DB ไม่เรียก API และไม่พึ่ง timezone ของเครื่อง
// (เวลาตัดรอบคิดจาก Asia/Bangkok คงที่ UTC+07:00 ไม่มี DST) จึงเทสต์ตรง ๆ ได้
//
// เกณฑ์ที่ผู้ใช้เลือก: ออเดอร์ที่ชำระเงิน/สร้างก่อน 14.00 น. ของวันนั้น = รอบนี้ (ต้องแพ็คให้ทันรอบบ่ายสอง)
// ออเดอร์ที่เข้ามาตั้งแต่ 14.00 น. เป็นต้นไป = รอบถัดไป

/** ชั่วโมงตัดรอบแพ็คของ ตามเวลาไทย */
export const PACKING_CUTOFF_HOUR = 14;

/** ป้ายเมื่อออเดอร์ไม่มีข้อมูลขนส่ง */
export const NO_COURIER_LABEL = "ไม่ระบุขนส่ง";

const BANGKOK_TZ = "Asia/Bangkok";
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type PackingRound = "current" | "next";

/** รายการสินค้าหนึ่งบรรทัดในออเดอร์ (ใช้บอกพนักงานว่าต้องหยิบอะไร) */
export interface PackingItem {
  name: string;
  quantity: number;
  /** รูปสินค้า (URL จาก Shipnity) */
  image?: string | null;
}

/** ข้อมูลออเดอร์ขั้นต่ำที่ต้องมีเพื่อตัดรอบ (map มาจาก response ของ Shipnity) */
export interface PackingOrderInput {
  orderCode: string;
  customerName?: string | null;
  courier?: string | null;
  marketplace?: string | null;
  itemCount?: number;
  items?: readonly PackingItem[] | null;
  totalAmount?: number;
  /** สถานะออเดอร์จาก Shipnity */
  status?: string | null;
  /** เวลาที่ลูกค้าชำระเงิน (ใช้เป็นตัวสำรองเมื่อไม่มีเวลาสั่ง) */
  paidAt?: string | Date | null;
  /** เวลาที่ลูกค้าสั่งออเดอร์ — ใช้ตัดรอบก่อน */
  createdAt?: string | Date | null;
}

export interface PackingOrder {
  orderCode: string;
  customerName: string | null;
  courier: string;
  marketplace: string | null;
  itemCount: number;
  items: PackingItem[];
  totalAmount: number;
  /** สถานะออเดอร์จาก Shipnity (เช่น ยังไม่ชำระเงิน / แจ้งโอนเงิน / ชำระแล้ว) */
  status?: string | null;
  /** เวลาที่ใช้ตัดรอบจริง (เวลาสั่งของลูกค้า ไม่งั้นใช้เวลาชำระ) */
  cutAt: Date;
  round: PackingRound;
  /** จำนวนวันตามปฏิทินไทยที่ออเดอร์นี้ค้างอยู่ (0 = วันนี้) */
  daysPending: number;
}

export interface PackingCourierGroup {
  courier: string;
  orders: PackingOrder[];
  orderCount: number;
  itemCount: number;
  totalAmount: number;
}

export interface PackingRounds {
  /** เวลาตัดรอบของ "รอบนี้" (14.00 น. เวลาไทยของวันที่ของ now) */
  cutoffAt: Date;
  current: PackingCourierGroup[];
  next: PackingCourierGroup[];
  currentOrderCount: number;
  nextOrderCount: number;
  /** ออเดอร์ที่ไม่มีวันเวลาใช้ได้เลย จึงตัดรอบไม่ได้ */
  skippedOrderCodes: string[];
}

const bangkokDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: BANGKOK_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** ปี/เดือน/วันตามปฏิทินไทยของเวลาหนึ่ง */
export function bangkokDateParts(instant: Date): { year: number; month: number; day: number } {
  const parts = bangkokDateFormatter.formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? NaN);
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

/** เวลา 14.00 น. เวลาไทยของวันที่กำหนด (คืนเป็น instant) */
export function cutoffInstant(
  year: number,
  month: number,
  day: number,
  hour: number = PACKING_CUTOFF_HOUR,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, 0, 0) - BANGKOK_OFFSET_MS);
}

/** เวลาตัดรอบของรอบที่กำลังจะถึง สำหรับเวลาปัจจุบันหนึ่ง */
export function packingCutoffFor(now: Date): Date {
  const { year, month, day } = bangkokDateParts(now);
  return cutoffInstant(year, month, day);
}

const INSTANT_WITHOUT_ZONE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * แปลงค่าเวลาจาก Shipnity เป็น Date
 * - ISO ที่มี timezone อยู่แล้ว ใช้ตามนั้น
 * - "YYYY-MM-DD HH:mm:ss" / "YYYY-MM-DD" ที่ไม่มี timezone ถือว่าเป็นเวลาไทย (Shipnity แสดงเวลาไทย)
 * คืน null เมื่อแปลงไม่ได้ เพื่อให้ผู้เรียกตัดสินใจเองว่าจะข้ามหรือเตือน
 */
export function parseInstant(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const text = value.trim();
  if (!text) return null;

  const local = INSTANT_WITHOUT_ZONE.exec(text);
  if (local) {
    const [, y, m, d, hh, mm, ss] = local;
    const utcMs = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0), Number(ss ?? 0));
    return new Date(utcMs - BANGKOK_OFFSET_MS);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * เวลาที่ใช้ตัดรอบของออเดอร์ = เวลาที่ลูกค้าสั่ง (createdAt)
 * ไม่มีเวลาสั่งจึงใช้เวลาชำระเป็นตัวสำรอง
 */
export function resolveCutAt(order: PackingOrderInput): Date | null {
  return parseInstant(order.createdAt) ?? parseInstant(order.paidAt);
}

/**
 * รอบของออเดอร์ = เทียบเวลาที่ลูกค้าสั่ง กับ 14:00 ของ **วันเดียวกับที่สั่ง**
 * สั่งก่อน 14:00 → รอบก่อนบ่ายสอง · สั่งตั้งแต่ 14:00 → รอบหลังบ่ายสอง
 * (เดิมเทียบกับ 14:00 ของวันนี้ ทำให้ของค้างจากวันก่อนถูกเหมารวมเป็น “ก่อนบ่ายสอง” ทั้งหมด)
 */
export function resolveRound(cutAt: Date, _now: Date): PackingRound {
  return cutAt.getTime() < packingCutoffFor(cutAt).getTime() ? "current" : "next";
}

/** จำนวนวันตามปฏิทินไทยที่ค้างอยู่ นับจากวันที่ของ cutAt ถึงวันที่ของ now */
export function daysPendingBangkok(cutAt: Date, now: Date): number {
  const from = bangkokDateParts(cutAt);
  const to = bangkokDateParts(now);
  const diff =
    Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day);
  return Math.round(diff / MS_PER_DAY);
}

/** ป้ายชื่อขนส่งของออเดอร์ (ค่าว่างกลายเป็นป้ายกลาง) */
export function courierLabel(courier: string | null | undefined): string {
  const text = (courier ?? "").trim();
  return text || NO_COURIER_LABEL;
}

/** รวมออเดอร์เป็นกลุ่มตามขนส่ง โดยในกลุ่มเรียงของที่ค้างนานสุดขึ้นก่อน */
export function groupOrdersByCourier(orders: readonly PackingOrder[]): PackingCourierGroup[] {
  const buckets = new Map<string, PackingOrder[]>();
  for (const order of orders) {
    const bucket = buckets.get(order.courier);
    if (bucket) bucket.push(order);
    else buckets.set(order.courier, [order]);
  }

  return [...buckets.entries()]
    .map(([courier, groupOrders]) => {
      const sorted = [...groupOrders].sort((a, b) => a.cutAt.getTime() - b.cutAt.getTime());
      return {
        courier,
        orders: sorted,
        orderCount: sorted.length,
        itemCount: sorted.reduce((sum, order) => sum + order.itemCount, 0),
        totalAmount: sorted.reduce((sum, order) => sum + order.totalAmount, 0),
      };
    })
    .sort((a, b) => a.courier.localeCompare(b.courier, "th"));
}

/** แปลงออเดอร์หนึ่งเป็นรูปแบบที่ใช้ตัดรอบได้ (คืน null เมื่อไม่มีวันเวลาเลย) */
export function toPackingOrder(order: PackingOrderInput, now: Date): PackingOrder | null {
  const cutAt = resolveCutAt(order);
  if (!cutAt) return null;
  return {
    orderCode: order.orderCode,
    customerName: order.customerName?.trim() || null,
    courier: courierLabel(order.courier),
    marketplace: order.marketplace?.trim() || null,
    itemCount: Number.isFinite(order.itemCount) ? Number(order.itemCount) : 0,
    status: order.status ?? null,
    items: (order.items ?? []).map((item) => ({
      name: item.name,
      quantity: Number.isFinite(item.quantity) ? Number(item.quantity) : 0,
      image: item.image ?? null,
    })),
    totalAmount: Number.isFinite(order.totalAmount) ? Number(order.totalAmount) : 0,
    cutAt,
    round: resolveRound(cutAt, now),
    daysPending: daysPendingBangkok(cutAt, now),
  };
}

/** สรุปออเดอร์ทั้งหมดเป็นสองรอบ พร้อมแยกกลุ่มตามขนส่งในแต่ละรอบ */
export function buildPackingRounds(
  orders: readonly PackingOrderInput[],
  now: Date,
): PackingRounds {
  const current: PackingOrder[] = [];
  const next: PackingOrder[] = [];
  const skippedOrderCodes: string[] = [];

  for (const input of orders) {
    const order = toPackingOrder(input, now);
    if (!order) {
      skippedOrderCodes.push(input.orderCode);
      continue;
    }
    if (order.round === "current") current.push(order);
    else next.push(order);
  }

  return {
    cutoffAt: packingCutoffFor(now),
    current: groupOrdersByCourier(current),
    next: groupOrdersByCourier(next),
    currentOrderCount: current.length,
    nextOrderCount: next.length,
    skippedOrderCodes,
  };
}
