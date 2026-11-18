import { requireApiAuth } from "@/lib/auth";
import { getCentralStockImage } from "@/lib/stock/central";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** เสิร์ฟรูปที่แนบไว้กับรหัสกลาง — ใช้เมื่อสินค้ายังไม่มีประกาศบนแพลตฟอร์มให้ดึงรูป */
export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const code = new URL(request.url).searchParams.get("code") ?? "";
  const image = await getCentralStockImage(code);
  if (!image) {
    return new Response("ไม่พบรูป", { status: 404 });
  }
  return new Response(new Uint8Array(image.data), {
    headers: {
      "content-type": image.contentType,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
