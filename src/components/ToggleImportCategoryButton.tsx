"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

export function ToggleImportCategoryButton({
  importId,
  filename,
  isAccounting,
  size = "default",
}: {
  importId: number;
  filename: string;
  isAccounting: boolean;
  size?: "default" | "xs" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const nextIsAccounting = !isAccounting;
  const triggerLabel = isAccounting
    ? "สลับเป็นไฟล์ Shipnity ปกติ"
    : "สลับเป็นไฟล์สรุปบัญชี";

  async function handleToggle() {
    setBusy(true);
    try {
      const response = await fetch(`/api/imports/${importId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAccounting: nextIsAccounting }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        isAccounting?: boolean;
        error?: string;
      };
      if (!response.ok) {
        toast.error(payload.error ?? "สลับประเภทไฟล์ไม่สำเร็จ");
        return;
      }
      setOpen(false);
      toast.success(
        nextIsAccounting
          ? `เปลี่ยน "${filename}" เป็นไฟล์สรุปจากฝ่ายบัญชีเรียบร้อยแล้ว`
          : `เปลี่ยน "${filename}" เป็นไฟล์ออเดอร์ Shipnity ปกติเรียบร้อยแล้ว`,
      );
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={size}
          disabled={busy}
          loading={busy}
          aria-label={`${triggerLabel} (${filename})`}
          className="no-print"
        >
          ⇄ {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="no-print">
        <DialogHeader className="pr-11">
          <DialogTitle>
            {nextIsAccounting
              ? "สลับเป็นโหมด: 📋 ไฟล์สรุปจากฝ่ายบัญชี"
              : "สลับเป็นโหมด: 📦 ไฟล์ออเดอร์ Shipnity (ปกติ)"}
          </DialogTitle>
          <DialogDescription className="break-all">
            ต้องการสลับประเภทของไฟล์ &ldquo;{filename}&rdquo; หรือไม่?{" "}
            {nextIsAccounting
              ? "ระบบจะใช้ไฟล์นี้เป็นไฟล์สรุปจากฝ่ายบัญชีเพื่อเทียบยอดกับบิล LINE OA / Facebook และคำนวณสถานะการผูกไฟล์ใหม่ทันทีโดยไม่ต้องอัปโหลดซ้ำ"
              : "ระบบจะยกเลิกสถานะไฟล์สรุปบัญชีของไฟล์นี้ และคืนค่ากลับเป็นไฟล์ออเดอร์ Shipnity ปกติทันทีโดยไม่ต้องอัปโหลดซ้ำ"}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={busy}>
              ยกเลิก
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="default"
            onClick={handleToggle}
            disabled={busy}
            loading={busy}
          >
            {busy ? "กำลังอัปเดต..." : `ยืนยัน${triggerLabel}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
