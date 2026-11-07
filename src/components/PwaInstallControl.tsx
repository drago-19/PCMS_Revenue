"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2Icon,
  DownloadIcon,
  MonitorDownIcon,
  MoreVerticalIcon,
  PlusSquareIcon,
  ShareIcon,
  SmartphoneIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice?: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<{ outcome?: "accepted" | "dismissed" } | void>;
}

declare global {
  interface Window {
    __pcmsDeferredPrompt?: BeforeInstallPromptEvent | null;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    window.__pcmsDeferredPrompt = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new CustomEvent("pcms:pwa-prompt-ready"));
  });
}

function detectStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  const isStandaloneDisplay =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches;
  const isIosStandalone =
    Boolean(
      (window.navigator as Navigator & { standalone?: boolean }).standalone,
    );
  return isStandaloneDisplay || isIosStandalone;
}

function detectIosDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  const isIphoneOrIpad = /iPad|iPhone|iPod/i.test(ua);
  const isIpadOs =
    window.navigator.platform === "MacIntel" &&
    window.navigator.maxTouchPoints > 1;
  return isIphoneOrIpad || isIpadOs;
}

export function PwaInstallControl({
  variant = "sidebar",
  onAction,
}: {
  variant?: "sidebar" | "topbar";
  onAction?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsStandalone(detectStandaloneMode());
    setIsIos(detectIosDevice());

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => undefined);
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      window.__pcmsDeferredPrompt = event as BeforeInstallPromptEvent;
    }

    function handleAppInstalled() {
      window.__pcmsDeferredPrompt = null;
      setIsStandalone(true);
      setGuideOpen(false);
      toast.success("ติดตั้งแอป PCMS Revenue ลงเครื่องเรียบร้อยแล้ว");
    }

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const wcoQuery = window.matchMedia(
      "(display-mode: window-controls-overlay)",
    );
    function handleDisplayModeChange(e: MediaQueryListEvent) {
      if (e.matches) {
        setIsStandalone(true);
      }
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    mediaQuery.addEventListener("change", handleDisplayModeChange);
    wcoQuery.addEventListener("change", handleDisplayModeChange);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
      mediaQuery.removeEventListener("change", handleDisplayModeChange);
      wcoQuery.removeEventListener("change", handleDisplayModeChange);
    };
  }, []);

  if (!mounted || isStandalone) {
    return null;
  }

  function handleInstallClick() {
    const activePrompt = window.__pcmsDeferredPrompt;
    if (activePrompt && typeof activePrompt.prompt === "function") {
      window.__pcmsDeferredPrompt = null;
      try {
        const promptPromise = Promise.resolve(activePrompt.prompt());
        promptPromise
          .then((res) => {
            if (res && typeof res === "object" && res.outcome === "accepted") {
              onAction?.();
            }
          })
          .catch(() => {
            setGuideOpen(true);
          });
        if (activePrompt.userChoice) {
          Promise.resolve(activePrompt.userChoice)
            .then((choice) => {
              if (choice?.outcome === "accepted") {
                onAction?.();
              }
            })
            .catch(() => undefined);
        }
        return;
      } catch {
        setGuideOpen(true);
        return;
      }
    }

    setGuideOpen(true);
  }

  return (
    <>
      {variant === "topbar" ? (
        <Button
          type="button"
          variant="outline-light"
          size="sm"
          onClick={handleInstallClick}
          aria-label="ติดตั้งแอป PCMS Revenue ลงเครื่อง"
          data-testid="pwa-install-topbar-btn"
          className="no-print ml-auto min-h-[40px] min-w-[40px] shrink-0 justify-center gap-1.5 border-[#00f2ea]/40 bg-[#00f2ea]/10 px-2.5 text-xs font-bold text-[#00f2ea] hover:bg-[#00f2ea] hover:text-[#0f1117]"
        >
          <DownloadIcon className="size-4 shrink-0" />
          <span className="hidden min-[420px]:inline">ติดตั้งแอป</span>
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline-light"
          size="sm"
          onClick={handleInstallClick}
          aria-label="ติดตั้งแอปลงเครื่อง Desktop หรือมือถือ"
          data-testid="pwa-install-sidebar-btn"
          className={cn(
            "no-print w-full justify-start border-[#00f2ea]/40 bg-[#00f2ea]/10 text-xs font-semibold text-[#00f2ea] hover:bg-[#00f2ea] hover:text-[#0f1117]",
          )}
        >
          <MonitorDownIcon className="size-3.5 shrink-0" />
          <span className="truncate">ติดตั้งแอปลงเครื่อง</span>
        </Button>
      )}

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent
          className="no-print sm:max-w-[480px]"
          data-testid="pwa-install-dialog"
        >
          <DialogHeader className="pr-12 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className="bg-[#0f172a] text-white hover:bg-[#0f172a]"
              >
                {isIos ? "iOS · iPhone / iPad" : "Desktop & Mobile PWA"}
              </Badge>
              <Badge
                variant="outline"
                className="border-emerald-300 bg-emerald-50 text-emerald-950"
              >
                พร้อมติดตั้ง
              </Badge>
            </div>
            <DialogTitle className="mt-1 text-base font-bold text-[#0f172a]">
              {isIos
                ? "วิธีติดตั้งแอป PCMS Revenue บน iPhone / iPad"
                : "วิธีติดตั้งแอป PCMS Revenue ลงบนหน้าจอ Desktop"}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-[#475569]">
              {isIos
                ? "สร้างไอคอนแอปไว้บนหน้าจอโฮมเพื่อเปิดใช้งานแบบเต็มจอเหมือนแอปทั่วไป"
                : "สร้างไอคอนไว้บนหน้าจอ Desktop, Taskbar หรือ Start Menu เพื่อเปิดใช้งานเป็นหน้าต่างโปรแกรมแยกโดยตรง"}
            </DialogDescription>
          </DialogHeader>

          {isIos ? (
            <div className="flex flex-col gap-3 py-1 text-xs text-[#0f172a]">
              <div className="flex items-start gap-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3">
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#0f172a] font-bold text-white">
                  1
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-bold text-[#0f172a]">
                    แตะปุ่ม &ldquo;แชร์&rdquo; บนแถบเบราว์เซอร์
                  </span>
                  <span className="text-[#475569]">
                    มองหาไอคอน{" "}
                    <ShareIcon className="inline size-3.5 text-[#0284c7]" />{" "}
                    ด้านล่างหน้าจอ หรือมุมขวาบนของเบราว์เซอร์
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3">
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#0f172a] font-bold text-white">
                  2
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-bold text-[#0f172a]">
                    เลือก &ldquo;เพิ่มไปยังหน้าจอโฮม&rdquo;
                  </span>
                  <span className="text-[#475569]">
                    เลื่อนเมนูลงมาแล้วแตะแถบที่มีไอคอน{" "}
                    <PlusSquareIcon className="inline size-3.5 text-[#0f172a]" />{" "}
                    <strong>เพิ่มไปยังหน้าจอโฮม</strong>
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3">
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 font-bold text-white">
                  3
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-bold text-[#0f172a]">
                    แตะปุ่ม &ldquo;เพิ่ม&rdquo; มุมขวาบน
                  </span>
                  <span className="text-[#475569]">
                    ไอคอน <strong>PCMS Revenue</strong> จะปรากฏบนหน้าจอโฮมทันที
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 py-1 text-xs text-[#0f172a]">
              <div className="flex items-start gap-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3">
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#0f172a] font-bold text-white">
                  1
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-bold text-[#0f172a]">
                    คลิกไอคอนติดตั้งบนแถบ URL ด้านบน (เร็วที่สุด)
                  </span>
                  <span className="text-[#475569]">
                    มองหาไอคอนรูปหน้าจอ{" "}
                    <MonitorDownIcon className="inline size-3.5 text-[#0284c7]" />{" "}
                    ทางด้านขวาของช่องพิมพ์ URL บน Chrome หรือ Edge แล้วกด{" "}
                    <strong>ติดตั้ง</strong>
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3">
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#0f172a] font-bold text-white">
                  2
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-bold text-[#0f172a]">
                    หรือติดตั้งผ่านเมนูมุมขวาบนของเบราว์เซอร์
                  </span>
                  <ul className="mt-1 flex flex-col gap-1 text-[#475569]">
                    <li>
                      • <strong>Google Chrome</strong>: กดปุ่ม{" "}
                      <MoreVerticalIcon className="inline size-3.5" /> มุมขวาบน
                      → <strong>แคสต์ บันทึก และแชร์</strong> →{" "}
                      <strong>ติดตั้งหน้าเป็นแอป...</strong>
                    </li>
                    <li>
                      • <strong>Microsoft Edge</strong>: กดปุ่ม{" "}
                      <strong>...</strong> มุมขวาบน → <strong>แอป</strong>{" "}
                      → <strong>ติดตั้งไซต์นี้เป็นแอป</strong>
                    </li>
                    <li>
                      • <strong>มือถือ Android</strong>: กดปุ่ม{" "}
                      <SmartphoneIcon className="inline size-3.5" /> มุมขวาบน →{" "}
                      <strong>ติดตั้งแอป / เพิ่มลงในหน้าจอหลัก</strong>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3">
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#0f172a] font-bold text-white">
                  3
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-bold text-[#0f172a]">
                    ซ่อนแถบเมนูและชื่อเว็บไซต์ด้านบนให้เหมือนโปรแกรมเต็มจอ
                  </span>
                  <span className="text-[#475569]">
                    หลังเปิดหน้าต่างแอป ให้คลิกปุ่มลูกศรชี้ขึ้น{" "}
                    <strong>⌃ (ซ่อนแถบชื่อเรื่อง / Hide title bar)</strong>{" "}
                    มุมขวาบนใกล้ปุ่มย่อ/ขยาย เพื่อเปิดใช้แถบควบคุมด่วนของโปรแกรม
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-950">
                <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600" />
                <span>
                  เมื่อติดตั้งแล้ว ปุ่มนี้จะซ่อนตัวเองอัตโนมัติในหน้าต่างแอป
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="pt-1">
            <DialogClose asChild>
              <Button
                type="button"
                variant="default"
                onClick={() => onAction?.()}
              >
                เข้าใจแล้ว
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
