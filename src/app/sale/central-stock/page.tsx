import Link from "next/link";
import { SaleHeader } from "@/components/sale/SaleHeader";
import { Button } from "@/components/ui/button";
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
import { CentralStockReceiveForm } from "@/components/sale/CentralStockTools";
import { CentralShopStockBrowser } from "@/components/sale/CentralShopStockBrowser";
import { CentralStockCreateProductDialog } from "@/components/sale/CentralStockCreateProductDialog";
import { CentralStockProductTable } from "@/components/sale/CentralStockProductTable";
import { LiveRefresh } from "@/components/sale/LiveRefresh";
import { isSandboxShopName } from "@/lib/platform/platforms";
import { SALE_THEME } from "@/lib/sale/theme";
import {
  centralStockTotals,
  listCentralStockRows,
  listLinkedShops,
  listShopStocksForLinking,
  type CentralStatusFilter,
} from "@/lib/stock/central";
import { groupCentralStockRows } from "@/lib/stock/central-list";

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
  status?: string;
}>;

function num(value: number): string {
  return value.toLocaleString("th-TH");
}

/** ตัวกรองสถานะของรายการสินค้า (คนละตัวกับแท็บผูก/ยังไม่ผูกในไดอะล็อกผูก SKU) */
const STATUS_OPTIONS: Array<{ key: CentralStatusFilter; label: string }> = [
  { key: "all", label: "ทั้งหมด" },
  { key: "out", label: "ของหมด" },
  { key: "unlinked", label: "ยังไม่ผูกประกาศ" },
];

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
  const status: CentralStatusFilter =
    params.status === "out" || params.status === "unlinked" ? params.status : "all";
  const shopKey = params.shop ?? "";

  const [totals, list, shops] = await Promise.all([
    centralStockTotals(),
    listCentralStockRows({ q, page, status }),
    listLinkedShops(),
  ]);

  // รหัสในหน้านี้จัดกลุ่มตาม product_id ของประกาศที่ผูก — รหัสที่ยังไม่ผูกเป็นกลุ่มของตัวเอง
  const groups = groupCentralStockRows(list.rows);

  const keyOf = (shop: { platform: string; shopId: string }) => `${shop.platform}:${shop.shopId}`;
  const selected = shops.find((shop) => keyOf(shop) === shopKey) ?? shops[0] ?? null;
  // ปุ่มสร้างสินค้าสร้างได้เฉพาะร้านทดสอบ — เลือกร้านทดสอบจากรายการที่เชื่อมต่อไว้
  const sandboxShop =
    shops.find((shop) => shop.platform === "TikTok" && isSandboxShopName(shop.shopName)) ?? null;
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
  const href = (
    next: Partial<{
      q: string;
      page: number;
      shop: string;
      sq: string;
      spage: number;
      filter: string;
      status: CentralStatusFilter;
    }>,
  ) => {
    const qs = new URLSearchParams();
    const nextQ = next.q ?? q;
    const nextPage = next.page ?? page;
    const nextShop = next.shop ?? (selected ? keyOf(selected) : "");
    const nextSq = next.sq ?? sq;
    const nextSpage = next.spage ?? spage;
    const nextFilter = next.filter ?? filter;
    const nextStatus = next.status ?? status;
    if (nextQ) qs.set("q", nextQ);
    if (nextPage > 1) qs.set("page", String(nextPage));
    if (nextShop) qs.set("shop", nextShop);
    if (nextSq) qs.set("sq", nextSq);
    if (nextSpage > 1) qs.set("spage", String(nextSpage));
    if (nextFilter !== "all") qs.set("filter", nextFilter);
    if (nextStatus !== "all") qs.set("status", nextStatus);
    const text = qs.toString();
    return text ? `/sale/central-stock?${text}` : "/sale/central-stock";
  };

  return (
    <div className="workspace-page flex min-w-0 flex-col gap-4">
      <SaleHeader
        eyebrow="สต็อกกลาง"
        title="สินค้า · สต็อกกลาง"
        description="สินค้า 1 แถวหลัก ไซส์เป็นแถวลูก — สร้างสินค้าใหม่ได้จากหน้านี้ เติมของที่เดียวแล้วทุกร้านที่ผูกเห็นยอดเดียวกัน"
      />

      {/* แถวเครื่องมือเดียว: ค้นหา · ตัวกรอง · ปุ่มงานหลัก — การ์ดสรุป 4 ใบเดิมยุบเป็นข้อความบรรทัดเดียว */}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <form action="/sale/central-stock" className="flex min-w-[200px] flex-1 items-center gap-2">
            {selected ? <input type="hidden" name="shop" value={keyOf(selected)} /> : null}
            {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
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
            <Button type="submit" size="sm" variant="secondary" className="min-h-[40px]">
              ค้นหา
            </Button>
            {q ? (
              <Button asChild size="sm" variant="ghost" className="min-h-[40px]">
                <Link href={href({ q: "", page: 1 })} scroll={false}>
                  ล้างคำค้น
                </Link>
              </Button>
            ) : null}
          </form>

          <div role="group" aria-label="ตัวกรองสถานะ" className="flex flex-wrap items-center gap-1.5">
            {STATUS_OPTIONS.map((option) => (
              <Button
                key={option.key}
                asChild
                size="sm"
                variant={status === option.key ? "secondary" : "outline"}
                className="min-h-[40px]"
              >
                <Link
                  href={href({ status: option.key, page: 1 })}
                  scroll={false}
                  aria-current={status === option.key ? "true" : undefined}
                >
                  {option.label}
                </Link>
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <CentralStockCreateProductDialog
              shopId={sandboxShop?.shopId ?? ""}
              shopName={sandboxShop?.shopName ?? null}
            />
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="min-h-[40px]">
                  รับเข้าสต็อกกลาง
                </Button>
              </DialogTrigger>
              <DialogContent className="@container max-h-[85dvh] max-w-[520px] overflow-y-auto" style={SALE_THEME}>
                <DialogHeader className="pr-11">
                  <DialogTitle>รับเข้าสต็อกกลาง</DialogTitle>
                  <DialogDescription>รับของเข้ารหัสกลาง — ยอดอัปเดตทันทีหลังบันทึก</DialogDescription>
                </DialogHeader>
                <CentralStockReceiveForm />
              </DialogContent>
            </Dialog>
            <CentralStockLinkDialog defaultOpen={Boolean(sq) || filter !== "all" || spage > 1}>
              <div className="flex min-w-0 flex-col gap-3">
                {shops.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">ยังไม่มีร้านที่เชื่อมต่อ</p>
                ) : (
                  <>
                    {/* แผงตัวกรองของตัวเอง — เลือกร้าน/แท็บ/ช่องค้นหาอยู่กลุ่มเดียวกัน แยกชัดจากตารางด้านล่าง */}
                    <div className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-muted/30 p-3">
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
                    </div>

                    {/* ค้นหาทันทีที่พิมพ์ในคอมโพเนนต์นี้ — ข้อมูลแรกมาจาก server render แล้วดึงเองผ่าน API */}
                    {selected && shopStocks ? (
                      <CentralShopStockBrowser
                        platform={selected.platform}
                        shopId={selected.shopId}
                        filter={filter}
                        initialSq={sq}
                        initial={{
                          rows: shopStocks.rows,
                          total: shopStocks.total,
                          page: shopStocks.page,
                          pageCount: shopStocks.pageCount,
                        }}
                      />
                    ) : null}
                  </>
                )}
              </div>
            </CentralStockLinkDialog>
          </div>
        </div>

        {/* สรุปบรรทัดเดียว แทนการ์ดตัวเลข 4 ใบที่เคยกินพื้นที่หัวหน้า */}
        <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
          <span>
            รหัสในคลังกลาง <b className="mono tabular-nums text-foreground">{num(totals.skus)}</b>
          </span>
          <span>
            ชิ้นคงเหลือรวม <b className="mono tabular-nums text-foreground">{num(totals.units)}</b>
          </span>
          <span>
            ของหมด{" "}
            <b className="mono tabular-nums text-[color:var(--danger)]">{num(totals.out)}</b>
          </span>
          <span>
            ประกาศที่ผูก <b className="mono tabular-nums text-foreground">{num(totals.links)}</b>
          </span>
          <LiveRefresh />
        </p>
      </div>

      {/* ตารางแบบหน้า Shipnity เต็มความกว้างใต้หัวหน้า: แถวหลัก = สินค้า · แถวลูก = รหัสกลาง (กาง/ย่อได้) */}
      <CentralStockProductTable
        groups={groups}
        emptyText={
          q
            ? "ไม่พบรหัสที่ค้นหา"
            : status !== "all"
              ? "ไม่มีรหัสในสถานะที่กรองไว้ — กด “ทั้งหมด” เพื่อดูทุกรหัส"
              : totals.links > 0
                ? `ผูกไว้ ${num(totals.links)} ประกาศแล้ว แต่ยังไม่มีของในคลังกลาง — กรอกจำนวนในช่อง “รับเข้าสต็อกกลาง” ด้านบนแล้วกดบันทึก`
                : "ยังไม่มีของในคลังกลาง — ใช้ช่อง “รับเข้าสต็อกกลาง” ด้านบน หรือผูก SKU ของร้านด้านล่างก่อน"
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
        <span>
          แสดง {num(list.rows.length)} จาก {num(list.total)} รหัส · หน้า {num(list.page)} / {num(list.pageCount)}
        </span>
        <span className="flex items-center gap-2">
          {list.page > 1 ? (
            <Button asChild size="sm" variant="outline" className="min-h-[40px]">
              <Link href={href({ page: list.page - 1 })} scroll={false}>
                ก่อนหน้า
              </Link>
            </Button>
          ) : null}
          {list.page < list.pageCount ? (
            <Button asChild size="sm" variant="outline" className="min-h-[40px]">
              <Link href={href({ page: list.page + 1 })} scroll={false}>
                ถัดไป
              </Link>
            </Button>
          ) : null}
        </span>
      </div>

    </div>
  );
}
