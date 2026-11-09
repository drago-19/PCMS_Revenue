import ExcelJS from "exceljs";
import { requireApiAuth } from "@/lib/auth";
import { listAllProductsForStockExport } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const products = await listAllProductsForStockExport();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "PCMS Revenue System";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("สต๊อกสินค้าและต้นทุน", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    sheet.columns = [
      { header: "รหัสสินค้า (SKU)", key: "skuCode", width: 22 },
      { header: "ชื่อสินค้า", key: "productName", width: 42 },
      { header: "ราคาขายตั้งต้น (฿)", key: "defaultPrice", width: 16 },
      { header: "ราคาทุน/ชิ้น (฿)", key: "costPrice", width: 18 },
      { header: "สต็อกตั้งต้น (ตัว)", key: "initialStock", width: 18 },
      { header: "ของเข้ารวม (ตัว)", key: "stockIn", width: 18 },
      { header: "ขายไปแล้ว (ตัว)", key: "totalSold", width: 18 },
      { header: "คงเหลือ (ตัว)", key: "remaining", width: 18 },
      { header: "มูลค่าสต็อกคงเหลือ (฿)", key: "stockValue", width: 22 },
      { header: "ต้นทุนขายรวม (฿)", key: "cogs", width: 20 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.alignment = { vertical: "middle", horizontal: colNumber <= 2 ? "left" : "right" };
      if (colNumber === 4) {
        // Cost column header - Amber
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD97706" } };
      } else if (colNumber === 5) {
        // Initial stock header - Blue
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      } else if (colNumber === 6) {
        // Stock in header - Emerald
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
      } else {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
      }
    });

    // Populate rows
    for (let i = 0; i < products.length; i++) {
      const p = products[i]!;
      const rowIdx = i + 2;
      const row = sheet.addRow({
        skuCode: p.skuCode,
        productName: p.productName,
        defaultPrice: p.defaultPrice,
        costPrice: p.costPrice,
        initialStock: p.initialStock,
        stockIn: p.stockIn,
        totalSold: p.totalSoldAllTime,
        remaining: { formula: `E${rowIdx}+F${rowIdx}-G${rowIdx}`, result: p.remainingStock },
        stockValue: { formula: `IF(H${rowIdx}>0, H${rowIdx}*D${rowIdx}, 0)`, result: p.stockValue },
        cogs: { formula: `G${rowIdx}*D${rowIdx}`, result: p.cogs },
      });

      row.height = 22;
      row.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
      row.getCell(2).alignment = { vertical: "middle", horizontal: "left" };
      row.getCell(3).numFmt = "#,##0.00";
      row.getCell(4).numFmt = "#,##0.00";
      row.getCell(5).numFmt = "#,##0";
      row.getCell(6).numFmt = "#,##0";
      row.getCell(7).numFmt = "#,##0";
      row.getCell(8).numFmt = "#,##0";
      row.getCell(9).numFmt = "#,##0.00";
      row.getCell(10).numFmt = "#,##0.00";

      // Highlight editable columns
      row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } }; // Light amber
      row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } }; // Light blue
      row.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } }; // Light green
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `stock_inventory_${dateStr}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "x-request-id": auth.requestId,
      },
    });
  } catch (err) {
    console.error("[api/products/stock-export] export failed:", err);
    return Response.json(
      { error: "ไม่สามารถส่งออกไฟล์สต็อกสินค้าได้", requestId: auth.requestId },
      { status: 500, headers: { "x-request-id": auth.requestId } },
    );
  }
}
