"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * แจ้งเตือนมุมขวาเมื่อข้อมูลที่ดึงมาเปลี่ยน (เช่น มีออเดอร์ใหม่ สต็อกขยับ)
 * ทำงานคู่กับ SaleAutoRefresh: หน้ารีเฟรชเอง → ค่าใหม่ไหลเข้ามา → ถ้าต่างจากเดิมจะเด้ง toast
 */
export function SaleChangeToast({
  metrics,
  scopeKey,
  title = "ข้อมูลอัปเดตแล้ว",
}: {
  metrics: Array<{ label: string; value: number; unit?: string }>;
  /** ตัวกรอง/ร้าน/ช่วงเวลาที่กำลังดู — เปลี่ยนชุดนี้คือเปลี่ยนข้อมูลคนละชุด ห้ามเทียบกัน */
  scopeKey: string;
  title?: string;
}) {
  const previous = useRef<Map<string, number> | null>(null);
  const lastScope = useRef<string | null>(null);

  useEffect(() => {
    const current = new Map(metrics.map((metric) => [metric.label, metric.value]));
    // เปลี่ยนตัวกรอง/ร้าน/ช่วงวันที่ = เป็นข้อมูลอีกชุด เริ่มนับใหม่ ไม่ใช่ \"มีของใหม่\"
    if (lastScope.current !== scopeKey) {
      lastScope.current = scopeKey;
      previous.current = current;
      return;
    }
    const before = previous.current;
    previous.current = current;
    // รอบแรกหลังเปิดหน้าเป็นแค่การจำค่า
    if (!before) return;

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
  }, [metrics, scopeKey, title]);

  return null;
}
