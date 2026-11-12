// ตัวเรียก Shipnity Open API v2 (อ่านอย่างเดียว) สำหรับหน้าคำสั่งซื้อรอแพ็ค
//
// auth ตามเอกสาร Shipnity: header `Authorization: Token token=<token>, email=<email>`
// token ของร้าน (shop apiKey) ยังไม่ถูกเปิดใช้บนบัญชีนี้ — token ที่ใช้ได้คือของผู้ใช้
//
// แยก credential ตามบริษัท: SHIPNITY_API_TOKEN__DRAGON19 / SHIPNITY_API_TOKEN__SEEHENG
// (ค่าเดิม SHIPNITY_API_TOKEN / SHIPNITY_API_EMAIL ถือเป็นของ dragon19 เพื่อความเข้ากันได้)
//
// เอกสาร: https://documenter.getpostman.com/view/2910242/SW18ua24

import type { CompanyId } from "@/lib/db";
import { bangkokDateParts } from "@/lib/packing-rounds";

const DEFAULT_BASE_URL = "https://www.shipnity.pro/api/v2";

/** Shipnity แบ่งหน้า 15 รายการต่อหน้า และไม่บอกจำนวนทั้งหมดมาให้ */
export const SHIPNITY_PAGE_SIZE = 15;

export class ShipnityError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "ShipnityError";
    this.status = status;
  }
}

export interface ShipnityPurchase {
  code?: string | null;
  name?: string | null;
  quantity?: number | null;
  price?: string | null;
  discount?: string | null;
  /** URL รูปสินค้า (S3 presigned — หมดอายุประมาณ 6 ชั่วโมง) */
  thumb?: string | null;
}

export interface ShipnityOrder {
  id: number;
  invoice_number: string;
  created_at: string;
  transferred_at?: string | null;
  closed_at?: string | null;
  price?: string | null;
  paid?: boolean | null;
  /** แจ้งโอนเงินแล้ว (อาจยังไม่ถูกตรวจสอบ) */
  transferred?: boolean | null;
  /** ยืนยันหลักฐานการโอนแล้ว */
  payment_accepted?: boolean | null;
  /** ขั้นของออเดอร์: 0 สร้าง · 1 รับหลักฐาน · 2 พิมพ์ · 3 ปิดรายการ */
  stage?: number | null;
  closed?: boolean | null;
  packed?: boolean | null;
  printed?: boolean | null;
  cancelled?: boolean | null;
  shipping_type?: string | null;
  order_bank?: string | null;
  contact_method?: string | null;
  name?: string | null;
  tel?: string | null;
  address?: string | null;
  purchases?: ShipnityPurchase[] | null;
}

export interface ShipnityOrdersPage {
  orders: ShipnityOrder[];
  options: { enable_packed_stage?: boolean | null };
}

export interface ShipnityCredentials {
  token: string;
  email: string;
}

/** บริษัทที่ผูก Shipnity ไว้ (ใช้บอกผู้ใช้เมื่อบริษัทที่เปิดอยู่ยังไม่ได้เชื่อม) */
export const SHIPNITY_COMPANY: CompanyId = "dragon19";

/** อ่าน credential จาก .env ของบริษัทนั้น คืน null เมื่อยังไม่ได้ตั้งค่า */
export function shipnityCredentialsFromEnv(
  companyId: CompanyId = SHIPNITY_COMPANY,
): ShipnityCredentials | null {
  const suffix = companyId === "seeheng" ? "SEEHENG" : "DRAGON19";
  const scopedToken = process.env[`SHIPNITY_API_TOKEN__${suffix}`]?.trim();
  const scopedEmail = process.env[`SHIPNITY_API_EMAIL__${suffix}`]?.trim();
  if (scopedToken && scopedEmail) {
    return { token: scopedToken, email: scopedEmail };
  }
  if (companyId !== SHIPNITY_COMPANY) return null;

  const token = process.env.SHIPNITY_API_TOKEN?.trim();
  const email = process.env.SHIPNITY_API_EMAIL?.trim();
  if (!token || !email) return null;
  return { token, email };
}

