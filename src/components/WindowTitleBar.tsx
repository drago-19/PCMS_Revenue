"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  RotateCwIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AppMark } from "./icons";

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

const ROUTE_TITLES: Array<{
  match: (pathname: string) => boolean;
  title: string;
}> = [
  {
    match: (p) => p === "/",
    title: "ภาพรวมสรุปยอด",
  },
  {
    match: (p) =>
      p === "/bills" ||
      p.startsWith("/bills/") ||
      p.startsWith("/invoices/") ||
      p === "/days" ||
      p.startsWith("/days/"),
    title: "บิลคำสั่งซื้อและใบกำกับภาษี",
  },
  {
    match: (p) => p === "/products" || p.startsWith("/products/"),
    title: "สรุปยอดรหัสสินค้า",
  },
  {
    match: (p) =>
      p === "/accounting" ||
      p.startsWith("/accounting/") ||
      p === "/expenses" ||
      p.startsWith("/expenses/"),
    title: "บริหารบัญชี · รายจ่าย · ภาษี",
  },
  {
    match: (p) => p === "/import",
    title: "อัปโหลดไฟล์รายได้",
  },
  {
    match: (p) => p === "/history" || p.startsWith("/import/"),
    title: "ประวัติการนำเข้าไฟล์",
  },
  {
    match: (p) => p === "/settings" || p.startsWith("/settings/"),
    title: "ตั้งค่าเอกสาร / บริษัท",
  },
  {
    match: (p) => p === "/login",
    title: "เข้าสู่ระบบผู้ดูแล",
  },
];

function resolvePageTitle(pathname: string): string {
  const found = ROUTE_TITLES.find((item) => item.match(pathname));
  return found?.title ?? "ระบบจัดการรายได้และใบกำกับภาษี";
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

export function WindowTitleBar({
  companyId = "dragon19",
  companyName,
}: {
  companyId?: "dragon19" | "seeheng";
  companyName?: string;
}) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [active, setActive] = useState(false);
  const [liveCompanyName, setLiveCompanyName] = useState<string | undefined>(
    companyName,
  );

  useEffect(() => {
    setLiveCompanyName(companyName);
  }, [companyName, companyId]);

  useEffect(() => {
    function handleCompanyNameChanged(event: Event) {
      const custom = event as CustomEvent<string>;
      if (typeof custom.detail === "string") {
        setLiveCompanyName(custom.detail);
      }
    }
    window.addEventListener(
      "pcms:company-name-changed",
      handleCompanyNameChanged,
    );
    return () => {
      window.removeEventListener(
        "pcms:company-name-changed",
        handleCompanyNameChanged,
      );
    };
  }, []);

  const syncWcoState = useCallback(() => {
    const isNowActive = detectWcoActive();
    setActive(isNowActive);
    if (typeof document !== "undefined") {
      if (isNowActive) {
        document.documentElement.setAttribute("data-wco-active", "true");
      } else {
        document.documentElement.removeAttribute("data-wco-active");
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
    window.addEventListener("pcms:wco-check", handleGeometryChange);

    return () => {
      wco?.removeEventListener?.("geometrychange", handleGeometryChange);
      mediaQuery.removeEventListener("change", handleGeometryChange);
      window.removeEventListener("pcms:wco-check", handleGeometryChange);
    };
  }, [syncWcoState]);

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined") {
      window.history.back();
    }
  }, []);

  const handleForward = useCallback(() => {
    if (typeof window !== "undefined") {
      window.history.forward();
    }
  }, []);

  const handleRefresh = useCallback(() => {
    startRefreshTransition(() => {
      router.refresh();
    });
  }, [router]);

  const companyLabel =
    liveCompanyName?.trim() ||
    companyName?.trim() ||
    (companyId === "seeheng"
      ? "บริษัท ซีเฮง จำกัด"
      : "บริษัท ดราก้อน 19 จำกัด");

  const pageTitle = resolvePageTitle(pathname);

  if (!active) {
    return null;
  }

  return (
    <header
      data-testid="window-titlebar"
      aria-label="แถบหัวหน้าต่างโปรแกรม PCMS Revenue"
      className="window-titlebar no-print fixed top-0 z-[65] flex select-none items-center justify-between gap-2 border-b border-[#1e293b] bg-[#0f1117] px-2.5 text-white"
    >
      {/* โซนซ้าย: โลโก้ + ชื่อโปรแกรม + ชื่อหน้าปัจจุบัน (พื้นที่ว่างลากหน้าต่างได้) */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link
          href={pathname === "/login" ? "/login" : "/"}
          aria-label="หน้าแรก PCMS Revenue"
          className="window-titlebar-no-drag inline-flex min-h-[28px] shrink-0 items-center gap-2 rounded-md px-1.5 py-0.5 text-xs font-extrabold tracking-tight text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe2c55]"
        >
          <span className="inline-flex size-5 shrink-0 overflow-hidden rounded-[6px] shadow-[0_0_8px_rgba(254,44,85,0.35)]">
            <AppMark size={20} />
          </span>
          <span className="whitespace-nowrap">PCMS Revenue</span>
        </Link>

        <span
          aria-hidden="true"
          className="hidden text-[#475569] min-[480px]:inline"
        >
          /
        </span>

        <span
          data-testid="window-titlebar-page"
          className="hidden truncate text-[11.5px] font-semibold text-[#cbd5e1] min-[480px]:inline"
        >
          {pageTitle}
        </span>
      </div>

      {/* โซนขวา (ก่อนถึงปุ่มย่อ/ขยาย/ปิดของ OS): ป้ายชื่อบริษัท + ปุ่มย้อนกลับ / ไปข้างหน้า / รีเฟรช */}
      <div className="window-titlebar-no-drag flex shrink-0 items-center gap-1">
        {pathname !== "/login" ? (
          <div
            data-testid="window-titlebar-company"
            className=" mr-1 hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-semibold text-[#e2e8f0] min-[768px]:inline-flex"
          >
            <ShieldCheckIcon
              aria-hidden="true"
              className="size-3 shrink-0 text-[#00f2ea]"
            />
            <span className="max-w-[200px] truncate">{companyLabel}</span>
          </div>
        ) : null}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleBack}
              aria-label="ย้อนกลับหน้าก่อนหน้า"
              data-testid="window-titlebar-back-btn"
              className="size-7 min-h-[28px] min-w-[28px] rounded-md text-[#cbd5e1] hover:bg-white/10 hover:text-white"
            >
              <ArrowLeftIcon className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            ย้อนกลับ (Alt + ←)
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleForward}
              aria-label="ไปหน้าถัดไป"
              data-testid="window-titlebar-forward-btn"
              className="size-7 min-h-[28px] min-w-[28px] rounded-md text-[#cbd5e1] hover:bg-white/10 hover:text-white"
            >
              <ArrowRightIcon className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            ไปข้างหน้า (Alt + →)
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="รีเฟรชข้อมูลหน้าปัจจุบัน"
              data-testid="window-titlebar-refresh-btn"
              className="size-7 min-h-[28px] min-w-[28px] rounded-md text-[#cbd5e1] hover:bg-white/10 hover:text-white"
            >
              <RotateCwIcon
                className={cn(
                  "size-3.5",
                  isRefreshing && "motion-safe:animate-spin text-[#00f2ea]",
                )}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            รีเฟรชข้อมูล
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
