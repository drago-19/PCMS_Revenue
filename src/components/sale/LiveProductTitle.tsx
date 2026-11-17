"use client";

import { useEffect } from "react";
import { usePendingValue } from "@/lib/sale/use-pending-value";

/**
 * ชื่อสินค้าที่หัวป๊อปอัพ
 * ฟอร์มแก้ชื่อยิง event `sale:product-title-updated` มา — ชื่อใหม่ขึ้นทันที
 * และไม่ถูกชื่อเก่าจากการรีเฟรชเขียนทับ (จนกว่า DB จะตรงกับชื่อใหม่)
 */
export function LiveProductTitle({ productId, initial }: { productId: string; initial: string }) {
  const { value, commit } = usePendingValue(initial);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ productId?: string; title?: string }>).detail;
      if (detail?.productId === productId && detail.title) {
        commit(detail.title);
      }
    };
    window.addEventListener("sale:product-title-updated", onUpdate);
    return () => window.removeEventListener("sale:product-title-updated", onUpdate);
  }, [productId, commit]);

  return <>{value}</>;
}
