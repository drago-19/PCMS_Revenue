import { deleteImport, getImport } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const importId = Number(id);
  if (!Number.isInteger(importId) || importId <= 0) {
    return Response.json({ error: "รหัสการนำเข้าไม่ถูกต้อง" }, { status: 400 });
  }
  const existing = await getImport(importId);
  if (!existing) {
    return Response.json({ error: "ไม่พบการนำเข้านี้" }, { status: 404 });
  }
  const deleted = await deleteImport(importId);
  return Response.json({ ok: deleted, deletedImport: existing.filename });
}
