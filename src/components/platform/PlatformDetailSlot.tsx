// ตัวเรียกใช้กลางของป๊อปอัปรายละเอียด — เป็น server component จึงคิวรีข้อมูลเองได้
// ใส่บรรทัดเดียวในหน้าไหนก็ได้ แล้วการ์ดที่มีลิงก์ ?detail= จะเปิดป๊อปอัปเอง

import { PlatformDetailDialog } from "@/components/platform/PlatformDetailDialog";
import { buildDetail, hrefWithout, parseDetail } from "@/lib/platform/details";

export async function PlatformDetail({
  raw,
  basePath,
  params,
  from,
  to,
  shopId,
}: {
  raw?: string;
  basePath: string;
  params: Record<string, string | string[] | undefined>;
  from?: string;
  to?: string;
  shopId?: string;
}) {
  const parsed = parseDetail(raw);
  if (!parsed) return null;

  const view = await buildDetail(parsed, { from, to, shopId });
  return <PlatformDetailDialog view={view} closeHref={hrefWithout(basePath, params, "detail")} />;
}
