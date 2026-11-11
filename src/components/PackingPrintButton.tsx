"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { IconPrinter, IconSpinner } from "@/components/icons";

/** เพดานเวลารอรูปก่อนเปิดหน้าต่างพิมพ์ — กันค้างนานถ้า CDN รูปตอบช้า */
const PRINT_WAIT_MS = 10_000;
/** เพดานเวลารอให้ป๊อปอัปที่เลือกปิดสนิทก่อนสั่งพิมพ์ (ไม่งั้นป๊อปอัปติดไปในกระดาษ) */
const DIALOG_CLOSE_MS = 1_500;

export interface PackingRoundOption {
  value: string;
  label: string;
  orders: number;
}

/** ซ่อนรอบที่ไม่เลือกไว้ชั่วคราวตอนพิมพ์ — คืนค่าด้วย clearPrintScope */
function setPrintScope(scope: string) {
  document.querySelectorAll<HTMLElement>("[data-packing-round]").forEach((panel) => {
    if (scope !== "all" && panel.dataset.packingRound !== scope) {
      panel.style.setProperty("display", "none", "important");
    } else {
      panel.style.removeProperty("display");
    }
  });
}

function clearPrintScope() {
  document.querySelectorAll<HTMLElement>("[data-packing-round]").forEach((panel) => {
    panel.style.removeProperty("display");
  });
}

/** รอจนป๊อปอัปถูกถอดออกจาก DOM — กันมันติดไปในกระดาษที่พิมพ์ */
function waitForDialogClose(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const tick = () => {
      if (!document.querySelector('[role="dialog"]') || performance.now() - startedAt > timeoutMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * ปุ่มพิมพ์ของหน้าแพ็คออเดอร์
 *
 * 1) กดแล้วให้เลือกรอบ (ก่อน/หลัง 14.00 น. หรือทั้งหมด) — พิมพ์เฉพาะรอบที่เลือก
 * 2) รูปสินค้าใช้ loading="lazy" อยู่ จึงสั่งโหลดรูปของรอบที่จะพิมพ์แล้วรอจนพร้อม
 *    ก่อนเรียก window.print() — กันรูปหายและกันหน้าต่างพิมพ์ค้างรอรูป
 */
export function PackingPrintButton({
  imageUrls,
  rounds,
}: {
  imageUrls: readonly string[];
  rounds: PackingRoundOption[];
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const imageUrlsRef = useRef(imageUrls);
  imageUrlsRef.current = imageUrls;

  useEffect(() => {
    const restore = () => clearPrintScope();
    window.addEventListener("afterprint", restore);
    return () => {
      window.removeEventListener("afterprint", restore);
      clearPrintScope();
    };
  }, []);

  const printScope = async (scope: string) => {
    setOpen(false);
    setBusy(true);
    try {
      await waitForDialogClose(DIALOG_CLOSE_MS);
      setPrintScope(scope);

      // เอาเฉพาะรูปของรอบที่เลือก — ร้านที่ไม่ได้เปิดแท็บอยู่ก็พิมพ์ออก จึงดูที่การซ่อนของรอบเท่านั้น
      const images = Array.from(
        document.querySelectorAll<HTMLImageElement>("img[data-packing-thumb]"),
      ).filter((image) => {
        const panel = image.closest<HTMLElement>("[data-packing-round]");
        return !panel || panel.style.display !== "none";
      });
      images.forEach((image) => {
        image.loading = "eager";
      });

      const decoded = images.map((image) => image.decode().catch(() => undefined));
      await Promise.race([
        Promise.all(decoded),
        new Promise((resolve) => window.setTimeout(resolve, PRINT_WAIT_MS)),
      ]);

      window.print();
    } finally {
      clearPrintScope();
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="default"
          className="no-print"
          aria-label="พิมพ์ หรือ บันทึก PDF"
          aria-busy={busy}
          disabled={busy}
        >
          {busy ? <IconSpinner size={17} /> : <IconPrinter size={17} />}
          {busy ? "กำลังเตรียมพิมพ์…" : "พิมพ์ / บันทึก PDF"}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-[min(94vw,420px)]">
        <DialogHeader className="pr-11">
          <DialogTitle className="text-base">พิมพ์ใบแพ็ค</DialogTitle>
          <DialogDescription>
            เลือกรอบที่จะพิมพ์ — พิมพ์เฉพาะรอบที่เลือกเพื่อไม่ให้กระดาษเยอะเกิน
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {rounds.map((round) => (
            <Button
              key={round.value}
              type="button"
              variant="outline"
              className="h-11 justify-start"
              disabled={round.orders === 0}
              onClick={() => printScope(round.value)}
            >
              {round.label} · {round.orders} ออเดอร์
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            className="h-11 justify-start"
            onClick={() => printScope("all")}
          >
            ทั้งหมด (ทุกรอบ)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
