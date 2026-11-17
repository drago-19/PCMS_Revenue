"use client";

import { useEffect } from "react";
import { usePendingValue } from "@/lib/sale/use-pending-value";

/**
 * เลข "คงเหลือรวม" ในป๊อปอัพ SKU
 * ฟอร์มปรับสต็อกยิง event `sale:stock-updated` มาพร้อมค่าที่เซิร์ฟเวอร์อ่านกลับได้
 * ค่านี้จะขึ้นทันทีและไม่ถูกข้อมูลเก่าจากการรีเฟรชเขียนทับ (จนกว่า DB จะตรงกัน)
 */
export function LiveStockQuantity({ skuId, initial }: { skuId: string; initial: number }) {
  const { value, commit } = usePendingValue(initial);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ skuId?: string; quantity?: number }>).detail;
      if (detail?.skuId === skuId && typeof detail.quantity === "number") {
        commit(detail.quantity);
      }
    };
    window.addEventListener("sale:stock-updated", onUpdate);
    return () => window.removeEventListener("sale:stock-updated", onUpdate);
  }, [skuId, commit]);

  return <span className="tabular-nums">{value.toLocaleString("th-TH")}</span>;
}
