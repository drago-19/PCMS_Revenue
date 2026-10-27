# PROJECT_GUIDELINES.md — PCMS Revenue (สเปกโปรเจกต์)

> ไฟล์นี้คือสเปกกลางของโปรเจกต์ — **อ่านก่อนเริ่มงานเสมอ** (กฎ Architect ข้อบังคับ)
> ควบคู่กับกฎ UI เฉพาะโปรเจกต์ใน `AGENTS.md`

## ภาพรวม

ระบบสรุปบิลรายวันจากไฟล์ export ของ **TikTok Shop** (`.xlsx`) เป็นบิลรายคำสั่งซื้อ + ใบกำกับภาษี (อย่างย่อ) พร้อมตรวจสอบความถูกต้องอัตโนมัติ

- เป้าหมายหลัก: นำเข้าไฟล์รายได้ TikTok Shop, ตรวจยอดกับชีตสรุป, สรุปบิลรายคำสั่งซื้อ และพิมพ์ใบกำกับภาษีอย่างย่อ (เดี่ยว/เป็นชุด)
- ผู้ใช้: ทีมบัญชี/ปฏิบัติการภายในองค์กร (บริษัท ชีเฮง จำกัด)
- ภาษา UI: ไทย

## เทคโนโลยี (Stack) — stack จริงของโปรเจกต์ชนะ global

| ชั้น | เทคโนโลยี |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript — webapp มือถือ+เว็บ |
| Styling & UI | Tailwind CSS v4 + `shadcn/ui` (`src/components/ui/*` + `cva` + `cn()`) |
| Database หลัก | PostgreSQL (`pg` ชี้ไปยัง database `pcms_revenue` ที่แชร์ container `pcms-supabase-db`) |
| Excel Processing | `exceljs` |
| Network | Cloudflare Tunnel (`docker-compose.yml` profile `tunnel`) |
| Hosting | Docker Compose (`pcms-revenue-app` พอร์ต 3002 สำหรับตัว Build/ออกท่อ, `pnpm dev` พอร์ต 3001, Supabase Studio พอร์ต 54324) |

## คำสั่งที่ใช้บ่อย

```bash
pnpm dev                    # รัน dev server ที่พอร์ต 3001 (แก้โค้ดแยก)
pnpm run deploy:app         # build และอัปเดตเซิร์ฟเวอร์จริง (Docker พอร์ต 3002)
npx tsc --noEmit            # ตรวจ TypeScript types
pnpm build                  # build production
pnpm test                   # รัน unit/integration tests (tsx --test tests/*.test.ts)
pnpm run import:file -- <path> # นำเข้าไฟล์ .xlsx ผ่าน CLI
pnpm run import:dir -- <dir>   # นำเข้าทุกไฟล์ในโฟลเดอร์ผ่าน CLI
```

## โครงสร้างโฟลเดอร์ (สำคัญ)

```
src/
  app/                # Next.js App Router pages & API routes (/api/imports, /bills, /days, /import, /invoices)
  components/         # App components + shadcn/ui components ใน src/components/ui/*
  lib/                # Business logic (db.ts, queries.ts, bill.ts, invoice.ts, format.ts, seller.ts, utils.ts, ingest/*)
tests/                # ชุดทดสอบการแกะไฟล์และคำนวณยอด
scripts/              # CLI scripts สำหรับนำเข้าไฟล์/โฟลเดอร์
```

## สถาปัตยกรรมที่ต้องเข้าใจก่อนแก้

- **กฎ UI บังคับ (`AGENTS.md`)**:
  - คอมโพเนนต์ UI ทุกตัวต้องมาจาก `shadcn/ui` ใน `src/components/ui/*` (Button, Input, Card, Table, Badge, Dialog, DropdownMenu, Tabs, Sonner, Tooltip, Sheet)
  - ปรับธีมผ่าน CSS variables ใน `src/app/globals.css` (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, `--ring` ฯลฯ)
  - Responsive mobile-first ทั้งระบบ (360px, 390px, 768px, 1280px) โดยไม่มีการตัดหายของข้อมูลหรือเลื่อนแนวนอนทั้งหน้า
  - เมนู sidebar บนจอเล็กต้องเป็น `Sheet` (drawer) พร้อมปุ่มเปิดที่แตะได้ ≥40×40px, ช่องว่างระหว่างเป้าหมายแตะ ≥8px, ห้ามใช้ `100vh` เดี่ยว (ใช้ `100dvh`)
  - งานพิมพ์ (`@media print`): ปุ่ม/ไอคอนทุกชนิดต้องมีคลาส `no-print` และห้ามเปลี่ยนเลขที่เอกสาร ยอด หรือลำดับบรรทัดของเอกสารที่พิมพ์ออก

## มาตรฐานบังคับ

- **กฎโปรเจกต์ (`AGENTS.md`)** + **กฎเหล็ก 11 ข้อ + บทบาท 6** (ใน `~/.gemini/GEMINI.md`)
- **มาตรฐานละเอียด** (`~/.AGENTS.d/standards/`): data · security · testing · observability · compliance · performance · backend-scalability · ui-design · execution-loop · roles · lessons

## เอกสารอ้างอิง

| ไฟล์ | ใช้เมื่อ |
|---|---|
| `AGENTS.md` | กฎบังคับทุกงาน UI (shadcn/ui, responsive, print, DoD) |
| `README.md` | คู่มือการรันระบบ Docker / CLI / โครงสร้างหน้า |
| `docs/PROGRESS.md` | บันทึกความคืบหน้า (ต้องอัปเดตทุกครั้ง) |
| `docs/lessons.md` | บทเรียนเฉพาะโปรเจกต์ (อ่านก่อนเริ่มรอบ) |
