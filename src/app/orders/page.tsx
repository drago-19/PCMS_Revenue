import { DatePickerField } from "@/components/DatePickerField";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { PackingAutoRefresh } from "@/components/PackingAutoRefresh";
import Link from "next/link";
import { CourierFilter } from "@/components/CourierFilter";
import { OrderDetailButton } from "@/components/OrderDetailButton";
import { OrderDetailDialog, type OrderDetailView } from "@/components/OrderDetailDialog";
import { OrdersHelp } from "@/components/OrdersHelp";
import { PackingThumb } from "@/components/PackingThumb";
import { ProductBreakdown } from "@/components/ProductBreakdown";
import { PackingRefreshButton } from "@/components/PackingRefreshButton";
import { PackingPrintButton, type PackingRoundOption } from "@/components/PackingPrintButton";
import { IconTruck } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getActiveCompanyId } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  bangkokDateParts,
  PACKING_CUTOFF_HOUR,
  type PackingCourierGroup,
  type PackingOrder,
} from "@/lib/packing-rounds";
import { getCompanyDefaultSeller } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { loadDayOrdersFromStore, startShipnityBackgroundSync } from "@/lib/shipnity/sync";
import { ShipnityError, type ShipnityOrder } from "@/lib/shipnity/client";
import {
  resolveShipnityAccounts,
  type ConnectedShipnityAccount,
} from "@/lib/shipnity/config";
import {
  buildDayPackingSummary,
  collectWaitingPaymentOrders,
  countShipnityStatuses,
  isOrderFromDay,
  mergeProductRows,
  summarizeChannels,
  summarizeProducts,
  type DayPackingSummary,
  type ProductPackingRow,
  type WaitingPaymentOrder,
} from "@/lib/shipnity/packing";

export const dynamic = "force-dynamic";

export const metadata = { title: "ออเดอร์รอแพ็ค" };

const CUTOFF_TEXT = `${PACKING_CUTOFF_HOUR}.00 น.`;

interface ShopResult {
  account: ConnectedShipnityAccount;
  summary: DayPackingSummary | null;
  /** ออเดอร์ที่ยังไม่ชำระเงินของวันนี้ (หรือรวมของค้าง) */
  waiting: WaitingPaymentOrder[];
  error: string | null;
  fetchedAt: string | null;
  complete: boolean;
  /** จำนวนออเดอร์ที่ดึงได้ในรอบซิงก์ล่าสุด (null = ยังไม่เคยซิงก์) */
  syncedCount: number | null;
  /** จำนวนออเดอร์ที่ยังไม่ปิดรายการที่มีในฐานข้อมูล */
  storedOpen: number;
  /** จำนวนออเดอร์ดิบที่ดึงมาได้จาก Shipnity */
  rawCount: number;
  /** ออเดอร์ดิบไว้สร้างสรุปตามตัวกรองสถานะ */
  orders: ShipnityOrder[];
  /** ออเดอร์ที่ยังไม่ปิดรายการแต่สั่งก่อนวันนี้ (ของค้าง) — แยกแสดงจากตารางแพ็คของวันนี้ */
  carryOrders: ShipnityOrder[];
  carrySummary: DayPackingSummary | null;
  /** ค้างจ่ายของวันก่อน (ยังไม่ชำระและไม่ใช่ COD) */
  carryWaiting: WaitingPaymentOrder[];
}

/** ออเดอร์ที่สั่งก่อนวันนี้แต่ยังไม่ปิดรายการ (ของค้างที่ต้องแพ็ค/ตามเก็บเงินต่อ) */
function carryOverOrders(orders: readonly ShipnityOrder[], isoDay: string): ShipnityOrder[] {
  return orders.filter(
    (order) =>
      !order.cancelled && !order.closed && !order.packed && !isOrderFromDay(order, isoDay),
  );
}

