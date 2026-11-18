"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { platformImageSrc } from "@/lib/platform/image-proxy";

type SkuPreview = {
  skuCode: string;
  productName: string | null;
  imageUrl: string | null;
  onHand: number | null;
  linkedListings: number;
  listings: Array<{ platform: string; shopId: string; shopName: string | null; quantity: number }>;
};

/**
 * รับเข้าสต็อกกลาง — หนึ่งรหัส หนึ่งยอด ใช้ร่วมทุกแพลตฟอร์ม
 * หลังบันทึก ระบบเขียนยอดใหม่ลงประกาศของทุกร้านที่ผูกไว้ให้ด้วย
 */
export function CentralStockReceiveForm() {
  const router = useRouter();
  const [skuCode, setSkuCode] = useState("");
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const amount = Math.trunc(Number(quantity));
  const valid = skuCode.trim().length > 0 && Number.isFinite(amount) && amount !== 0 && Math.abs(amount) <= 1_000_000;

  // พิมพ์รหัสแล้วดึงรูป/ชื่อ/จำนวนบนร้านมาให้เห็นก่อนกดบันทึก — กันเติมผิดรหัส
  const [preview, setPreview] = useState<SkuPreview | null>(null);
  const [looking, setLooking] = useState(false);
  useEffect(() => {
    const code = skuCode.trim();
    if (code.length < 3) {
      setPreview(null);
      setLooking(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLooking(true);
      try {
        const response = await fetch(`/api/platform/central-stock?code=${encodeURIComponent(code)}`);
        const payload = (await response.json().catch(() => ({}))) as { item?: SkuPreview | null };
        setPreview(payload.item ?? null);
      } catch {
        setPreview(null);
      } finally {
        setLooking(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [skuCode]);

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/platform/central-stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "receive",
          skuCode: skuCode.trim(),
          productName: productName.trim() || null,
          quantity: amount,
          note: note.trim() || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        onHand?: number;
        pushed?: number;
        pushFailed?: number;
      };
      if (!response.ok) {
        setError(payload.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      const pushed = payload.pushed ?? 0;
      setMessage(
        `${amount > 0 ? "รับเข้า" : "ตัดออก"} ${Math.abs(amount)} · ยอดกลางเหลือ ${payload.onHand ?? 0}${
          pushed > 0 ? ` · เขียนลงประกาศ ${pushed} ร้าน` : ""
        }${(payload.pushFailed ?? 0) > 0 ? ` · พลาด ${payload.pushFailed} ร้าน` : ""}`,
      );
      setQuantity("");
      setNote("");
      router.refresh();
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 min-[560px]:grid-cols-2 min-[900px]:grid-cols-4">
        <label className="flex flex-col gap-1 text-[12px] font-semibold">
          รหัสสินค้า (ของกลาง)
          <Input
            value={skuCode}
            onChange={(event) => setSkuCode(event.target.value)}
            placeholder="เช่น K-6TS-10-XL"
            className="h-10 text-[13px]"
            aria-label="รหัสสินค้าของสต็อกกลาง"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold">
          ชื่อสินค้า (ไม่บังคับ)
          <Input
            value={productName}
            onChange={(event) => setProductName(event.target.value)}
            placeholder="ไว้ดูในรายการ"
            className="h-10 text-[13px]"
            aria-label="ชื่อสินค้า"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold">
          จำนวน (บวก = รับเข้า, ลบ = ตัดออก)
          <Input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value.replace(/[^\d-]/g, ""))}
            inputMode="numeric"
            placeholder="50"
            className="h-10 text-[13px] tabular-nums"
            aria-label="จำนวนที่รับเข้าหรือตัดออก"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold">
          หมายเหตุ
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="เลขที่เอกสาร ฯลฯ"
            className="h-10 text-[13px]"
            aria-label="หมายเหตุ"
          />
        </label>
      </div>

      {looking ? <p className="text-[12px] text-muted-foreground">กำลังค้นรหัส…</p> : null}
      {preview ? (
        <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/30 p-2">
          <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
            {preview.imageUrl ? (
              <img
                src={platformImageSrc(preview.imageUrl) ?? preview.imageUrl}
                alt={`รูป ${preview.skuCode}`}
                className="size-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="text-[10px] text-muted-foreground">ไม่มีรูป</span>
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="mono text-[13px] font-bold">{preview.skuCode}</span>
            <span className="truncate text-[12px] text-muted-foreground">{preview.productName ?? "—"}</span>
            <span className="text-[11.5px] text-muted-foreground">
              {preview.listings.length > 0
                ? preview.listings
                    .slice(0, 3)
                    .map((row) => `${row.shopName ?? row.shopId}: ${row.quantity.toLocaleString("th-TH")}`)
                    .join(" · ")
                : "ยังไม่มีประกาศร้านไหนใช้รหัสนี้"}
            </span>
          </span>
          <span className="flex flex-col items-end gap-0.5 text-[11.5px]">
            <span>
              คงเหลือกลาง{" "}
              <b className="mono text-[13px]">
                {preview.onHand === null ? "—" : preview.onHand.toLocaleString("th-TH")}
              </b>
            </span>
            <span className="text-muted-foreground">ผูกไว้ {preview.linkedListings} ประกาศ</span>
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={submit} disabled={!valid || busy} aria-busy={busy}>
          {busy ? "กำลังบันทึก…" : "บันทึกเข้าสต็อกกลาง"}
        </Button>
        {message ? (
          <span className="text-[12px] font-semibold text-[color:var(--ok)]" role="status">
            {message}
          </span>
        ) : null}
        {error ? (
          <span className="text-[12px] font-semibold text-[#b42318]" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** แถวผูก SKU ของร้านเข้ากับรหัสกลาง — ใช้ในตารางหน้าสต็อกกลาง */
export function CentralLinkRow({
  platform,
  shopId,
  skuId,
  sellerSku,
  linkedCode,
}: {
  platform: string;
  shopId: string;
  skuId: string;
  sellerSku: string | null;
  linkedCode: string | null;
}) {
  const router = useRouter();
  const [code, setCode] = useState(linkedCode ?? sellerSku ?? "");
  const [busy, setBusy] = useState<null | "link" | "unlink">(null);
  const [error, setError] = useState<string | null>(null);

  async function post(body: Record<string, unknown>): Promise<boolean> {
    const response = await fetch("/api/platform/central-stock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "ทำรายการไม่สำเร็จ");
      return false;
    }
    setError(null);
    return true;
  }

  async function link() {
    if (!code.trim() || busy) return;
    setBusy("link");
    const ok = await post({ action: "link", platform, shopId, skuId, skuCode: code.trim() });
    setBusy(null);
    if (ok) {
      setCode(code.trim());
      router.refresh();
    }
  }

  async function unlink() {
    if (busy) return;
    setBusy("unlink");
    const ok = await post({ action: "unlink", platform, shopId, skuId });
    setBusy(null);
    if (ok) {
      // ต้องล้างช่องด้วย ไม่งั้นรหัสเดิมค้างอยู่และดูเหมือนยังผูกอยู่ (sku นี้เลิกผูกแล้วจริง)
      setCode("");
      router.refresh();
    }
  }

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Input
        value={code}
        onChange={(event) => setCode(event.target.value)}
        className="h-9 w-[160px] text-[12.5px]"
        aria-label="รหัสสินค้าของสต็อกกลาง"
        placeholder={sellerSku ?? "รหัสกลาง"}
      />
      <Button type="button" size="sm" variant="outline" onClick={link} disabled={busy !== null || !code.trim()}>
        {busy === "link" ? "…" : "ผูก"}
      </Button>
      {linkedCode ? (
        <Button type="button" size="sm" variant="ghost" onClick={unlink} disabled={busy !== null}>
          {busy === "unlink" ? "…" : "เลิกผูก"}
        </Button>
      ) : null}
      {error ? (
        <span className="text-[11.5px] font-semibold text-[#b42318]" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
