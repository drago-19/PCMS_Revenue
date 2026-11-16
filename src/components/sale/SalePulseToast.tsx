"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/**
 * เฝ้าตัวเลขของร้านทุก 15 วินาที แล้วเด้งแจ้งเตือนมุมขวาบนเมื่อ "ของใหม่เข้าจริง"
 * - ออเดอร์ใหม่ = จำนวนออเดอร์ที่สร้างวันนี้เพิ่มขึ้น (นับทั้งร้าน ไม่สนตัวกรองบนจอ)
 * - สต็อกขยับ = จำนวนรายการที่สต็อกเปลี่ยนวันนี้เพิ่มขึ้น
 * ทำงานแยกจากการรีเฟรชหน้า จึงไม่พลาดแม้ผู้ใช้กำลังกรองสถานะอื่นอยู่
 */
export function SalePulseToast({ shopId }: { shopId?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const rawShop = params.get("shop") ?? shopId ?? "";
  // รหัสร้านเป็นตัวเลขเท่านั้น — กันค่าอื่นหลุดเข้าไปในคำขอ
  const shop = /^[0-9]{1,32}$/.test(rawShop) ? rawShop : "";
  const baseline = useRef<{ ordersToday: number; stockMoves: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const response = await fetch(`/api/platform/sale-pulse?shop=${encodeURIComponent(shop)}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as { ordersToday: number; stockMoves: number };
        if (cancelled) return;

        const before = baseline.current;
        baseline.current = { ordersToday: data.ordersToday, stockMoves: data.stockMoves };
        if (!before) return; // รอบแรกแค่จำค่า

        const orderDelta = data.ordersToday - before.ordersToday;
        const stockDelta = data.stockMoves - before.stockMoves;
        if (orderDelta <= 0 && stockDelta <= 0) return;

        const parts: string[] = [];
        if (orderDelta > 0) parts.push(`ออเดอร์ +${orderDelta}`);
        if (stockDelta > 0) parts.push(`สต็อกขยับ ${stockDelta} รายการ`);

        toast.success(parts.join(" · "), {
          description: "กำลังอัปเดตข้อมูลบนหน้าให้แล้ว",
          duration: 5000,
        });
        // อัปเดตหน้าให้เลย ไม่ต้องให้ผู้ใช้กดรีเฟรชเอง
        router.refresh();
      } catch {
        // เงียบไว้ — รอบหน้าลองใหม่เอง
      }
    };

    void tick();
    const timer = setInterval(tick, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [router, shop]);

  return null;
}
