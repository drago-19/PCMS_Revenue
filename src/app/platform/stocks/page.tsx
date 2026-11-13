import Link from "next/link";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { PlatformNav } from "@/components/platform/PlatformNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getLastStockSync, getStockMovements, getStockRows, syncStock } from "@/lib/platform/stock";
import { listPlatformAccounts, TIKTOK_PLATFORM } from "@/lib/platform/store";
import { thaiDateTime } from "@/lib/platform/period";

export const dynamic = "force-dynamic";

export const metadata = { title: "แพลตฟอร์ม · สต็อก" };

type SearchParams = Promise<{ shop?: string; sync?: string }>;

function num(value: number): string {
  return value.toLocaleString("th-TH");
}

export default async function PlatformStockPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const accounts = await listPlatformAccounts(TIKTOK_PLATFORM);
  const shopId = params.shop ?? accounts[0]?.accountKey ?? null;

  if (!shopId) {
    return (
      <div className="workspace-page flex min-w-0 flex-col gap-4">
        <PageHeader eyebrow="TikTok Shop" title="สต็อกของร้านนี้" description="ยังไม่มีร้านที่เชื่อมต่อ" />
        <p className="text-[13px] text-muted-foreground">เชื่อมร้าน TikTok ก่อน แล้วจำนวนสต็อกจะดึงมาแสดงที่นี่</p>
      </div>
    );
  }

  const sync = params.sync ? await syncStock(shopId) : null;
  const [rows, movements, lastSync] = await Promise.all([
    getStockRows(shopId),
    getStockMovements(shopId),
    getLastStockSync(shopId),
  ]);

  const totalQty = rows.reduce((sum, row) => sum + row.quantity, 0);
  const outOfStock = rows.filter((row) => row.quantity <= 0).length;
  const unmatched = rows.filter((row) => !row.productCode).length;
  const shopName = accounts.find((account) => account.accountKey === shopId)?.shopName ?? shopId;

  return (
    <div className="workspace-page flex min-w-0 flex-col gap-4">
      <PageHeader
        eyebrow="TikTok Shop"
        title="สต็อกของร้านนี้"
        description={`จำนวนคงเหลือดึงจาก TikTok โดยตรง · ร้าน ${shopName} · อัปเดตล่าสุด ${
          lastSync ? thaiDateTime(lastSync) : "ยังไม่เคยดึง"
        }`}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href={`/platform/stocks?shop=${encodeURIComponent(shopId)}&sync=1`} scroll={false}>
              ดึงสต็อกล่าสุด
            </Link>
          </Button>
        }
      />

      <PlatformNav active="products" shop={shopId} />

      {sync ? (
        <p className="rounded-xl border border-[#cfe8da] bg-[#f6fbf8] px-3 py-2 text-[12.5px] text-[#0d6b3c]" role="status">
          ดึงแล้ว {num(sync.skus)} SKU · เปลี่ยนแปลง {num(sync.changed)} รายการ
          {sync.error ? ` · ${sync.error}` : ""}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 min-[900px]:grid-cols-4">
        <StatCard label="SKU ทั้งหมด" value={num(rows.length)} hint="นับเฉพาะที่มีใน TikTok" />
        <StatCard label="ชิ้นคงเหลือรวม" value={num(totalQty)} tone="positive" hint="รวมทุก SKU ทุกคลัง" />
        <StatCard
          label="สินค้าหมด"
          value={num(outOfStock)}
          tone={outOfStock > 0 ? "negative" : "default"}
          hint="คงเหลือ 0 ชิ้น"
        />
        <StatCard label="ยังไม่จับคู่รหัส" value={num(unmatched)} hint="ไม่มีรหัสในทะเบียนสินค้า" />
      </div>

      <Card padding="padded" className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14.5px] font-bold">คงเหลือต่อ SKU</h2>
          <Badge variant="neutral">เรียงจากของมากไปน้อย</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-[11.5px] text-muted-foreground">
                <th scope="col" className="py-1.5 pr-2 text-left font-bold">รหัส SKU</th>
                <th scope="col" className="py-1.5 pr-2 text-left font-bold">สินค้า</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-bold">คงเหลือ</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-bold">คลัง</th>
                <th scope="col" className="py-1.5 pr-2 text-left font-bold">รหัสในทะเบียน</th>
                <th scope="col" className="py-1.5 text-right font-bold">อัปเดต</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.skuId} className="border-b border-border last:border-0">
                  <td className="mono py-1.5 pr-2">{row.sellerSku ?? "—"}</td>
                  <td className="max-w-[280px] truncate py-1.5 pr-2">{row.productName ?? "—"}</td>
                  <td className={`mono py-1.5 pr-2 text-right font-bold ${row.quantity <= 0 ? "text-[#b42318]" : ""}`}>
                    {num(row.quantity)}
                  </td>
                  <td className="mono py-1.5 pr-2 text-right text-muted-foreground">{num(row.warehouses.length)}</td>
                  <td className="py-1.5 pr-2">
                    {row.productCode ? (
                      <span className="mono">{row.productCode}</span>
                    ) : (
                      <Badge variant="warning">ยังไม่จับคู่</Badge>
                    )}
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground">{thaiDateTime(row.updatedAt)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    ยังไม่มีข้อมูล — กด “ดึงสต็อกล่าสุด” เพื่อดึงจาก TikTok
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card padding="padded" className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14.5px] font-bold">ประวัติการเปลี่ยนแปลง</h2>
          <span className="text-[11.5px] text-muted-foreground">บันทึกเมื่อยอดจาก TikTok เปลี่ยนระหว่างการดึง</span>
        </div>
        {movements.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            ยังไม่มีการเปลี่ยนแปลง — ประวัติจะเริ่มนับตั้งแต่การดึงครั้งแรกเป็นต้นไป
          </p>
        ) : (
          <ul className="flex list-none flex-col p-0">
            {movements.map((movement, index) => (
              <li
                key={`${movement.sellerSku}-${movement.changedAt}-${index}`}
                className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border/70 py-2 last:border-0"
              >
                <span className="mono text-[12.5px] font-bold">{movement.sellerSku ?? "—"}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                  {movement.productName ?? ""}
                </span>
                <span className="mono text-[12.5px]">
                  {num(movement.fromQty ?? 0)} → <b>{num(movement.toQty)}</b>
                </span>
                <Badge variant={movement.delta > 0 ? "success" : "danger"}>
                  {movement.delta > 0 ? "+" : ""}
                  {num(movement.delta)}
                </Badge>
                <span className="text-[11.5px] text-muted-foreground">{thaiDateTime(movement.changedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-[12px] leading-5 text-muted-foreground">
        หมายเหตุ: หน้านี้อ่านจำนวนจาก TikTok อย่างเดียว — การเพิ่ม/ลดจากระบบเรายังต้องรอสิทธิ์ “เขียนสินค้า” (Product write)
        จาก TikTok ก่อน ระหว่างนี้ประวัติจะบันทึกเฉพาะการเปลี่ยนแปลงที่ตรวจพบจากฝั่ง TikTok
      </p>
    </div>
  );
}