function baseUrl(): string {
  return (process.env.SHIPNITY_API_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/** YYYY-MM-DD → DD-MM-YYYY ตามรูปแบบที่ Shipnity ต้องการ */
export function toShipnityDate(isoDay: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay.trim());
  if (!match) throw new ShipnityError(`รูปแบบวันที่ไม่ถูกต้อง: ${isoDay}`);
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/** เลื่อนวันแบบ YYYY-MM-DD (ค่าลบ = ย้อนหลัง) */
export function shiftIsoDay(isoDay: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay.trim());
  if (!match) throw new ShipnityError(`รูปแบบวันที่ไม่ถูกต้อง: ${isoDay}`);
  const base = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const shifted = new Date(base + days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 300);
  } catch {
    return "";
  }
}

export interface FetchOrdersParams {
  credentials: ShipnityCredentials;
  filter?: string;
  page?: number;
  /** วันที่สร้างออเดอร์ (YYYY-MM-DD) — แปลงเป็น DD-MM-YYYY ให้เอง */
  fromDay?: string;
  toDay?: string;
}

/** ดึงออเดอร์หนึ่งหน้า (15 รายการ) — ใส่ fetchImpl ได้เพื่อเทสต์ */
export async function fetchOrdersPage(
  params: FetchOrdersParams,
  fetchImpl: typeof fetch = fetch,
): Promise<ShipnityOrdersPage> {
  const credentials = params.credentials;

  const search = new URLSearchParams();
  search.set("filter", params.filter ?? "open");
  search.set("page", String(params.page ?? 1));
  if (params.fromDay) search.set("filter_start", toShipnityDate(params.fromDay));
  if (params.toDay) search.set("filter_end_date", toShipnityDate(params.toDay));

  const url = `${baseUrl()}/orders?${search.toString()}`;

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Token token=${credentials.token}, email=${credentials.email}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    throw new ShipnityError(
      "Shipnity ปฏิเสธ token — ตรวจ token/อีเมลของบริษัทนี้ในการเชื่อมต่อ Shipnity",
      response.status,
    );
  }
  if (response.status === 429) {
    throw new ShipnityError(
      "Shipnity จำกัดจำนวนการเรียก (429) — รอประมาณ 2 นาทีแล้วกดรีเฟรชอีกครั้ง",
      429,
    );
  }
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ShipnityError(`Shipnity ตอบ ${response.status}${body ? `: ${body}` : ""}`, response.status);
  }

  const payload = (await response.json()) as Partial<ShipnityOrdersPage>;
  return {
    orders: Array.isArray(payload.orders) ? payload.orders : [],
    options: payload.options ?? {},
  };
}

/**
 * วนทุกหน้าเก็บออเดอร์ตาม filter และช่วงวันที่สร้าง
 * หยุดเมื่อหน้านั้นได้น้อยกว่าหนึ่งหน้าเต็ม (หน้าสุดท้าย) หรือถึงเพดาน maxPages
 */
/** จำนวนหน้าที่ดึงพร้อมกัน (เร็วขึ้น ~2–3 เท่า แต่ยังไม่กระหน่ำ API) */
const PAGE_FETCH_CONCURRENCY = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** ดึงหน้าหนึ่ง — เจอ 429 ระหว่างไล่หลายหน้า ให้รอแล้วลองซ้ำหนึ่งครั้ง */
async function fetchPageWithRetry(
  fetchPage: (page: number) => Promise<ShipnityOrdersPage>,
  page: number,
): Promise<ShipnityOrdersPage> {
  try {
    return await fetchPage(page);
  } catch (error) {
    if (error instanceof ShipnityError && error.status === 429) {
      await sleep(2000);
      return fetchPage(page);
    }
    throw error;
  }
}

/**
 * ดึงหน้าหนึ่งแบบกันข้อมูลขาด
 * หน้าสั้นอาจไม่ใช่หน้าสุดท้ายจริง — Shipnity เคยตอบไม่ครบ 15 ใบตอนถูกจำกัดอัตรา
 * ทำให้ไล่หน้าหยุดกลางทางและเก็บออเดอร์ได้ไม่ครบ จึงลองซ้ำอีกครั้งก่อนสรุปว่าจบ
 */
