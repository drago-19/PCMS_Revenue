import Link from "next/link";
import { SaleHeader } from "@/components/sale/SaleHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CentralShopPicker } from "@/components/sale/CentralShopPicker";
import { CentralStockLinkDialog } from "@/components/sale/CentralStockLinkDialog";
import { CentralLinkRow, CentralStockReceiveForm } from "@/components/sale/CentralStockTools";
import { CentralStockRowActions } from "@/components/sale/CentralStockRowActions";
import { CentralStockRestoreButton } from "@/components/sale/CentralStockRestoreButton";
import { LiveRefresh } from "@/components/sale/LiveRefresh";
import { thaiDateTime } from "@/lib/platform/period";
import { SALE_THEME } from "@/lib/sale/theme";
import {
  centralStockTotals,
  listArchivedCentralStock,
  listCentralStockRows,
  listLinkedShops,
  listShopStocksForLinking,
} from "@/lib/stock/central";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "ฝ่ายขาย · สต็อกกลาง" };

type SearchParams = Promise<{
  q?: string;
  page?: string;
  shop?: string;
  sq?: string;
  spage?: string;
  filter?: string;
  unlinked?: string;
}>;

function num(value: number): string {
  return value.toLocaleString("th-TH");
}

export default async function CentralStockPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const sq = (params.sq ?? "").trim();
  const spage = Math.max(1, Number(params.spage ?? "1") || 1);
  // แท็บสถานะการผูก — รับ filter ใหม่เป็นหลัก และยังเข้าใจ unlinked=1 ของลิงก์เก่า
  const filter: "all" | "linked" | "unlinked" =
    params.filter === "linked" || params.filter === "unlinked"
      ? params.filter
      : params.unlinked === "1"
        ? "unlinked"
        : "all";
  const shopKey = params.shop ?? "";

  const [totals, list, shops, archived] = await Promise.all([
    centralStockTotals(),
    listCentralStockRows({ q, page }),
    listLinkedShops(),
    listArchivedCentralStock(20),
  ]);

  const keyOf = (shop: { platform: string; shopId: string }) => `${shop.platform}:${shop.shopId}`;
  const selected = shops.find((shop) => keyOf(shop) === shopKey) ?? shops[0] ?? null;
  const shopStocks = selected
    ? await listShopStocksForLinking({
        platform: selected.platform,
        shopId: selected.shopId,
        q: sq,
        linkFilter: filter,
        page: spage,
      })
    : null;

  // ลิงก์คงคำค้น/หน้าระหว่างสลับแท็บ — ใช้ตัวช่วยเดียวกันทั้งหน้า
  const href = (next: Partial<{ q: string; page: number; shop: string; sq: string; spage: number; filter: string }>) => {
    const qs = new URLSearchParams();
    const nextQ = next.q ?? q;
    const nextPage = next.page ?? page;
    const nextShop = next.shop ?? (selected ? keyOf(selected) : "");
    const nextSq = next.sq ?? sq;
    const nextSpage = next.spage ?? spage;
    const nextFilter = next.filter ?? filter;
    if (nextQ) qs.set("q", nextQ);
    if (nextPage > 1) qs.set("page", String(nextPage));
    if (nextShop) qs.set("shop", nextShop);
    if (nextSq) qs.set("sq", nextSq);
    if (nextSpage > 1) qs.set("spage", String(nextSpage));
    if (nextFilter !== "all") qs.set("filter", nextFilter);
    const text = qs.toString();
    return text ? `/sale/central-stock?${text}` : "/sale/central-stock";
  };

  return (
    <div className="workspace-page flex min-w-0 flex-col gap-4">
      <SaleHeader
        eyebrow="สต็อกกลาง"
        title="สต็อกกลาง · ทุกแพลตฟอร์มใช้ยอดเดียวกัน"
        description="เติมของที่เดียวแล้วผูก SKU ของแต่ละร้านเข้าที่รหัสกลาง — ยอดกลางหักอัตโนมัติเมื่อขาย และเขียนลงประกาศของทุกร้านที่ผูกไว้"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <LiveRefresh />
      </div>

      {/* การ์ดตัวเลขแยกสีตามความหมาย: น้ำเงิน=จำนวนรหัส · เขียว=ของในคลัง · แดง=ของหมด · เขียวอ่อน=การเชื่อมโยง */}
      <div className="grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <Card padding="padded" className="bg-[color:var(--accent)] ring-1 ring-inset ring-[color:var(--accent-foreground)]/10">
          <p className="text-[12px] font-semibold text-[color:var(--accent-foreground)]">รหัสในคลังกลาง</p>
          <p className="mono text-[24px] font-bold tabular-nums text-[color:var(--accent-foreground)]">{num(totals.skus)}</p>
        </Card>
        <Card padding="padded" className="bg-[color:var(--ok-soft)] ring-1 ring-inset ring-[color:var(--ok)]/15">
          <p className="text-[12px] font-semibold text-[color:var(--ok)]">ชิ้นคงเหลือรวม</p>
          <p className="mono text-[24px] font-bold tabular-nums text-[color:var(--ok)]">{num(totals.units)}</p>
        </Card>
        <Card padding="padded">
          <p className="text-[12px] font-semibold text-[color:var(--danger)]">รหัสที่ของหมด</p>
          <p className={cn("mono text-[24px] font-bold tabular-nums", totals.out > 0 ? "text-[color:var(--danger)]" : "text-[color:var(--danger)]/60")}>
            {num(totals.out)}
          </p>
        </Card>
        <Card padding="padded" className="bg-[color:var(--ok-soft)] ring-1 ring-inset ring-[color:var(--ok)]/15">
          <p className="text-[12px] font-semibold text-[color:var(--ok)]">ประกาศที่ผูกไว้</p>
          <p className="mono text-[24px] font-bold tabular-nums text-[color:var(--ok)]">{num(totals.links)}</p>
        </Card>
      </div>

      <Card padding="padded" className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14.5px] font-bold">รายการในคลังกลาง</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">เรียงจากของน้อยไปมาก</Badge>
            {/* ปุ่มผูก SKU กับรับเข้าสต็อกกลางอยู่ด้วยกันที่หัวการ์ด — ไม่ต้องเลื่อนลงท้ายหน้า */}
            <CentralStockLinkDialog defaultOpen={Boolean(sq) || filter !== "all" || spage > 1}>
              <div className="flex min-w-0 flex-col gap-3">
                {shops.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">ยังไม่มีร้านที่เชื่อมต่อ</p>
                ) : (
                  <>
                    {/* dropdown เลือกร้าน + แท็บผูกแล้ว/ยังไม่ผูก — ร้านเยอะไม่ล้นแถวอีกต่อไป */}
                    <CentralShopPicker
                      shops={shops}
                      selectedKey={selected ? keyOf(selected) : ""}
                      filter={filter}
                      counts={{
                        all: shopStocks ? shopStocks.linkedCount + shopStocks.unlinkedCount : 0,
                        linked: shopStocks?.linkedCount ?? 0,
                        unlinkedCount: shopStocks?.unlinkedCount ?? 0,
                      }}
                      keep={{ q, sq, page }}
                    />

                    <form action="/sale/central-stock" className="flex min-w-0 flex-wrap items-center gap-2">
                      {selected ? <input type="hidden" name="shop" value={keyOf(selected)} /> : null}
                      {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
                      <label className="sr-only" htmlFor="shop-search">
                        ค้นหา SKU ในร้านนี้
                      </label>
                      <Input
                        id="shop-search"
                        name="sq"
                        defaultValue={sq}
                        placeholder="ค้นหารหัส SKU หรือชื่อสินค้าในร้านนี้"
                        className="h-10 min-w-0 flex-1 text-[13px]"
                      />
                      <Button type="submit" size="sm" variant="secondary">
                        ค้นหา
                      </Button>
                    </form>

                    {shopStocks ? (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[760px] text-[12.5px]">
                            <thead>
                              <tr className="border-b border-[color:var(--foreground)]/25 text-[11.5px] font-semibold text-muted-foreground">
                                <th scope="col" className="py-1.5 pr-2 text-left font-bold">
                                  SKU บนร้าน
                                </th>
                                <th scope="col" className="py-1.5 pr-2 text-left font-bold">
                                  สินค้า
                                </th>
                                <th scope="col" className="py-1.5 pr-2 text-right font-bold">
                                  คงเหลือบนร้าน
                                </th>
                                <th scope="col" className="py-1.5 pr-2 text-left font-bold">
                                  รหัสกลางที่ผูก
                                </th>
                                <th scope="col" className="py-1.5 text-right font-bold">
                                  คงเหลือกลาง
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {shopStocks.rows.map((row) => (
                                <tr key={row.skuId} className="border-b border-border/60">
                                  <td className="mono py-1.5 pr-2 font-bold">{row.sellerSku ?? row.skuId}</td>
                                  <td className="max-w-[240px] truncate py-1.5 pr-2">{row.productName ?? "—"}</td>
                                  <td className="mono py-1.5 pr-2 text-right">{num(row.quantity)}</td>
                                  <td className="py-1.5 pr-2">
                                    {selected ? (
                                      <CentralLinkRow
                                        platform={selected.platform}
                                        shopId={selected.shopId}
                                        skuId={row.skuId}
                                        sellerSku={row.sellerSku}
                                        linkedCode={row.linkedCode}
                                      />
                                    ) : null}
                                  </td>
                                  <td
                                    className={cn(
                                      "mono py-1.5 text-right",
                                      row.linkedOnHand !== null && row.linkedOnHand <= 0 ? "font-bold text-[#b42318]" : "",
                                    )}
                                  >
                                    {row.linkedOnHand === null ? "—" : num(row.linkedOnHand)}
                                  </td>
                                </tr>
                              ))}
                              {shopStocks.rows.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                                    {sq || filter !== "all" ? "ไม่พบ SKU ตามเงื่อนไขนี้" : "ร้านนี้ยังไม่มี SKU ที่ดึงมา"}
                                  </td>
                                </tr>
                              ) : null}
                            </tbody>
                          </table>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
                          <span>
                            แสดง {num(shopStocks.rows.length)} จาก {num(shopStocks.total)} SKU · หน้า{" "}
                            {num(shopStocks.page)} / {num(shopStocks.pageCount)}
                          </span>
                          <span className="flex items-center gap-2">
                            {shopStocks.page > 1 ? (
                              <Button asChild size="sm" variant="outline">
                                <Link href={href({ spage: shopStocks.page - 1 })} scroll={false}>
                                  ก่อนหน้า
                                </Link>
                              </Button>
                            ) : null}
                            {shopStocks.page < shopStocks.pageCount ? (
                              <Button asChild size="sm" variant="outline">
                                <Link href={href({ spage: shopStocks.page + 1 })} scroll={false}>
                                  ถัดไป
                                </Link>
                              </Button>
                            ) : null}
                          </span>
                        </div>
                      </>
                    ) : null}
                  </>
                )}
              </div>
            </CentralStockLinkDialog>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">รับเข้าสต็อกกลาง</Button>
              </DialogTrigger>
              <DialogContent className="@container max-h-[85dvh] max-w-[520px] overflow-y-auto" style={SALE_THEME}>
                <DialogHeader className="pr-11">
                  <DialogTitle>รับเข้าสต็อกกลาง</DialogTitle>
                  <DialogDescription>รับของเข้ารหัสกลาง — ยอดอัปเดตทันทีหลังบันทึก</DialogDescription>
                </DialogHeader>
                <CentralStockReceiveForm />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <form action="/sale/central-stock" className="flex min-w-0 flex-wrap items-center gap-2">
          {selected ? <input type="hidden" name="shop" value={keyOf(selected)} /> : null}
          <label className="sr-only" htmlFor="central-search">
            ค้นหารหัสหรือชื่อสินค้า
          </label>
          <Input
            id="central-search"
            name="q"
            defaultValue={q}
            placeholder="ค้นหารหัสหรือชื่อสินค้า"
            className="h-10 min-w-0 flex-1 text-[13px]"
          />
          <Button type="submit" size="sm" variant="secondary">
            ค้นหา
          </Button>
          {q ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={href({ q: "", page: 1 })} scroll={false}>
                ล้างคำค้น
              </Link>
            </Button>
          ) : null}
        </form>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-[12.5px]">
            <thead>
              <tr className="border-b border-[color:var(--foreground)]/25 text-[11.5px] font-semibold text-muted-foreground">
                <th scope="col" className="py-1.5 pr-2 text-left font-bold">รูป</th>
                <th scope="col" className="py-1.5 pr-2 text-left font-bold">รหัสกลาง</th>
                <th scope="col" className="py-1.5 pr-2 text-left font-bold">ชื่อสินค้า</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-bold">คงเหลือ</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-bold">ร้านที่ผูก</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-bold">ประกาศที่ผูก</th>
                <th scope="col" className="py-1.5 text-right font-bold">อัปเดต</th>
              </tr>
            </thead>
            <tbody>
              {/* แถวทั้งแถวกดได้ — คอมโพเนนต์เรนเดอร์ <tr> เองและเปิดป๊อปอัพเมื่อกด */}
              {list.rows.map((row) => (
                <CentralStockRowActions
                  key={row.skuCode}
                  skuCode={row.skuCode}
                  productName={row.productName}
                  onHand={row.onHand}
                  hasImage={row.hasImage}
                  imageUrl={row.imageUrl}
                  shopCount={row.shopCount}
                  listingCount={row.listingCount}
                  updatedAtText={thaiDateTime(row.updatedAt)}
                />
              ))}
              {list.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">
                    {q
                      ? "ไม่พบรหัสที่ค้นหา"
                      : totals.links > 0
                        ? `ผูกไว้ ${num(totals.links)} ประกาศแล้ว แต่ยังไม่มีของในคลังกลาง — กรอกจำนวนในช่อง “รับเข้าสต็อกกลาง” ด้านบนแล้วกดบันทึก`
                        : "ยังไม่มีของในคลังกลาง — ใช้ช่อง “รับเข้าสต็อกกลาง” ด้านบน หรือผูก SKU ของร้านด้านล่างก่อน"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
          <span>
            แสดง {num(list.rows.length)} จาก {num(list.total)} รหัส · หน้า {num(list.page)} / {num(list.pageCount)}
          </span>
          <span className="flex items-center gap-2">
            {list.page > 1 ? (
              <Button asChild size="sm" variant="outline">
                <Link href={href({ page: list.page - 1 })} scroll={false}>ก่อนหน้า</Link>
              </Button>
            ) : null}
            {list.page < list.pageCount ? (
              <Button asChild size="sm" variant="outline">
                <Link href={href({ page: list.page + 1 })} scroll={false}>ถัดไป</Link>
              </Button>
            ) : null}
          </span>
        </div>
      </Card>

      {archived.length > 0 ? (
        <Card padding="padded" className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[14.5px] font-bold">รหัสที่เลิกใช้แล้ว</h2>
            <span className="text-[11.5px] text-muted-foreground">ซ่อนจากรายการหลัก — ประวัติยังอยู่ครบ นำกลับได้</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12.5px]" aria-label="รหัสที่เลิกใช้แล้ว">
              <thead>
                <tr className="border-b border-[color:var(--foreground)]/25 text-[11.5px] font-semibold text-muted-foreground">
                  <th scope="col" className="py-1.5 pr-2 text-left font-bold">รหัสกลาง</th>
                  <th scope="col" className="py-1.5 pr-2 text-left font-bold">ชื่อสินค้า</th>
                  <th scope="col" className="py-1.5 pr-2 text-right font-bold">คงเหลือตอนเลิกใช้</th>
                  <th scope="col" className="py-1.5 pr-2 text-right font-bold">เลิกใช้เมื่อ</th>
                  <th scope="col" className="py-1.5 text-right font-bold">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {archived.map((row) => (
                  <tr key={row.skuCode} className="border-b border-border/60">
                    <td className="mono py-1.5 pr-2 font-bold">{row.skuCode}</td>
                    <td className="max-w-[240px] truncate py-1.5 pr-2">{row.productName ?? "—"}</td>
                    <td className="mono py-1.5 pr-2 text-right">{num(row.onHand)}</td>
                    <td className="py-1.5 pr-2 text-right text-muted-foreground">{thaiDateTime(row.archivedAt)}</td>
                    <td className="py-1.5 text-right">
                      <CentralStockRestoreButton skuCode={row.skuCode} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <p className="text-[12px] leading-5 text-muted-foreground">
        หมายเหตุ: ยอดกลางหักจากออเดอร์ทุกช่องทางอัตโนมัติ (TikTok/Shopee จาก API · Facebook จาก Shipnity) และเขียนยอดคงเหลือกลับไปที่
        ประกาศของทุกร้านที่ผูกไว้ภายในรอบนาที — รหัสที่ยังไม่เคยเติมของจะไม่ถูกเขียนลงประกาศ
      </p>
    </div>
  );
}
