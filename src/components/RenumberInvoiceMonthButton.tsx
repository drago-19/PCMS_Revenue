"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { IconReceipt } from "./icons";

function currentMonthKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  return parts.slice(0, 7);
}

export function RenumberInvoiceMonthButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(currentMonthKey);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleRenumber() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/invoices/renumber", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const payload = (await response.json()) as {
        error?: string;
        renumbered?: number;
      };
      if (!response.ok) {
        const msg = payload.error ?? "จัดเรียงเลขไม่สำเร็จ";
        setError(msg);
        toast.error(msg);
        return;
      }
      setOpen(false);
      toast.success(
        `จัดเรียงเลขเดือน ${month} ใหม่แล้ว ${payload.renumbered ?? 0} ใบ`,
      );
      router.refresh();
    } catch {
      const msg = "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = confirmText.trim() === month && !busy;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={busy} loading={busy}>
          <IconReceipt size={16} /> จัดเรียงเลขใบกำกับฯ
        </Button>
      </DialogTrigger>
      <DialogContent className="no-print max-w-lg">
        <DialogHeader className="pr-11">
          <DialogTitle>จัดเรียงเลขใบกำกับฯ ใหม่ทั้งเดือน</DialogTitle>
          <DialogDescription>
            เรียงเลขใหม่ 1, 2, 3 … ตาม <strong>เวลาที่ชำระคำสั่งซื้อ</strong>{" "}
            (วันที่เดียวกับที่พิมพ์บนบิล) ทำได้เฉพาะเดือนที่ยังไม่มีใบไหนถูกพิมพ์
            เพราะเลขที่ขึ้นกระดาษไปแล้วเลื่อนไม่ได้ ใบที่ถูกยกเลิกจะได้เลขต่อท้าย
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-sm font-semibold text-[#334155]">
            เดือนที่ต้องการจัดเรียงเลข
            <Input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value.slice(0, 7))}
              disabled={busy}
              className="w-full sm:w-56"
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <label className="flex flex-col gap-1 text-sm font-semibold text-[#334155]">
            พิมพ์ {month} เพื่อยืนยัน
            <Input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={month}
              disabled={busy}
              className="w-full sm:w-56"
            />
          </label>
        </div>

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={busy}>
              ยกเลิก
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={handleRenumber}
            disabled={!canSubmit}
            loading={busy}
          >
            {busy ? "กำลังจัดเรียง..." : "ยืนยันจัดเรียงเลข"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
