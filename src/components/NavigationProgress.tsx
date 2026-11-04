"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { recordTableRegionHeight } from "@/components/TableSkeleton";
import {
  NAVIGATION_CANCEL_EVENT,
  NAVIGATION_START_EVENT,
  isSameBrowserUrl,
  setNavigationPending,
} from "@/lib/navigation-progress";
import { cn } from "@/lib/utils";

/**
 * แถบความคืบหน้าด้านบนจอ แสดงทันทีเมื่อผู้ใช้กำลังเปลี่ยนหน้า (สลับเมนู / กดลิงก์ / router.push)
 * ทำหน้าที่เป็น loading ระดับ "หน้าเว็บ" เท่านั้น — ส่วน loading ของตารางมีอยู่แล้วในแต่ละหน้า
 *
 * หลักการ:
 * - หน่วงแสดง 120ms เพื่อไม่ให้แถบกระพริบตอนเปลี่ยนหน้าที่ตอบกลับเร็ว
 * - ซ่อนทันทีเมื่อ pathname หรือ query เปลี่ยน (แปลว่า RSC payload มาถึงแล้ว)
 * - มี safety timeout 15 วินาที กันแถบค้างถ้าการนำทางล้มเหลว
 */
const SHOW_DELAY_MS = 120;
const SAFETY_TIMEOUT_MS = 15_000;

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locationKey = `${pathname ?? ""}?${searchParams?.toString() ?? ""}`;

  const [visible, setVisible] = useState(false);
  const pendingRef = useRef(false);
  const showTimerRef = useRef<number | null>(null);
  const safetyTimerRef = useRef<number | null>(null);
  const lastLocationRef = useRef(locationKey);

  const clearTimers = useCallback(() => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (safetyTimerRef.current !== null) {
      window.clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    pendingRef.current = false;
    clearTimers();
    setVisible(false);
    // แจ้ง skeleton ของตารางว่าข้อมูลใหม่มาถึงแล้ว
    setNavigationPending(false);
  }, [clearTimers]);

  const start = useCallback(() => {
    if (!pendingRef.current) {
      pendingRef.current = true;
      // เปิดใช้ทันที (ไม่หน่วง 120ms) เพื่อให้ skeleton ของตารางขึ้นพร้อมคลิกโดยไม่อ่าน offsetHeight ซ้ำ (ป้องกัน Forced Reflow)
      setNavigationPending(true);
    }
    clearTimers();
    showTimerRef.current = window.setTimeout(() => {
      setVisible(true);
    }, SHOW_DELAY_MS);
    safetyTimerRef.current = window.setTimeout(() => {
      stop();
    }, SAFETY_TIMEOUT_MS);
  }, [clearTimers, stop]);

  // จบการนำทางเมื่อ URL จริงเปลี่ยน (pathname หรือ query)
  useEffect(() => {
    if (locationKey === lastLocationRef.current) return;
    lastLocationRef.current = locationKey;
    stop();
  }, [locationKey, stop]);

  // วัดความสูงตารางแบบไม่อุดตัน Main Thread (ผ่าน ResizeObserver แทนการอ่าน offsetHeight สดตอนคลิก)
  useEffect(() => {
    const tableWrap = document.querySelector(".table-wrap");
    if (!tableWrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      if (h > 240) {
        recordTableRegionHeight(h + 56);
      }
    });
    ro.observe(tableWrap);
    return () => ro.disconnect();
  }, [locationKey]);

  useEffect(() => {
    function isPlainLeftClick(event: MouseEvent) {
      if (event.defaultPrevented) return false;
      if (event.button !== 0) return false;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return false;
      }
      return true;
    }

    function handleClick(event: MouseEvent) {
      if (!isPlainLeftClick(event)) return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.getAttribute("target") === "_blank") return;
      if (anchor.hasAttribute("download")) return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      // ลิงก์ที่ชี้ไปตำแหน่งเดิม (รวม hash หรือลำดับ query ต่างกัน) ไม่ต้องขึ้น loading
      if (isSameBrowserUrl(url.href)) {
        return;
      }
      start();
    }

    function handleNotify() {
      start();
    }

    function handleCancel() {
      stop();
    }

    function updateScrollbarWidthVar() {
      if (document.body.hasAttribute("data-scroll-locked")) return;
      let sbWidth = window.innerWidth - document.documentElement.clientWidth;
      if (sbWidth <= 0) {
        const probe = document.createElement("div");
        probe.style.cssText =
          "position:fixed;top:-9999px;width:100px;height:100px;overflow:scroll;visibility:hidden;pointer-events:none;";
        document.body.appendChild(probe);
        sbWidth = probe.offsetWidth - probe.clientWidth;
        document.body.removeChild(probe);
      }
      if (sbWidth >= 0) {
        document.documentElement.style.setProperty(
          "--app-scrollbar-width",
          `${sbWidth}px`,
        );
      }
    }

    updateScrollbarWidthVar();
    window.addEventListener("resize", updateScrollbarWidthVar, {
      passive: true,
    });
    document.addEventListener("click", handleClick, true);
    window.addEventListener(NAVIGATION_START_EVENT, handleNotify);
    window.addEventListener(NAVIGATION_CANCEL_EVENT, handleCancel);
    return () => {
      window.removeEventListener("resize", updateScrollbarWidthVar);
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener(NAVIGATION_START_EVENT, handleNotify);
      window.removeEventListener(NAVIGATION_CANCEL_EVENT, handleCancel);
      clearTimers();
    };
  }, [clearTimers, start]);

  return (
    <>
      {/* keyframes ผูกกับคอมโพเนนต์ ไม่เพิ่มคลาสใหม่ลง globals.css */}
      <style href="pcms-navigation-progress" precedence="default">{`
        @keyframes pcms-navigation-progress {
          0% { transform: translateX(-100%) scaleX(0.35); }
          55% { transform: translateX(15%) scaleX(0.8); }
          100% { transform: translateX(100%) scaleX(0.35); }
        }
      `}</style>

      <div
        className="no-print pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px] overflow-hidden"
        aria-hidden="true"
      >
        <div
          data-navigation-progress={visible ? "pending" : "idle"}
          className={cn(
            "h-full w-full origin-left rounded-full bg-[linear-gradient(90deg,transparent,var(--primary)_18%,#00f2ea_55%,var(--primary)_82%,transparent)] transition-opacity duration-150 ease-out",
            visible ? "opacity-100" : "opacity-0",
          )}
          style={
            visible
              ? {
                  animation:
                    "pcms-navigation-progress 1.05s cubic-bezier(0.4,0,0.2,1) infinite",
                }
              : undefined
          }
        />
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {visible ? "กำลังเปิดหน้าใหม่" : ""}
      </p>
    </>
  );
}
