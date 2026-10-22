"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PaginationBar({
  page,
  pageCount,
  pageSize,
  total,
  unitLabel = "รายการ",
  basePath,
  extraParams = {},
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  unitLabel?: string;
  basePath: string;
  extraParams?: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [jumpValue, setJumpValue] = useState(String(page));

  function buildHref(targetPage: number) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(extraParams)) {
      if (value) search.set(key, value);
    }
    const clamped = Math.max(1, Math.min(pageCount, targetPage));
    if (clamped > 1) search.set("page", String(clamped));
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  function handleJumpSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = Number(jumpValue);
    if (!Number.isFinite(parsed)) return;
    const target = Math.max(1, Math.min(pageCount, Math.round(parsed)));
    router.push(buildHref(target));
  }

  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(total, page * pageSize);

  return (
    <div className="pagination shrink-0 bg-[#f8fafc] flex-wrap">
      <span className="text-xs text-muted-foreground">
        แสดง{" "}
        <strong className="text-foreground">
          {startItem.toLocaleString("th-TH")}–{endItem.toLocaleString("th-TH")}
        </strong>{" "}
        จากทั้งหมด{" "}
        <strong className="text-foreground">
          {total.toLocaleString("th-TH")}
        </strong>{" "}
        {unitLabel} (หน้าละ {pageSize} {unitLabel})
      </span>

      <div className="pagination-actions flex-wrap items-center">
        {page > 1 ? (
          <>
            <Button asChild variant="outline" size="xs">
              <Link href={buildHref(1)} aria-label="หน้าแรก">
                « หน้าแรก
              </Link>
            </Button>
            <Button asChild variant="secondary" size="xs">
              <Link href={buildHref(page - 1)} aria-label="หน้าก่อนหน้า">
                ‹ ก่อนหน้า
              </Link>
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="outline" size="xs" disabled>
              « หน้าแรก
            </Button>
            <Button type="button" variant="secondary" size="xs" disabled>
              ‹ ก่อนหน้า
            </Button>
          </>
        )}

        <form
          onSubmit={handleJumpSubmit}
          className="inline-flex items-center gap-1.5 px-1"
        >
          <span className="text-xs text-muted-foreground">หน้า</span>
          <Input
            type="number"
            min={1}
            max={pageCount}
            key={page}
            defaultValue={page}
            onChange={(e) => setJumpValue(e.target.value)}
            aria-label="ระบุเลขหน้าที่ต้องการไป"
            className="h-8 w-16 px-2 text-center text-xs font-bold"
          />
          <span className="text-xs text-muted-foreground">
            / {pageCount.toLocaleString("th-TH")}
          </span>
          <Button type="submit" variant="outline" size="xs">
            ไป
          </Button>
        </form>

        {page < pageCount ? (
          <>
            <Button asChild variant="secondary" size="xs">
              <Link href={buildHref(page + 1)} aria-label="หน้าถัดไป">
                ถัดไป ›
              </Link>
            </Button>
            <Button asChild variant="outline" size="xs">
              <Link href={buildHref(pageCount)} aria-label="หน้าสุดท้าย">
                สุดท้าย »
              </Link>
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="secondary" size="xs" disabled>
              ถัดไป ›
            </Button>
            <Button type="button" variant="outline" size="xs" disabled>
              สุดท้าย »
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
