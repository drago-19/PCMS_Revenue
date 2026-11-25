"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { IconPrinter } from "./icons";

/**
 * ปุ่มพิมพ์ของหน้าใบกำกับฯ — ถ้าส่ง orderIds มาด้วย จะบันทึกรอยพิมพ์
 * (invoice_registry.printed_at) ก่อนเปิดหน้าต่างพิมพ์ เพราะเลขที่ขึ้นกระดาษแล้ว
 * ห้ามถูกจัดเรียงใหม่ทั้งเดือน · ไม่รอผลลัพธ์: เน็ตสะดุดก็ยังต้องพิมพ์ได้
 */
export function PrintButton({
  className,
  orderIds,
}: {
  className?: string;
  orderIds?: string[];
}) {
  function markPrinted() {
    if (!orderIds || orderIds.length === 0) return;
    void fetch("/api/invoices/printed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds }),
      keepalive: true,
    }).catch(() => undefined);
  }

  return (
    <Button
      type="button"
      variant="default"
      className={cn("no-print", className)}
      aria-label="พิมพ์ หรือ บันทึก PDF"
      onClick={() => {
        markPrinted();
        window.print();
      }}
    >
      <IconPrinter size={17} />
      พิมพ์ / บันทึก PDF
    </Button>
  );
}
