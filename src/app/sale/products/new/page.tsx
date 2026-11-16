import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NewProductForm } from "@/components/sale/NewProductForm";
import { isSandboxShopName, readPlatform } from "@/lib/platform/platforms";
import { getPlatformAccountRow, TIKTOK_PLATFORM } from "@/lib/platform/store";

export const dynamic = "force-dynamic";

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const platform = readPlatform(params.platform);
  const shop = typeof params.shop === "string" ? params.shop : "";
  const account = shop ? await getPlatformAccountRow(TIKTOK_PLATFORM, shop) : null;
  const isSandbox = Boolean(account && isSandboxShopName(account.shopName));
  const backHref = `/sale/stocks?shop=${encodeURIComponent(shop)}`;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-[20px] font-bold leading-tight">เพิ่มสินค้าใหม่</h1>
          <p className="text-[12.5px] leading-5 text-muted-foreground">
            สร้างสินค้าเป็นแบบร่างบน TikTok Shop{account ? ` · ร้าน ${account.shopName}` : ""}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={backHref}>กลับไปหน้าสต็อก</Link>
        </Button>
      </header>

      {platform !== "tiktok" ? (
        <p className="rounded-xl border border-dashed border-border p-3 text-[12.5px] text-muted-foreground">
          ตอนนี้เพิ่มสินค้าได้เฉพาะร้าน TikTok Shop
        </p>
      ) : !isSandbox ? (
        <p className="rounded-xl border border-dashed border-border p-3 text-[12.5px] text-muted-foreground">
          ร้านจริงยังไม่เปิดให้เพิ่มสินค้า — ต้องทดสอบบนร้านทดสอบให้ผ่านก่อน
        </p>
      ) : (
        <NewProductForm shopId={shop} />
      )}
    </div>
  );
}
