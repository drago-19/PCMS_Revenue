import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { PlatformNav } from "@/components/platform/PlatformNav";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getPlatformOrder } from "@/lib/platform/orders";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  UNPAID: "รอชำระ",
  ON_HOLD: "พักไว้",
  AWAITING_SHIPMENT: "รอส่ง",
  PARTIALLY_SHIPPING: "ส่งบางส่วน",
  AWAITING_COLLECTION: "รอเข้ารับ",
  IN_TRANSIT: "กำลังส่ง",
  DELIVERED: "ส่งถึงแล้ว",
  COMPLETED: "สำเร็จ",
  CANCELLED: "ยกเลิก",
};

function money(value: number): string {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orderId } = await params;
  const query = await searchParams;
  const shopParam = query.shop;
  const shop = (Array.isArray(shopParam) ? shopParam[0] : shopParam) ?? undefined;

  const order = await getPlatformOrder(decodeURIComponent(orderId), shop);
  if (!order) notFound();

  const steps = [
    { label: "สร้างออเดอร์", value: order.createTime },
    { label: "ชำระเงิน", value: order.paidTime },
    { label: "ส่งออก", value: order.shippedTime },
    { label: "ส่งถึง", value: order.deliveredTime },
    { label: "ยกเลิก", value: order.cancelledTime },
  ].filter((step) => step.value);

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="รายละเอียดออเดอร์"
        title={`ออเดอร์ ${order.orderId}`}
        description={`${order.currency ?? "THB"} · ${order.items.length} รายการ · ยอดสั่งซื้อ ฿${money(order.totalAmount)}`}
      />

      <PlatformNav active="orders" shop={shop} />

      <div className="grid grid-cols-1 gap-3 min-[980px]:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-3">
          <Card padding="padded" className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[14.5px] font-bold">สินค้าในออเดอร์</h2>
              <Badge variant={order.status === "CANCELLED" ? "destructive" : "success"}>
                {STATUS_LABEL[order.status] ?? order.status}
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-border text-[11.5px] text-muted-foreground">
                    <th scope="col" className="py-1.5 text-left font-bold">รูป</th>
                    <th scope="col" className="py-1.5 text-left font-bold">สินค้า</th>
                    <th scope="col" className="py-1.5 text-left font-bold">SKU</th>
                    <th scope="col" className="py-1.5 text-right font-bold">จำนวน</th>
                    <th scope="col" className="py-1.5 text-right font-bold">ราคา/ชิ้น</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, index) => (
                    <tr key={`${item.sku ?? "item"}-${index}`} className="border-b border-border last:border-0">
                      <td className="py-2 pr-2">
                        {item.imageUrl ? (
                          // รูปจาก CDN ของ TikTok — ใช้ <img> ธรรมดาเพราะ domain นอก config ของ next/image
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            width={44}
                            height={44}
                            loading="lazy"
                            className="size-11 rounded-lg border border-border object-cover"
                          />
                        ) : (
                          <span className="block size-11 rounded-lg bg-muted" aria-hidden="true" />
                        )}
                      </td>
                      <td className="py-2 pr-2">{item.name}</td>
                      <td className="mono py-2 pr-2 text-[11.5px] text-muted-foreground">{item.sku ?? "—"}</td>
                      <td className="mono py-2 pr-2 text-right">{item.quantity}</td>
                      <td className="mono py-2 text-right">฿{money(item.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {order.cancelReason ? (
              <p className="rounded-lg border border-[#f5c2bd] bg-[#fdf3f2] px-3 py-2 text-[12.5px] leading-6 text-[#8a1c14]">
                ยกเลิก: {order.cancelReason}
                {order.cancelUser ? ` · โดย ${order.cancelUser}` : ""}
              </p>
            ) : null}
          </Card>

          <Card padding="padded" className="flex min-w-0 flex-col gap-2">
            <h2 className="text-[14.5px] font-bold">ไทม์ไลน์</h2>
            <ol className="flex list-none flex-col gap-1.5 p-0 text-[12.5px]">
              {steps.map((step) => (
                <li key={step.label} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{step.label}</span>
                  <span className="mono">{dateTime(step.value)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <Card padding="padded" className="flex min-w-0 flex-col gap-2">
            <h2 className="text-[14.5px] font-bold">ยอดเงิน</h2>
            <dl className="flex flex-col gap-1.5 text-[12.5px]">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">ยอดขาย (revenue)</dt>
                <dd className="mono">฿{money(order.money.revenue)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">ค่าธรรมเนียม/ภาษี</dt>
                <dd className="mono text-[#b42318]">฿{money(order.money.fee)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                <dt className="font-bold">โอนจริง (settlement)</dt>
                <dd className="mono font-bold text-[#0d8a47]">
                  {order.money.statementId ? `฿${money(order.money.settlement)}` : "รอโอน"}
                </dd>
              </div>
              {order.money.statementId ? (
                <div className="flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
                  <dt>statement</dt>
                  <dd className="mono truncate">{order.money.statementId}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          <Card padding="padded" className="flex min-w-0 flex-col gap-2">
            <h2 className="text-[14.5px] font-bold">การจัดส่ง</h2>
            <dl className="flex flex-col gap-1.5 text-[12.5px]">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">ขนส่ง</dt>
                <dd className="truncate">{order.shippingProvider ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">เลขพัสดุ</dt>
                <dd className="mono truncate">{order.trackingNumber ?? "—"}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
