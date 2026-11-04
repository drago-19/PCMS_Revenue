"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ParsedAnimatedValue {
  prefix: string;
  targetNumber: number;
  decimals: number;
  useGrouping: boolean;
  suffix: string;
}

/**
 * แยกข้อความตัวเลข เช่น:
 * - "฿15,483,318.26" -> prefix: "฿", targetNumber: 15483318.26, decimals: 2
 * - "-฿47,703.72" -> prefix: "-฿", targetNumber: 47703.72, decimals: 2
 * - "+฿14,479.50" -> prefix: "+฿", targetNumber: 14479.50, decimals: 2
 * - "฿15.5M" -> prefix: "฿", targetNumber: 15.5, decimals: 1, suffix: "M"
 * - "38,268 ใบ" -> prefix: "", targetNumber: 38268, decimals: 0, suffix: " ใบ"
 * - "85.4%" -> prefix: "", targetNumber: 85.4, decimals: 1, suffix: "%"
 *
 * ข้ามการแอนิเมตสำหรับวันที่ เช่น "04/11/2026" หรือ "2026-11-04"
 */
export function parseAnimatedValueString(value: string): ParsedAnimatedValue | null {
  if (!value) return null;
  // ข้ามข้อความที่เป็นรูปแบบวันที่ เช่น DD/MM/YYYY หรือ YYYY-MM-DD
  if (/^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/.test(value.trim())) {
    return null;
  }

  const match = /^([^\d]*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(value);
  if (!match) return null;

  const [, prefix, rawNumStr, suffix] = match;
  // หาก suffix ขึ้นต้นด้วย / หรือ - ตามด้วยตัวเลข แปลว่าเป็นวันที่หรือรหัส ไม่ต้องแอนิเมต
  if (/^[/-]\d/.test(suffix)) {
    return null;
  }

  const cleanNumStr = rawNumStr.replace(/,/g, "");
  const targetNumber = Number(cleanNumStr);
  if (!Number.isFinite(targetNumber)) return null;

  const dotIdx = cleanNumStr.indexOf(".");
  const decimals = dotIdx >= 0 ? cleanNumStr.length - dotIdx - 1 : 0;
  const useGrouping = rawNumStr.includes(",") || targetNumber >= 1000;

  return {
    prefix,
    targetNumber,
    decimals,
    useGrouping,
    suffix,
  };
}

export function formatAnimatedNumberFrame(
  current: number,
  parsed: ParsedAnimatedValue,
): string {
  const factor = Math.pow(10, parsed.decimals);
  const rounded = Math.round(current * factor) / factor;

  let formattedNum: string;
  if (parsed.useGrouping) {
    formattedNum = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: parsed.decimals,
      maximumFractionDigits: parsed.decimals,
    }).format(rounded);
  } else {
    formattedNum = rounded.toFixed(parsed.decimals);
  }

  return `${parsed.prefix}${formattedNum}${parsed.suffix}`;
}

export function AnimatedValueText({
  value,
  duration = 200,
  className,
}: {
  value: string;
  duration?: number;
  className?: string;
}) {
  const [displayValue, setDisplayValue] = useState<string>(value);
  const rafRef = useRef<number | null>(null);
  const prevValueRef = useRef<string>(value);

  useEffect(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // ตอนเปิดหน้าครั้งแรก (Initial Mount) หรือค่าไม่เปลี่ยน: แสดงค่าจริงทันทีเพื่อไม่ให้หน่วง LCP และไม่บล็อก Main Thread
    if (prevValueRef.current === value) {
      setDisplayValue(value);
      return;
    }

    const prevParsed = parseAnimatedValueString(prevValueRef.current);
    prevValueRef.current = value;

    const parsed = parseAnimatedValueString(value);
    if (!parsed || parsed.targetNumber === 0) {
      setDisplayValue(value);
      return;
    }

    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplayValue(value);
      return;
    }

    const startNumber =
      prevParsed && prevParsed.suffix === parsed.suffix ? prevParsed.targetNumber : 0;
    const effectiveDuration = Math.min(300, Math.max(150, duration));
    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (startTime === null) {
        startTime = timestamp;
      }
      const elapsed = timestamp - startTime;
      const progress = Math.min(1, elapsed / effectiveDuration);
      // easeOutQuart: วิ่งเข้าสู่ค่าจริงอย่างนุ่มนวลภายใน 200ms
      const eased = 1 - Math.pow(1 - progress, 4);

      if (progress < 1) {
        const currentVal =
          startNumber + (parsed.targetNumber - startNumber) * eased;
        setDisplayValue(formatAnimatedNumberFrame(currentVal, parsed));
        rafRef.current = window.requestAnimationFrame(step);
      } else {
        setDisplayValue(value);
        rafRef.current = null;
      }
    };

    rafRef.current = window.requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, duration]);

  return (
    <span className={cn("tabular-nums", className)} data-animated-value={value}>
      {displayValue}
    </span>
  );
}
