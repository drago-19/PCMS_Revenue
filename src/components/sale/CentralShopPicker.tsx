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
    <div className="flex min-w-0 flex-col gap-2 min-[720px]:flex-row min-[720px]:items-center min-[720px]:justify-between">
      <Select value={selectedKey} onValueChange={(value) => go({ shop: value })}>
        {/* เขียนชื่อร้านเองแทน SelectValue — SelectValue ฝั่ง server ยังไม่รู้จักไอเท็มจึงเรนเดอร์เป็น placeholder แล้ว client เปลี่ยนเป็นชื่อร้าน เกิด hydration mismatch */}
        <SelectTrigger aria-label="เลือกร้าน" className="h-10 w-full min-[560px]:w-[360px]">
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

      {/* จอ 360px แท็บ 3 ใบพร้อมตัวเลขไม่พอดี — ลดระยะขอบในแท็บที่จอแคบ และกันล้นออกนอกการ์ด */}
      <Tabs value={filter} onValueChange={(value) => go({ filter: value })} className="min-w-0 max-w-full overflow-x-auto">
        <TabsList aria-label="กรองตามสถานะการผูก" className="min-[560px]:gap-1">
          <TabsTrigger value="all" className="px-2.5 text-[12.5px] min-[560px]:px-4 min-[560px]:text-[13.5px]">
            ทั้งหมด {th(counts.all)}
          </TabsTrigger>
          <TabsTrigger value="linked" className="px-2.5 text-[12.5px] min-[560px]:px-4 min-[560px]:text-[13.5px]">
            ผูกแล้ว {th(counts.linked)}
          </TabsTrigger>
          <TabsTrigger value="unlinked" className="px-2.5 text-[12.5px] min-[560px]:px-4 min-[560px]:text-[13.5px]">
            ยังไม่ผูก {th(counts.unlinkedCount)}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
