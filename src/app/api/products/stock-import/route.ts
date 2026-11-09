import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { requireApiAuth } from "@/lib/auth";
import { bulkUpdateProductStock } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeHeader(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).toLowerCase().replace(/[\s\-_()\/฿]/g, "");
}

function parseNumeric(val: unknown): number | undefined {
  if (val === null || val === undefined) return undefined;
  if (typeof val === "number") {
    return Number.isFinite(val) ? val : undefined;
  }
  if (typeof val === "object" && "result" in (val as Record<string, unknown>)) {
    const res = (val as { result: unknown }).result;
    return typeof res === "number" && Number.isFinite(res) ? res : undefined;
  }
  const clean = String(val).replace(/,/g, "").trim();
  if (clean === "" || clean === "-") return undefined;
  const num = Number(clean);
  return Number.isFinite(num) ? num : undefined;
}

const SKU_ALIASES = ["รหัสสินค้า", "รหัสสินค้าsku", "sku", "skucode", "รหัส", "itemcode", "code"];
const NAME_ALIASES = ["ชื่อสินค้า", "ชื่อ", "productname", "name", "รายการสินค้า", "รายการ", "ชื่อรายการ"];
const COST_ALIASES = ["ราคาทุนชิ้น", "ราคาทุนชิ้น฿", "ราคาทุน", "ราคาทุนต่อชิ้น", "ทุน", "cost", "costprice", "unitcost"];
const INITIAL_STOCK_ALIASES = ["สต็อกตั้งต้นตัว", "สต็อกตั้งต้น", "สต๊อกตั้งต้น", "สต็อกยกมา", "สต๊อกยกมา", "initialstock", "ตั้งต้น"];
const STOCK_IN_ALIASES = ["ของเข้ารวมตัว", "ของเข้า", "ของเข้ารวม", "stockin", "รับเข้า", "เพิ่มสต็อก"];

export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const arrayBuffer = await request.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return Response.json(
        { error: "ไม่พบข้อมูลไฟล์ที่อัปโหลด", requestId: auth.requestId },
        { status: 400, headers: { "x-request-id": auth.requestId } },
      );
    }

    if (arrayBuffer.byteLength > 20 * 1024 * 1024) {
      return Response.json(
        { error: "ขนาดไฟล์ใหญ่เกินกำหนด (สูงสุด 20 MB)", requestId: auth.requestId },
        { status: 413, headers: { "x-request-id": auth.requestId } },
      );
    }

    const workbook = new ExcelJS.Workbook();
    // Load buffer safely
    await workbook.xlsx.load(Buffer.from(arrayBuffer) as any);

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      return Response.json(
        { error: "ไฟล์ไม่มีข้อมูลหรือตารางว่างเปล่า", requestId: auth.requestId },
        { status: 400, headers: { "x-request-id": auth.requestId } },
      );
    }

    // Detect header columns
    let skuCol = -1;
    let nameCol = -1;
    let costCol = -1;
    let initialStockCol = -1;
    let stockInCol = -1;
    let headerRowIdx = 1;

    for (let r = 1; r <= Math.min(10, worksheet.rowCount); r++) {
      const row = worksheet.getRow(r);
      row.eachCell((cell, colNumber) => {
        const norm = normalizeHeader(cell.value);
        if (SKU_ALIASES.includes(norm) && skuCol === -1) {
          skuCol = colNumber;
        } else if (NAME_ALIASES.includes(norm) && nameCol === -1) {
          nameCol = colNumber;
        } else if (COST_ALIASES.includes(norm) && costCol === -1) {
          costCol = colNumber;
        } else if (INITIAL_STOCK_ALIASES.includes(norm) && initialStockCol === -1) {
          initialStockCol = colNumber;
        } else if (STOCK_IN_ALIASES.includes(norm) && stockInCol === -1) {
          stockInCol = colNumber;
        }
      });
      if (skuCol !== -1) {
        headerRowIdx = r;
        break;
      }
    }

    if (skuCol === -1) {
      return Response.json(
        {
          error: "ไม่พบคอลัมน์ 'รหัสสินค้า' หรือ 'SKU' ในไฟล์ Excel กรุณาใช้ไฟล์แม่แบบของระบบ",
          requestId: auth.requestId,
        },
        { status: 400, headers: { "x-request-id": auth.requestId } },
      );
    }

    const itemsToUpdate: Array<{
      skuCode: string;
      productName?: string;
      costPrice?: number;
      initialStock?: number;
      stockIn?: number;
    }> = [];

    for (let r = headerRowIdx + 1; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const skuVal = row.getCell(skuCol).value;
      if (!skuVal) continue;

      const cleanSku = String(
        typeof skuVal === "object" && skuVal !== null && "result" in skuVal
          ? (skuVal as { result: unknown }).result
          : skuVal,
      ).trim();

      if (!cleanSku || cleanSku === "-") continue;

      const nameVal = nameCol !== -1 ? row.getCell(nameCol).value : undefined;
      const cleanName = nameVal
        ? String(
            typeof nameVal === "object" && nameVal !== null && "result" in nameVal
              ? (nameVal as { result: unknown }).result
              : nameVal,
          ).trim()
        : undefined;

      const rawCost = costCol !== -1 ? parseNumeric(row.getCell(costCol).value) : undefined;
      const rawInitial = initialStockCol !== -1 ? parseNumeric(row.getCell(initialStockCol).value) : undefined;
      const rawStockIn = stockInCol !== -1 ? parseNumeric(row.getCell(stockInCol).value) : undefined;

      // Push if at least one field or product name is provided
      if (
        rawCost !== undefined ||
        rawInitial !== undefined ||
        rawStockIn !== undefined ||
        (cleanName && cleanName.length > 0)
      ) {
        itemsToUpdate.push({
          skuCode: cleanSku,
          productName: cleanName && cleanName.length > 0 ? cleanName : undefined,
          costPrice: rawCost !== undefined ? Math.max(0, rawCost) : undefined,
          initialStock: rawInitial !== undefined ? Math.max(0, Math.round(rawInitial)) : undefined,
          stockIn: rawStockIn !== undefined ? Math.max(0, Math.round(rawStockIn)) : undefined,
        });
      }
    }

    if (itemsToUpdate.length === 0) {
      return Response.json(
        {
          error: "ไม่พบแถวข้อมูลที่มีการระบุ รหัสสินค้า, ชื่อสินค้า, ราคาทุน, สต็อกตั้งต้น หรือของเข้า ในไฟล์",
          requestId: auth.requestId,
        },
        { status: 400, headers: { "x-request-id": auth.requestId } },
      );
    }

    const { updatedCount, insertedCount } = await bulkUpdateProductStock(itemsToUpdate);

    revalidatePath("/products");

    return Response.json(
      {
        ok: true,
        updatedCount,
        insertedCount,
        totalCount: updatedCount + insertedCount,
        totalRows: itemsToUpdate.length,
        message: `อัปเดตสต็อกและราคาทุนสำเร็จ ${updatedCount.toLocaleString("th-TH")} รายการ`,
        requestId: auth.requestId,
      },
      { headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    console.error("[api/products/stock-import] import failed:", err);
    return Response.json(
      {
        error: "เกิดข้อผิดพลาดในการอ่านไฟล์ Excel กรุณาตรวจสอบรูปแบบไฟล์",
        requestId: auth.requestId,
      },
      { status: 500, headers: { "x-request-id": auth.requestId } },
    );
  }
}
