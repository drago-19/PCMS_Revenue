"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface WindowControlsOverlayGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WindowControlsOverlay extends EventTarget {
  readonly visible: boolean;
  getTitlebarAreaRect(): DOMRect | WindowControlsOverlayGeometry;
}

declare global {
  interface Navigator {
    windowControlsOverlay?: WindowControlsOverlay;
  }
}

function detectWcoActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.navigator.windowControlsOverlay?.visible) {
      return true;
    }
    if (window.matchMedia("(display-mode: window-controls-overlay)").matches) {
      return true;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("wco") === "1") {
      return true;
    }
    if (document.documentElement.getAttribute("data-wco-active") === "true") {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function syncDynamicThemeColor(pathname: string) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  // หน้าต่างแคบกว่า 1100px (ที่ไม่ใช่หน้า /login) มีแถบ .mobile-topbar สี #0f1117 อยู่ด้านบนสุด
  // ส่วนหน้าต่างตั้งแต่ 1100px ขึ้นไป ด้านขวาบนเป็นพื้นหลังเนื้อหาสี #f1f4f9
  const isCompactTopbarVisible =
    pathname !== "/login" && window.innerWidth < 1100;
  const targetColor = isCompactTopbarVisible ? "#0f1117" : "#f1f4f9";

  const metaTags = document.querySelectorAll('meta[name="theme-color"]');
  if (metaTags.length === 0) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = targetColor;
    document.head.appendChild(meta);
    return;
  }
  metaTags.forEach((tag) => {
    const media = tag.getAttribute("media");
    if (!media) {
      tag.setAttribute("content", targetColor);
    }
  });
}

/**
 * โหมด Window Controls Overlay (ซ่อนแถบหัวสีดำเดิมของเบราว์เซอร์ 100%):
 * - ไม่แสดงแถบสีดำหรือโลโก้ซ้ำด้านบน เพื่อให้ Sidebar และเนื้อหาหลักดันขึ้นชิดขอบบนสุดของหน้าต่างโปรแกรม (top: 0)
 * - ปรับสีพื้นหลังปุ่มย่อ/ขยาย/ปิด มุมขวาบน (`meta[name="theme-color"]`) ตามความกว้างหน้าต่างอัตโนมัติ:
 *   - หน้าต่าง < 1100px (มีแถบหัว `.mobile-topbar` สีดำ `#0f1117`): ใช้สี `#0f1117` กลืนเป็นเนื้อเดียวกับแถบหัว ไม่เกิดกล่องสีขาวทับมุมขวาบน
 *   - หน้าต่าง >= 1100px (แสดง Sidebar ด้านซ้าย + เนื้อหาสีสว่าง `#f1f4f9` ด้านขวา): ใช้สี `#f1f4f9` กลืนกับพื้นหลังด้านขวา
 */
export function WindowTitleBar({
  companyId: _companyId = "dragon19",
  companyName: _companyName,
}: {
  companyId?: "dragon19" | "seeheng";
  companyName?: string;
}) {
  const pathname = usePathname() || "/";
  const [active, setActive] = useState(false);

  const syncWcoState = useCallback(() => {
    const isNowActive = detectWcoActive();
    setActive(isNowActive);
    syncDynamicThemeColor(pathname);

    if (typeof document !== "undefined") {
      const root = document.documentElement;
      if (isNowActive) {
        root.setAttribute("data-wco-active", "true");
        const rect =
          window.navigator.windowControlsOverlay?.getTitlebarAreaRect?.();
        if (rect && rect.width > 0 && window.innerWidth > rect.width) {
          const rightInset = Math.max(
            0,
            Math.round(window.innerWidth - (rect.x + rect.width)),
          );
          root.style.setProperty("--wco-right-inset", `${rightInset}px`);
        } else {
          root.style.setProperty("--wco-right-inset", "140px");
        }
      } else {
        root.removeAttribute("data-wco-active");
        root.style.setProperty("--wco-right-inset", "0px");
      }
    }
  }, [pathname]);

  useEffect(() => {
    syncWcoState();

    const wco = window.navigator.windowControlsOverlay;
    const mediaQuery = window.matchMedia(
      "(display-mode: window-controls-overlay)",
    );
    const breakpointQuery = window.matchMedia("(max-width: 1099px)");

    const handleGeometryChange = () => {
      syncWcoState();
    };

    wco?.addEventListener?.("geometrychange", handleGeometryChange);
    mediaQuery.addEventListener("change", handleGeometryChange);
    breakpointQuery.addEventListener("change", handleGeometryChange);
    window.addEventListener("resize", handleGeometryChange, { passive: true });
    window.addEventListener("pcms:wco-check", handleGeometryChange);

    return () => {
      wco?.removeEventListener?.("geometrychange", handleGeometryChange);
      mediaQuery.removeEventListener("change", handleGeometryChange);
      breakpointQuery.removeEventListener("change", handleGeometryChange);
      window.removeEventListener("resize", handleGeometryChange);
      window.removeEventListener("pcms:wco-check", handleGeometryChange);
    };
  }, [syncWcoState]);

  if (!active) {
    return null;
  }

  return (
    <div
      data-testid="window-titlebar"
      aria-hidden="true"
      className="window-titlebar no-print pointer-events-none fixed top-0 z-[65] select-none"
    />
  );
}
