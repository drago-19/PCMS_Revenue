"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, MinusIcon, PackageOpen, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  // แยกรหัสที่ค้นแล้วไม่พบออกจาก "ยังไม่ได้พิมพ์" — ไม่ให้ช่องว่างดูเหมือนระบบไม่ตอบสนอง
  const [notFound, setNotFound] = useState(false);
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
      setNotFound(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLooking(true);
      try {
        const response = await fetch(`/api/platform/central-stock?code=${encodeURIComponent(code)}`);
        const payload = (await response.json().catch(() => ({}))) as { item?: SkuPreview | null };
        setPreview(payload.item ?? null);
        // "ไม่พบ" หมายถึงเซิร์ฟเวอร์ตอบปกติแล้วไม่มีรหัสนี้เท่านั้น — คำขอที่ล้มเหลวไม่ควรถูกกล่าวหาว่ารหัสผิด
        setNotFound(response.ok && !payload.item);
      } catch {
        setPreview(null);
        setNotFound(false);
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
        restored?: boolean;
        pushed?: number;
        pushFailed?: number;
        pushShops?: number;
        pushBlocked?: number;
        pushMs?: number;
        pushDisabled?: boolean;
      };
      if (!response.ok) {
        setError(payload.error ?? "บันทึกไม่สำเร็จ");
        return;
      }

      // รีเฟรชการ์ดสินค้าให้ตรงยอดใหม่ — ไม่งั้นแถบ 'คงเหลือ X' จะค้างค่าเก่าหลังบันทึก
      const fresh = await fetch(`/api/platform/central-stock?code=${encodeURIComponent(code)}`);
      const freshPayload = (await fresh.json().catch(() => ({}))) as { item?: SkuPreview | null };
      if (freshPayload.item) setPreview(freshPayload.item);

      let imageNote = "";
      if (imageFile) {
        const dataUrl = await readImageAsDataUrl(imageFile);
        if (dataUrl) {
          const uploaded = await fetch("/api/platform/central-stock/actions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "image", skuCode: code, dataUrl }),
          });
          if (uploaded.ok) imageNote = " · แนบรูปแล้ว";
        }
      }

      // สต็อกกลางเป็นเจ้าของยอด — เติมแล้วต้องบอกผลการดันขึ้นประกาศ (กี่ประกาศ กี่ร้าน เวลาเท่าไร)
      const pushed = payload.pushed ?? 0;
      const blocked = payload.pushBlocked ?? 0;
      const failed = payload.pushFailed ?? 0;
      const pushNote =
        pushed > 0
          ? ` · อัปเดตขึ้นประกาศ ${pushed} ประกาศ (${payload.pushShops ?? 0} ร้าน) · ${payload.pushMs ?? 0} ms`
          : payload.pushDisabled
            ? " · การดันยอดขึ้นประกาศปิดอยู่ (STOCK_PUSH_ENABLED=0)"
            : blocked > 0
              ? ` · ร้านจริงรอเปิด STOCK_PUSH_LIVE (${blocked} ประกาศ)`
              : "";
      setMessage(
        `${mode === "add" ? "รับเข้า" : "ตัดออก"} ${effective} · ยอดกลางเหลือ ${payload.onHand ?? 0}${pushNote}${
          failed > 0 ? ` · ประกาศที่พลาด ${failed}` : ""
        }${payload.restored ? " · เปิดใช้รหัสกลับมาแล้ว" : ""}${imageNote}`,
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
    <div className="grid gap-4 @min-[620px]:grid-cols-[minmax(0,1fr)_248px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="grid gap-3 @min-[420px]:grid-cols-2">
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
                onClick={() => setAmount((value) => Math.min(maxAmount, value + preset))}
                disabled={busy || amount >= maxAmount}
                aria-label={`บวกเพิ่ม ${preset}`}
                className="min-h-[40px] tabular-nums"
              >
                +{preset}
              </Button>
            ))}
            {/* ปุ่มลดโชว์เมื่อมีจำนวนค้างให้ลด — จำนวน 0 จะไม่มีปุ่มลดเลย */}
            {PRESETS.map((preset) =>
              amount >= preset ? (
                <Button
                  key={`minus-${preset}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount((value) => Math.max(0, value - preset))}
                  disabled={busy}
                  aria-label={`ลดลง ${preset}`}
                  className="min-h-[40px] tabular-nums"
                >
                  −{preset}
                </Button>
              ) : null,
            )}
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

        <div className="grid gap-3 @min-[420px]:grid-cols-2">
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
        <span className="mx-auto flex size-28 items-center justify-center overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {previewImage ? (
            <img src={previewImage} alt={`รูป ${code || "สินค้า"}`} className="size-full object-cover" />
          ) : (
            <PackageOpen className="size-9 text-muted-foreground/50" aria-hidden="true" />
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
            {notFound
              ? "ไม่พบรหัสนี้ในคลังกลางและในประกาศของร้าน — ตรวจรหัสอีกครั้ง หรือบันทึกเพื่อสร้างรหัสใหม่"
              : "พิมพ์รหัสสินค้าเพื่อดูรูป ชื่อ และจำนวนบนร้านก่อนบันทึก"}
          </p>
        )}
      </aside>
    </div>
  );
}


type CentralCodeRow = {
  skuCode: string;
  productName: string | null;
  onHand: number;
  shopCount: number;
  listingCount: number;
  hasImage: boolean;
  imageUrl: string | null;
};

/** ข้อมูลบนประกาศของ SKU นี้ — ใช้เป็นตัวอย่างก่อนสร้างรหัสกลางใหม่ */
type ListingPreview = {
  sellerSku: string | null;
  productName: string | null;
  quantity: number;
};

/**
 * ผูก SKU ของร้านเข้ากับรหัสกลางด้วยการเลือกจากรายการ (ไม่ต้องพิมพ์รหัสเอง)
 * เปิดป๊อปอัพ → ค้นหาทันทีที่พิมพ์ → กดแถวเพื่อผูก
 */
export function CentralLinkRow({
  platform,
  shopId,
  skuId,
  sellerSku,
  linkedCode,
  onChanged,
}: {
  platform: string;
  shopId: string;
  skuId: string;
  sellerSku: string | null;
  linkedCode: string | null;
  /** เรียกหลังผูก/เลิกผูกสำเร็จ — รายการที่ค้นสดต้องดึงข้อมูลใหม่เอง (router.refresh ไม่พอ) */
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<CentralCodeRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // สองทางเลือกในป๊อปอัพ: ผูกกับรหัสที่มีอยู่ หรือสร้างรหัสกลางใหม่จากประกาศนี้
  const [tab, setTab] = useState<"link" | "create">("link");
  const [createCode, setCreateCode] = useState(sellerSku ?? "");
  const [codeTaken, setCodeTaken] = useState(false);
  const [listing, setListing] = useState<ListingPreview | null>(null);
  const [listingState, setListingState] = useState<"idle" | "loading" | "missing">("idle");

  // เปิดใหม่ทุกครั้งเริ่มที่โหมดผูกของเดิม และเติมรหัสตั้งต้นจาก SKU บนร้าน
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) return;
    setTab("link");
    setCreateCode(sellerSku ?? "");
    setCodeTaken(false);
    setError(null);
  }

  // ตัวอย่างข้อมูลที่จะใช้สร้างรหัสใหม่: ชื่อและยอดบนประกาศ (อ่านอย่างเดียว)
  useEffect(() => {
    if (!open || tab !== "create") return;
    let alive = true;
    setListingState("loading");
    const params = new URLSearchParams({ platform, shopId, skuId });
    fetch(`/api/platform/central-stock?${params.toString()}`)
      .then((response) => (response.ok ? response.json() : { listing: null }))
      .then((payload: { listing?: ListingPreview | null }) => {
        if (!alive) return;
        setListing(payload.listing ?? null);
        setListingState(payload.listing ? "idle" : "missing");
      })
      .catch(() => {
        if (!alive) return;
        setListing(null);
        setListingState("missing");
      });
    return () => {
      alive = false;
    };
  }, [open, tab, platform, shopId, skuId]);

  // รหัสที่มีอยู่แล้วต้องเตือนก่อนกด (เซิร์ฟเวอร์กันซ้ำอีกชั้นด้วย 409)
  useEffect(() => {
    if (!open || tab !== "create") return;
    const code = createCode.trim();
    if (!code) {
      setCodeTaken(false);
      return;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/platform/central-stock/codes?q=${encodeURIComponent(code)}`);
        const payload = (await response.json().catch(() => ({}))) as { rows?: CentralCodeRow[] };
        if (alive) setCodeTaken((payload.rows ?? []).some((row) => row.skuCode === code));
      } catch {
        if (alive) setCodeTaken(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [createCode, open, tab]);

  // ค้นหาอัตโนมัติเมื่อพิมพ์ (หน่วง 250ms) — เปิดป๊อปอัพแล้วได้รายการทันที
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/platform/central-stock/codes?q=${encodeURIComponent(query)}`);
        const payload = (await response.json().catch(() => ({}))) as { rows?: CentralCodeRow[] };
        if (alive) setRows(payload.rows ?? []);
      } catch {
        if (alive) setRows([]);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, open]);

  async function linkCode(code: string) {
    if (busy) return;
    setBusy(code);
    setError(null);
    const response = await fetch("/api/platform/central-stock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "link", platform, shopId, skuId, skuCode: code }),
    });
    setBusy(null);
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "ผูกไม่สำเร็จ");
      return;
    }
    setOpen(false);
    setQuery("");
    setNotice(`ผูกกับรหัสกลาง ${code} แล้ว`);
    onChanged?.();
    router.refresh();
  }

  async function createFromListing() {
    const code = createCode.trim();
    if (busy || !code || codeTaken) return;
    setBusy("create");
    setError(null);
    const response = await fetch("/api/platform/central-stock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "link", create: true, platform, shopId, skuId, skuCode: code }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      created?: boolean;
      skuCode?: string;
      onHand?: number | null;
    };
    setBusy(null);
    if (!response.ok) {
      setError(payload.error ?? "สร้างรหัสกลางใหม่ไม่สำเร็จ");
      if (response.status === 409) setCodeTaken(true);
      return;
    }
    setOpen(false);
    setQuery("");
    // บอกให้ชัดว่ารอบนี้สร้างรหัสใหม่หรือผูกของเดิม และยอดเริ่มต้นเท่าไร
    setNotice(
      payload.created
        ? `สร้างรหัสกลาง ${payload.skuCode ?? code} และผูกให้ประกาศนี้แล้ว · เริ่มต้น ${(payload.onHand ?? 0).toLocaleString("th-TH")} ชิ้น`
        : `ผูกกับรหัสกลาง ${code} แล้ว`,
    );
    onChanged?.();
    router.refresh();
  }

  async function unlink() {
    if (busy) return;
    setBusy("unlink");
    const response = await fetch("/api/platform/central-stock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "unlink", platform, shopId, skuId }),
    });
    setBusy(null);
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "เลิกผูกไม่สำเร็จ");
      return;
    }
    setNotice("เลิกผูกแล้ว");
    onChanged?.();
    router.refresh();
  }

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant={linkedCode ? "outline" : "default"}
        onClick={() => changeOpen(true)}
        className="max-w-[220px] truncate"
        aria-label={linkedCode ? `เปลี่ยนรหัสกลางที่ผูกอยู่ (${linkedCode})` : "เลือกจากคลังกลาง"}
      >
        {linkedCode ? `ผูก: ${linkedCode}` : "เลือกจากคลังกลาง"}
      </Button>
      {linkedCode ? (
        <Button type="button" size="sm" variant="ghost" onClick={unlink} disabled={busy !== null}>
          {busy === "unlink" ? "…" : "เลิกผูก"}
        </Button>
      ) : null}

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader className="pr-11">
            <DialogTitle>ผูก SKU กับรหัสกลาง</DialogTitle>
            <DialogDescription>
              SKU บนร้าน: <span className="mono font-bold">{sellerSku ?? skuId}</span> — เลือกผูกกับรหัสกลางที่มีอยู่
              หรือสร้างรหัสกลางใหม่จากประกาศนี้
            </DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(next) => setTab(next === "create" ? "create" : "link")} className="min-w-0">
            <TabsList className="w-full">
              <TabsTrigger value="link" className="min-h-[40px] px-2 text-[13px] sm:px-4 sm:text-[13.5px]">
                ผูกกับรหัสเดิม
              </TabsTrigger>
              <TabsTrigger value="create" className="min-h-[40px] px-2 text-[13px] sm:px-4 sm:text-[13.5px]">
                สร้างรหัสใหม่
              </TabsTrigger>
            </TabsList>

            <TabsContent value="link" className="flex min-w-0 flex-col gap-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ค้นหารหัสหรือชื่อสินค้าในคลังกลาง"
                className="h-10 text-[13px]"
                aria-label="ค้นหารหัสกลาง"
                autoFocus
              />

              <div className="max-h-[320px] min-h-[80px] overflow-y-auto rounded-lg border border-border">
                {rows === null ? (
                  <p className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">กำลังค้นหา…</p>
                ) : rows.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">
                    ไม่พบรหัสที่ค้นหา — เพิ่มรหัสใหม่ได้ที่ช่อง “รับเข้าสต็อกกลาง”
                  </p>
                ) : (
                  <ul>
                    {rows.map((row) => (
                      <li key={row.skuCode} className="border-b border-border/60 last:border-b-0">
                        <button
                          type="button"
                          onClick={() => linkCode(row.skuCode)}
                          disabled={busy !== null}
                          className="flex w-full min-h-[44px] items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                            {row.hasImage ? (
                              <img
                                src={`/api/platform/central-stock/image?code=${encodeURIComponent(row.skuCode)}`}
                                alt={`รูป ${row.skuCode}`}
                                className="size-full object-cover"
                                loading="lazy"
                              />
                            ) : row.imageUrl ? (
                              <img
                                src={platformImageSrc(row.imageUrl) ?? row.imageUrl}
                                alt={`รูป ${row.skuCode}`}
                                className="size-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <PackageOpen className="size-4 text-muted-foreground/50" aria-hidden="true" />
                            )}
                          </span>
                          <span className="mono w-[92px] min-w-0 shrink truncate text-[12.5px] font-bold sm:w-[132px]">
                            {row.skuCode}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                            {row.productName ?? "—"}
                          </span>
                          <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
                            {row.onHand.toLocaleString("th-TH")} ชิ้น · {row.shopCount} ร้าน
                          </span>
                          {busy === row.skuCode ? (
                            <span className="shrink-0 text-[11.5px] text-muted-foreground">กำลังผูก…</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </TabsContent>

            <TabsContent value="create" className="flex min-w-0 flex-col gap-2">
              <label className="flex min-w-0 flex-col gap-1 text-[12px] font-semibold">
                รหัสกลางที่จะสร้าง
                <Input
                  value={createCode}
                  onChange={(event) => setCreateCode(event.target.value)}
                  disabled={busy !== null}
                  placeholder="ตั้งต้นจากรหัสบนร้าน"
                  className="mono h-10 text-[13px]"
                  aria-label="รหัสกลางที่จะสร้างใหม่"
                />
              </label>

              <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-muted/40 p-2.5 text-[12px]">
                <span className="font-semibold">ข้อมูลที่จะใช้จากประกาศนี้</span>
                {listingState === "loading" ? (
                  <span className="text-muted-foreground">กำลังอ่านข้อมูลประกาศ…</span>
                ) : !listing ? (
                  <span className="text-muted-foreground">
                    ยังอ่านข้อมูลประกาศนี้ไม่ได้ — รหัสใหม่จะเริ่มที่ 0 ชิ้น แล้วค่อยเติมทีหลัง
                  </span>
                ) : (
                  <>
                    <span className="flex min-w-0 gap-1.5">
                      <span className="shrink-0 text-muted-foreground">ชื่อสินค้า</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{listing.productName ?? "—"}</span>
                    </span>
                    <span className="flex min-w-0 gap-1.5">
                      <span className="shrink-0 text-muted-foreground">ยอดเริ่มต้นจากประกาศ</span>
                      <span className="mono font-bold tabular-nums">
                        {listing.quantity.toLocaleString("th-TH")} ชิ้น
                      </span>
                    </span>
                  </>
                )}
              </div>

              {codeTaken ? (
                <p className="text-[12px] font-semibold text-[#b42318]" role="alert">
                  รหัสนี้มีอยู่แล้ว — ใช้ “ผูกกับรหัสเดิม” แทน
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={createFromListing}
                  disabled={busy !== null || codeTaken || !createCode.trim()}
                >
                  {busy === "create" ? "กำลังสร้าง…" : "สร้างและผูก"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setQuery(createCode.trim());
                    setTab("link");
                  }}
                  disabled={busy !== null}
                >
                  ไปผูกกับรหัสเดิม
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* error ของป๊อปอัพต้องเห็นในป๊อปอัพ (เช่น รหัสซ้ำจากเซิร์ฟเวอร์) */}
          {error ? (
            <p className="text-[12px] font-semibold text-[#b42318]" role="alert">
              {error}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>

      {error && !open ? (
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
