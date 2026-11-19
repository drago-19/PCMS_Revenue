"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** นำรหัสกลางที่เลิกใช้แล้วกลับมาใช้ — ประวัติการเคลื่อนไหวเดิมยังอยู่ครบ */
export function CentralStockRestoreButton({ skuCode }: { skuCode: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/platform/central-stock/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "restore", skuCode }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "นำกลับไม่สำเร็จ");
        return;
      }
      router.refresh();
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center justify-end gap-1.5">
      <Button type="button" size="sm" variant="outline" onClick={restore} disabled={busy}>
        {busy ? "…" : "นำกลับมาใช้"}
      </Button>
      {error ? (
        <span className="text-[11.5px] font-semibold text-[#b42318]" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
