"use client";

import { IconInfo } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const TERMS: { term: string; meaning: string }[] = [
  {
    term: "ก่อน 14.00 น.",
    meaning:
      "ออเดอร์ที่ลูกค้า “สั่ง” ก่อน 14:00 ของวันที่สั่งของออเดอร์นั้น (ไม่ได้ดูเวลาชำระ) — ของค้างจากวันก่อนก็ถูกจัดตามเวลาที่สั่งจริง",
  },
  {
    term: "หลัง 14.00 น.",
    meaning: "ออเดอร์ที่ลูกค้าสั่งตั้งแต่ 14:00 ถึงเที่ยงคืน ของวันที่สั่งของออเดอร์นั้น",
  },
  {
    term: "ค้างจ่าย",
    meaning:
      "ออเดอร์ที่ Shipnity ยังไม่ได้รับเงิน — แยกเป็น “ยังไม่ชำระเงิน” (ยังไม่แจ้งโอน) และ “แจ้งโอนเงิน · รอตรวจสอบ” (ลูกค้าแจ้งโอนแล้วแต่ยังไม่ยืนยัน)",
  },
  {
    term: "ทั้งหมด",
    meaning: "ออเดอร์ที่ชำระแล้วและยังไม่ถูกกดปิดรายการ = ยังไม่พิมพ์ + พิมพ์แล้ว (ทุกใบที่ต้องแพ็ค)",
  },
  {
    term: "ยังไม่พิมพ์",
    meaning:
      "ตรงกับชิป “พิมพ์ที่อยู่” ใน Shipnity — ชำระเงินแล้วแต่ยังไม่ได้พิมพ์ใบปะหน้า/ใบแพ็ค ต้องพิมพ์ก่อนจึงจะแพ็คได้",
  },
  {
    term: "พิมพ์แล้ว · รอส่ง",
    meaning:
      "ตรงกับชิป “รอส่ง” ใน Shipnity — พิมพ์ใบแล้ว รอแพ็คของ/รอขนส่งมารับ (หรือรอกรอกเลขพัสดุ) คือของที่พร้อมหยิบจริง",
  },
  {
    term: "ค้าง N วัน",
    meaning:
      "ออเดอร์นี้ลูกค้าสั่งไว้ N วันแล้ว แต่ Shipnity ยังไม่ถูกกดปิดรายการ จึงยังถือว่าต้องส่ง — มักเกิดจากส่งของแล้วแต่ลืมปิดรายการ",
  },
  {
    term: "ค้างจากวันก่อน",
    meaning:
      "แท็บแยกสำหรับออเดอร์ที่สั่งก่อนวันที่เลือกแต่ยังไม่ปิดรายการ — ไม่ถูกนับในตารางแพ็คของวันนี้ และไม่ลงกระดาษที่พิมพ์ให้พนักงาน",
  },
  {
    term: "แพ็คแล้ว (ช่องจด)",
    meaning:
      "ช่องว่างไว้ให้คนงานจด/ติ๊กบนกระดาษที่พิมพ์ออกมา — ไม่ผูกกับ Shipnity ระบบไม่บันทึกตัวเลขในช่องนี้",
  },
];

/** ปุ่มเปิดคำอธิบายคำศัพท์บนหน้าออเดอร์รอแพ็ค */
export function OrdersHelp() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="size-7 shrink-0 rounded-full p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
          aria-label="เปิดคำอธิบายความหมายของแท็บและป้ายต่าง ๆ"
          title="คำอธิบายแท็บและป้าย"
        >
          <IconInfo size={17} />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-[min(94vw,720px)]">
        <DialogHeader className="pr-11">
          <DialogTitle className="text-base">คำอธิบายแท็บและป้ายบนหน้านี้</DialogTitle>
          <DialogDescription>
            ทุกอย่างอิงจาก “เวลาที่ลูกค้าสั่ง” และสถานะจริงใน Shipnity
          </DialogDescription>
        </DialogHeader>

        <dl className="flex max-h-[62dvh] flex-col gap-3 overflow-y-auto pr-1">
          {TERMS.map((item) => (
            <div key={item.term} className="rounded-xl border border-border bg-[#f8fafc] px-3 py-2.5">
              <dt className="text-sm font-bold text-foreground">{item.term}</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {item.meaning}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
