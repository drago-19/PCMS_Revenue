"use client";

// ปุ่ม "สร้างสินค้า" บนหน้าสต็อกกลาง — เปิดฟอร์มเดียวกับ /sale/products/new (ไม่ก็อปฟอร์มมาใหม่)
// สร้างลง TikTok ของร้านทดสอบแล้ว เซิร์ฟเวอร์ตั้งยอดกลาง + ผูกประกาศให้เอง (ส่ง linkCentral = true)
// เปิดไดอะล็อกไม่ได้เมื่อยังไม่มีร้านทดสอบ — ปุ่มปิดไว้พร้อมบอกเหตุผล

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NewProductForm } from "@/components/sale/NewProductForm";
import { SALE_THEME } from "@/lib/sale/theme";

export function CentralStockCreateProductDialog({
  shopId,
  shopName,
}: {
  /** ร้านทดสอบที่จะสร้างสินค้า — ว่างเมื่อยังไม่มีร้านทดสอบที่เชื่อมต่อ */
  shopId: string;
  shopName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!shopId) {
    return (
      <Button
        type="button"
        size="sm"
        className="min-h-[40px]"
        disabled
        title="ยังไม่มีร้านทดสอบที่เชื่อมต่อ — สร้างสินค้าได้เฉพาะร้านทดสอบ"
      >
        สร้างสินค้า
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" className="min-h-[40px]">
          สร้างสินค้า
        </Button>
      </DialogTrigger>
      {/* sm:max-w-lg ตั้งต้นของ DialogContent ต้องถูกแทนด้วย sm:max-w-3xl คู่กับ max-w-3xl */}
      <DialogContent className="@container max-h-[88dvh] max-w-3xl overflow-y-auto sm:max-w-3xl" style={SALE_THEME}>
        <DialogHeader className="pr-11">
          <DialogTitle>สร้างสินค้าใหม่ · {shopName ?? "ร้านทดสอบ"}</DialogTitle>
          <DialogDescription>
            สร้างบน TikTok แล้วเปิดขายทันที พร้อมตั้งยอดสต็อกกลางและผูกประกาศให้เอง — เห็นสินค้าใหม่ในตารางหลังสร้างเสร็จ
          </DialogDescription>
        </DialogHeader>
        <NewProductForm
          shopId={shopId}
          linkCentral
          onCreated={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
