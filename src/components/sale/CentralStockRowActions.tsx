"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * จัดการรหัสกลางต่อแถว: ปรับจำนวน (เติม/ตัด) · เปลี่ยนชื่อ · เลิกใช้รหัส
 * เลิกใช้ = ซ่อนจากรายการและตัดการผูก แต่ประวัติการเคลื่อนไหวอยู่ครบ
 */
export function CentralStockRowActions({
  skuCode,
  productName,
  onHand,
}: {
  skuCode: string;
  productName: string | null;
  onHand: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(productName ?? "");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const quantity = Math.trunc(Number(amount));
  const amountValid = Number.isFinite(quantity) && quantity !== 0 && Math.abs(quantity) <= 1_000_000;

  async function post(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const response = await fetch("/api/platform/central-stock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      setError(typeof payload.error === "string" ? payload.error : "ทำรายการไม่สำเร็จ");
      return null;
    }
    setError(null);
    return payload;
  }

  async function saveName() {
    if (busy) return;
    setBusy("rename");
    setNotice(null);
    const result = await post({ action: "rename", skuCode, productName: name });
    setBusy(null);
    if (!result) return;
    setNotice("บันทึกชื่อแล้ว");
    router.refresh();
  }

  async function adjust(sign: 1 | -1) {
    if (busy || !amountValid) return;
    setBusy("adjust");
    setNotice(null);
    const result = await post({ action: "receive", skuCode, quantity: sign * quantity });
    setBusy(null);
    if (!result) return;
    const pushed = Number(result.pushed ?? 0);
    const failed = Number(result.pushFailed ?? 0);
    setAmount("");
    setNotice(
      `${sign > 0 ? "เติม" : "ตัด"} ${Math.abs(quantity)} แล้ว · ยอดกลางเหลือ ${Number(result.onHand ?? 0)}${
        pushed > 0 ? ` · เขียนลงประกาศ ${pushed} ร้าน` : ""
      }${failed > 0 ? ` · พลาด ${failed} ร้าน` : ""}`,
    );
    router.refresh();
  }

  async function archive() {
    if (busy) return;
    if (!confirmArchive) {
      setConfirmArchive(true);
      return;
    }
    setBusy("archive");
    setNotice(null);
    const result = await post({ action: "archive", skuCode });
    setBusy(null);
    if (!result) return;
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); setConfirmArchive(false); setError(null); setNotice(null); }}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          จัดการ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[440px]">
        <DialogHeader className="pr-11">
          <DialogTitle className="mono text-[15px]">{skuCode}</DialogTitle>
          <DialogDescription>คงเหลือกลางตอนนี้ {onHand.toLocaleString("th-TH")} ชิ้น</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`name-${skuCode}`} className="text-[12px] font-semibold">
              ชื่อสินค้า
            </label>
            <div className="flex items-center gap-2">
              <Input
                id={`name-${skuCode}`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-10 text-[13px]"
                placeholder="ชื่อไว้ดูในรายการ"
              />
              <Button type="button" size="sm" onClick={saveName} disabled={busy !== null}>
                {busy === "rename" ? "…" : "บันทึก"}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <label htmlFor={`qty-${skuCode}`} className="text-[12px] font-semibold">
              ปรับจำนวน (บวก = เติม, ลบ = ตัด)
            </label>
            <div className="flex items-center gap-2">
              <Input
                id={`qty-${skuCode}`}
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^\d-]/g, ""))}
                inputMode="numeric"
                placeholder="50"
                className="h-10 w-[120px] text-[13px] tabular-nums"
              />
              <Button type="button" size="sm" onClick={() => adjust(1)} disabled={busy !== null || !amountValid}>
                {busy === "adjust" ? "…" : "เติมเข้า"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => adjust(-1)} disabled={busy !== null || !amountValid}>
                ตัดออก
              </Button>
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              ยอดใหม่จะถูกเขียนลงประกาศของทุกร้านที่ผูกไว้ภายในรอบถัดไป
            </p>
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <p className="text-[12px] font-semibold">เลิกใช้รหัสนี้</p>
            <p className="text-[11.5px] text-muted-foreground">
              ซ่อนจากรายการและตัดการผูกทุกร้าน (หยุดหัก/หยุดเขียนยอด) — ประวัติยังอยู่ครบ กดกลับมาใช้ได้ภายหลัง
            </p>
            <Button
              type="button"
              size="sm"
              variant={confirmArchive ? "default" : "outline"}
              onClick={archive}
              disabled={busy !== null}
            >
              {busy === "archive" ? "กำลังบันทึก…" : confirmArchive ? "ยืนยันเลิกใช้รหัส" : "เลิกใช้รหัส"}
            </Button>
          </div>

          {error ? (
            <p className="text-[12.5px] font-semibold text-[#b42318]" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="text-[12.5px] font-semibold text-[color:var(--ok)]" role="status">
              {notice}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
