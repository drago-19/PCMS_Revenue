"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * แผงสต็อกกลางในป๊อปอัปของ SKU — เติม/ตัดยอดของรหัสกลาง และผูก SKU ของร้านเข้ากับรหัสนั้น
 * ยอดเดียวกันนี้ใช้ร่วมทุกแพลตฟอร์มและทุกร้านที่ผูกไว้ (ไม่ใช่ยอดของร้านนี้ร้านเดียว)
 */
export function CentralStockPanel({
  platform,
  shopId,
  skuId,
  sellerSku,
  skuCode,
  onHand,
  canWrite,
}: {
  platform: string;
  shopId: string;
  skuId: string;
  sellerSku: string | null;
  skuCode: string | null;
  onHand: number | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [linkCode, setLinkCode] = useState(skuCode ?? sellerSku ?? "");
  const [busy, setBusy] = useState<null | "receive" | "link" | "unlink">(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const quantity = Math.trunc(Number(amount));
  const amountValid = Number.isFinite(quantity) && quantity !== 0 && Math.abs(quantity) <= 1_000_000;

  async function post(
    body: Record<string, unknown>,
  ): Promise<{
    onHand?: number;
    restored?: boolean;
    pushed?: number;
    pushFailed?: number;
    pushShops?: number;
    pushBlocked?: number;
    pushMs?: number;
    pushDisabled?: boolean;
  } | null> {
    const response = await fetch("/api/platform/central-stock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      onHand?: number;
      linked?: number;
      restored?: boolean;
      pushed?: number;
      pushFailed?: number;
      pushShops?: number;
      pushBlocked?: number;
      pushMs?: number;
      pushDisabled?: boolean;
    };
    if (!response.ok) {
      setError(payload.error ?? "ทำรายการไม่สำเร็จ");
      return null;
    }
    setError(null);
    return payload;
  }

  async function receive(sign: 1 | -1) {
    if (!canWrite || !skuCode || !amountValid || busy) return;
    setBusy("receive");
    setMessage(null);
    const result = await post({ action: "receive", skuCode, quantity: sign * quantity });
    setBusy(null);
    if (!result) return;
    setAmount("");
    // สต็อกกลางเป็นเจ้าของยอด — เติมแล้วต้องบอกว่าได้ดันขึ้นประกาศไปแล้วกี่ประกาศและใช้เวลาเท่าไร
    // ถ้าร้านจริงยังไม่เปิด STOCK_PUSH_LIVE หรือดันไม่สำเร็จ ต้องบอกตรง ๆ ไม่ใช่เงียบ
    const pushed = result.pushed ?? 0;
    const blocked = result.pushBlocked ?? 0;
    const failed = result.pushFailed ?? 0;
    const note = pushed > 0
      ? ` · อัปเดตขึ้นประกาศ ${pushed} ประกาศ (${result.pushShops ?? 0} ร้าน) · ${result.pushMs ?? 0} ms`
      : result.pushDisabled
        ? " · การดันยอดขึ้นประกาศปิดอยู่ (STOCK_PUSH_ENABLED=0)"
        : blocked > 0
          ? ` · ร้านจริงรอเปิด STOCK_PUSH_LIVE (${blocked} ประกาศ)`
          : "";
    const failedNote = failed > 0 ? ` · ประกาศที่พลาด ${failed}` : "";
    setMessage(
      sign > 0
        ? `เติม ${Math.abs(quantity)} เข้าสต็อกกลางแล้ว${note}${failedNote}`
        : `ตัด ${Math.abs(quantity)} ออกจากสต็อกกลางแล้ว${note}${failedNote}`,
    );
    router.refresh();
  }

  async function link() {
    const code = linkCode.trim();
    if (!canWrite || !code || busy) return;
    setBusy("link");
    setMessage(null);
    const result = await post({ action: "link", platform, shopId, skuId, skuCode: code });
    setBusy(null);
    if (!result) return;
    setMessage(`ผูกกับรหัสกลาง ${code} แล้ว`);
    router.refresh();
  }

  async function unlink() {
    if (!canWrite || busy) return;
    setBusy("unlink");
    setMessage(null);
    const result = await post({ action: "unlink", platform, shopId, skuId });
    setBusy(null);
    if (!result) return;
    setMessage("เลิกผูกกับสต็อกกลางแล้ว");
    router.refresh();
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-bold">สต็อกกลาง</h3>
        <span className="text-[11.5px] text-muted-foreground">ยอดเดียวใช้ร่วมทุกแพลตฟอร์มและทุกร้าน</span>
      </div>

      {skuCode ? (
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px]">
          <span className="text-muted-foreground">รหัสกลาง</span>
          <span className="mono font-bold">{skuCode}</span>
          <span className="text-muted-foreground">· เหลือ</span>
          <span
            className={cn(
              "mono text-[18px] font-bold tabular-nums",
              (onHand ?? 0) <= 0 ? "text-[#b42318]" : "",
            )}
          >
            {onHand === null ? "—" : onHand.toLocaleString("th-TH")}
          </span>
          <span className="text-muted-foreground">ชิ้น</span>
        </p>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">
          ยังไม่ผูกกับสต็อกกลาง — ออเดอร์ของ SKU นี้จะยังไม่ถูกหักจากยอดกลาง
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[12px] font-semibold">
          รหัสกลางของ SKU นี้
          <Input
            value={linkCode}
            onChange={(event) => setLinkCode(event.target.value)}
            disabled={!canWrite || busy !== null}
            placeholder="เช่น K-6TS-10-XL"
            className="h-10 w-[200px] text-[13px]"
            aria-label="รหัสสินค้าของสต็อกกลาง"
          />
        </label>
        <Button type="button" size="sm" variant="outline" onClick={link} disabled={!canWrite || busy !== null}>
          {busy === "link" ? "กำลังผูก…" : "ผูก"}
        </Button>
        {skuCode ? (
          <Button type="button" size="sm" variant="ghost" onClick={unlink} disabled={!canWrite || busy !== null}>
            {busy === "unlink" ? "กำลังเลิกผูก…" : "เลิกผูก"}
          </Button>
        ) : null}
      </div>

      {skuCode ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
          <label className="flex flex-col gap-1 text-[12px] font-semibold">
            จำนวน
            <Input
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d-]/g, ""))}
              disabled={!canWrite || busy !== null}
              inputMode="numeric"
              placeholder="50"
              className="h-10 w-[120px] text-[13px] tabular-nums"
              aria-label="จำนวนที่ต้องการเติมหรือตัด"
            />
          </label>
          <Button
            type="button"
            size="sm"
            onClick={() => receive(1)}
            disabled={!canWrite || !amountValid || busy !== null}
          >
            {busy === "receive" ? "กำลังบันทึก…" : "เติมเข้า"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => receive(-1)}
            disabled={!canWrite || !amountValid || busy !== null}
          >
            ตัดออก
          </Button>
        </div>
      ) : null}

      {!canWrite ? (
        <p className="text-[12px] text-muted-foreground">ร้านนี้ยังไม่เปิดให้แก้สต็อก — ต้องทดสอบบนร้านทดสอบให้ผ่านก่อน</p>
      ) : null}
      {error ? (
        <p className="text-[12.5px] font-semibold text-[#b42318]" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-[12.5px] font-semibold text-[color:var(--ok)]" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
