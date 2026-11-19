"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SALE_THEME } from "@/lib/sale/theme";

/**
 * ป๊อปอัพผูก SKU ของแต่ละร้าน — หน้าหลักเหลือแค่ตารางคลังกลาง
 * กล่องค้นหา/แท็บกรองส่ง query ทั้งหน้า (โหลดใหม่) — defaultOpen ทำให้ป๊อปอัพเปิดค้าง
 * ไว้เมื่อกลับมาจากการค้นหา ผู้ใช้จึงเห็นผลค้นหาต่อในป๊อปอัพเดิม
 */
export function CentralStockLinkDialog({
  children,
  defaultOpen = false,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          ผูก SKU ของแต่ละร้าน
        </Button>
      </DialogTrigger>
      {/* จำกัดสูง + เลื่อนในตัว — ตารางผูกยาวได้แต่ไม่ล้นจอ
          กว้าง 4xl เพื่อให้ตาราง min-w-[760px] อยู่ได้โดยไม่ต้องสกอลแนวนอนในป๊อปอัพ */}
      {/* sm:max-w-4xl แทนที่ sm:max-w-lg ตั้งต้นของ DialogContent ผ่าน tailwind-merge — ใส่แค่ max-w-4xl ไม่พอเพราะโดน sm:max-w-lg ชนะ */}
      <DialogContent className="@container max-h-[85dvh] max-w-4xl sm:max-w-4xl overflow-y-auto" style={SALE_THEME}>
        <DialogHeader className="pr-11">
          <DialogTitle>ผูก SKU ของแต่ละร้าน</DialogTitle>
          <DialogDescription>
            รหัสบนประกาศอาจต่างกันได้ — ผูกเข้าตัวกลางเดียวกัน ปิดหน้าต่างเมื่อผูกครบ
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
