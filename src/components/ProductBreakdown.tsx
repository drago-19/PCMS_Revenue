"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import type { ProductPackingRow } from "@/lib/shipnity/packing";

/** กดชื่อสินค้า → ดูว่าต้องส่งช่องทางไหนกี่ชิ้น และบิลไหนบ้าง */
export function ProductBreakdown({ product }: { product: ProductPackingRow }) {
  const lines = [...product.lines].sort(
    (a, b) => a.channel.localeCompare(b.channel, "th") || a.orderCode.localeCompare(b.orderCode, "th"),
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="block min-w-0 max-w-full cursor-pointer truncate text-left font-semibold text-foreground underline-offset-2 hover:underline focus-visible:rounded focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label={`ดูรายละเอียดการส่ง ${product.name}`}
        >
          {product.name}
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-[min(95vw,880px)] sm:max-w-[min(95vw,880px)]">
        <DialogHeader className="pr-11">
          <DialogTitle className="text-base">{product.name}</DialogTitle>
          <DialogDescription>
            ต้องส่งทั้งหมด {product.quantity} ชิ้น · {product.orderCount} บิล
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {product.channels.map((channel) => (
            <span
              key={channel.channel}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-[#f8fafc] px-3 py-1 text-xs"
            >
              <span className="font-semibold text-foreground">{channel.channel}</span>
              <span className="text-muted-foreground">
                {channel.quantity} ชิ้น · {channel.orderCount} บิล
              </span>
            </span>
          ))}
        </div>

        <div className="max-h-[52dvh] overflow-auto rounded-xl border border-border">
          <table className="w-full min-w-[600px] border-collapse text-[12.5px]">
            <thead className="sticky top-0 bg-[#f1f5f9] text-left">
              <tr>
                <th className="px-2.5 py-2 font-semibold whitespace-nowrap">บิล</th>
                <th className="px-2.5 py-2 font-semibold whitespace-nowrap">ช่องทาง</th>
                <th className="px-2.5 py-2 font-semibold whitespace-nowrap">ขนส่ง</th>
                <th className="px-2.5 py-2 font-semibold whitespace-nowrap">ลูกค้า</th>
                <th className="px-2.5 py-2 text-right font-semibold whitespace-nowrap">จำนวน</th>
                <th className="px-2.5 py-2 text-right font-semibold whitespace-nowrap">สั่งเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {[...lines]
                .sort((a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt))
                .map((line, index) => (
                <tr
                  key={`${line.orderCode}-${line.channel}-${line.paidAt}-${index}`}
                  className="border-t border-border"
                >
                  <td className="px-2.5 py-2 font-semibold whitespace-nowrap">{line.orderCode}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap">{line.channel}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap">{line.courier}</td>
                  <td className="px-2.5 py-2">{line.customerName ?? "-"}</td>
                  <td className="px-2.5 py-2 text-right font-semibold">{line.quantity}</td>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap">
                    {formatDateTime(line.paidAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
