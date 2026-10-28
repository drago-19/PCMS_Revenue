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
- **ห้ามปุ่ม/Badge/ข้อความซ้อนทับกัน (No Overlap)**:
  - คอมโพเนนต์ที่มีปุ่มปิดมุมขวาบนแบบ `absolute` (`DialogContent`, `SheetContent`) ต้องเว้นระยะขอบขวาในส่วนหัว (`DialogHeader` / `SheetHeader` มี `pr-11` หรือ `pr-12` เสมอเมื่อแสดงปุ่มปิด) ห้ามให้ข้อความหรือ `Badge` ชนหรือถูกปุ่ม `×` บังเด็ดขาด
  - ห้ามใส่ negative margin บนปุ่ม (`margin: -...`) ที่ทำให้พื้นที่คลิกของปุ่มทับกับลิงก์หรือปุ่มข้างเคียง
- `viewport` ห้ามใส่ `user-scalable=no` และห้ามใช้ `100vh` เดี่ยว (ใช้ `100dvh`)

## 3. ประสิทธิภาพการนำเข้าข้อมูล (Database & Import Performance)

- **ห้าม Query / Insert / Update ทีละแถวใน Loop**: การนำเข้าไฟล์ Excel ที่มีหลายพันรายการต้องใช้ **Batch Insert / Bulk Upsert** (เช่น ทีละ 500 แถวต่อคำสั่ง SQL หรือใช้ `ANY($1::text[])` / `unnest`) เท่านั้น เพื่อให้ไฟล์ขนาดใหญ่ (5,000+ รายการ) นำเข้าเสร็จภายในไม่กี่วินาที

## 4. การพิมพ์ (ใบกำกับภาษี / บิล)

- งานพิมพ์ใช้ `@media print` เท่านั้น ปุ่ม/ไอคอนทุกชนิดต้องมีคลาส `no-print`
- ห้ามให้งาน refactor UI เปลี่ยนเลขที่เอกสาร ยอด หรือลำดับบรรทัดของเอกสารที่พิมพ์ออก
- **ห้ามตัดคำเป็น `...` บนเอกสารพิมพ์เด็ดขาด (No Truncation on Print)**: ห้ามใช้ `truncate`, `text-ellipsis` หรือ `line-clamp-*` ในคอมโพเนนต์ใบพิมพ์ (`InvoiceDocument.tsx`, `BillDocument.tsx`) เพราะกระดาษที่พิมพ์ออกมาไม่สามารถเอาเมาส์ไปชี้ดูข้อความเต็มได้ เลขคำสั่งซื้อ เลขพัสดุ เลขผู้เสียภาษี ที่อยู่ และชื่อสินค้าต้องแสดงครบทุกตัวอักษร 100%
- **ย่อสัดส่วนฟอนต์และปรับโครงสร้างคอลัมน์ตามขนาดกระดาษจริง (Proportional Print Scaling)**: เมื่อเปลี่ยนขนาดกระดาษจาก `A4` เป็น `100×150 มม. (A6 / 1/4 A4)`, `A4 แบ่ง 4 ใบ` หรือ `สลิปความร้อน 80 มม.` ต้องย่อขนาดตัวอักษร ระยะห่างบรรทัด และลดจำนวนคอลัมน์ให้พอดีกับความกว้างกระดาษโดยไม่มีข้อความถูกตัดหรือล้นขอบ

## 5. ก่อนส่งงาน

- `npx tsc --noEmit` และ `pnpm build` ผ่าน
- **บังคับใช้ `playwright` MCP (`@playwright/mcp`) ในการเปิดเบราว์เซอร์ทดสอบเสมอ** (ใช้แทน `chrome-devtools-mcp` เป็นหลัก) โดยเปิดทดสอบจริงที่ `360px`, `390px`, `768px` และ `1280px` แล้วทดสอบเส้นทางหลักของหน้าที่แก้ พร้อมตรวจการชน/ซ้อนทับของปุ่มและ Badge (รายงานผลพร้อมสิ่งที่กดผ่าน/ไม่ผ่าน)
- **ห้ามเทสต์แค่หน้าเดียวเมื่อแก้คอมโพเนนต์ร่วม (Test All Render Surfaces & All Button States)**:
  - หากแก้คอมโพเนนต์หรือ CSS ที่ใช้ร่วมกันหลายจุด (เช่น `InvoiceDocument`, `BillDocument`, `InvoiceZoomControl` ที่แสดงทั้งในหน้าเต็ม `/days/[date]/invoices`, `/invoices/[orderId]`, ในป๊อปอัป `BillPreviewDialog`, และในกรอบพรีวิว `/settings`) **ต้องเปิด Playwright MCP กดทดสอบครบทุกหน้า ทุก Modal/Dialog และครบทุกตัวเลือกปุ่ม (เช่น ทุกระดับซูม `100%–300%` และทุกขนาดกระดาษ)** ก่อนส่งงานเสมอ
  - **บังคับรันสคริปต์ตรวจการล้นกรอบภายใน (`Child Bounding-Box Overflow Check`)**: ห้ามตรวจแค่ `document.documentElement.scrollWidth <= clientWidth` ของหน้าเว็บหลักอย่างเดียว ต้องตรวจด้วยว่าภายใน Dialog / Card / `.invoice` ไม่มีข้อความหรือ Element ลูกใดล้นทะลุขอบขวา/ซ้ายของกรอบ (`childRect.right <= cardRect.right + 1` และ `el.scrollWidth <= el.clientWidth`)
  - การซูม (`zoom`) หรือย่อ/ขยายคอมโพเนนต์ที่อยู่ในกรอบจำกัดความกว้าง (เช่น ใน `DialogContent` หรือ Split Pane) ต้องวัดความกว้างจาก Container ที่ครอบอยู่จริง (`container.clientWidth` + `ResizeObserver`) ห้ามใช้แค่ `@media` ของหน้าต่างเบราว์เซอร์ เพราะจะทำให้ความกว้างภายในถูกบีบจนข้อความล้นทะลุการ์ด
- ถ้าแก้ไฟล์ UI ที่มี session อื่นกำลังแก้ไขอยู่ ให้ `git diff` ตรวจก่อน-หลังทุกครั้ง

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
