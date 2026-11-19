"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type PickerShop = { platform: string; shopId: string; shopName: string | null };

type Props = {
  shops: PickerShop[];
  selectedKey: string;
  filter: "all" | "linked" | "unlinked";
  counts: { all: number; linked: number; unlinkedCount: number };
  /** พารามิเตอร์ที่ต้องคงไว้ตอนสลับร้าน/แท็บ */
  keep: { q: string; sq: string; page: number };
};

const keyOf = (shop: PickerShop) => `${shop.platform}:${shop.shopId}`;
const th = (n: number) => n.toLocaleString("th-TH");

export function CentralShopPicker({ shops, selectedKey, filter, counts, keep }: Props) {
  const router = useRouter();
  const selectedShop = shops.find((shop) => keyOf(shop) === selectedKey) ?? null;

  // สลับร้าน/แท็บ = เปลี่ยน URL ให้ server render ใหม่ — รีเซ็ตหน้ารายการ (spage) กลับ 1 ทุกครั้ง
  const go = (next: { shop?: string; filter?: string }) => {
    const qs = new URLSearchParams();
    if (keep.q) qs.set("q", keep.q);
    if (keep.page > 1) qs.set("page", String(keep.page));
    const shop = next.shop ?? selectedKey;
    if (shop) qs.set("shop", shop);
    if (keep.sq) qs.set("sq", keep.sq);
    const nextFilter = next.filter ?? filter;
    if (nextFilter !== "all") qs.set("filter", nextFilter);
    const text = qs.toString();
    router.push(text ? `/sale/central-stock?${text}` : "/sale/central-stock", { scroll: false });
  };

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {/* เลือกร้านเต็มแถวของตัวเอง — เดิมบีบให้แบ่งแถวกับแท็บ ร้านชื่อยาวกับแท็บเลขเป็นพันเลยเบียดกันจนล้น */}
      <Select value={selectedKey} onValueChange={(value) => go({ shop: value })}>
        {/* เขียนชื่อร้านเองแทน SelectValue — SelectValue ฝั่ง server ยังไม่รู้จักไอเท็มจึงเรนเดอร์เป็น placeholder แล้ว client เปลี่ยนเป็นชื่อร้าน เกิด hydration mismatch */}
        <SelectTrigger aria-label="เลือกร้าน" className="h-10 w-full">
          {selectedShop ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="text-[10.5px] font-bold uppercase text-muted-foreground">
                {selectedShop.platform}
              </span>
              <span className="truncate">{selectedShop.shopName ?? selectedShop.shopId}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">เลือกร้าน</span>
          )}
        </SelectTrigger>
        {/* position="popper" — โหมด item-aligned คิดพิกัดเป็นตำแหน่งเอกสารแต่เรนเดอร์แบบ fixed
            ทำให้รายการไปโผล่ท้ายหน้าแทนที่จะอยู่ใต้ปุ่ม (เจอบน prod 19 พ.ย. 2026) */}
        <SelectContent position="popper" sideOffset={4} className="max-h-[280px] w-[var(--radix-select-trigger-width)]">
          {shops.map((shop) => (
            <SelectItem key={keyOf(shop)} value={keyOf(shop)}>
              <span className="text-[10.5px] font-bold uppercase text-muted-foreground">
                {shop.platform}
              </span>
              <span className="truncate">{shop.shopName ?? shop.shopId}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* แท็บ 3 ช่องเท่ากันเต็มแถว ชื่อสถานะบน เลขล่าง — เลขเป็นพันก็ไม่ล้นจนเกิดสกอลบาร์แถวเดียว */}
      <Tabs value={filter} onValueChange={(value) => go({ filter: value })} className="w-full">
        <TabsList aria-label="กรองตามสถานะการผูก" className="grid h-auto w-full grid-cols-3 gap-1 p-1">
          <TabsTrigger
            value="all"
            className="flex h-auto min-h-[44px] flex-col gap-0 px-2 py-1.5"
          >
            <span className="text-[11px] font-semibold leading-tight">ทั้งหมด</span>
            <span className="text-[15px] font-bold leading-tight tabular-nums">{th(counts.all)}</span>
          </TabsTrigger>
          <TabsTrigger
            value="linked"
            className="flex h-auto min-h-[44px] flex-col gap-0 px-2 py-1.5"
          >
            <span className="text-[11px] font-semibold leading-tight">ผูกแล้ว</span>
            <span className="text-[15px] font-bold leading-tight tabular-nums">{th(counts.linked)}</span>
          </TabsTrigger>
          <TabsTrigger
            value="unlinked"
            className="flex h-auto min-h-[44px] flex-col gap-0 px-2 py-1.5"
          >
            <span className="text-[11px] font-semibold leading-tight">ยังไม่ผูก</span>
            <span className="text-[15px] font-bold leading-tight tabular-nums">{th(counts.unlinkedCount)}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
