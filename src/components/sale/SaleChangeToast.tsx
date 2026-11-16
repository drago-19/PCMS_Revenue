"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * แจ้งเตือนมุมขวาเมื่อข้อมูลที่ดึงมาเปลี่ยน (เช่น มีออเดอร์ใหม่ สต็อกขยับ)
 * ทำงานคู่กับ SaleAutoRefresh: หน้ารีเฟรชเอง → ค่าใหม่ไหลเข้ามา → ถ้าต่างจากเดิมจะเด้ง toast
 */
export function SaleChangeToast({
  metrics,
  title = "ข้อมูลอัปเดตแล้ว",
}: {
  metrics: Array<{ label: string; value: number; unit?: string }>;
  title?: string;
}) {
  const previous = useRef<Map<string, number> | null>(null);
  // ต้อง “ติดอาวุธ” จากการรีเฟรชอัตโนมัติเท่านั้น — เปลี่ยนหน้าหรือกดเมนูไม่ต้องเด้ง
  const armed = useRef(false);

  useEffect(() => {
    const onRefresh = () => {
      armed.current = true;
    };
    window.addEventListener("sale:refresh", onRefresh);
    return () => window.removeEventListener("sale:refresh", onRefresh);
  }, []);

  useEffect(() => {
    const current = new Map(metrics.map((metric) => [metric.label, metric.value]));
    const before = previous.current;
    const wasArmed = armed.current;
    armed.current = false;
    previous.current = current;
    if (!before) return; // รอบแรกแค่จำค่าไว้ ไม่ต้องเด้ง
    if (!wasArmed) return; // ค่าเปลี่ยนเพราะเปลี่ยนหน้า/ตัวกรอง — ไม่ใช่สัญญาณว่ามีข้อมูลใหม่

    const lines: string[] = [];
    for (const [label, value] of current) {
      const old = before.get(label);
      if (old === undefined || old === value) continue;
      const delta = value - old;
      const sign = delta > 0 ? "+" : "−";
      lines.push(`${label} ${sign}${Math.abs(delta).toLocaleString("th-TH")}`);
    }
    if (lines.length === 0) return;

    toast.success(title, { description: lines.join(" · "), duration: 6000 });
  }, [metrics, title]);

  return null;
}
