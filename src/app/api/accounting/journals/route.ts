import { revalidatePath } from "next/cache";
import { requireApiAuth } from "@/lib/auth";
import {
  createManualJournalEntry,
  deleteManualJournalEntry,
  updateManualJournalEntry,
  updateManualJournalStatus,
  type JournalBookType,
  type JournalEntryLine,
  type JournalEntryStatus,
} from "@/lib/accounting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 65536) {
      return Response.json(
        { error: "ข้อมูลคำขอมีขนาดใหญ่เกินกำหนด", requestId: auth.requestId },
        { status: 413, headers: { "x-request-id": auth.requestId } },
      );
    }
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "รูปแบบข้อมูลไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  const lines: JournalEntryLine[] = rawLines.map((item) => {
    const obj = (item || {}) as Record<string, unknown>;
    return {
      accountCode: String(obj.accountCode || ""),
      accountName: String(obj.accountName || ""),
      debit: Number(obj.debit || 0),
      credit: Number(obj.credit || 0),
      memo: String(obj.memo || ""),
    };
  });

  try {
    const rawPrefix = String(body.documentPrefix || body.journalType || "JV")
      .trim()
      .toUpperCase();
    const validPrefix = (
      ["JV", "OP", "UV", "SV", "PV", "RV"].includes(rawPrefix)
        ? rawPrefix
        : "JV"
    ) as "JV" | "OP" | "UV" | "SV" | "PV" | "RV";

    const voucher = await createManualJournalEntry({
      entryDate: String(body.entryDate || ""),
      journalType: (body.journalType as JournalBookType) || "JV",
      documentPrefix: validPrefix,
      contactName: String(body.contactName || ""),
      referenceNo: String(body.referenceNo || ""),
      description: String(body.description || ""),
      remarks: String(body.remarks || ""),
      status: (body.status as JournalEntryStatus) || "approved",
      lines,
    });
    revalidatePath("/accounting");
    return Response.json(
      { ok: true, voucher, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    console.error("[POST /api/accounting/journals] failed", {
      requestId: auth.requestId,
      message: err instanceof Error ? err.message : "unknown_error",
    });
    return Response.json(
      {
        error: err instanceof Error ? err.message : "ไม่สามารถบันทึกสมุดรายวันได้",
        requestId: auth.requestId,
      },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
}

export async function PUT(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "รูปแบบข้อมูลไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const id = Number(body.id);
  const status = String(body.status || "approved") as JournalEntryStatus;
  if (!id || isNaN(id)) {
    return Response.json(
      { error: "ไม่พบรายการสมุดรายวันที่ต้องการแก้ไข", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    let voucher;
    if (Array.isArray(body.lines) && body.lines.length > 0) {
      const rawLines = body.lines as unknown[];
      const lines: JournalEntryLine[] = rawLines.map((item) => {
        const obj = (item || {}) as Record<string, unknown>;
        return {
          accountCode: String(obj.accountCode || ""),
          accountName: String(obj.accountName || ""),
          debit: Number(obj.debit || 0),
          credit: Number(obj.credit || 0),
          memo: String(obj.memo || ""),
        };
      });
      voucher = await updateManualJournalEntry(id, {
        entryDate: String(body.entryDate || ""),
        contactName: String(body.contactName || ""),
        referenceNo: String(body.referenceNo || ""),
        description: String(body.description || ""),
        remarks: String(body.remarks || ""),
        status: body.status ? (String(body.status) as JournalEntryStatus) : undefined,
        lines,
      });
    } else {
      voucher = await updateManualJournalStatus(id, status);
    }
    revalidatePath("/accounting");
    return Response.json(
      { ok: true, voucher, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "ไม่สามารถอัปเดตสถานะได้",
        requestId: auth.requestId,
      },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  if (!id || isNaN(id)) {
    return Response.json(
      { error: "กรุณาระบุรายการสมุดรายวันที่ต้องการลบ", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    await deleteManualJournalEntry(id);
    revalidatePath("/accounting");
    return Response.json(
      { ok: true, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "ไม่สามารถลบสมุดรายวันได้",
        requestId: auth.requestId,
      },
      { status: 500, headers: { "x-request-id": auth.requestId } },
    );
  }
}
