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
import { IconTrash } from "./icons";

export function DeleteImportButton({
  importId,
  filename,
  billCount,
}: {
  importId: number;
  filename: string;
  billCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/imports/${importId}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        const msg = payload.error ?? "ลบไม่สำเร็จ";
        setError(msg);
        toast.error(msg);
        return;
      }
      setOpen(false);
      toast.success(`ลบการนำเข้า ${filename} แล้ว`);
      router.push("/history");
      router.refresh();
    } catch {
      const msg = "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="delete-import no-print">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            loading={busy}
            aria-label={`ลบการนำเข้า ${filename}`}
          >
            <IconTrash size={16} />
            {busy ? "กำลังลบ..." : "ลบการนำเข้านี้"}
          </Button>
        </DialogTrigger>
        <DialogContent className="no-print">
          <DialogHeader className="pr-11">
            <DialogTitle>ยืนยันการลบการนำเข้า</DialogTitle>
            <DialogDescription className="break-all">
              ลบการนำเข้า &ldquo;{filename}&rdquo; หรือไม่? บิล {billCount.toLocaleString("th-TH")}{" "}
              ใบที่มาจากไฟล์นี้จะถูกลบออกจากระบบ (ไฟล์ Excel ต้นฉบับไม่ถูกลบ)
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p className="text-sm font-medium text-destructive">{error}</p>
          ) : null}
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                ยกเลิก
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={busy}
              loading={busy}
            >
              <IconTrash size={16} />
              {busy ? "กำลังลบ..." : "ยืนยันลบ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ClearAllImportsButton({ totalFiles }: { totalFiles: number }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleClearAll() {
    setBusy(true);
    try {
      const response = await fetch("/api/imports", { method: "DELETE" });
      if (!response.ok) {
        toast.error("ล้างข้อมูลไม่สำเร็จ");
        return;
      }
      setOpen(false);
      toast.success("ล้างข้อมูลการนำเข้าทั้งหมดในฐานข้อมูลเรียบร้อยแล้ว");
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  if (totalFiles <= 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" disabled={busy} loading={busy}>
          <IconTrash size={16} /> ล้างข้อมูลทั้งหมด ({totalFiles})
        </Button>
      </DialogTrigger>
      <DialogContent className="no-print">
        <DialogHeader className="pr-11">
          <DialogTitle>ยืนยันการล้างข้อมูลทั้งหมดในฐานข้อมูล</DialogTitle>
          <DialogDescription>
            ต้องการลบไฟล์ที่นำเข้าทั้งหมด ({totalFiles.toLocaleString("th-TH")} ไฟล์) รวมถึงบิล รายการออเดอร์ OMS รหัสสินค้า (`products`) และรีเซ็ตเลขใบกำกับภาษีกลับเป็น 0 ทั้งหมดหรือไม่?
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
            variant="destructive"
            onClick={handleClearAll}
            disabled={busy}
            loading={busy}
          >
            <IconTrash size={16} />
            {busy ? "กำลังล้างข้อมูล..." : "ยืนยันล้างทั้งหมด"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
