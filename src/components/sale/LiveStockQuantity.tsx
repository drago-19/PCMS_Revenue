"use client";

import { useEffect, useState } from "react";

/**
 * เลข "คงเหลือรวม" ในป๊อปอัพ SKU — อัปเดตทันทีที่กดปรับสต็อกสำเร็จ
 * ฟอร์มปรับสต็อกยิง event `sale:stock-updated` มาพร้อมค่าที่เซิร์ฟเวอร์อ่านกลับได้
 * แล้วค่อยให้ router.refresh() ประสานข้อมูลชุดเต็มตามมาอีกที
 */
export function LiveStockQuantity({ skuId, initial }: { skuId: string; initial: number }) {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    setValue(initial);
  }, [initial]);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ skuId?: string; quantity?: number }>).detail;
      if (detail?.skuId === skuId && typeof detail.quantity === "number") {
        setValue(detail.quantity);
      }
    };
    window.addEventListener("sale:stock-updated", onUpdate);
    return () => window.removeEventListener("sale:stock-updated", onUpdate);
  }, [skuId]);

  return <span className="tabular-nums">{value.toLocaleString("th-TH")}</span>;
}
