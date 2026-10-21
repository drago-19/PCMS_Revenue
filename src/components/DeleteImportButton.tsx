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
      router.push("/import");
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
          <DialogHeader>
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
