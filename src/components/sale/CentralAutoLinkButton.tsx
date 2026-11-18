"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * ผูก SKU ของร้านนี้เข้ากับสต็อกกลางอัตโนมัติ เมื่อรหัสบนประกาศตรงกับรหัสในรายการสินค้าเป๊ะ
 * รหัสที่ตั้งไม่ตรงกันยังต้องผูกมือในป๊อปอัปของ SKU นั้น
 */
export function CentralAutoLinkButton({ platform, shopId }: { platform: string; shopId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const response = await fetch("/api/platform/central-stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "auto-link", platform, shopId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; linked?: number };
      if (!response.ok) {
        setError(payload.error ?? "ผูกอัตโนมัติไม่สำเร็จ");
        return;
      }
      setResult(
        payload.linked && payload.linked > 0
          ? `ผูกใหม่ ${payload.linked.toLocaleString("th-TH")} SKU`
          : "ไม่มี SKU ใหม่ให้ผูก — รหัสที่เหลือต้องผูกเองในช่องรายละเอียดสินค้า",
      );
      router.refresh();
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="outline" onClick={run} disabled={busy} aria-busy={busy}>
        {busy ? "กำลังผูก…" : "ผูก SKU กับสต็อกกลาง"}
      </Button>
      {result ? <span className="text-[11.5px] text-muted-foreground">{result}</span> : null}
      {error ? (
        <span className="text-[11.5px] font-semibold text-[#b42318]" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
