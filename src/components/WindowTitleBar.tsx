"use client";

import { useCallback, useEffect, useState } from "react";

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

/**
 * โหมด Window Controls Overlay (ซ่อนแถบหัวสีดำเดิมของเบราว์เซอร์ 100%):
 * - ไม่แสดงแถบสีดำหรือโลโก้ซ้ำด้านบน เพื่อให้ Sidebar และเนื้อหาหลักดันขึ้นชิดขอบบนสุดของหน้าต่างโปรแกรม (top: 0)
 * - วางแถบลากหน้าต่างแบบใส (Invisible Drag Region) เฉพาะขอบบนสุด 16px เพื่อใช้คลิกค้างลากย้ายหน้าต่างโปรแกรมได้โดยไม่บังปุ่มหรือเมนูใดๆ
 * - คำนวณความกว้างของปุ่มย่อ/ขยาย/ปิด มุมขวาบน (`--wco-right-inset`) เพื่อเว้นระยะในส่วนหัวการ์ดหรือแถบมือถืออัตโนมัติ
 */
export function WindowTitleBar({
  companyId: _companyId = "dragon19",
  companyName: _companyName,
}: {
  companyId?: "dragon19" | "seeheng";
  companyName?: string;
}) {
  const [active, setActive] = useState(false);

  const syncWcoState = useCallback(() => {
    const isNowActive = detectWcoActive();
    setActive(isNowActive);
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
  }, []);

  useEffect(() => {
    syncWcoState();

    const wco = window.navigator.windowControlsOverlay;
    const mediaQuery = window.matchMedia(
      "(display-mode: window-controls-overlay)",
    );

    const handleGeometryChange = () => {
      syncWcoState();
    };

    wco?.addEventListener?.("geometrychange", handleGeometryChange);
    mediaQuery.addEventListener("change", handleGeometryChange);
    window.addEventListener("resize", handleGeometryChange, { passive: true });
    window.addEventListener("pcms:wco-check", handleGeometryChange);

    return () => {
      wco?.removeEventListener?.("geometrychange", handleGeometryChange);
      mediaQuery.removeEventListener("change", handleGeometryChange);
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
