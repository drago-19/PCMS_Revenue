"use client";

import { useEffect, useState } from "react";

/**
 * ชื่อสินค้าที่หัวป๊อปอัพ — เปลี่ยนทันทีเมื่อบันทึกชื่อใหม่สำเร็จ
 * ฟอร์มแก้ชื่อยิง event `sale:product-title-updated` มา แล้ว router.refresh() ประสานข้อมูลเต็มตามมาอีกที
 */
export function LiveProductTitle({ productId, initial }: { productId: string; initial: string }) {
  const [title, setTitle] = useState(initial);

  useEffect(() => {
    setTitle(initial);
  }, [initial]);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ productId?: string; title?: string }>).detail;
      if (detail?.productId === productId && detail.title) setTitle(detail.title);
    };
    window.addEventListener("sale:product-title-updated", onUpdate);
    return () => window.removeEventListener("sale:product-title-updated", onUpdate);
  }, [productId]);

  return <>{title}</>;
}
