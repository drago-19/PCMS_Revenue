"use client";

import { useEffect, useRef, useState } from "react";
import { ZoomInIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export type InvoicePreviewZoom = "100" | "150" | "200" | "250" | "300";

const STORAGE_KEY = "pcms_invoice_preview_zoom_v1";
const SYNC_EVENT = "pcms-invoice-zoom-change";
const PAPER_BASE_WIDTH_PX = 356;
const SHEET_4UP_TWO_COL_WIDTH_PX = 726;

function normalizeZoom(raw: string | null | undefined): InvoicePreviewZoom {
  if (
    raw === "100" ||
    raw === "150" ||
    raw === "200" ||
    raw === "250" ||
    raw === "300"
  ) {
    return raw;
  }
  if (raw === "140") return "150";
  if (raw === "175") return "200";
  return "150";
}

function findMeasureContainer(anchor: HTMLElement | null): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (anchor) {
    const dialog = anchor.closest('[role="dialog"]');
    if (dialog) {
      const dialogScroll = dialog.querySelector<HTMLElement>(
        "[data-invoice-scroll-container]",
      );
      if (dialogScroll) return dialogScroll;
    }
    const settingsCard = anchor.closest("[data-invoice-preview-card]");
    if (settingsCard) {
      const pane = settingsCard.querySelector<HTMLElement>(
        "[data-invoice-scroll-container]",
      );
      if (pane) return pane;
    }
  }
  return (
    document.querySelector<HTMLElement>(".app-content") ??
    document.documentElement
  );
}

function resetZoomForPrint(anchor: HTMLElement | null) {
  if (typeof document === "undefined") return;
  const container = findMeasureContainer(anchor);
  if (!container) return;
  container.style.setProperty("--invoice-zoom", "1");
  container.style.setProperty("--invoice-4up-zoom", "1");
  container.dataset.invoice4upCols = "2";
}

function applyResponsiveZoom(
  zoom: InvoicePreviewZoom,
  anchor: HTMLElement | null,
) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.invoiceZoom = zoom;

  if (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("print").matches
  ) {
    resetZoomForPrint(anchor);
    return;
  }

  const container = findMeasureContainer(anchor);
  if (!container) return;

  const style = window.getComputedStyle(container);
  const padLeft = Number.parseFloat(style.paddingLeft) || 0;
  const padRight = Number.parseFloat(style.paddingRight) || 0;
  const innerWidth = Math.max(0, container.clientWidth - padLeft - padRight);

  // คำนวณเพดานซูมสูงสุดที่ไม่ทำให้กระดาษ 356px ล้นกรอบหรือถูกบีบความกว้างภายในต่ำกว่า 356px
  const safeAvailableWidth = Math.max(PAPER_BASE_WIDTH_PX, innerWidth - 12);
  const maxFitZoom = Math.max(
    1,
    Math.min(3, safeAvailableWidth / PAPER_BASE_WIDTH_PX),
  );

  const t = (Number(zoom) - 100) / 200; // 0, 0.25, 0.5, 0.75, 1.0
  const desiredZoom = 1 + t * 2; // 1.0, 1.5, 2.0, 2.5, 3.0
  const effectiveZoom =
    maxFitZoom >= 3
      ? desiredZoom
      : Number((1 + t * (maxFitZoom - 1)).toFixed(3));

  // สำหรับแผ่น A4 แบ่ง 4 ใบ: ถ้าซูมแล้ววางคู่ 2 คอลัมน์ (726px * zoom) เกินความกว้างกรอบ ให้สลับเรียงเป็น 1 คอลัมน์อัตโนมัติ
  let effective4UpZoom = effectiveZoom;
  let cols4Up: "1" | "2" = "2";
  if (SHEET_4UP_TWO_COL_WIDTH_PX * effectiveZoom <= safeAvailableWidth) {
    cols4Up = "2";
    effective4UpZoom = effectiveZoom;
  } else if (zoom === "150" && SHEET_4UP_TWO_COL_WIDTH_PX * 1.25 <= safeAvailableWidth) {
    cols4Up = "2";
    effective4UpZoom = Number(
      Math.min(
        effectiveZoom,
        safeAvailableWidth / SHEET_4UP_TWO_COL_WIDTH_PX,
      ).toFixed(3),
    );
  } else {
    cols4Up = "1";
    effective4UpZoom = effectiveZoom;
  }

  container.style.setProperty("--invoice-zoom", String(effectiveZoom));
  container.style.setProperty("--invoice-4up-zoom", String(effective4UpZoom));
  container.dataset.invoice4upCols = cols4Up;
}

export function InvoiceZoomControl({
  compact = false,
}: {
  compact?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<InvoicePreviewZoom>("150");

  useEffect(() => {
    let initial: InvoicePreviewZoom = "150";
    try {
      initial = normalizeZoom(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      initial = "150";
    }
    setZoom(initial);
    applyResponsiveZoom(initial, rootRef.current);

    const container = findMeasureContainer(rootRef.current);
    let ro: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        const current = normalizeZoom(
          document.documentElement.dataset.invoiceZoom ?? initial,
        );
        applyResponsiveZoom(current, rootRef.current);
      });
      ro.observe(container);
    }

    function handleSync(e: Event) {
      const custom = e as CustomEvent<InvoicePreviewZoom>;
      const next = normalizeZoom(custom.detail);
      setZoom(next);
      applyResponsiveZoom(next, rootRef.current);
    }

    function handleWindowResize() {
      if (window.matchMedia && window.matchMedia("print").matches) {
        resetZoomForPrint(rootRef.current);
        return;
      }
      const current = normalizeZoom(
        document.documentElement.dataset.invoiceZoom ?? initial,
      );
      applyResponsiveZoom(current, rootRef.current);
    }

    function handleBeforePrint() {
      resetZoomForPrint(rootRef.current);
    }

    function handleAfterPrint() {
      const current = normalizeZoom(
        document.documentElement.dataset.invoiceZoom ?? initial,
      );
      applyResponsiveZoom(current, rootRef.current);
    }

    window.addEventListener(SYNC_EVENT, handleSync);
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener(SYNC_EVENT, handleSync);
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
      ro?.disconnect();
    };
  }, []);

  function handleSelect(next: InvoicePreviewZoom) {
    setZoom(next);
    applyResponsiveZoom(next, rootRef.current);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: next }));
    } catch {
      // ignore storage errors
    }
  }

  const options: { key: InvoicePreviewZoom; label: string }[] = [
    { key: "100", label: "100%" },
    { key: "150", label: compact ? "150%" : "150% (อ่านง่าย)" },
    { key: "200", label: "200%" },
    { key: "250", label: "250%" },
    { key: "300", label: "300%" },
  ];

  return (
    <div
      ref={rootRef}
      className="no-print hidden flex-wrap items-center gap-1.5 sm:flex"
    >
      <span className="inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap text-[#334155]">
        <ZoomInIcon className="size-3.5 text-[#64748b]" />
        ซูมหน้าจอ:
      </span>
      <div
        role="group"
        aria-label="ระดับการซูมตัวอย่างใบพิมพ์บนหน้าจอ"
        className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border bg-white p-1 shadow-2xs"
      >
        {options.map((opt) => {
          const active = zoom === opt.key;
          return (
            <Button
              key={opt.key}
              type="button"
              variant={active ? "default" : "ghost"}
              size="xs"
              aria-pressed={active}
              onClick={() => handleSelect(opt.key)}
              className={
                active
                  ? "h-8 min-h-[32px] px-2.5 shadow-2xs"
                  : "h-8 min-h-[32px] px-2.5 text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
              }
            >
              {opt.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
