"use client";

// ตาราง "รายการในคลังกลาง" ในรูปแบบหน้า "สินค้า" ของ Shipnity:
// แถวหลัก = สินค้า (สรุปทั้งตัว) · แถวลูก = รหัสกลาง/ไซส์ ที่กางออกมาได้
// จอเล็ก (360px) แสดงเป็นการ์ด ไม่มีการเลื่อนแนวนอนทั้งหน้า

import { Fragment, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CentralStockManageDialog } from "@/components/sale/CentralStockRowActions";
import { platformImageSrc } from "@/lib/platform/image-proxy";
import { thaiDateTime } from "@/lib/platform/period";
import type { CentralListGroup, CentralListSku } from "@/lib/stock/central-list";
import { cn } from "@/lib/utils";

function num(value: number): string {
  return value.toLocaleString("th-TH");
}

/** ราคาเดียวเมื่อทุกประกาศเท่ากัน · เป็นช่วงเมื่อแต่ละประกาศไม่เท่ากัน */
function priceText(price: { min: number; max: number } | null, currency: string | null): string {
  if (!price) return "—";
  const symbol = !currency || currency === "THB" ? "฿" : `${currency} `;
  if (price.min === price.max) return `${symbol}${num(price.min)}`;
  return `${num(price.min)}–${symbol}${num(price.max)}`;
}

/** รูปของกลุ่ม: รูปที่แนบกับรหัสกลางมาก่อน แล้วค่อยใช้รูปจากประกาศ */
function groupImageSrc(group: CentralListGroup): string | null {
  const withStored = group.skus.find((sku) => sku.hasImage);
  if (withStored) return `/api/platform/central-stock/image?code=${encodeURIComponent(withStored.skuCode)}`;
  if (group.imageUrl) return platformImageSrc(group.imageUrl) ?? group.imageUrl;
  return null;
}

