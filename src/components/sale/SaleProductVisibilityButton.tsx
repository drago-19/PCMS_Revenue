"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** เปิด/ซ่อนตะกร้าของสินค้าที่ TikTok — มีกล่องยืนยันก่อนยิงจริง */
export function SaleProductVisibilityButton({
  shopId,
  productId,
  productStatus,
  canWrite,
  blockedReason,
}: {
  shopId: string;
  productId: string;
  productStatus: string | null;
  canWrite: boolean;
  blockedReason: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visible = productStatus === "ACTIVATE";
  const nextVisible = !visible;

  async function submit() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/tiktok/product/visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, productId, visible: nextVisible }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "เปลี่ยนสถานะไม่สำเร็จ");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={visible ? "outline" : "default"}
        disabled={!canWrite}
        title={canWrite ? undefined : blockedReason}
        onClick={() => setOpen(true)}
      >
        {visible ? "ซ่อนตะกร้า" : "เปิดตะกร้า"}
      </Button>

      <Dialog open={open} onOpenChange={(next) => (saving ? undefined : setOpen(next))}>
        <DialogContent className="max-w-md">
          <DialogHeader className="pr-12">
            <DialogTitle>{nextVisible ? "เปิดตะกร้าสินค้านี้?" : "ซ่อนตะกร้าสินค้านี้?"}</DialogTitle>
            <DialogDescription>
              {nextVisible
                ? "สินค้าจะกลับมาให้ลูกค้าซื้อได้ทันทีหลังบันทึก"
                : "สินค้าจะถูกซ่อนจากลูกค้าทันทีหลังบันทึก (ของในสต็อกไม่เปลี่ยน)"}
            </DialogDescription>
          </DialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="button" disabled={saving} onClick={submit}>
              {saving ? "กำลังบันทึก…" : nextVisible ? "ยืนยันเปิดตะกร้า" : "ยืนยันซ่อนตะกร้า"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