function isoDayOf(instant: Date): string {
  const parts = bangkokDateParts(instant);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function money(value: number): string {
  return `฿${value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function orderItemsText(order: PackingOrder): string {
  if (order.items.length === 0) return "ไม่ระบุรายการสินค้า";
  const shown = order.items.slice(0, 3).map((item) => `${item.name} ×${item.quantity}`);
  const rest = order.items.length - shown.length;
  return rest > 0 ? `${shown.join(" · ")} · +${rest} รายการ` : shown.join(" · ");
}

/** ช่องว่างสำหรับให้พนักงานจด/ติ๊กบนกระดาษที่พิมพ์ออกมา */
function TickBox({ label }: { label: string }) {
  return (
    <span
      className="inline-flex h-7 w-14 items-center justify-center rounded border border-dashed border-border text-[11px] text-muted-foreground"
      aria-label={label}
    >
      &nbsp;
    </span>
  );
}

function ProductsTable({ products }: { products: ProductPackingRow[] }) {
  if (products.length === 0) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">ยังไม่มีสินค้าที่ต้องแพ็คในวันนี้</Card>;
  }

  const total = products.reduce((sum, product) => sum + product.quantity, 0);

  return (
    <Card className="overflow-hidden print:overflow-visible">
      <Table
        containerClassName="overflow-x-auto"
        className="@min-[700px]:min-w-[560px] print:min-w-0"
      >
        <TableHeader sticky={false}>
          <TableRow>
            <TableHead className="w-[42%]">สินค้า</TableHead>
            <TableHead className="w-[18%]">ช่องทาง</TableHead>
            <TableHead className="num w-[10%]">คำสั่งซื้อ</TableHead>
            <TableHead className="num w-[14%]">ต้องส่ง (ชิ้น)</TableHead>
            <TableHead className="num w-[16%]">แพ็คแล้ว</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.name} className="print:break-inside-avoid">
              <TableCell data-label="สินค้า" className="font-semibold">
                <div className="flex items-center gap-2.5">
                  {product.image ? (
                    <PackingThumb src={product.image} name={product.name} size="sm" />
                  ) : (
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-dashed border-border text-[9px] text-muted-foreground">
                      ไม่มีรูป
                    </span>
                  )}
                  <span className="flex min-w-0 flex-col">
                    <ProductBreakdown product={product} />
                  </span>
                </div>
              </TableCell>
              <TableCell data-label="ช่องทาง" className="text-[12px] text-muted-foreground">
                {product.channels.map((channel) => (
                  <span key={channel.channel} className="block whitespace-nowrap">
                    {channel.channel} · {channel.quantity}
                  </span>
                ))}
              </TableCell>
              <TableCell data-label="คำสั่งซื้อ" className="num text-[13px] font-semibold">
                {product.orderCount} บิล
              </TableCell>
              <TableCell data-label="ต้องส่ง (ชิ้น)" className="num text-[15px] font-bold">
                {product.quantity}
              </TableCell>
              <TableCell data-label="แพ็คแล้ว" className="num">
                <TickBox label={`ช่องจดจำนวนที่แพ็คแล้วของ ${product.name}`} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell data-label="รวม" className="font-bold">
              รวม {products.length} รายการ
            </TableCell>
            <TableCell data-label="" />
            <TableCell data-label="รวม (บิล)" className="num text-[13px] font-bold">
              {products.reduce((sum, product) => sum + product.orderCount, 0)} บิล
            </TableCell>
            <TableCell data-label="รวม (ชิ้น)" className="num text-[15px] font-bold">
              {total}
            </TableCell>
            <TableCell data-label="" />
          </TableRow>
        </TableFooter>
      </Table>
    </Card>
  );
}

function ChannelSummary({
  rows,
}: {
  rows: { channel: string; quantity: number; orderCount: number }[];
}) {
  if (rows.length === 0) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">ยังไม่มีออเดอร์ที่ต้องส่งในรอบนี้</Card>;
  }

  const total = rows.reduce((sum, row) => sum + row.quantity, 0);

  return (
    <Card className="overflow-hidden">
      <Table containerClassName="overflow-x-auto" className="@min-[600px]:min-w-[420px]">
        <TableHeader sticky={false}>
          <TableRow>
            <TableHead>ช่องทาง</TableHead>
            <TableHead className="num">ต้องส่ง (ชิ้น)</TableHead>
            <TableHead className="num">บิล</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.channel}>
              <TableCell data-label="ช่องทาง" className="font-semibold">
                {row.channel}
              </TableCell>
              <TableCell data-label="ต้องส่ง (ชิ้น)" className="num font-bold">
                {row.quantity}
              </TableCell>
              <TableCell data-label="บิล" className="num">
                {row.orderCount}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
        รวมทุกรอบนี้ <span className="font-bold text-foreground">{total}</span> ชิ้น · {rows.reduce((sum, row) => sum + row.orderCount, 0)} บิล
      </div>
    </Card>
  );
}

function CouriersTable({ groups }: { groups: PackingCourierGroup[] }) {
  if (groups.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">ไม่มีออเดอร์ในรอบนี้</Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <Card key={group.courier} className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <IconTruck size={17} />
              <h3 className="text-[13.5px] font-bold text-foreground">{group.courier}</h3>
              <Badge variant="neutral">{group.orderCount} ออเดอร์</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              รวม {group.itemCount} ชิ้น · {money(group.totalAmount)}
            </p>
          </div>
          <Table containerClassName="overflow-x-auto" className="@min-[700px]:min-w-[560px]">
            <TableHeader sticky={false}>
              <TableRow>
                <TableHead className="w-[10%]">บิล</TableHead>
                <TableHead className="w-[22%]">ลูกค้า</TableHead>
                <TableHead className="w-[38%]">สินค้าที่ต้องหยิบ</TableHead>
                <TableHead className="num w-[18%]">สั่งเมื่อ</TableHead>
                <TableHead className="num w-[12%]">แพ็คแล้ว</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.orders.map((order) => (
                <TableRow key={order.orderCode}>
                  <TableCell data-label="บิล" className="whitespace-nowrap">
                    <span className="font-semibold">{order.orderCode}</span>
                    {order.status ? (
                      <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                        {order.status}
                      </span>
                    ) : null}
                    {order.daysPending > 0 ? (
                      <Badge
                        variant="warning"
                        className="ml-1.5"
                        aria-label={`ออเดอร์นี้สั่งไว้ ${order.daysPending} วันแล้ว และ Shipnity ยังไม่ปิดรายการ`}
                      >
                        ค้าง {order.daysPending} วัน
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell data-label="ลูกค้า" className="whitespace-nowrap">
                    {order.customerName ?? "-"}
                  </TableCell>
                  <TableCell data-label="สินค้าที่ต้องหยิบ" className="max-w-[260px]">
                    <span className="flex flex-col gap-0.5">
                      {order.items.slice(0, 2).map((item, index) => (
                        <span
                          key={`${order.orderCode}-${item.name}-${index}`}
                          className="block truncate text-[12px]"
                          title={`${item.name} ×${item.quantity}`}
                        >
                          • {item.name} ×{item.quantity}
                        </span>
                      ))}
                      {order.items.length > 2 ? (
                        <span className="text-[11px] text-muted-foreground">
                          +{order.items.length - 2} รายการ
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell data-label="สั่งเมื่อ" className="num whitespace-nowrap">
                    {formatDateTime(order.cutAt.toISOString())}
                  </TableCell>
                  <TableCell data-label="แพ็คแล้ว" className="num">
                    <TickBox label={`ช่องจดว่าแพ็คบิล ${order.orderCode} แล้ว`} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ))}
    </div>
  );
}

function dayPicker(isoDay: string, isToday: boolean) {
  return (
    <div className="flex flex-wrap items-end gap-2 no-print">
      <span className="flex flex-col gap-1 text-xs text-muted-foreground">
        ดูของวันที่
        <DatePickerField name="date" defaultValue={isoDay} basePath="/orders" allowClear={false} />
      </span>
      {isToday ? null : (
        <a
          href="/orders"
          className="inline-flex h-10 min-h-[40px] items-center rounded-[10px] border border-border bg-white px-3 text-xs font-semibold text-foreground hover:bg-[#f1f5f9]"
        >
          กลับมาวันนี้
        </a>
      )}
    </div>
  );
}

function ShopRound({ label, groups }: { label: string; groups: PackingCourierGroup[] }) {
  const shopName = label.includes("@") ? label.split("@")[0] : label;
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-[15px] font-bold text-foreground">ร้าน {shopName}</h3>
      <CouriersTable groups={groups} />
    </section>
  );
}

export default async function PackingOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    stage?: string;
    view?: string;
    q?: string;
    courier?: string;
    page?: string;
    order?: string;
    shop?: string;
    round?: string;
  }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const today = isoDayOf(now);
  const requestedDay = (params.date ?? "").trim();
  const isoDay = /^\d{4}-\d{2}-\d{2}$/.test(requestedDay) ? requestedDay : today;
  const isToday = isoDay === today;
  const stageFilter: "all" | "print" | "ready" =
    params.stage === "print" || params.stage === "ready" ? params.stage : "all";
  // แบ่งหน้าออกเป็นส่วน: 1) ช่องทาง · 2) สินค้า · 3) ออเดอร์ — เห็นทีละส่วน หน้าไม่ยาว
  const sectionView: "channel" | "products" | "orders" =
    params.view === "channel" || params.view === "orders" ? params.view : "products";
  // ตารางแพ็คของวันนี้มีเฉพาะออเดอร์ที่สั่งวันนี้ — ของค้างมีแท็บ “ค้างจากวันก่อน” ของตัวเอง
  const query = (params.q ?? "").trim();
  const queryLower = query.toLowerCase();
  const courierFilter = (params.courier ?? "").trim();
  const pageNumber = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const detailOrder = (params.order ?? "").trim();
  const requestedShop = (params.shop ?? "").trim();
  const requestedRound =
    params.round === "after" || params.round === "unpaid" || params.round === "carry"
      ? params.round
      : "before";

  const matchesQuery = (order: ShipnityOrder): boolean => {
    if (!queryLower) return true;
    const haystack = [
      order.invoice_number,
      order.name ?? "",
      order.tel ?? "",
      ...(order.purchases ?? []).map((purchase) => purchase.name ?? purchase.code ?? ""),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(queryLower);
  };
  const companyId = await getActiveCompanyId();

  const header = (print: { imageUrls: string[]; rounds: PackingRoundOption[] }) => (
    <PageHeader
      eyebrow={`Shipnity · Open API v2 · ${getCompanyDefaultSeller(companyId).name}`}
      title="ออเดอร์รอแพ็ค"
      description={`${isToday ? "ของวันนี้" : `ย้อนหลัง ${formatDate(isoDay)}`} · ตัดรอบ ${CUTOFF_TEXT} · ข้อมูล ${formatDateTime(now.toISOString())}`}
      actions={
        <div className="flex flex-wrap items-end justify-end gap-2">
          {dayPicker(isoDay, isToday)}
          <PackingRefreshButton />
          <PackingPrintButton imageUrls={print.imageUrls} rounds={print.rounds} />
        </div>
      }
    />
  );

  const accounts = await resolveShipnityAccounts(companyId);
  // งานเบื้องหลัง: อัปเดตออเดอร์เข้าฐานข้อมูลทุก 2 นาที (หน้าเว็บอ่านจากฐานข้อมูลเท่านั้น)
  startShipnityBackgroundSync(accounts);

  if (accounts.length === 0) {
    return (
      <div className="workspace-page">
        {header({ imageUrls: [], rounds: [] })}
        <Card className="flex flex-col items-start gap-2 p-4">
          <p className="text-sm font-semibold text-foreground">ยังไม่ได้เชื่อม Shipnity ของบริษัทนี้</p>
          <p className="text-sm text-muted-foreground">
            ไปที่หน้าตั้งค่าบริษัทแล้วล็อกอิน Shipnity — เชื่อมได้หลายบัญชี (หลายร้าน)
          </p>
          <a
            href="/settings"
            className="mt-1 inline-flex h-10 items-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            ไปที่ตั้งค่าบริษัท
          </a>
        </Card>
      </div>
    );
  }

  let results: ShopResult[] = [];
  for (const account of accounts) {
    try {
      // อ่านจากฐานข้อมูลของเรา — การดึง Shipnity เป็นงานเบื้องหลัง (ไม่ทำให้หน้าเว็บรอ)
      const day = await loadDayOrdersFromStore(account, {
        isoDay,
        includeClosed: !isToday,
      });
      const carry = isToday ? carryOverOrders(day.orders, isoDay) : [];
      results.push({
        account,
        summary: buildDayPackingSummary(day.orders, isoDay, { includeClosed: !isToday }),
        waiting: collectWaitingPaymentOrders(day.orders, isoDay),
        rawCount: day.orders.length,
        syncedCount: day.syncedCount,
        storedOpen: day.storedOpen,
        orders: day.orders,
        carryOrders: carry,
        carrySummary:
          carry.length > 0 ? buildDayPackingSummary(carry, isoDay, { carryOverOpen: true }) : null,
        carryWaiting:
          carry.length > 0
            ? collectWaitingPaymentOrders(carry, isoDay, { carryOverOpen: true })
            : [],
        error: null,
        fetchedAt: day.fetchedAt,
        complete: day.complete,
      });
    } catch (error) {
      results.push({
        account,
        summary: null,
        waiting: [],
        rawCount: 0,
        syncedCount: null,
        storedOpen: 0,
        orders: [],
        carryOrders: [],
        carrySummary: null,
        carryWaiting: [],
        error:
          error instanceof ShipnityError
            ? error.message
            : "ดึงข้อมูลจาก Shipnity ไม่สำเร็จ กรุณาลองโหลดหน้าใหม่",
        fetchedAt: null,
        complete: true,
      });
    }
  }

  // นับตามสถานะที่ Shipnity แสดง (ยืนยัน/ยังไม่พิมพ์ · พิมพ์แล้ว/รอส่ง) ก่อนกรอง
  const stageCounts = { all: 0, print: 0, ready: 0 };
  for (const item of results) {
    if (!item.summary) continue;
    for (const group of [...item.summary.rounds.current, ...item.summary.rounds.next]) {
      for (const order of group.orders) {
        stageCounts.all += 1;
        if (order.status?.startsWith("ชำระแล้ว")) stageCounts.print += 1;
        else if (order.status?.startsWith("พิมพ์แล้ว")) stageCounts.ready += 1;
      }
    }
  }

  if (stageFilter !== "all" || queryLower) {
    results = results.map((item) => {
      const filtered = item.orders.filter((order) => {
        if (!matchesQuery(order)) return false;
        if (stageFilter === "print") return order.paid && !order.printed;
        if (stageFilter === "ready") return order.paid && order.printed;
        return true;
      });
      const options = { includeClosed: !isToday };
      const carry = isToday ? carryOverOrders(filtered, isoDay) : [];
      return {
        ...item,
        summary: item.summary ? buildDayPackingSummary(filtered, isoDay, options) : null,
        waiting: item.summary ? collectWaitingPaymentOrders(filtered, isoDay) : item.waiting,
        carryOrders: carry,
        carrySummary:
          carry.length > 0 ? buildDayPackingSummary(carry, isoDay, { carryOverOpen: true }) : null,
        carryWaiting:
          carry.length > 0
            ? collectWaitingPaymentOrders(carry, isoDay, { carryOverOpen: true })
            : [],
      };
    });
  }

  const summaries = results.flatMap((item) => (item.summary ? [item.summary] : []));
  const matchProduct = (row: ProductPackingRow): boolean =>
    !queryLower || row.name.toLowerCase().includes(queryLower);
  const products = mergeProductRows(summaries.map((summary) => summary.products)).filter(matchProduct);
  // รูปที่ตารางพิมพ์ต้องใช้ (ทั้งสองรอบ) — ส่งให้ปุ่มพิมพ์โหลดไว้ล่วงหน้า
  const printImageUrls = [
    ...new Set(products.map((product) => product.image).filter((url): url is string => Boolean(url))),
  ];
  const beforeProducts = mergeProductRows(
    summaries.map((summary) =>
      summarizeProducts(summary.rounds.current.flatMap((group) => group.orders)),
    ),
  ).filter(matchProduct);
  const afterProducts = mergeProductRows(
    summaries.map((summary) => summarizeProducts(summary.rounds.next.flatMap((group) => group.orders))),
  ).filter(matchProduct);
  const stateQuery = new URLSearchParams();
  if (!isToday) stateQuery.set("date", isoDay);
  if (stageFilter !== "all") stateQuery.set("stage", stageFilter);
  if (sectionView !== "products") stateQuery.set("view", sectionView);
  if (query) stateQuery.set("q", query);
  if (courierFilter) stateQuery.set("courier", courierFilter);
  const baseQuery = stateQuery.toString();

  const makeHref = (overrides: Record<string, string | null>): string => {
    const params2 = new URLSearchParams(baseQuery);
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null || value === "") params2.delete(key);
      else params2.set(key, value);
    }
    const text = params2.toString();
    return text ? `/orders?${text}` : "/orders";
  };

  // ร้านที่เลือกอยู่ใน URL (?shop=) — ถ้าไม่มี ให้เลือกร้านที่มีออเดอร์มากสุด ไม่ใช่ร้านแรกที่ว่าง
  const activeShopId = results.some((item) => item.account.id === requestedShop)
    ? requestedShop
    : ([...results]
        .sort(
          (a, b) =>
            (b.summary?.totalOrders ?? 0) +
            b.carryOrders.length -
            ((a.summary?.totalOrders ?? 0) + a.carryOrders.length),
        )
        .at(0)?.account.id ?? "");


  const beforeOrders = summaries.flatMap((summary) =>
    summary.rounds.current.flatMap((group) => group.orders),
  );
  const afterOrders = summaries.flatMap((summary) =>
    summary.rounds.next.flatMap((group) => group.orders),
  );
  // ตัวเลือกรอบตอนกดพิมพ์ — พิมพ์เฉพาะรอบที่เลือกเพื่อไม่ให้กระดาษเยอะ
  const printRounds: PackingRoundOption[] = [
    { value: "before", label: `ก่อน ${CUTOFF_TEXT}`, orders: beforeOrders.length },
    { value: "after", label: `หลัง ${CUTOFF_TEXT}`, orders: afterOrders.length },
  ];
  const totals = summaries.reduce(
    (acc, summary) => ({
      orders: acc.orders + summary.totalOrders,
      items: acc.items + summary.totalItems,
      current: acc.current + summary.rounds.currentOrderCount,
      next: acc.next + summary.rounds.nextOrderCount,
      waiting: acc.waiting + summary.waitingPaymentCount,
      closed: acc.closed + summary.closedCount,
    }),
    { orders: 0, items: 0, current: 0, next: 0, waiting: 0, closed: 0 },
  );

  const fetchedAts = results
    .map((item) => item.fetchedAt)
    .filter((value): value is string => value !== null)
    .sort();
  // หัวหน้าแสดงเวลาที่ "ใหม่ที่สุด" — แต่ละร้านมีเวลาของตัวเองอยู่ในการ์ดร้านอยู่แล้ว
  const newestFetch = fetchedAts.at(-1) ?? null;
  const oldestFetch = fetchedAts[0] ?? null;
  const staleShop =
    oldestFetch && newestFetch && Date.parse(newestFetch) - Date.parse(oldestFetch) > 10 * 60_000
      ? results.find((item) => item.fetchedAt === oldestFetch)?.account.label ?? null
      : null;

  return (
    <div className="workspace-page @container">
      <PackingAutoRefresh intervalMs={120_000} />
      {header({ imageUrls: printImageUrls, rounds: printRounds })}
      {results
        .filter((item) => item.error)
        .map((item) => (
          <Card key={item.account.id} className="border-destructive/40 p-4">
            <p className="text-sm font-semibold text-destructive">
              ดึงข้อมูลร้าน {item.account.label} ไม่สำเร็จ
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{item.error}</p>
          </Card>
        ))}

      {summaries.length > 0 ? (
        <>
          {newestFetch ? (
            <p className="no-print text-xs text-muted-foreground">
              ข้อมูลจาก Shipnity ณ {formatDateTime(newestFetch)} · เก็บไว้ในเซิร์ฟเวอร์เรา
              และอัปเดตอัตโนมัติทุก 5 นาที
              {staleShop && oldestFetch
                ? ` · ${staleShop} ยังไม่ได้อัปเดตตั้งแต่ ${formatDateTime(oldestFetch)}`
                : ""}
            </p>
          ) : null}

          {!isToday ? (
            <p className="no-print text-xs text-muted-foreground">
              มุมมองย้อนหลัง: นับออเดอร์ที่ปิดรายการแล้ว {totals.closed} รายการของวันนั้นด้วย
            </p>
          ) : null}


          {/*
            กติกาของหน้านี้: กระดาษที่พิมพ์ให้พนักงานมีแค่ “ต้องแพ็คอะไร · กี่ชิ้น · รวมเท่าไร”
            ข้อมูลอื่น (สรุปช่องทาง, รายการแยกบิล/ร้าน, ค้างจ่าย, คำอธิบาย) ต้องใส่ no-print เสมอ
          */}
          <div className="flex flex-col gap-3">
            <div className="flex min-w-0 flex-col gap-2 no-print @min-[800px]:flex-row @min-[800px]:items-center @min-[800px]:justify-between">
              <form method="get" className="flex w-full min-w-0 items-center gap-2 @min-[800px]:w-auto">
                {isToday ? null : <input type="hidden" name="date" value={isoDay} />}
                {stageFilter === "all" ? null : <input type="hidden" name="stage" value={stageFilter} />}
                <Input
                  type="search"
                  name="q"
                  defaultValue={query}
                  placeholder="ค้นหาเลขบิล / ชื่อลูกค้า / ชื่อสินค้า"
                  aria-label="ค้นหาออเดอร์จากเลขบิล ชื่อลูกค้า หรือชื่อสินค้า"
                  className="h-9 min-w-0 flex-1 @min-[800px]:w-[240px] @min-[800px]:flex-none"
                />
                <Button type="submit" variant="outline" className="h-9 shrink-0">
                  ค้นหา
                </Button>
                {query ? (
                  <Link
                    href={makeHref({ q: null, page: null })}
                    scroll={false}
                    className="text-xs font-semibold text-muted-foreground underline underline-offset-2"
                  >
                    ล้างคำค้น
                  </Link>
                ) : null}
              </form>

              <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 text-[11.5px] @min-[800px]:w-auto @min-[800px]:justify-end">
                <OrdersHelp />
                <span className="font-semibold text-muted-foreground">กรองสถานะ:</span>
                {(
                  [
                    { key: "all", label: `ทั้งหมด ${stageCounts.all}` },
                    { key: "print", label: `ยังไม่พิมพ์ ${stageCounts.print}` },
                    { key: "ready", label: `พิมพ์แล้ว · รอส่ง ${stageCounts.ready}` },
                  ] as const
                ).map((chip) => (
                  <Link
                    key={chip.key}
                    href={makeHref({ stage: chip.key === "all" ? null : chip.key, page: null })}
                    scroll={false}
                    className={`inline-flex h-8 items-center rounded-full border px-2.5 font-semibold ${
                      stageFilter === chip.key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-white text-foreground hover:bg-[#f1f5f9]"
                    }`}
                    aria-current={stageFilter === chip.key ? "true" : undefined}
                  >
                    {chip.label}
                  </Link>
                ))}
              </div>
            </div>

            <nav className="no-print flex w-full max-w-full items-center gap-1 overflow-x-auto">
              {results.map((item) => {
                const active = item.account.id === activeShopId;
                return (
                  <Link
                    key={item.account.id}
                    href={makeHref({ shop: item.account.id, round: requestedRound, page: null })}
                    scroll={false}
                    className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-xs font-semibold ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-white text-foreground hover:bg-[#f1f5f9]"
                    }`}
                  >
                    {item.account.label} · {item.summary?.totalOrders ?? 0} ออเดอร์
                  </Link>
                );
              })}
            </nav>

            {results.map((item) => (
              <div
                key={item.account.id}
                className={item.account.id === activeShopId ? "block" : "hidden print:block"}
              >
                {item.summary ? (
                  <ShopPanel
                    item={item}
                    queryLower={queryLower}
                    courier={courierFilter}
                    page={pageNumber}
                    baseQuery={baseQuery}
                    detailCode={detailOrder}
                    activeRound={requestedRound}
                    showCarry={isToday}
                    sectionView={sectionView}
                    makeHref={makeHref}
                  />
                ) : (
                  <Card className="border-destructive/40 p-4">
                    <p className="text-sm font-semibold text-destructive">
                      ดึงข้อมูลร้าน {item.account.label} ไม่สำเร็จ
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.error}</p>
                  </Card>
                )}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function ShopPanel({
  item,
  queryLower,
  courier,
  page,
  baseQuery,
  detailCode,
  activeRound,
  showCarry,
  sectionView,
  makeHref,
}: {
  item: ShopResult;
  queryLower: string;
  courier: string;
  page: number;
  baseQuery: string;
  detailCode: string;
  activeRound: string;
  /** วันที่เลือกเป็นวันนี้ — จึงมีของค้างจากวันก่อนให้แยกดู */
  showCarry: boolean;
  /** ส่วนที่กำลังดูอยู่: ช่องทาง / สินค้า / ออเดอร์ */
  sectionView: "channel" | "products" | "orders";
  makeHref: (overrides: Record<string, string | null>) => string;
}) {
  const summary = item.summary;
  if (!summary) return null;

  const match = (row: ProductPackingRow) =>
    !queryLower || row.name.toLowerCase().includes(queryLower);

  const currentOrders = summary.rounds.current.flatMap((group) => group.orders);
  const nextOrders = summary.rounds.next.flatMap((group) => group.orders);
  const currentProducts = summarizeProducts(currentOrders).filter(match);
  const nextProducts = summarizeProducts(nextOrders).filter(match);
  const waitingRows = item.waiting.map((row) => ({ ...row, shop: item.account.label }));

  // ของค้างจากวันก่อน: แยกแท็บของตัวเอง ไม่ถูกนับในตารางแพ็คของวันนี้
  const carryPackingOrders = item.carrySummary
    ? [...item.carrySummary.rounds.current, ...item.carrySummary.rounds.next].flatMap(
        (group) => group.orders,
      )
    : [];
  const carryOrderRows = [...carryPackingOrders].sort(
    (a, b) => a.cutAt.getTime() - b.cutAt.getTime(),
  );
  const carryProducts = summarizeProducts(carryPackingOrders).filter(match);
  const carryWaitingRows = item.carryWaiting.map((row) => ({ ...row, shop: item.account.label }));

  const rounds = [
    {
      value: "before",
      label: `ก่อน ${CUTOFF_TEXT}`,
      groups: summary.rounds.current,
      rows: currentProducts,
      orders: currentOrders,
    },
    {
      value: "after",
      label: `หลัง ${CUTOFF_TEXT}`,
      groups: summary.rounds.next,
      rows: nextProducts,
      orders: nextOrders,
    },
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <ShipnityChips
        orders={item.orders}
        fetchedAt={item.fetchedAt}
        syncedCount={item.syncedCount}
        storedOpen={item.storedOpen}
      />

      <div className="grid grid-cols-2 gap-3 no-print @min-[760px]:grid-cols-3">
        <StatCard
          label="ต้องแพ็คของวันนี้"
          value={`${summary.totalOrders} ออเดอร์`}
          hint={`${summary.totalItems} ชิ้น · ${currentProducts.length + nextProducts.length} รายการสินค้า${
            item.carryOrders.length > 0 ? ` · ไม่รวมของค้าง ${item.carryOrders.length} ใบ` : ""
          }`}
          tone="brand"
          icon={<IconTruck size={19} />}
        />
        <StatCard
          label={`ก่อน ${CUTOFF_TEXT}`}
          value={`${summary.rounds.currentOrderCount} ออเดอร์`}
          hint="ต้องแพ็คให้ทันรอบบ่ายสอง"
        />
        <StatCard
          label={`หลัง ${CUTOFF_TEXT}`}
          value={`${summary.rounds.nextOrderCount} ออเดอร์`}
          hint="รอบถัดไป"
        />
      </div>

      <nav className="no-print flex w-full max-w-full items-center gap-1 overflow-x-auto">
        {rounds.map((round) => {
          const active = activeRound === round.value;
          return (
            <Link
              key={round.value}
              href={makeHref({ shop: item.account.id, round: round.value, page: null })}
              scroll={false}
              className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-xs font-semibold ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-white text-foreground hover:bg-[#f1f5f9]"
              }`}
            >
              {round.label} · {round.orders.length} ออเดอร์
            </Link>
          );
        })}
        {showCarry && item.carryOrders.length > 0 ? (
          <Link
            href={makeHref({ shop: item.account.id, round: "carry", page: null })}
            scroll={false}
            className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-xs font-semibold ${
              activeRound === "carry"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-white text-foreground hover:bg-[#f1f5f9]"
            }`}
          >
            ค้างจากวันก่อน · {item.carryOrders.length} ออเดอร์
          </Link>
        ) : null}
        <Link
          href={makeHref({ shop: item.account.id, round: "unpaid", page: null })}
          scroll={false}
          className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-xs font-semibold ${
            activeRound === "unpaid"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-white text-foreground hover:bg-[#f1f5f9]"
          }`}
        >
          ค้างจ่าย · {waitingRows.length} ออเดอร์
        </Link>
      </nav>

      {rounds.map((round) => (
        <div
          key={round.value}
          data-packing-round={round.value}
          className={`flex-col gap-4 ${activeRound === round.value ? "flex" : "hidden print:flex"}`}
        >
          <nav className="no-print flex w-full max-w-full items-center gap-1 overflow-x-auto">
            {([
              { value: "channel", label: "1) ช่องทาง", count: `${round.orders.length} ใบ` },
              { value: "products", label: "2) สินค้า", count: `${round.rows.length} รายการ` },
              { value: "orders", label: "3) ออเดอร์", count: `${round.orders.length} ใบ` },
            ] as const).map((section) => (
              <Link
                key={section.value}
                href={makeHref({
                  shop: item.account.id,
                  round: round.value,
                  view: section.value === "products" ? null : section.value,
                  page: null,
                })}
                scroll={false}
                className={`inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-semibold ${
                  sectionView === section.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-white text-foreground hover:bg-[#f1f5f9]"
                }`}
              >
                {section.label} · {section.count}
              </Link>
            ))}
          </nav>

          <section
            className={`no-print flex-col gap-2.5 ${sectionView === "channel" ? "flex" : "hidden"}`}
          >
            <h2 className="text-[15px] font-bold text-foreground">1) ต้องส่งแยกตามช่องทาง</h2>
            <ChannelSummary rows={summarizeChannels([...round.orders])} />
          </section>

          <section
            className={`flex-col gap-2.5 ${sectionView === "products" ? "flex" : "hidden print:flex"}`}
          >
            <div className="no-print">
              <h2 className="text-[15px] font-bold text-foreground">
                2) สรุปตามสินค้า — ต้องส่งอย่างละกี่ชิ้น
              </h2>
              <p className="text-xs text-muted-foreground">
                กดที่ชื่อสินค้าเพื่อดูว่าช่องทางไหนต้องส่งกี่ชิ้น และเป็นบิลไหนบ้าง
              </p>
            </div>
            <div className="hidden print:block print:break-after-avoid">
              <h2 className="text-[15px] font-bold text-foreground">
                {item.account.label} · {round.label} · {round.orders.length} ออเดอร์
              </h2>
            </div>
            <ProductsTable products={[...round.rows]} />
          </section>

          <div className={sectionView === "orders" ? "block" : "hidden"}>
            <RoundOrders
              orders={[...round.orders]}
              courier={courier}
              page={page}
              pageHref={(nextPage) =>
                makeHref({
                  shop: item.account.id,
                  round: round.value,
                  page: nextPage > 1 ? String(nextPage) : null,
                })
              }
              detailCode={detailCode}
            />
          </div>
        </div>
      ))}

      {showCarry && item.carryOrders.length > 0 ? (
        <div className={`no-print flex-col gap-4 ${activeRound === "carry" ? "flex" : "hidden"}`}>
          <section className="flex flex-col gap-2.5">
            <h2 className="text-[15px] font-bold text-foreground">
              ค้างจากวันก่อน — {item.carryOrders.length} ใบ
            </h2>
            <p className="text-xs text-muted-foreground">
              ออเดอร์ที่สั่งก่อนวันนี้แต่ยังไม่ปิดรายการ — ไม่นับในตารางแพ็คของวันนี้ และไม่ลงในกระดาษ
              พิมพ์ของวันนี้ (เรียงค้างนานสุดก่อน)
            </p>
            {carryProducts.length > 0 ? (
              <ProductsTable products={[...carryProducts]} />
            ) : (
              <Card className="p-4 text-sm text-muted-foreground">
                ไม่มีออเดอร์ค้างที่ต้องแพ็ค — เหลือแค่ที่ยังไม่ชำระเงินด้านล่าง
              </Card>
            )}
          </section>

          {carryOrderRows.length > 0 ? (
            <section className="flex flex-col gap-2.5">
              <h2 className="text-[15px] font-bold text-foreground">
                ต้องแพ็ค · ค้างจากวันก่อน
              </h2>
              <RoundOrders
                orders={carryOrderRows}
                courier={courier}
                page={page}
                pageHref={(nextPage) =>
                  makeHref({
                    shop: item.account.id,
                    round: "carry",
                    page: nextPage > 1 ? String(nextPage) : null,
                  })
                }
                detailCode={detailCode}
              />
            </section>
          ) : null}

          {carryWaitingRows.length > 0 ? (
            <section className="flex flex-col gap-2.5">
              <h2 className="text-[15px] font-bold text-foreground">
                ค้างจ่ายของวันก่อน — {carryWaitingRows.length} ใบ
              </h2>
              <WaitingTable rows={carryWaitingRows} />
            </section>
          ) : null}
        </div>
      ) : null}

      <div className={`no-print flex-col gap-4 ${activeRound === "unpaid" ? "flex" : "hidden print:flex"}`}>
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[15px] font-bold text-foreground">ค้างจ่าย — ยังไม่ชำระเงิน</h2>
          <p className="text-xs text-muted-foreground">
            ออเดอร์ที่ต้องโอนเงิน (ไม่รวม COD) — เรียงของที่สั่งนานสุดขึ้นก่อน
          </p>
          <WaitingTable rows={waitingRows} />
        </section>
      </div>
    </div>
  );
}

const ORDERS_PAGE_SIZE = 10;

function RoundOrders({
  orders,
  courier,
  page,
  pageHref,
  detailCode,
}: {
  orders: PackingOrder[];
  courier: string;
  page: number;
  /** สร้างลิงก์เปลี่ยนหน้า โดยคงร้าน/แท็บรอบ/ตัวกรองเดิมไว้ */
  pageHref: (nextPage: number) => string;
  detailCode: string;
}) {
  const couriers = [...new Set(orders.map((order) => order.courier))].sort((a, b) =>
    a.localeCompare(b, "th"),
  );
  const filtered = courier ? orders.filter((order) => order.courier === courier) : orders;
  const sorted = [...filtered].sort((a, b) => b.cutAt.getTime() - a.cutAt.getTime());
  const totalPages = Math.max(1, Math.ceil(sorted.length / ORDERS_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), totalPages);
  const rows = sorted.slice((current - 1) * ORDERS_PAGE_SIZE, current * ORDERS_PAGE_SIZE);
  const detail = detailCode ? orders.find((order) => order.orderCode === detailCode) : undefined;
  const detailView: OrderDetailView | null = detail
    ? {
        orderCode: detail.orderCode,
        customerName: detail.customerName ?? null,
        status: detail.status ?? null,
        courier: detail.courier,
        channel: detail.marketplace ?? null,
        orderedAt: formatDateTime(detail.cutAt.toISOString()),
        total: money(detail.totalAmount),
        daysPending: detail.daysPending,
        items: detail.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          image: item.image ?? null,
        })),
      }
    : null;

  return (
    <section className="no-print flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold text-foreground">3) ออเดอร์ล่าสุด</h2>
          <p className="text-xs text-muted-foreground">
            {sorted.length} ใบ{courier ? ` · ขนส่ง ${courier}` : ""} · หน้าละ {ORDERS_PAGE_SIZE} รายการ (ใหม่สุดก่อน)
          </p>
        </div>
        <CourierFilter couriers={couriers} value={courier} />
      </div>

      <OrderDetailDialog detail={detailView} />

      {rows.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">ไม่มีออเดอร์ในรอบนี้</Card>
      ) : (
        <Card className="overflow-hidden">
          <Table
            containerClassName="overflow-x-auto"
            className="@min-[700px]:min-w-[720px]"
          >
            <TableHeader sticky={false}>
              <TableRow>
                <TableHead>บิล / สถานะ</TableHead>
                <TableHead>ลูกค้า</TableHead>
                <TableHead>ขนส่ง</TableHead>
                <TableHead>ช่องทาง</TableHead>
                <TableHead>สินค้าที่ต้องหยิบ</TableHead>
                <TableHead className="num">สั่งเมื่อ</TableHead>
                <TableHead className="num">แพ็คแล้ว</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((order) => (
                <TableRow key={order.orderCode} className="relative cursor-pointer hover:bg-[#f8fafc]">
                  <TableCell data-label="บิล" className="whitespace-nowrap">
                    <OrderDetailButton orderCode={order.orderCode} stretch />
                    {order.status ? (
                      <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                        {order.status}
                      </span>
                    ) : null}
                    {order.daysPending > 0 ? (
                      <Badge variant="warning" className="ml-1.5">
                        ค้าง {order.daysPending} วัน
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell data-label="ลูกค้า" className="whitespace-nowrap">
                    {order.customerName ?? "-"}
                  </TableCell>
                  <TableCell data-label="ขนส่ง" className="whitespace-nowrap">
                    {order.courier}
                  </TableCell>
                  <TableCell data-label="ช่องทาง" className="whitespace-nowrap">
                    {order.marketplace ?? "-"}
                  </TableCell>
                  <TableCell data-label="สินค้าที่ต้องหยิบ" className="max-w-[260px]">
                    <span className="flex flex-col gap-0.5">
                      {order.items.slice(0, 2).map((item, index) => (
                        <span
                          key={`${order.orderCode}-${item.name}-${index}`}
                          className="block truncate text-[12px]"
                          title={`${item.name} ×${item.quantity}`}
                        >
                          • {item.name} ×{item.quantity}
                        </span>
                      ))}
                      {order.items.length > 2 ? (
                        <span className="text-[11px] text-muted-foreground">
                          +{order.items.length - 2} รายการ
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell data-label="สั่งเมื่อ" className="num whitespace-nowrap">
                    {formatDateTime(order.cutAt.toISOString())}
                  </TableCell>
                  <TableCell data-label="แพ็คแล้ว" className="num">
                    <TickBox label={`ช่องจดว่าแพ็คบิล ${order.orderCode} แล้ว`} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs no-print">
            <span className="text-muted-foreground">
              หน้า {current} / {totalPages} · แสดง {rows.length} จาก {sorted.length} ใบ
            </span>
            <div className="flex items-center gap-2">
              <Link
                href={pageHref(current - 1)}
                scroll={false}
                aria-disabled={current <= 1}
                className={`inline-flex h-8 items-center rounded-[8px] border border-border px-3 font-semibold ${
                  current <= 1 ? "pointer-events-none opacity-40" : "hover:bg-[#f1f5f9]"
                }`}
              >
                ก่อนหน้า
              </Link>
              <Link
                href={pageHref(current + 1)}
                scroll={false}
                aria-disabled={current >= totalPages}
                className={`inline-flex h-8 items-center rounded-[8px] border border-border px-3 font-semibold ${
                  current >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-[#f1f5f9]"
                }`}
              >
                ถัดไป
              </Link>
            </div>
          </div>
        </Card>
      )}
    </section>
  );
}

function WaitingTable({ rows }: { rows: (WaitingPaymentOrder & { shop: string })[] }) {
  if (rows.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        ไม่มีออเดอร์ที่ค้างจ่ายในวันนี้
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table
        containerClassName="overflow-x-auto"
        className="@min-[700px]:min-w-[720px]"
      >
        <TableHeader sticky={false}>
          <TableRow>
            <TableHead>บิล</TableHead>
            <TableHead>ลูกค้า</TableHead>
            <TableHead>ช่องทาง</TableHead>
            <TableHead>ขนส่ง</TableHead>
            <TableHead>สถานะการจ่ายเงิน</TableHead>
            <TableHead className="num">ยอด</TableHead>
            <TableHead className="num">สั่งเมื่อ</TableHead>
            <TableHead className="num">ค้าง</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`${row.shop}-${row.orderCode}-${index}`}>
              <TableCell data-label="บิล" className="whitespace-nowrap">
                <span className="font-semibold">{row.orderCode}</span>
                <span className="block text-[10px] text-muted-foreground">{row.shop}</span>
              </TableCell>
              <TableCell data-label="ลูกค้า">{row.customerName ?? "-"}</TableCell>
              <TableCell data-label="ช่องทาง">{row.channel}</TableCell>
              <TableCell data-label="ขนส่ง">{row.courier}</TableCell>
              <TableCell data-label="สถานะการจ่ายเงิน">
                <Badge variant={row.status === "ยังไม่ชำระเงิน" ? "warning" : "neutral"}>
                  {row.status}
                </Badge>
              </TableCell>
              <TableCell data-label="ยอด" className="num whitespace-nowrap">
                {money(row.totalAmount)}
              </TableCell>
              <TableCell data-label="สั่งเมื่อ" className="num whitespace-nowrap">
                {formatDateTime(row.orderedAt)}
              </TableCell>
              <TableCell data-label="ค้าง" className="num whitespace-nowrap">
                {row.daysPending > 0 ? `${row.daysPending} วัน` : "วันนี้"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function ShipnityChips({
  orders,
  fetchedAt,
  syncedCount,
  storedOpen,
}: {
  orders: ShipnityOrder[];
  fetchedAt: string | null;
  syncedCount: number | null;
  storedOpen: number;
}) {
  const incomplete = syncedCount !== null && storedOpen > 0 && syncedCount < storedOpen;
  const counts = countShipnityStatuses(orders);
  const stamp = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString("th-TH", {
        timeZone: "Asia/Bangkok",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const chips = [
    { label: "ทั้งหมด", value: counts.total, key: "total" },
    { label: "ยังไม่ชำระเงิน", value: counts.unpaid, key: "unpaid" },
    { label: "ตรวจหลักฐาน", value: counts.checkSlip, key: "check" },
    { label: "ยืนยันออเดอร์", value: counts.confirmed, key: "confirm" },
    { label: "พิมพ์ที่อยู่", value: counts.toPrint, key: "print" },
    { label: "รอส่ง", value: counts.ready, key: "ready" },
  ];

  return (
    <div className="no-print flex flex-col gap-1 rounded-xl border border-border bg-[#f8fafc] px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-semibold text-muted-foreground">สถานะใน Shipnity:</span>
        {chips.map((chip) => (
          <span
            key={chip.key}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1"
          >
            <span className="text-muted-foreground">{chip.label}</span>
            <span className="font-bold text-foreground">{chip.value}</span>
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        นับจากออเดอร์ที่ยังไม่ปิดรายการของทั้งร้าน (ทุกวันที่ รวมของค้าง) — จึงมากกว่าการ์ด
        “ต้องแพ็คของวันนี้” ที่นับเฉพาะออเดอร์ที่สั่งวันนี้
        {stamp ? ` · ณ ${stamp} น.` : ""} — เทียบกับหน้า Shipnity ได้ แต่ต้องดูเลขของจังหวะเดียวกัน
        เพราะออเดอร์ใหม่เข้ามาตลอด
      </p>
      {incomplete ? (
        <p className="rounded-lg bg-[#fff7ed] px-2 py-1 text-xs font-semibold text-[#9a3412]">
          รอบล่าสุดดึงได้เพียง {syncedCount} จาก {storedOpen} ใบ — Shipnity จำกัดการเรียก
          ข้อมูลส่วนที่เหลือจึงเป็นชุดเดิม
        </p>
      ) : null}
    </div>
  );
}
