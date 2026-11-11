"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export interface OrderDetailItem {
  name: string;
  quantity: number;
}

export interface OrderDetailDialogProps {
  orderCode: string;
  customerName: string | null;
  courier: string;
  channel: string | null;
  status: string | null;
  orderedAt: string;
  totalAmount: number;
  daysPending: number;
  items: OrderDetailItem[];
}

/**
 * ปุ่มเลขบิล → เปิดรายละเอียดออเดอร์ (ไม่ต้องออกจากหน้า)
 * stretch = ให้พื้นที่คลิกคลุมทั้งแถว (วางใน TableRow ที่มี relative)
 */
export function OrderDetailButton({ orderCode, stretch = false }: { orderCode: string; stretch?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();

  function open() {
    const next = new URLSearchParams(params.toString());
    next.set("order", orderCode);
    router.push(`?${next.toString()}`, { scroll: false });
  }

  return (
    <button
      type="button"
      onClick={open}
      className={`cursor-pointer font-semibold text-foreground underline-offset-2 hover:underline focus-visible:rounded focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${
        stretch ? "after:absolute after:inset-0 after:content-['']" : ""
      }`}
      aria-label={`เปิดรายละเอียดบิล ${orderCode}`}
    >
      {orderCode}
    </button>
  );
}


