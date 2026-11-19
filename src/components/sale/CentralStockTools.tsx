"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, MinusIcon, PackageOpen, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { platformImageSrc } from "@/lib/platform/image-proxy";
import { cn } from "@/lib/utils";

type SkuPreview = {
  skuCode: string;
  productName: string | null;
  imageUrl: string | null;
  hasImage?: boolean;
  onHand: number | null;
  linkedListings: number;
  listings: Array<{ platform: string; shopId: string; shopName: string | null; quantity: number }>;
};

const PRESETS = [1, 5, 10, 50] as const;
const MAX_AMOUNT = 999_999;

/**
 * รับเข้าสต็อกกลาง — หนึ่งรหัส หนึ่งยอด ใช้ร่วมทุกแพลตฟอร์ม
 * ซ้าย: ฟอร์ม (รหัส · ชื่อ · จำนวนแบบปุ่มลัด · หมายเหตุ · รูป) ขวา: การ์ดสินค้าที่จะรับเข้า
 * รูปบังคับเมื่อรหัสนั้นยังไม่มีรูปจากประกาศร้าน (แพลตฟอร์มต้องมีรูปสินค้า)
 */
export function CentralStockReceiveForm() {
  const router = useRouter();
  const [skuCode, setSkuCode] = useState("");
  const [productName, setProductName] = useState("");
  const [note, setNote] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState(0);
  const [preview, setPreview] = useState<SkuPreview | null>(null);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const code = skuCode.trim();
  const maxAmount = mode === "remove" ? Math.max(preview?.onHand ?? 0, 0) : MAX_AMOUNT;
  const effective = Math.min(amount, maxAmount);
  const baseQuantity = preview?.onHand ?? 0;
  const nextQuantity = mode === "add" ? baseQuantity + effective : Math.max(baseQuantity - effective, 0);
  const needsImage = !imageFile && !preview?.imageUrl && !preview?.hasImage;
  // ไม่ล็อกปุ่มด้วยเงื่อนไขรูป — ให้กดแล้วเจอข้อความที่ช่องรูปเอง จะได้รู้ว่าติดอะไร
  const canSubmit = code.length > 0 && effective >= 1 && !busy;

  useEffect(() => {
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
  }, [code]);

  useEffect(() => {
    if (!imageFile) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  function changeMode(next: "add" | "remove") {
    setMode(next);
    setAmount(0);
  }

  async function readImageAsDataUrl(file: File): Promise<string | null> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  async function submit() {
    if (busy) return;
    setCodeError(null);
    setImageError(null);
    setError(null);
    setMessage(null);

    if (code.length === 0) {
      setCodeError("ต้องระบุรหัสสินค้าก่อนบันทึก");
      return;
    }
    if (effective < 1) {
      setError("ระบุจำนวนอย่างน้อย 1 ชิ้นก่อนบันทึก");
      return;
    }
    if (needsImage) {
      setImageError("ต้องแนบรูปสินค้าก่อนบันทึก — รหัสนี้ยังไม่มีรูปจากประกาศร้าน");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/platform/central-stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "receive",
          skuCode: code,
          productName: productName.trim() || null,
          quantity: mode === "add" ? effective : -effective,
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

      let imageNote = "";
      if (imageFile) {
        const dataUrl = await readImageAsDataUrl(imageFile);
        if (dataUrl) {
          const uploaded = await fetch("/api/platform/central-stock", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "image", skuCode: code, dataUrl }),
          });
          if (uploaded.ok) imageNote = " · แนบรูปแล้ว";
        }
      }

      const pushed = payload.pushed ?? 0;
      setMessage(
        `${mode === "add" ? "รับเข้า" : "ตัดออก"} ${effective} · ยอดกลางเหลือ ${payload.onHand ?? 0}${
          pushed > 0 ? ` · เขียนลงประกาศ ${pushed} ร้าน` : ""
        }${(payload.pushFailed ?? 0) > 0 ? ` · พลาด ${payload.pushFailed} ร้าน` : ""}${imageNote}`,
      );
      setAmount(0);
      setNote("");
      setImageFile(null);
      router.refresh();
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }

  }

  const previewImage = imageUrl ?? (preview?.imageUrl ? platformImageSrc(preview.imageUrl) ?? preview.imageUrl : null);

  return (
    <div className="grid gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_248px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="grid gap-3 min-[560px]:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="central-code" className="text-[12px] font-semibold">
              รหัสสินค้า (ของกลาง) <span aria-hidden="true" className="text-[#b42318]">*</span>
            </label>
            <Input
              id="central-code"
              value={skuCode}
              onChange={(event) => setSkuCode(event.target.value)}
              placeholder="เช่น K-6TS-10-XL"
              className="h-10 text-[13px]"
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? "central-code-err" : undefined}
            />
            {codeError ? (
              <p id="central-code-err" className="text-[11.5px] font-semibold text-[#b42318]" role="alert">
                {codeError}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="central-name" className="text-[12px] font-semibold">
              ชื่อสินค้า (ไม่บังคับ)
            </label>
            <Input
              id="central-name"
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              placeholder="ไว้ดูในรายการ"
              className="h-10 text-[13px]"
            />
          </div>
        </div>

        <section aria-label="จำนวนที่จะปรับ" className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <div role="group" aria-label="เลือกว่าจะเติมหรือตัด" className="grid w-full grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            <button
              type="button"
              onClick={() => changeMode("add")}
              aria-pressed={mode === "add"}
              className={cn(
                "min-h-[40px] rounded-lg border text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                mode === "add"
                  ? "border-[color:var(--ok)] bg-[color:var(--ok-soft)] text-[color:var(--ok)]"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              เติมเข้า
            </button>
            <button
              type="button"
              onClick={() => changeMode("remove")}
              aria-pressed={mode === "remove"}
              disabled={(preview?.onHand ?? 0) <= 0}
              className={cn(
                "min-h-[40px] rounded-lg border text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
                mode === "remove"
                  ? "border-[color:var(--danger)] bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              ตัดออก
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="ลดจำนวนลงหนึ่ง"
              onClick={() => setAmount((value) => Math.max(0, value - 1))}
              disabled={busy || amount <= 0}
              className="size-11"
            >
              <MinusIcon className="size-5" aria-hidden="true" />
            </Button>
            <span
              aria-live="polite"
              aria-label={`จำนวนที่จะ${mode === "add" ? "เติม" : "ตัด"} ${effective}`}
              className="min-w-[80px] text-center text-[30px] font-bold leading-none tabular-nums"
            >
              {effective}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="เพิ่มจำนวนขึ้นหนึ่ง"
              onClick={() => setAmount((value) => Math.min(maxAmount, value + 1))}
              disabled={busy || amount >= maxAmount}
              className="size-11"
            >
              <PlusIcon className="size-5" aria-hidden="true" />
            </Button>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant={effective === preset ? "secondary" : "outline"}
                size="sm"
                onClick={() =>
                  setAmount((value) =>
                    mode === "add" ? Math.min(maxAmount, value + preset) : Math.max(0, value - preset),
                  )
                }
                disabled={busy || (mode === "remove" && effective < preset)}
                aria-label={`${mode === "add" ? "บวกเพิ่ม" : "ลดลง"} ${preset}`}
                className="min-h-[40px] tabular-nums"
              >
                {mode === "add" ? `+${preset}` : `−${preset}`}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="central-amount-exact" className="text-[12px] font-semibold whitespace-nowrap">
              พิมพ์จำนวน
            </label>
            <Input
              id="central-amount-exact"
              value={amount === 0 ? "" : String(amount)}
              onChange={(event) => {
                const digits = event.target.value.replace(/[^\d]/g, "");
                setAmount(digits ? Math.min(maxAmount, Number(digits)) : 0);
              }}
              inputMode="numeric"
              placeholder="เช่น 100"
              className="h-10 w-[110px] text-[13px] tabular-nums"
              aria-describedby="central-amount-preview"
            />
            <span id="central-amount-preview" className="text-[11.5px] text-muted-foreground">
              จำกัดไม่เกิน {maxAmount.toLocaleString("th-TH")} ตามโหมดที่เลือก
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-[13px]">
            <span className="text-muted-foreground">
              คงเหลือ <span className="font-bold tabular-nums text-foreground">{baseQuantity}</span>
            </span>
            <span aria-hidden="true" className="text-muted-foreground">
              →
            </span>
            <span className="text-muted-foreground">
              จะเป็น{" "}
              <span className={cn("font-bold tabular-nums", mode === "add" ? "text-[#0d6b3c]" : "text-[#b42318]")}>
                {nextQuantity}
              </span>
            </span>
          </div>
        </section>

        <div className="grid gap-3 min-[560px]:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="central-note" className="text-[12px] font-semibold">
              หมายเหตุ
            </label>
            <Input
              id="central-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="เลขที่เอกสาร ฯลฯ"
              className="h-10 text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold">
              รูปสินค้า{" "}
              <span className="font-normal text-muted-foreground">
                {needsImage ? "(ต้องมี — รหัสนี้ยังไม่มีรูป)" : "(มีรูปแล้ว แนบใหม่ได้)"}
              </span>
            </span>
            <label
              htmlFor="central-image"
              className={cn(
                "flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-[12.5px] transition-colors hover:bg-muted/60 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring",
                imageError ? "border-[#b42318] bg-[#fdf2f1]" : "border-border",
              )}
            >
              <ImagePlus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                {imageFile ? imageFile.name : "เลือกรูปสินค้า (JPG/PNG/WEBP)"}
              </span>
              <input
                id="central-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  setImageFile(event.target.files?.[0] ?? null);
                  setImageError(null);
                }}
                className="sr-only"
                aria-invalid={imageError ? true : undefined}
                aria-describedby={imageError ? "central-image-err" : undefined}
              />
            </label>
            {imageError ? (
              <p id="central-image-err" className="text-[11.5px] font-semibold text-[#b42318]" role="alert">
                {imageError}
              </p>
            ) : null}
          </div>
        </div>

        <Button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          aria-busy={busy}
          className="min-h-[46px] w-full text-[14px]"
        >
          {busy ? "กำลังบันทึก…" : `บันทึก${mode === "add" ? "รับเข้า" : "ตัดออก"} ${effective} ชิ้น`}
          {/* ปุ่มเปิดให้กดเสมอเมื่อกรอกครบ — ข้อผิดพลาดเรื่องรูปจะโชว์ที่ช่องรูป */}
        </Button>

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

      <aside
        aria-label="สินค้าที่จะรับเข้า"
        className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3"
      >
        <h3 className="text-[12.5px] font-bold">สินค้าที่จะรับเข้า</h3>
        <span className="flex size-24 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
          {previewImage ? (
            <img src={previewImage} alt={`รูป ${code || "สินค้า"}`} className="size-full object-cover" />
          ) : (
            <PackageOpen className="size-8 text-muted-foreground/60" aria-hidden="true" />
          )}
        </span>
        {looking ? (
          <p className="text-[12px] text-muted-foreground">กำลังค้นรหัส…</p>
        ) : preview ? (
          <>
            <p className="mono text-[13px] font-bold">{preview.skuCode}</p>
            <p className="line-clamp-2 text-[12px] text-muted-foreground">{preview.productName ?? "—"}</p>
            <p className="text-[11.5px] text-muted-foreground">
              {preview.listings.length > 0
                ? preview.listings
                    .slice(0, 3)
                    .map((row) => `${row.shopName ?? row.shopId}: ${row.quantity.toLocaleString("th-TH")}`)
                    .join(" · ")
                : "ยังไม่มีประกาศร้านไหนใช้รหัสนี้"}
            </p>
            <p className="text-[11.5px] text-muted-foreground">
              คงเหลือกลาง{" "}
              <b className="mono text-[13px] text-foreground">
                {(preview.onHand ?? 0).toLocaleString("th-TH")}
              </b>{" "}
              · ผูกไว้ {preview.linkedListings} ประกาศ
            </p>
          </>
        ) : (
          <p className="text-[12px] leading-5 text-muted-foreground">
            พิมพ์รหัสสินค้าเพื่อดูรูป ชื่อ และจำนวนบนร้านก่อนบันทึก
          </p>
        )}
      </aside>
    </div>
  );
}

/** แถวผูก SKU ของร้านเข้ากับรหัสกลาง — ใช้ในตารางผูกของหน้าสต็อกกลาง */
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
  const [notice, setNotice] = useState<string | null>(null);

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
      setNotice(`ผูกกับรหัสกลาง ${code.trim()} แล้ว`);
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
      setNotice("เลิกผูกแล้ว");
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
      {notice ? (
        <span className="text-[11.5px] font-semibold text-[color:var(--ok)]" role="status">
          {notice}
        </span>
      ) : null}
    </span>
  );
}
