// เหตุการณ์พัสดุแบบละเอียด (ถึงศูนย์คัดแยก/สาขา/นำส่ง) จาก TikTok Get Tracking
// - เก็บลงฐานข้อมูลเพื่อไม่ให้ยิง API ซ้ำทุกครั้งที่เปิดป๊อปอัป
// - ใช้ของเดิมได้ไม่เกิน 10 นาที แล้วค่อยดึงใหม่ (คุมจำนวนคำขอตามกฎของ TikTok)

import { query } from "@/lib/db";
import { getPlatformAccountRow, getPlatformConfig, TIKTOK_PLATFORM } from "@/lib/platform/store";
import { callTikTokApi } from "@/lib/platform/tiktok";

export type OrderTrackingEvent = {
  actionCode: number | null;
  description: string;
  /** เวลาที่เกิด event (ISO) */
  eventAt: string;
};

type TrackingRow = {
  action_code: number | null;
  description: string;
  event_time: string;
  fetched_at: string;
};

/** แปลงรหัสเหตุการณ์ของ TikTok เป็นข้อความไทย — ไม่รู้รหัสก็ใช้ข้อความเดิม */
const ACTION_LABEL: Record<number, string> = {
  20201: "ส่งข้อมูลให้ขนส่ง",
  30901: "ขนส่งรับพัสดุแล้ว",
  31301: "ถึงศูนย์คัดแยก",
  31401: "ออกจากศูนย์คัดแยก",
  31201: "ถึงศูนย์คัดแยกปลายทาง",
  40101: "ถึงศูนย์กระจายสินค้าปลายทาง",
  40501: "อยู่ระหว่างนำส่ง",
  50101: "ส่งถึงผู้รับแล้ว",
};

function describe(code: number | null, description: string): string {
  const label = code !== null ? ACTION_LABEL[code] : undefined;
  if (!label) return description;
  const place = / in ([^.]+)\.?\s*$/.exec(description)?.[1];
  return place ? `${label} · ${place}` : label;
}

const FRESH_MINUTES = 10;

function toEvents(rows: TrackingRow[]): OrderTrackingEvent[] {
  return rows.map((row) => ({
    actionCode: row.action_code,
    description: describe(row.action_code, row.description),
    eventAt: row.event_time,
  }));
}

export async function loadOrderTracking(
  orderId: string,
  shopId: string | null,
): Promise<OrderTrackingEvent[]> {
  if (!shopId) return [];

  const cached = await query<TrackingRow>(
    `SELECT action_code, description, event_time::text AS event_time, fetched_at::text AS fetched_at
       FROM platform_order_tracking
      WHERE shop_id = $1 AND order_id = $2
      ORDER BY event_time DESC`,
    [shopId, orderId],
  );

  const lastFetch = cached[0] ? new Date(cached[0].fetched_at).getTime() : 0;
  const isFresh = cached.length > 0 && Date.now() - lastFetch < FRESH_MINUTES * 60_000;
  if (isFresh) return toEvents(cached);

  const config = await getPlatformConfig();
  const account = await getPlatformAccountRow(TIKTOK_PLATFORM, shopId);
  if (!config.tiktok || !account?.accessToken || !account.shopCipher) return toEvents(cached);

  try {
    const response = await callTikTokApi<{
      tracking?: Array<{ action_code?: number; description?: string; update_time_millis?: number }>;
    }>({
      config: config.tiktok,
      accessToken: account.accessToken,
      path: `/fulfillment/202309/orders/${orderId}/tracking`,
      query: { shop_cipher: account.shopCipher },
    });

    const events = (response.tracking ?? [])
      .filter((row) => row.description && row.update_time_millis)
      .map((row) => ({
        actionCode: row.action_code ?? null,
        description: describe(row.action_code ?? null, String(row.description)),
        // ฟิลด์นี้เป็นมิลลิวินาทีอยู่แล้ว (ไม่ต้องคูณพัน)
        eventAt: new Date(Number(row.update_time_millis)).toISOString(),
      }));

    if (events.length === 0) return toEvents(cached);

    await query(
      `INSERT INTO platform_order_tracking (platform, shop_id, order_id, action_code, description, event_time, fetched_at)
       SELECT 'TikTok', $1, $2, item.action_code, item.description, item.event_time, now()
         FROM unnest($3::int[], $4::text[], $5::timestamptz[]) AS item(action_code, description, event_time)
       ON CONFLICT DO NOTHING`,
      [
        shopId,
        orderId,
        events.map((event) => event.actionCode),
        events.map((event) => event.description),
        events.map((event) => event.eventAt),
      ],
    );

    return events;
  } catch {
    // เน็ต/โควต้าพังก็ยังแสดงของเดิมที่มีอยู่ ไม่ทำให้หน้าจอพัง
    return toEvents(cached);
  }
}
