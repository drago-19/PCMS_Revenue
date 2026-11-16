"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ตัวเลขที่ "ไล่จำนวน" จากค่าเดิมไปค่าใหม่เมื่อข้อมูลอัปเดต (เช่น รีเฟรชอัตโนมัติแล้วมีออเดอร์เพิ่ม)
 * - ค่าเริ่มต้นตอนเปิดหน้าแสดงทันที ไม่ไล่จากศูนย์ (ไม่ให้ดูเหมือนโหลดช้า)
 * - ถ้าผู้ใช้ตั้ง "ลดการเคลื่อนไหว" ไว้ จะเปลี่ยนเป็นค่าใหม่ทันที
 */
export function AnimatedNumber({
  value,
  format = "int",
  duration = 600,
}: {
  value: number;
  format?: "int" | "money";
  duration?: number;
}) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;

    if (reduced || from === value) {
      fromRef.current = value;
      setShown(value);
      return;
    }

    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      if (progress >= 1) {
        fromRef.current = value;
        setShown(value);
        return;
      }
      setShown(from + (value - from) * eased);
      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      fromRef.current = value;
    };
  }, [value, duration]);

  const text =
    format === "money"
      ? Math.round(shown).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : Math.round(shown).toLocaleString("th-TH");

  return <span className="tabular-nums">{text}</span>;
}
