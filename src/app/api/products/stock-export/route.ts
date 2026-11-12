import ExcelJS from "exceljs";
import { requireApiAuth } from "@/lib/auth";
import { listAllProductsForStockExport } from "@/lib/queries";
import type { StockFilterKey } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatPeriodLabel(dateStr: string): string {
  if (!dateStr) return "สะสมตลอดกาล";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-");
    return `วันที่ ${d}/${m}/${y}`;
  }
  if (/^\d{4}-\d{2}$/.test(dateStr)) {
    const [y, m] = dateStr.split("-");
    return `เดือน ${m}/${y}`;
  }
  if (/^\d{4}$/.test(dateStr)) {
    return `ปี ${dateStr}`;
  }
  return dateStr;
}

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const date = (url.searchParams.get("date") ?? "").trim();
    const channel = (url.searchParams.get("channel") ?? "all").trim();
    const q = (url.searchParams.get("q") ?? "").trim();
    const stockFilter = (url.searchParams.get("stockFilter") ?? "all").trim() as StockFilterKey;
    const onlySoldParam = (url.searchParams.get("onlySold") ?? "").trim().toLowerCase();
    const scopeParam = (url.searchParams.get("scope") ?? "").trim().toLowerCase();
    const onlySold = onlySoldParam === "true" || onlySoldParam === "1" || scopeParam === "sold";

    const products = await listAllProductsForStockExport({
      date: date || undefined,
      channel: channel !== "all" ? channel : undefined,
      q: q || undefined,
      stockFilter: stockFilter !== "all" ? stockFilter : undefined,
      onlySold,
    });

    const isPeriodFiltered = Boolean(date);
    const periodLabel = formatPeriodLabel(date);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "PCMS Revenue System";
    workbook.created = new Date();

    const sheetName = onlySold
      ? (isPeriodFiltered ? `ต้นทุนขาย (${date.replace(/-/g, "")})` : "ต้นทุนขาย")
      : (isPeriodFiltered ? `สต๊อก (${date.replace(/-/g, "")})` : "สต๊อกสินค้าและต้นทุน");
    const sheet = workbook.addWorksheet(sheetName.slice(0, 31), {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    if (isPeriodFiltered) {
      sheet.columns = [
        { header: "รหัสสินค้า (SKU)", key: "skuCode", width: 22 },
        { header: "ชื่อสินค้า", key: "productName", width: 40 },
        { header: "ราคาขายตั้งต้น (฿)", key: "defaultPrice", width: 16 },
        { header: "ราคาทุน/ชิ้น (฿)", key: "costPrice", width: 18 },
        { header: "สต็อกตั้งต้น (ตัว)", key: "initialStock", width: 16 },
        { header: "ของเข้ารวม (ตัว)", key: "stockIn", width: 16 },
        { header: `ของออกช่วงนี้ (${periodLabel}) (ตัว)`, key: "soldQty", width: 28 },
        { header: "ขายสะสมตลอดกาล (ตัว)", key: "totalSoldAllTime", width: 22 },
        { header: "คงเหลือ (ตัว)", key: "remaining", width: 16 },
        { header: "มูลค่าสต็อกคงเหลือ (฿)", key: "stockValue", width: 22 },
        { header: `ต้นทุนขายช่วงนี้ (฿)`, key: "cogs", width: 22 },
      ];
    } else {
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
    }

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.height = 32;
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
      } else if (isPeriodFiltered && (colNumber === 7 || colNumber === 11)) {
        // Period sold & period COGS - Indigo
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
      } else {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
      }
    });

    // Populate rows
    for (let i = 0; i < products.length; i++) {
      const p = products[i]!;
      const rowIdx = i + 2;

      if (isPeriodFiltered) {
        const row = sheet.addRow({
          skuCode: p.skuCode,
          productName: p.productName,
          defaultPrice: p.defaultPrice,
          costPrice: p.costPrice,
          initialStock: p.initialStock,
          stockIn: p.stockIn,
          soldQty: p.soldQty,
          totalSoldAllTime: p.totalSoldAllTime,
          remaining: { formula: `E${rowIdx}+F${rowIdx}-H${rowIdx}`, result: p.remainingStock },
          stockValue: { formula: `IF(I${rowIdx}>0, I${rowIdx}*D${rowIdx}, 0)`, result: p.stockValue },
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
        row.getCell(9).numFmt = "#,##0";
        row.getCell(10).numFmt = "#,##0.00";
        row.getCell(11).numFmt = "#,##0.00";

        // Highlight editable columns
        row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
        row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
        row.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
      } else {
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
        row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
        row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
        row.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
      }
    }

    // Add Summary Row at the bottom
    const totalRowIdx = products.length + 2;
    if (products.length > 0) {
      if (isPeriodFiltered) {
        const summaryLabel = onlySold
          ? `(${products.length.toLocaleString("th-TH")} รหัสสินค้าที่มีการขาย · ${periodLabel})`
          : `(${products.length.toLocaleString("th-TH")} รหัสสินค้า · ${periodLabel})`;

        const totalRow = sheet.addRow({
          skuCode: "รวมทั้งหมด",
          productName: summaryLabel,
          defaultPrice: "",
          costPrice: "",
          initialStock: { formula: `SUM(E2:E${totalRowIdx - 1})` },
          stockIn: { formula: `SUM(F2:F${totalRowIdx - 1})` },
          soldQty: { formula: `SUM(G2:G${totalRowIdx - 1})` },
          totalSoldAllTime: { formula: `SUM(H2:H${totalRowIdx - 1})` },
          remaining: { formula: `SUM(I2:I${totalRowIdx - 1})` },
          stockValue: { formula: `SUM(J2:J${totalRowIdx - 1})` },
          cogs: { formula: `SUM(K2:K${totalRowIdx - 1})` },
        });

        totalRow.height = 26;
        totalRow.font = { bold: true, color: { argb: "FF0F172A" } };
        totalRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
        totalRow.getCell(2).alignment = { vertical: "middle", horizontal: "left" };
        totalRow.getCell(5).numFmt = "#,##0";
        totalRow.getCell(6).numFmt = "#,##0";
        totalRow.getCell(7).numFmt = "#,##0";
        totalRow.getCell(8).numFmt = "#,##0";
        totalRow.getCell(9).numFmt = "#,##0";
        totalRow.getCell(10).numFmt = "#,##0.00";
        totalRow.getCell(11).numFmt = "#,##0.00";

        for (let col = 1; col <= 11; col++) {
          totalRow.getCell(col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
          totalRow.getCell(col).border = { top: { style: "thin" }, bottom: { style: "double" } };
        }
      } else {
        const summaryLabel = onlySold
          ? `(${products.length.toLocaleString("th-TH")} รหัสสินค้าที่มีการขาย · ตลอดกาล)`
          : `(${products.length.toLocaleString("th-TH")} รหัสสินค้า · ตลอดกาล)`;

        const totalRow = sheet.addRow({
          skuCode: "รวมทั้งหมด",
          productName: summaryLabel,
          defaultPrice: "",
          costPrice: "",
          initialStock: { formula: `SUM(E2:E${totalRowIdx - 1})` },
          stockIn: { formula: `SUM(F2:F${totalRowIdx - 1})` },
          totalSold: { formula: `SUM(G2:G${totalRowIdx - 1})` },
          remaining: { formula: `SUM(H2:H${totalRowIdx - 1})` },
          stockValue: { formula: `SUM(I2:I${totalRowIdx - 1})` },
          cogs: { formula: `SUM(J2:J${totalRowIdx - 1})` },
        });

        totalRow.height = 26;
        totalRow.font = { bold: true, color: { argb: "FF0F172A" } };
        totalRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
        totalRow.getCell(2).alignment = { vertical: "middle", horizontal: "left" };
        totalRow.getCell(5).numFmt = "#,##0";
        totalRow.getCell(6).numFmt = "#,##0";
        totalRow.getCell(7).numFmt = "#,##0";
        totalRow.getCell(8).numFmt = "#,##0";
        totalRow.getCell(9).numFmt = "#,##0.00";
        totalRow.getCell(10).numFmt = "#,##0.00";

        for (let col = 1; col <= 10; col++) {
          totalRow.getCell(col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
          totalRow.getCell(col).border = { top: { style: "thin" }, bottom: { style: "double" } };
        }
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const todayStr = new Date().toISOString().slice(0, 10);

    const filePrefix = onlySold ? "cogs_sold" : "stock_inventory";
    let filename = `${filePrefix}_all_time_${todayStr}.xlsx`;
    if (date) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        filename = `${filePrefix}_day_${date}.xlsx`;
      } else if (/^\d{4}-\d{2}$/.test(date)) {
        filename = `${filePrefix}_month_${date}.xlsx`;
      } else if (/^\d{4}$/.test(date)) {
        filename = `${filePrefix}_year_${date}.xlsx`;
      } else {
        // ค่าที่ไม่ใช่รูปแบบวันที่ถูกตัดอักขระพิเศษออกก่อนใส่ใน header ชื่อไฟล์
        filename = `${filePrefix}_${date.replace(/[^0-9A-Za-z._-]/g, "")}.xlsx`;
      }
    }

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
