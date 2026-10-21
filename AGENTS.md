# กฎของระบบ PCMS_Revenue (บังคับทุกงาน UI)

## 1. Component library — ใช้ shadcn/ui เท่านั้น

คอมโพเนนต์ UI ทุกตัวต้องมาจาก shadcn/ui ใน `src/components/ui/*` ห้ามเขียน control ใหม่เป็น CSS เอง

- เพิ่มคอมโพเนนต์: `pnpm dlx shadcn@latest add <name>` แล้วใช้จาก `@/components/ui/<name>`
- ปุ่ม/ช่องกรอก/การ์ด/ตาราง/badge/dialog/dropdown/tabs/toast/tooltip/sheet = Button, Input, Card, Table, Badge, Dialog, DropdownMenu, Tabs, Sonner, Tooltip, Sheet ตามลำดับ
- ปรับธีมผ่าน CSS variables ใน `src/app/globals.css` (`--background --foreground --primary --muted --border --ring ...`) ห้าม override ด้วย `!important` หรือ class เฉพาะหน้า
- Class custom เดิมใน `globals.css` ถือเป็น legacy: อนุญาตให้ "ย้ายออก" อย่างเดียว ห้ามเพิ่มคอมโพเนนต์ใหม่ลงไฟล์นั้น
- ทุกคอมโพเนนต์ต้องมี variant ผ่าน `cva` + `cn()` (`src/lib/utils.ts`) ไม่ใช่ prop สไตล์ดิบ
- สถานะต้องครบเสมอ: hover / focus-visible / disabled / loading และต้องมี label ที่เข้าถึงได้ (`aria-label` หรือ text จริง)

## 2. Responsive — mobile-first ทั้งระบบ

ทุกหน้าต้องใช้งานได้ที่ **360px, 390px, 768px, 1280px** โดยไม่มีการตัดหายของข้อมูลหรือเลื่อนแนวนอนทั้งหน้า

- เขียนสไตล์จากมือถือขึ้น desktop (`min-*`) ส่วน breakpoint เดิมเป็น `max-width` — เวลาแก้หน้าไหน ให้ตรวจ 360px ของหน้านั้นด้วยเสมอ
- ตารางข้อมูลบนจอเล็ก: ใช้ `Table` ใน `overflow-x-auto` หรือเปลี่ยนเป็น card list — ห้ามย่อฟอนต์ต่ำกว่า 12px เพื่อให้อยู่
- เมนู sidebar บนจอเล็กต้องเป็น `Sheet` (drawer) พร้อมปุ่มเปิดที่แตะได้ ≥40px
- ปุ่ม/ไอคอนแตะได้ ≥ 40×40px, ช่องว่างระหว่างเป้าหมายแตะ ≥ 8px
- `viewport` ห้ามใส่ `user-scalable=no` และห้ามใช้ `100vh` เดี่ยว (ใช้ `100dvh`)

## 3. การพิมพ์ (ใบกำกับภาษี / บิล)

- งานพิมพ์ใช้ `@media print` เท่านั้น ปุ่ม/ไอคอนทุกชนิดต้องมีคลาส `no-print`
- ห้ามให้งาน refactor UI เปลี่ยนเลขที่เอกสาร ยอด หรือลำดับบรรทัดของเอกสารที่พิมพ์ออก

## 4. ก่อนส่งงาน

- `npx tsc --noEmit` และ `pnpm build` ผ่าน
- เปิดเบราว์เซอร์จริงที่ 390px + 1280px แล้วทดสอบเส้นทางหลักของหน้าที่แก้ (รายงานผลพร้อมสิ่งที่กดผ่าน/ไม่ผ่าน)
- ถ้าแก้ไฟล์ UI ที่มี session อื่นกำลังแก้ไขอยู่ ให้ `git diff` ตรวจก่อน-หลังทุกครั้ง

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