export function CentralStockProductTable({
  groups,
  emptyText,
}: {
  groups: CentralListGroup[];
  emptyText: string;
}) {
  // เก็บเฉพาะกลุ่มที่ผู้ใช้กดย่อ — ค่าเริ่มต้นกางไว้ให้เห็นไซส์เหมือนหน้า Shipnity
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const isOpen = (key: string) => !collapsed[key];
  const toggle = (key: string) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  if (groups.length === 0) {
    return <p className="py-6 text-center text-[13px] text-muted-foreground">{emptyText}</p>;
  }

  const manageDialog = (sku: CentralListSku, label: string) => (
    <CentralStockManageDialog
      skuCode={sku.skuCode}
      productName={sku.productName}
      onHand={sku.onHand}
      listingCount={sku.listingCount}
      updatedAtText={thaiDateTime(sku.updatedAt)}
    >
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-[40px] whitespace-nowrap"
        aria-label={`${label} ${sku.skuCode}`}
      >
        {label}
      </Button>
    </CentralStockManageDialog>
  );

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* จอใหญ่: สินค้าเป็นแถวหลัก · รหัสกลาง (ไซส์) เป็นแถวลูกอยู่ใต้กัน */}
      <div className="hidden min-w-0 md:block">
        <Table containerClassName="overflow-x-auto">
          <TableHeader>
            <TableRow>
              <TableHead>สินค้า / รหัส</TableHead>
              <TableHead className="num">ราคา</TableHead>
              <TableHead
                className="num"
                title="คงเหลือ (ขายได้) = ยอดกลางที่ถูกหักตอนขายแล้ว — ไม่ได้ลบยอดจองซ้ำ"
              >
                คงเหลือ (ขายได้)
              </TableHead>
              <TableHead
                className="num"
                title="จอง = ชิ้นที่อยู่ในออเดอร์ซึ่งร้านยังไม่ส่ง · ยอดนี้ถูกนับรวมอยู่ใน «รวมในมือ» แล้ว"
              >
                จอง
              </TableHead>
              <TableHead className="num" title="รวมในมือ = คงเหลือ (ขายได้) + จอง · ใช้เทียบกับยอดใน Shipnity">
                รวมในมือ
              </TableHead>
              <TableHead className="num" title="จำนวนประกาศของร้านที่ผูกกับรหัสกลางนี้">
                ผูกไว้
              </TableHead>
              <TableHead className="num">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => {
              const single = group.skuCount === 1 ? group.skus[0] : null;
              const open = isOpen(group.key);
              const imageSrc = groupImageSrc(group);
              return (
                <Fragment key={group.key}>
                  <TableRow className="bg-muted/30">
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2">
                        {group.skuCount > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => toggle(group.key)}
                            aria-expanded={open}
                            aria-label={`${open ? "ซ่อน" : "แสดง"}รหัสย่อยของ ${
                              group.productName ?? group.skus[0]?.skuCode ?? "สินค้านี้"
                            }`}
                            className="shrink-0"
                          >
                            <ChevronDown
                              className={cn("size-4 transition-transform", !open && "-rotate-90")}
                              aria-hidden="true"
                            />
                          </Button>
                        ) : (
                          <span className="size-10 shrink-0" aria-hidden="true" />
                        )}
                        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                          {imageSrc ? (
                            <img src={imageSrc} alt="" loading="lazy" className="size-full object-cover" />
                          ) : null}
                        </span>
                        <div className="min-w-0">
                          <p className="max-w-[260px] truncate font-bold">
                            {group.productName ?? single?.skuCode ?? "—"}
                          </p>
                          <p className="truncate text-[11.5px] text-muted-foreground">
                            {single ? (
                              <span className="mono">{single.skuCode}</span>
                            ) : (
                              `รวม ${num(group.skuCount)} รหัสย่อย`
                            )}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="num font-bold">{priceText(group.price, group.currency)}</TableCell>
                    <TableCell
                      className={cn("num font-bold", group.totalAvailable < 0 && "text-[color:var(--danger)]")}
                    >
                      {num(group.totalAvailable)}
                    </TableCell>
                    <TableCell className="num">{num(group.totalReserved)}</TableCell>
                    <TableCell className={cn("num", group.totalOnHand < 0 && "text-[color:var(--danger)]")}>
                      {num(group.totalOnHand)}
                    </TableCell>
                    <TableCell className="num">
                      {num(group.listingCount)}
                      <span className="block text-[11px] text-muted-foreground">{num(group.shopCount)} ร้าน</span>
                    </TableCell>
                    <TableCell className="text-right">
                      {single ? manageDialog(single, "เติมสต็อก") : (
                        <span className="text-[11.5px] text-muted-foreground">กางดูรายรหัส</span>
                      )}
                    </TableCell>
                  </TableRow>

                  {/* แถวลูก: รหัสกลางหนึ่งแถว = หนึ่งไซส์ของสินค้านี้ */}
                  {single || !open
                    ? null
                    : group.skus.map((sku) => (
                        <TableRow key={sku.skuCode} className="bg-muted/10">
                          <TableCell>
                            <div className="flex min-w-0 items-center gap-1.5 pl-8">
                              <span aria-hidden="true" className="text-muted-foreground">
                                ↳
                              </span>
                              <span className="mono truncate font-bold">{sku.skuCode}</span>
                              <Badge variant="neutral" title={sku.variantHint ?? undefined}>
                                {sku.variantText}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="num">{priceText(sku.price, sku.currency)}</TableCell>
                          <TableCell className={cn("num font-bold", sku.available < 0 && "text-[color:var(--danger)]")}>
                            {num(sku.available)}
                          </TableCell>
                          <TableCell className="num">{num(sku.reserved)}</TableCell>
                          <TableCell className={cn("num", sku.onHandTotal < 0 && "text-[color:var(--danger)]")}>
                            {num(sku.onHandTotal)}
                          </TableCell>
                          <TableCell className="num">{num(sku.listingCount)}</TableCell>
                          <TableCell className="text-right">{manageDialog(sku, "เติมสต็อก")}</TableCell>
                        </TableRow>
                      ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* จอมือถือ (360px): การ์ดต่อสินค้า — ความกว้างยืดตามจอ ไม่มีการเลื่อนแนวนอน */}
      <div className="flex min-w-0 flex-col gap-2.5 md:hidden">
        {groups.map((group) => {
          const open = isOpen(group.key);
          const imageSrc = groupImageSrc(group);
          return (
            <div key={group.key} className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-3">
              <div className="flex min-w-0 items-start gap-2">
                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                  {imageSrc ? <img src={imageSrc} alt="" loading="lazy" className="size-full object-cover" /> : null}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">
                    {group.productName ?? group.skus[0]?.skuCode ?? "—"}
                  </p>
                  <p className="text-[11.5px] text-muted-foreground">
                    {num(group.skuCount)} รหัส · {priceText(group.price, group.currency)}
                  </p>
                </div>
                {group.skuCount > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => toggle(group.key)}
                    aria-expanded={open}
                    aria-label={`${open ? "ซ่อน" : "แสดง"}รหัสย่อยของ ${
                      group.productName ?? group.skus[0]?.skuCode ?? "สินค้านี้"
                    }`}
                    className="shrink-0"
                  >
                    <ChevronDown
                      className={cn("size-4 transition-transform", !open && "-rotate-90")}
                      aria-hidden="true"
                    />
                  </Button>
                ) : null}
              </div>

              <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 px-2 py-1.5 text-center">
                <div className="min-w-0">
                  <dt className="text-[10.5px] font-bold text-muted-foreground">คงเหลือ (ขายได้)</dt>
                  <dd
                    className={cn(
                      "mono text-[15px] font-bold tabular-nums",
                      group.totalAvailable < 0 && "text-[color:var(--danger)]",
                    )}
                  >
                    {num(group.totalAvailable)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10.5px] font-bold text-muted-foreground">จอง</dt>
                  <dd className="mono text-[15px] font-bold tabular-nums">{num(group.totalReserved)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10.5px] font-bold text-muted-foreground">รวมในมือ</dt>
                  <dd
                    className={cn(
                      "mono text-[15px] font-bold tabular-nums",
                      group.totalOnHand < 0 && "text-[color:var(--danger)]",
                    )}
                  >
                    {num(group.totalOnHand)}
                  </dd>
                </div>
              </dl>

              {open ? (
                <ul className="flex min-w-0 list-none flex-col gap-2 p-0">
                  {group.skus.map((sku) => (
                    <li
                      key={sku.skuCode}
                      className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="mono block truncate text-[12.5px] font-bold">{sku.skuCode}</span>
                        <span className="mb-1 block text-[11.5px] text-muted-foreground" title={sku.variantHint ?? undefined}>
                          {sku.variantText} · {priceText(sku.price, sku.currency)} · ผูก {num(sku.listingCount)} ประกาศ
                        </span>
                        <span className="block text-[11.5px] tabular-nums">
                          คงเหลือ{" "}
                          <b className={sku.available < 0 ? "text-[color:var(--danger)]" : ""}>{num(sku.available)}</b>
                          {" · "}จอง {num(sku.reserved)} · รวมในมือ {num(sku.onHandTotal)}
                        </span>
                      </div>
                      <span className="shrink-0">{manageDialog(sku, "เติมสต็อก")}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