async function fetchFullPage(
  fetchPage: (page: number) => Promise<ShipnityOrdersPage>,
  page: number,
): Promise<ShipnityOrdersPage> {
  const first = await fetchPageWithRetry(fetchPage, page);
  if (first.orders.length >= SHIPNITY_PAGE_SIZE) return first;
  await sleep(600);
  const retry = await fetchPageWithRetry(fetchPage, page).catch(() => first);
  return retry.orders.length > first.orders.length ? retry : first;
}

export async function listAllOrdersDetailed(
  params: FetchOrdersParams & { maxPages?: number },
  fetchPage: (page: number) => Promise<ShipnityOrdersPage> = (page) =>
    fetchOrdersPage({ ...params, page }),
): Promise<{ orders: ShipnityOrder[]; complete: boolean }> {
  const maxPages = params.maxPages ?? 20;
  const collected: ShipnityOrder[] = [];
  const seen = new Set<number>();

  // หน้าแรกดูก่อนเสมอ — ถ้ามีไม่ถึงหนึ่งหน้าเต็มก็จบเลย ไม่ต้องยิงเพิ่ม
  const first = await fetchFullPage(fetchPage, 1);
  for (const order of first.orders) {
    if (seen.has(order.id)) continue;
    seen.add(order.id);
    collected.push(order);
  }
  let completed = true;
  if (first.orders.length < SHIPNITY_PAGE_SIZE) return { orders: collected, complete: completed };

  let page = 2;
  let finished = false;

  while (!finished && page <= maxPages) {
    const batch: number[] = [];
    for (let i = 0; i < PAGE_FETCH_CONCURRENCY && page + i <= maxPages; i += 1) {
      batch.push(page + i);
    }

    const results = await Promise.all(batch.map((target) => fetchFullPage(fetchPage, target)));

    for (const result of results) {
      for (const order of result.orders) {
        if (seen.has(order.id)) continue;
        seen.add(order.id);
        collected.push(order);
      }
      if (result.orders.length < SHIPNITY_PAGE_SIZE) finished = true;
    }

    page += batch.length;
  }

  // ยังวนไม่จบเพราะชนเพดานหน้า = ข้อมูลอาจยังไม่ครบ
  if (!finished) completed = false;

  return { orders: collected, complete: completed };
}

export interface DayOrdersResult {
  orders: ShipnityOrder[];
  /** true เมื่อเก็บครบทุกหน้าของช่วงที่ขอ */
  complete: boolean;
  /** เวลาที่ดึงข้อมูลชุดนี้มาจริง (ISO) */
  fetchedAt: string;
}

/**
 * ดึงออเดอร์ที่เกี่ยวกับวันที่หนึ่ง
 *
 * - ออเดอร์ที่ยังไม่ส่ง (open) ดึงทั้งกองโดยไม่กรองวันที่ เพราะปกติมีไม่มาก และต้องไม่พลาดของที่ค้างจากวันก่อน
 * - ดูย้อนหลัง (includeClosed) เพิ่มออเดอร์ที่ส่งแล้ว ซึ่ง Shipnity กรองด้วย "วันที่สร้าง" จึงเผื่อช่วง 1 วัน
 *
 * การเลือกว่าเป็นของวันไหนจริง ๆ ทำที่ buildDayPackingSummary (อิงเวลาชำระเงิน)
 */
export const OPEN_MAX_PAGES = 15;
export const CLOSED_MAX_PAGES = 15;

/** จำนวนวันย้อนหลังของออเดอร์ COD/เครดิต ที่ยังเอามาคิดในใบแพ็ค */
export const PAY_LATER_WINDOW_DAYS = 14;

/** เพดานหน้าของ pay_later (กันร้านที่มีประวัติ COD ยาว ๆ ดึงจนชนเพดานการเรียก) */
export const PAY_LATER_MAX_PAGES = 3;

