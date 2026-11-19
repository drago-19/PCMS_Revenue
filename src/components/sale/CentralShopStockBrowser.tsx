"use client";

import { useEffect, useRef, useState } from "react";
import { PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CentralLinkRow } from "@/components/sale/CentralStockTools";
import { platformImageSrc } from "@/lib/platform/image-proxy";
import { cn } from "@/lib/utils";

type ShopStockRow = {
  skuId: string;
  sellerSku: string | null;
  productName: string | null;
  quantity: number;
  linkedCode: string | null;
  linkedOnHand: number | null;
  imageUrl: string | null;
  centralHasImage: boolean;
};

type Payload = {
  rows: ShopStockRow[];
  total: number;
  page: number;
  pageCount: number;
};

const num = (n: number) => n.toLocaleString("th-TH");

/**
 * รายการ SKU ในร้านสำหรับผูก — ค้นหาทันทีที่พิมพ์ (debounce 350ms) ไม่ต้องกดปุ่ม
 * ข้อมูลแรกมาจาก server render แล้วดึงเองผ่าน /api/platform/central-stock/shop-stocks หลังจากนั้น
 */
export function CentralShopStockBrowser({
  platform,
  shopId,
  filter,
  initialSq,
  initial,
}: {
  platform: string;
  shopId: string;
  filter: "all" | "linked" | "unlinked";
  initialSq: string;
  initial: Payload;
}) {
  const [sq, setSq] = useState(initialSq);
  const [data, setData] = useState<Payload>(initial);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // บังคับดึงใหม่หลังผูก/เลิกผูกสำเร็จ — แถวที่เพิ่งกดต้องสะท้อนสถานะใหม่ทันที
  const [nonce, setNonce] = useState(0);
  const skipFirst = useRef(true);

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          platform,
          shopId,
          filter,
          page: String(page),
        });
        if (sq.trim()) params.set("q", sq.trim());
        const response = await fetch(`/api/platform/central-stock/shop-stocks?${params}`, {
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as (Payload & { error?: string }) | null;
        if (!response.ok || !payload?.rows) {
          throw new Error(payload?.error ?? "ค้นหาไม่สำเร็จ");
        }
        setData({
          rows: payload.rows,
          total: payload.total,
          page: payload.page,
          pageCount: payload.pageCount,
        });
        setError(null);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ — ลองพิมพ์ใหม่อีกครั้ง");
        }
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [sq, page, platform, shopId, filter, nonce]);

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="relative">
        <Input
          id="shop-search"
          value={sq}
          onChange={(event) => {
            setSq(event.target.value);
            setPage(1);
          }}
          placeholder="ค้นหารหัส SKU หรือชื่อสินค้าในร้านนี้ — พิมพ์แล้วค้นทันที"
          className="h-10 min-w-0 bg-background pr-9 text-[13px]"
          aria-label="ค้นหา SKU ในร้านนี้"
        />
        {/* จุดสถานะ: หมุนเบา ๆ ตรงขอบขวาช่องค้นหา — รู้ว่ากำลังค้นโดยไม่กระแทกการ์ดเดิม */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-1/2 right-3 size-3.5 -translate-y-1/2 rounded-full border-2 border-muted-foreground/30 transition-opacity",
            loading ? "border-t-muted-foreground opacity-100 animate-spin" : "opacity-0",
          )}
        />
      </div>

      {error ? (
        <p className="text-[12.5px] font-semibold text-[#b42318]" role="alert">
          {error}
        </p>
      ) : null}

      {/* การ์ดต่อ SKU — @min- คือ container query ตามความกว้างป๊อปอัพ (DialogContent เป็น @container) ไม่ใช่ตามจอ */}
      <ul className="grid gap-2 @min-[640px]:grid-cols-2" aria-label="รายการ SKU ในร้านนี้">
        {data.rows.map((row) => {
          // รูปของประกาศร้านก่อน — ไม่มีและผูกกับรหัสกลางที่มีรูปแนบ จึงใช้รูปกลาง
          const cardImage = row.imageUrl
            ? platformImageSrc(row.imageUrl) ?? row.imageUrl
            : row.linkedCode && row.centralHasImage
              ? `/api/platform/central-stock/image?code=${encodeURIComponent(row.linkedCode)}`
              : null;
          return (
            <li
              key={row.skuId}
              className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-card p-3"
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                  {cardImage ? (
                    <img
                      src={cardImage}
                      alt={`รูป ${row.sellerSku ?? row.skuId}`}
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <PackageOpen className="size-5 text-muted-foreground/50" aria-hidden="true" />
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex min-w-0 items-baseline justify-between gap-2">
                    <span className="mono truncate text-[13px] font-bold">{row.sellerSku ?? row.skuId}</span>
                    <span className="shrink-0 text-[11.5px] text-muted-foreground">
                      บนร้าน <b className="mono tabular-nums text-foreground">{num(row.quantity)}</b>
                    </span>
                  </div>
                  <p className="truncate text-[12px] text-muted-foreground">{row.productName ?? "—"}</p>
                </div>
              </div>
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
                <CentralLinkRow
                  platform={platform}
                  shopId={shopId}
                  skuId={row.skuId}
                  sellerSku={row.sellerSku}
                  linkedCode={row.linkedCode}
                  onChanged={() => setNonce((value) => value + 1)}
                />
                <span className="ml-auto shrink-0 text-[11.5px] text-muted-foreground">
                  คงเหลือกลาง{" "}
                  <b
                    className={cn(
                      "mono text-[13px] tabular-nums",
                      row.linkedOnHand !== null && row.linkedOnHand <= 0 ? "text-[#b42318]" : "text-foreground",
                    )}
                  >
                    {row.linkedOnHand === null ? "—" : num(row.linkedOnHand)}
                  </b>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {data.rows.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-muted-foreground">
          {sq.trim() || filter !== "all" ? "ไม่พบ SKU ตามเงื่อนไขนี้" : "ร้านนี้ยังไม่มี SKU ที่ดึงมา"}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
        <span>
          แสดง {num(data.rows.length)} จาก {num(data.total)} SKU · หน้า {num(data.page)} / {num(data.pageCount)}
        </span>
        <span className="flex items-center gap-2">
          {data.page > 1 ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setPage(data.page - 1)}>
              ก่อนหน้า
            </Button>
          ) : null}
          {data.page < data.pageCount ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setPage(data.page + 1)}>
              ถัดไป
            </Button>
          ) : null}
        </span>
      </div>
    </div>
  );
}
