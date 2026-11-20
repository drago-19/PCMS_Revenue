"use client";

// ป๊อปอัปรายละเอียด SKU ของหน้า /sale/stocks — เปิดด้วยสถานะในเบราว์เซอร์
//
// เดิม: กดแถว = เปลี่ยน ?sku= แล้วให้เซิร์ฟเวอร์เรนเดอร์หน้าใหม่ทั้งหน้า (ช้าและเห็นเป็นหน้าเด้ง)
// ตอนนี้: คลิกแถว → fetch จาก /api/platform/stock/sku-detail → เปิด <Dialog> ทันที ไม่มีการนำทาง
// URL ยังถูกเขียนเป็น ?sku= ด้วย history.replaceState เพื่อให้กด F5 หรือแชร์ลิงก์แล้วป๊อปอัปยังเปิด
//
// หน้าตาและเนื้อหาเป็นชุดเดิมที่ผู้ใช้ approve แล้ว — ย้ายมาไว้ที่นี่โดยไม่เปลี่ยนโครงสร้าง
// 20 พ.ย. 2026: หน้านี้ทำได้แค่ดูข้อมูลกับเปิด/ปิดตะกร้า — ปรับสต็อกและสร้างสินค้าใหม่ย้ายไปหน้าสต็อกกลาง

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImagePreview } from "@/components/sale/ImagePreview";
import { LiveProductTitle } from "@/components/sale/LiveProductTitle";
import { LiveStockQuantity } from "@/components/sale/LiveStockQuantity";
import { SaleProductVisibilityButton } from "@/components/sale/SaleProductVisibilityButton";
import { platformImageSrc } from "@/lib/platform/image-proxy";
import { thaiDateTime } from "@/lib/platform/period";
import { mergeDuplicateOrders } from "@/lib/platform/stock-list";
import { SALE_THEME } from "@/lib/sale/theme";
import { cn } from "@/lib/utils";
import type { SkuDetail } from "@/lib/platform/stock";

/** ลิงก์ในตารางที่เปิดป๊อปอัปนี้ — หน้าสต็อกใส่ data-stock-sku ไว้บน <Link> */
const ANCHOR_SELECTOR = "a[data-stock-sku]";

type DetailPayload = {
  detail: SkuDetail;
  /** ป้ายสถานะที่คิดแล้วฝั่งเซิร์ฟเวอร์ (productStatusLabel) */
  statusLabel: string;
  /** รหัสกลางที่ผูกกับ SKU นี้ + ยอดคงเหลือ (null = ยังไม่ผูก) */
  central: { skuCode: string; onHand: number | null } | null;
};

function num(value: number): string {
  return value.toLocaleString("th-TH");
}

