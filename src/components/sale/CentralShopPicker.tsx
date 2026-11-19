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
        <SelectContent>
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

      <Tabs value={filter} onValueChange={(value) => go({ filter: value })}>
        <TabsList aria-label="กรองตามสถานะการผูก">
          <TabsTrigger value="all">ทั้งหมด {th(counts.all)}</TabsTrigger>
          <TabsTrigger value="linked">ผูกแล้ว {th(counts.linked)}</TabsTrigger>
          <TabsTrigger value="unlinked">ยังไม่ผูก {th(counts.unlinkedCount)}</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
