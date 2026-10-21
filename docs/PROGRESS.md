# docs/PROGRESS.md — บันทึกความคืบหน้า PCMS_Revenue

> 📈 อัปเดตทุกครั้งที่มีความคืบหน้า — เขียนสถานะจริง (เสร็จ/ค้าง/ติดอะไร) ห้ามเขียนลอย ๆ
> ⚠️ งานที่ยังไม่ได้รัน/เทสต์จริง = ยังไม่เสร็จ (ดู DoD + Reality Check)

## สถานะปัจจุบัน (อัปเดตล่าสุด: 2026-10-21)

- ✅ เสร็จแล้ว:
  - ระบบแกะไฟล์ Excel TikTok Shop + ตรวจยอดกับชีตสรุป + สร้างบิลและใบกำกับภาษี (`src/lib/*`, `tests/*`)
  - ตั้งค่าเริ่มต้น Tailwind CSS v4 + `components.json` + `src/lib/utils.ts` + CSS variables ใน `src/app/globals.css`
  - สร้างเอกสารมาตรฐานโปรเจกต์ (`PROJECT_GUIDELINES.md`, `docs/PROGRESS.md`, `docs/lessons.md`)
  - ย้าย UI ทั้งระบบไปใช้ `shadcn/ui` (`src/components/ui/*`: `Button`, `Input`, `Card`, `Table`, `Badge`, `Dialog`, `DropdownMenu`, `Tabs`, `Sonner`, `Tooltip`, `Sheet`) + ปรับ Mobile-first (Sidebar เป็น `Sheet` drawer บนมือถือ, ปุ่มแตะ ≥40×40px, ใช้ `100dvh`) ตาม `AGENTS.md`
  - ตรวจสอบผ่าน `npx tsc --noEmit` (0 error), `pnpm test` (7/7 pass), `pnpm build` (success) และทดสอบเบราว์เซอร์จริงครบ 8 หน้า ที่ความกว้าง 360px, 390px, 768px, 1280px (`pageOverflowX: 0`, `offenderCount: 0`, `smallCount: 0`, `clipped: []`)
  - แบ่งหมวดหมู่ Git Commits ทั้งโปรเจกต์ออกเป็น 6 หมวดหมู่ชัดเจน + แก้ `.gitignore` (`imports/` → `/imports/`) ไม่ให้บัง `src/app/api/imports/*`
- 🔄 กำลังทำ: ไม่มี
- ⛔ ค้าง/ติด: ไม่มี

## ประวัติงาน

- [x] 2026-10-21 — แบ่งหมวดหมู่ Git Commits ออกเป็น 6 หมวดหมู่ตามโครงสร้างระบบ (`chore`, `feat(ingest)`, `feat(ui)`, `feat(components)`, `feat(pages)`, `docs`)
- [x] 2026-10-21 — ย้าย UI ทั้งระบบไปใช้ `shadcn/ui` (`src/components/ui/*`) + Mobile-first (`Sheet` drawer บนจอเล็ก, touch target ≥40×40px, ตรวจ 360px/390px/768px/1280px, ผ่าน `tsc --noEmit`, `pnpm test`, `pnpm build`)