export function SaleStockDetailDialog({
  platform,
  dbPlatform,
  shopId,
  canWrite,
  initialSku,
}: {
  /** คีย์แพลตฟอร์มฝั่งหน้าจอ (tiktok/shopee/facebook) — ใช้ตัดสินว่าจะแสดงช่องทางเขียนตัวไหน */
  platform: string;
  /** ชื่อแพลตฟอร์มที่ใช้เป็นคีย์ใน DB */
  dbPlatform: string;
  shopId: string;
  /** เขียนได้หรือไม่ — คิดจากชื่อร้านทดสอบ/flags ที่เซิร์ฟเวอร์แล้ว */
  canWrite: boolean;
  /** URL มี ?sku= ติดมา = เปิดป๊อปอัปเองทันทีหลังโหลดหน้า */
  initialSku?: string | null;
}) {
  // มี ?sku= ติดมากับ URL = เปิดป๊อปอัปตั้งแต่เรนเดอร์แรก (ไม่ต้องรอ effect — กัน URL ถูกเขียนลบชั่วขณะ)
  const [sku, setSku] = useState<string | null>(initialSku ?? null);
  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openSku = useCallback((next: string) => {
    setSku(next);
  }, []);

  // คลิกแถว: จับที่ระดับเอกสารแบบ capture เพื่อหยุดก่อนที่ Link ของ Next จะเริ่มเปลี่ยนหน้า
  // (คลิกแบบ meta/ctrl/shift/alt ปล่อยให้เปิดแท็บใหม่ตามปกติ — ลิงก์ ?sku= ยังเปิดป๊อปอัปได้เอง)
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>(ANCHOR_SELECTOR) : null;
      if (!anchor || (anchor.target && anchor.target !== "_self")) return;
      const sku = anchor.dataset.stockSku;
      if (!sku) return;
      event.preventDefault();
      openSku(sku);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [openSku]);

  // URL ตามป๊อปอัป: เขียนด้วย replaceState เท่านั้น ไม่มีการนำทางหรือโหลดหน้าใหม่
  useEffect(() => {
    const url = new URL(window.location.href);
    if (sku) {
      url.searchParams.set("sku", sku);
    } else {
      url.searchParams.delete("sku");
    }
    // ลิงก์เก่าที่ค้าง ?action=stock|edit ยังเปิดได้ — เก็บทิ้งแล้วเปิดเป็นข้อมูลอย่างเดียว
    url.searchParams.delete("action");
    if (url.href !== window.location.href) window.history.replaceState(null, "", url.href);
  }, [sku]);

  useEffect(() => {
    if (!sku) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    const params = new URLSearchParams({ platform: dbPlatform, shop: shopId, sku });
    fetch(`/api/platform/stock/sku-detail?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | (Partial<DetailPayload> & { ok?: boolean; error?: string })
          | null;
        if (!response.ok || !payload?.detail) {
          throw new Error(payload?.error ?? `อ่านข้อมูลไม่สำเร็จ (${response.status})`);
        }
        setData({
          detail: payload.detail,
          statusLabel: payload.statusLabel ?? "ไม่ทราบสถานะ",
          central: payload.central ?? null,
        });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [sku, dbPlatform, shopId]);

  const detail = data?.detail ?? null;
  // กันเลขออเดอร์ซ้ำอีกชั้น — คีย์ซ้ำทำให้ React ฟ้องและป๊อปอัปพังทั้งใบ
  const orders = useMemo(() => (detail ? mergeDuplicateOrders(detail.orders) : []), [detail]);

  return (
    <Dialog
      open={Boolean(sku)}
      onOpenChange={(next) => {
        if (!next) setSku(null);
      }}
    >
      {sku ? (
        <DialogContent
          aria-describedby={undefined}
          className="max-h-[88dvh] overflow-y-auto sm:max-w-3xl"
          style={SALE_THEME}
        >
          {detail && data ? (
            <SkuDetailBody
              platform={platform}
              shopId={shopId}
              canWrite={canWrite}
              detail={detail}
              statusLabel={data.statusLabel}
              central={data.central}
              orders={orders}
            />
          ) : (
            <>
              <DialogHeader className="pr-11">
                <DialogTitle className="text-[16px] leading-6">รายละเอียดสินค้า</DialogTitle>
              </DialogHeader>
              {error ? (
                <p className="text-[12.5px] leading-5 text-[#b42318]" role="alert">
                  เปิดรายละเอียดสินค้าไม่สำเร็จ: {error}
                </p>
              ) : (
                <p className="text-[12.5px] leading-5 text-muted-foreground" role="status">
                  {loading ? "กำลังโหลดรายละเอียดสินค้า…" : "ยังไม่มีข้อมูล"}
                </p>
              )}
            </>
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/** เนื้อของป๊อปอัป — ย้ายมาจากหน้า /sale/stocks ทั้งบล็อก ไม่เปลี่ยนหน้าตา */
function SkuDetailBody({
  platform,
  shopId,
  canWrite,
  detail,
  statusLabel,
  central,
  orders,
}: {
  platform: string;
  shopId: string;
  canWrite: boolean;
  detail: SkuDetail;
  statusLabel: string;
  central: { skuCode: string; onHand: number | null } | null;
  orders: SkuDetail["orders"];
}) {
  return (
    <>
      {/* ส่วนหัวฮีโร่: รูป + ชื่อ + สถานะ + ปุ่มตะกร้า + หมวดหมู่ อยู่ด้วยกันเป็นบล็อกเดียว */}
      <DialogHeader className="pr-11">
        <div className="flex items-start gap-3">
          {detail.imageUrl ? (
            // กดแล้วเปิดป๊อปอัพในหน้านี้ ไม่เด้งออกไปหน้าอื่น
            <ImagePreview
              src={platformImageSrc(detail.imageUrl) ?? detail.imageUrl}
              alt={detail.productName ?? "รูปสินค้า"}
              className="size-14 min-[720px]:size-16"
            />
          ) : (
            <span className="block size-14 shrink-0 rounded-xl border border-border bg-muted min-[720px]:size-16" />
          )}
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-[16px] leading-6">
              {/* ชื่อเปลี่ยนทันทีเมื่อบันทึกชื่อใหม่ (ไม่ต้องรอรีเฟรช) */}
              <LiveProductTitle
                productId={detail.productId ?? detail.skuId}
                initial={detail.productName ?? detail.sellerSku ?? "สินค้า"}
              />
            </DialogTitle>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 font-bold",
                  // สีเดียวกับป้ายในตาราง: เปิดขาย = เขียวอ่อน · ซ่อน/อื่น ๆ = เทา
                  detail.productStatus === "ACTIVATE"
                    ? "bg-[color:var(--ok-soft)] text-[color:var(--ok)]"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {statusLabel}
              </span>
              <span>
                SKU {platform === "shopee" ? "Shopee" : "TikTok"} {detail.sellerSku ?? "—"}
              </span>
              <span aria-hidden="true">·</span>
              <span>อัปเดต {thaiDateTime(detail.updatedAt)}</span>
              {platform !== "shopee" && detail.productId ? (
                <span className="ml-auto">
                  <SaleProductVisibilityButton
                    shopId={shopId}
                    productId={detail.productId}
                    productStatus={detail.productStatus}
                    canWrite={canWrite}
                    blockedReason="ร้านจริงยังไม่เปิดให้เปลี่ยนสถานะตะกร้า — ต้องทดสอบบนร้านทดสอบให้ผ่านก่อน"
                  />
                </span>
              ) : null}
            </p>
            <p className="mt-1 truncate text-[11.5px] text-muted-foreground">
              {detail.category ?? "ยังไม่มีข้อมูลหมวดหมู่"}
            </p>
          </div>
        </div>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        {/* แถวตัวเลข: เส้นบน-ล่างต่อเนื่องจากส่วนหัว ไม่มีกล่องลอย — ยอดกลางอยู่ด้วย */}
        <dl className="grid grid-cols-2 gap-y-3 border-y border-border py-3 min-[560px]:grid-cols-5">
          <div className="min-w-0">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">คงเหลือรวม</dt>
            {/* ขยับทันทีเมื่อกดปรับสต็อก (ไม่ต้องรอรีเฟรช) */}
            <dd className="mono text-[22px] font-bold leading-8">
              <LiveStockQuantity skuId={detail.skuId} initial={detail.quantity} />
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">สต็อกกลาง</dt>
            <dd
              className={cn(
                "mono text-[22px] font-bold leading-8",
                central && (central.onHand ?? 0) <= 0 ? "text-[#b42318]" : "",
              )}
            >
              {central ? (central.onHand ?? 0).toLocaleString("th-TH") : "—"}
            </dd>
            <dd className="truncate text-[10.5px] text-muted-foreground">
              {central?.skuCode ?? "ยังไม่ผูก"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">ราคาขาย</dt>
            <dd className="mono text-[22px] font-bold leading-8">
              {detail.price === null ? "—" : `${detail.currency === "THB" || !detail.currency ? "฿" : `${detail.currency} `}${num(detail.price)}`}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">จำนวนคลัง</dt>
            <dd className="mono text-[22px] font-bold leading-8">{num(detail.warehouses.length)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">กำลังตีกลับ</dt>
            <dd className="mono text-[22px] font-bold leading-8">{num(detail.inTransit)}</dd>
          </div>
        </dl>

        {/* ปรับสต็อกและสร้างสินค้าใหม่ย้ายไปหน้าสต็อกกลางแล้ว — ป๊อปอัปนี้เหลืออ่านข้อมูลกับสวิตช์ตะกร้า */}
        <p className="text-[12px] leading-5 text-muted-foreground">
          ดูข้อมูลได้อย่างเดียว — ปรับสต็อกและสร้างสินค้าใหม่ทำที่<Link href="/sale/central-stock" className="font-bold underline underline-offset-2">หน้าสต็อกกลาง</Link>
        </p>

        {detail.warehouses.length > 0 ? (
          <div className="rounded-xl border border-border bg-card p-3">
            <h3 className="text-[13px] font-bold">แยกตามคลัง</h3>
            <ul className="mt-1 grid list-none grid-cols-1 gap-1 p-0 text-[12.5px]">
              {detail.warehouses.map((warehouse) => (
                <li key={warehouse.warehouseId} className="flex justify-between gap-2 rounded-md bg-muted/40 px-2 py-1">
                  <span className="mono text-muted-foreground">{warehouse.warehouseId}</span>
                  <span className="mono font-bold">{num(warehouse.quantity)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* ประวัติ/ออเดอร์ไม่ได้ดูบ่อย — กดปุ่มเปิดเมื่อต้องการ (details เปิดปิดได้โดยไม่ใช้ JS) */}
        <details className="group rounded-xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
            <span className="text-[13px] font-bold">ประวัติและออเดอร์ของ SKU นี้</span>
            <span className="flex items-center gap-2 text-[11.5px] tabular-nums text-muted-foreground">
              <span>
                ออเดอร์ {num(orders.length)} · เปลี่ยนแปลง {num(detail.movements.length)}
              </span>
              <ChevronDown
                className="size-4 shrink-0 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-border p-3">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[13px] font-bold">ออเดอร์ที่ตัดสต็อก (ล่าสุด)</h3>
                <span className="text-[11.5px] tabular-nums text-muted-foreground">
                  {num(orders.length)} รายการ
                </span>
              </div>
              {orders.length === 0 ? (
                <p className="mt-1 text-[12.5px] text-muted-foreground">ยังไม่มีออเดอร์ของ SKU นี้ในระบบ</p>
              ) : (
                <ul className="mt-1 flex max-h-[320px] list-none flex-col overflow-y-auto pr-2 p-0">
                  {orders.map((order) => (
                    <li
                      key={order.orderId}
                      className="flex flex-wrap items-baseline gap-x-2 border-b border-border/70 py-1.5 text-[12.5px] last:border-0"
                    >
                      <a
                        href={
                          platform !== "tiktok"
                            ? `/sale/orders?platform=${platform}&order=${encodeURIComponent(order.orderId)}`
                            : `/sale/orders?order=${encodeURIComponent(order.orderId)}`
                        }
                        className="mono underline underline-offset-2"
                      >
                        {order.orderId}
                      </a>
                      <span className="text-muted-foreground">{thaiDateTime(order.orderedAt)}</span>
                      <span className="ml-auto mono font-bold">−{num(order.quantity)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="h-px bg-border" aria-hidden="true" />

            <div>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[13px] font-bold">ประวัติการเปลี่ยนแปลง</h3>
                <span className="text-[11.5px] tabular-nums text-muted-foreground">
                  {num(detail.movements.length)} รายการล่าสุด
                </span>
              </div>
              {detail.movements.length === 0 ? (
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  ยังไม่มีการเปลี่ยนแปลง — จะเริ่มบันทึกเมื่อยอดเปลี่ยนจากการดึงหรือจากการกดปรับในระบบ
                </p>
              ) : (
                <ul className="mt-1 flex max-h-[240px] list-none flex-col overflow-y-auto pr-2 p-0">
                  {detail.movements.map((movement, index) => (
                    <li
                      key={`${movement.changedAt}-${index}`}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 border-b border-border/60 py-2 text-[12.5px] last:border-0"
                    >
                      <span className="text-[11.5px] text-muted-foreground tabular-nums">
                        {thaiDateTime(movement.changedAt)}
                      </span>
                      <span className="mono tabular-nums">
                        {num(movement.fromQty ?? 0)} → <b>{num(movement.toQty)}</b>
                      </span>
                      <Badge variant={movement.delta > 0 ? "success" : "danger"}>
                        {movement.delta > 0 ? "+" : ""}
                        {num(movement.delta)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </details>
      </div>
    </>
  );
}
