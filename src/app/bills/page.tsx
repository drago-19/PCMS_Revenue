import Link from "next/link";
import { CopyButton } from "@/components/CopyButton";
import { EmptyState, PageHeader, StatCard } from "@/components/PageHeader";
import {
  IconAlert,
  IconCalendar,
  IconCheckCircle,
  IconReceipt,
  IconSearch,
  IconTrend,
  IconUpload,
  IconWallet,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatTHB } from "@/lib/format";
import { listBills } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "บิลทั้งหมด" };

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    date?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const date = (params.date ?? "").trim();
  const rawStatus = (params.status ?? "all").trim();
  const status: "all" | "ok" | "mismatch" =
    rawStatus === "ok" || rawStatus === "mismatch" ? rawStatus : "all";
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const result = await listBills({ q, date, status, page });

  function buildHref(overrides: {
    nextPage?: number;
    nextStatus?: "all" | "ok" | "mismatch";
  }) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (date) search.set("date", date);
    const targetStatus = overrides.nextStatus ?? status;
    if (targetStatus !== "all") search.set("status", targetStatus);
    const targetPage = overrides.nextPage ?? 1;
    if (targetPage > 1) search.set("page", String(targetPage));
    const query = search.toString();
    return query ? `/bills?${query}` : "/bills";
  }

  const hasFilters = Boolean(q || date || status !== "all");

  return (
    <>
      <PageHeader
        eyebrow="TikTok Shop · รายการบิล"
        title="บิลทั้งหมด"
        description="ค้นหา กรองสถานะ และเปิดดูบิลสรุปยอดชำระหรือพิมพ์ใบกำกับภาษีรายคำสั่งซื้อได้ทันที"
        actions={
          <Button asChild variant="default">
            <Link href="/import">
              <IconUpload size={17} /> อัปโหลดไฟล์รายได้
            </Link>
          </Button>
        }
      />

      <Card padding="compact" className="mb-4">
        <form className="flex flex-wrap items-center gap-2.5" method="get">
          {status !== "all" ? (
            <input type="hidden" name="status" value={status} />
          ) : null}
          <div className="field grow">
            <IconSearch size={17} />
            <Input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="ค้นหาหมายเลขคำสั่งซื้อ หรือ SKU สินค้า..."
              aria-label="ค้นหาบิล"
              className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="field">
            <IconCalendar size={17} />
            <Input
              type="date"
              name="date"
              defaultValue={date}
              aria-label="วันที่ชำระ"
              className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <Button type="submit" variant="default">
            <IconSearch size={16} /> ค้นหา
          </Button>
          {hasFilters ? (
            <Button asChild variant="ghost">
              <Link href="/bills">ล้างตัวกรอง</Link>
            </Button>
          ) : null}
        </form>

        <div
          className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-muted pt-3"
          role="navigation"
          aria-label="กรองตามสถานะตรวจยอด"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button
              asChild
              variant={status === "all" ? "default" : "secondary"}
              size="sm"
            >
              <Link href={buildHref({ nextStatus: "all", nextPage: 1 })}>
                บิลทั้งหมด
              </Link>
            </Button>
            <Button
              asChild
              variant={status === "ok" ? "default" : "secondary"}
              size="sm"
            >
              <Link href={buildHref({ nextStatus: "ok", nextPage: 1 })}>
                <IconCheckCircle size={15} /> ยอดตรง
              </Link>
            </Button>
            <Button
              asChild
              variant={status === "mismatch" ? "default" : "secondary"}
              size="sm"
            >
              <Link href={buildHref({ nextStatus: "mismatch", nextPage: 1 })}>
                <IconAlert size={15} /> ต้องตรวจสอบ
              </Link>
            </Button>
          </div>
          {date ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/days/${date}/invoices`}>
                <IconReceipt size={15} /> พิมพ์ใบกำกับภาษีรอบ {formatDate(date)}
              </Link>
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="stats mb-4 mt-0">
        <StatCard
          label="ผลลัพธ์ที่พบ"
          value={`${result.total.toLocaleString("th-TH")} บิล`}
          hint={hasFilters ? "ตามตัวกรองที่เลือก" : "บิลคำสั่งซื้อทั้งหมด"}
          icon={<IconReceipt size={19} />}
        />
        <StatCard
          label="รายได้รวม"
          value={formatTHB(result.summary.income)}
          hint="ยอดก่อนหักค่าธรรมเนียม"
          icon={<IconTrend size={19} />}
        />
        <StatCard
          label="ค่าธรรมเนียมรวม"
          value={formatTHB(result.summary.fees)}
          hint="หักค่าธรรมเนียม TikTok Shop"
          tone="negative"
          icon={<IconAlert size={19} />}
        />
        <StatCard
          label="ยอดชำระสุทธิ"
          value={formatTHB(result.summary.payout)}
          hint="ยอดโอนเข้าบัญชีจากบิล"
          tone="positive"
          icon={<IconWallet size={19} />}
        />
      </div>

      {result.rows.length === 0 ? (
        <EmptyState
          icon={<IconReceipt size={28} />}
          title="ไม่พบบิลที่ตรงกับเงื่อนไข"
          description={
            hasFilters
              ? "ลองเปลี่ยนสถานะ ล้างตัวกรอง หรือค้นหาด้วยหมายเลขคำสั่งซื้อบางส่วน"
              : "ยังไม่มีบิลในระบบ เริ่มต้นด้วยการอัปโหลดไฟล์รายได้จาก TikTok Shop"
          }
          action={
            hasFilters ? (
              <Button asChild variant="secondary">
                <Link href="/bills">ล้างตัวกรองทั้งหมด</Link>
              </Button>
            ) : (
              <Button asChild variant="default">
                <Link href="/import">
                  <IconUpload size={17} /> อัปโหลดไฟล์แรก
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>รายการบิลรายคำสั่งซื้อ</CardTitle>
            <span className="muted small">
              หน้า {result.page} / {result.pageCount} (แสดง {result.rows.length} จาก{" "}
              {result.total.toLocaleString("th-TH")} บิล)
            </span>
          </CardHeader>
          <Table variant="stack">
            <TableHeader>
              <TableRow>
                <TableHead>หมายเลขคำสั่งซื้อ</TableHead>
                <TableHead>วันที่สั่งซื้อ / ชำระ</TableHead>
                <TableHead className="num">รายได้</TableHead>
                <TableHead className="num">ค่าธรรมเนียม</TableHead>
                <TableHead className="num">ยอดชำระสุทธิ</TableHead>
                <TableHead>สถานะตรวจยอด</TableHead>
                <TableHead className="num">เอกสาร</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => {
                const ok =
                  Math.abs(row.checks.incomeDiff) < 0.01 &&
                  Math.abs(row.checks.feeDiff) < 0.01 &&
                  Math.abs(row.checks.payoutDiff) < 0.01;
                return (
                  <TableRow key={row.id}>
                    <TableCell data-label="หมายเลขคำสั่งซื้อ">
                      <div className="flex flex-col items-end min-[641px]:items-start">
                        <span className="inline-flex items-center gap-1.5">
                          <Link
                            className="mono link inline-flex min-h-[40px] items-center"
                            href={`/bills/${row.externalId}`}
                          >
                            {row.externalId}
                          </Link>
                          <CopyButton value={row.externalId} />
                        </span>
                        {row.invoiceNo ? (
                          <span className="muted small mono">
                            ใบกำกับฯ: {row.invoiceNo}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell data-label="วันที่สั่งซื้อ / ชำระ">
                      <div className="flex flex-col items-end min-[641px]:items-start">
                        <span className="font-semibold">
                          ชำระ {formatDate(row.paidDate)}
                        </span>
                        <span className="muted small">
                          สั่งซื้อ {formatDate(row.createdDate)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell data-label="รายได้" className="num">
                      {formatTHB(row.income)}
                    </TableCell>
                    <TableCell data-label="ค่าธรรมเนียม" className="num danger">
                      {formatTHB(row.feeTotal)}
                    </TableCell>
                    <TableCell data-label="ยอดชำระสุทธิ" className="num positive strong">
                      {formatTHB(row.payout)}
                    </TableCell>
                    <TableCell data-label="สถานะตรวจยอด">
                      {ok ? (
                        <Badge variant="success" size="sm">
                          <IconCheckCircle size={13} /> ยอดตรง
                        </Badge>
                      ) : (
                        <Badge variant="warning" size="sm">
                          <IconAlert size={13} /> ตรวจสอบ
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell data-label="เอกสาร" className="num">
                      <span className="inline-flex flex-wrap items-center justify-end gap-2">
                        <Button asChild variant="secondary" size="xs">
                          <Link href={`/bills/${row.externalId}`}>ดูบิล</Link>
                        </Button>
                        <Button asChild variant="ghost" size="xs">
                          <Link href={`/invoices/${row.externalId}`}>ใบกำกับฯ</Link>
                        </Button>
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {result.pageCount > 1 ? (
            <div className="pagination">
              <span>
                หน้า {result.page} จาก {result.pageCount} (ทั้งหมด{" "}
                {result.total.toLocaleString("th-TH")} บิล)
              </span>
              <div className="pagination-actions">
                {result.page > 1 ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={buildHref({ nextPage: result.page - 1 })}>
                      ก่อนหน้า
                    </Link>
                  </Button>
                ) : null}
                {result.page < result.pageCount ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={buildHref({ nextPage: result.page + 1 })}>
                      ถัดไป
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </>
  );
}
