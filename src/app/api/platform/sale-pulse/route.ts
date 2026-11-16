import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session-token";
import { cookies } from "next/headers";
import { query } from "@/lib/db";
import { getActiveShopId, TIKTOK_PLATFORM } from "@/lib/platform/store";

export const dynamic = "force-dynamic";

/**
 * ตัวเลขสั้น ๆ สำหรับแจ้งเตือนของฝ่ายขาย (เรียกทุก 15 วินาทีจากหน้าเว็บ)
 * - ordersToday: จำนวนออเดอร์ที่สร้างวันนี้ทั้งร้าน (ไม่สนตัวกรองบนจอ)
 * - stockMoves: จำนวนรายการที่สต็อกขยับวันนี้
 * ค่าพวกนี้เพิ่มขึ้นทันทีเมื่อมีของใหม่เข้าฐานข้อมูล จึงใช้เป็นสัญญาณแจ้งเตือนได้ตรงกว่า
 * การเทียบค่าที่หน้าจอโหลดมาล่าสุด (ซึ่งพลาดได้ถ้าหน้ากำลังกรองสถานะอื่นอยู่)
 */
export async function GET(request: Request) {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const shopId = url.searchParams.get("shop") || (await getActiveShopId(TIKTOK_PLATFORM));
  if (!shopId) {
    return NextResponse.json({ error: "no shop" }, { status: 400 });
  }

  const rows = await query<{ orders_today: string; stock_moves: string }>(
    `SELECT (SELECT count(*)::text FROM platform_orders
              WHERE platform = $1::text AND shop_id = $2::text
                AND create_time >= date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok') AS orders_today,
            (SELECT count(*)::text FROM platform_stock_movements
              WHERE platform = $1::text AND shop_id = $2::text
                AND changed_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok') AS stock_moves`,
    [TIKTOK_PLATFORM, shopId],
  );

  return NextResponse.json(
    {
      shopId,
      ordersToday: Number(rows[0]?.orders_today ?? 0),
      stockMoves: Number(rows[0]?.stock_moves ?? 0),
      at: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