function bangkokToday(): string {
  const parts = bangkokDateParts(new Date());
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/**
 * ออเดอร์ที่ยังไม่ส่งทั้งหมด (ไม่ขึ้นกับวันที่)
 *
 * ต้องรวม `pay_later` ด้วย: ออเดอร์ COD/เครดิต (เช่นร้าน Kiddee Shop) ไม่ถูกคืนมาใน `open`
 * ถ้าดูแค่ open ใบแพ็คของจะว่างทั้งที่ยังมีของต้องส่ง
 *
 * pay_later มีประวัติยาวและส่วนใหญ่ปิดรายการแล้ว จึงจำกัดช่วง PAY_LATER_WINDOW_DAYS วัน
 * และเพดาน PAY_LATER_MAX_PAGES หน้า
 */
/** ออเดอร์ที่ยังไม่ส่ง (filter=open) */
export async function listAllOrders(
  params: FetchOrdersParams & { maxPages?: number },
  fetchPage?: (page: number) => Promise<ShipnityOrdersPage>,
): Promise<ShipnityOrder[]> {
  const result = await listAllOrdersDetailed(params, fetchPage);
  return result.orders;
}

export async function listOpenOnly(
  credentials: ShipnityCredentials,
  maxPages: number = OPEN_MAX_PAGES,
): Promise<ShipnityOrder[]> {
  return listAllOrders({ credentials, filter: "open", maxPages });
}

/** เหมือน listOpenOnly แต่บอกด้วยว่าดึงจนจบหรือชนเพดานหน้า (ใช้ตัดสินว่าข้อมูลครบไหม) */
export function listOpenOnlyDetailed(
  credentials: ShipnityCredentials,
  maxPages: number = OPEN_MAX_PAGES,
): Promise<{ orders: ShipnityOrder[]; complete: boolean }> {
  return listAllOrdersDetailed({ credentials, filter: "open", maxPages });
}

/** ออเดอร์ COD/เครดิต (filter=pay_later) ในหน้าต่างที่กำหนด */
export async function listPayLaterOrders(
  credentials: ShipnityCredentials,
): Promise<ShipnityOrder[]> {
  const today = bangkokToday();
  return listAllOrders({
    credentials,
    filter: "pay_later",
    fromDay: shiftIsoDay(today, -PAY_LATER_WINDOW_DAYS),
    toDay: today,
    maxPages: PAY_LATER_MAX_PAGES,
  });
}

export async function listOpenOrders(
  credentials: ShipnityCredentials,
  maxPages: number = OPEN_MAX_PAGES,
): Promise<ShipnityOrder[]> {
  // ยิงสองตัวกรองพร้อมกันเพื่อลดเวลารอ (สูงสุด 2 คำขอพร้อมกันต่อบัญชี)
  const [openOrders, payLaterOrders] = await Promise.all([
    listOpenOnly(credentials, maxPages),
    listPayLaterOrders(credentials),
  ]);

  const merged = new Map<number, ShipnityOrder>();
  for (const order of openOrders) merged.set(order.id, order);
  for (const order of payLaterOrders) merged.set(order.id, order);
  return [...merged.values()];
}

/** ออเดอร์ที่ส่งแล้วของวันหนึ่ง (เผื่อช่วงวันที่สร้าง 1 วัน) */
export async function listClosedOrdersForDay(
  credentials: ShipnityCredentials,
  isoDay: string,
  maxPages: number = CLOSED_MAX_PAGES,
): Promise<ShipnityOrder[]> {
  return listAllOrders({
    credentials,
    filter: "closed",
    fromDay: shiftIsoDay(isoDay, -1),
    toDay: isoDay,
    maxPages,
  });
}

export async function listOrdersForDay(
  isoDay: string,
  options: { credentials: ShipnityCredentials; includeClosed?: boolean; maxPages?: number },
): Promise<DayOrdersResult> {
  const openOrders = await listOpenOrders(options.credentials, options.maxPages);
  const closedOrders = options.includeClosed
    ? await listClosedOrdersForDay(options.credentials, isoDay, options.maxPages)
    : [];

  const merged = new Map<number, ShipnityOrder>();
  for (const order of openOrders) merged.set(order.id, order);
  for (const order of closedOrders) merged.set(order.id, order);

  const cap = (options.maxPages ?? OPEN_MAX_PAGES) * SHIPNITY_PAGE_SIZE;
  const incomplete = openOrders.length >= cap || closedOrders.length >= cap;

  return { orders: [...merged.values()], complete: !incomplete, fetchedAt: new Date().toISOString() };
}
