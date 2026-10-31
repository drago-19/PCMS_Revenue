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

## 3. ประสิทธิภาพการนำเข้าข้อมูล และการรองรับข้อมูล TikTok, Shopee & Facebook (Database, Import & Multi-Channel Rules)

- **ห้าม Query / Insert / Update ทีละแถวใน Loop**: การนำเข้าไฟล์ Excel ที่มีหลายพันรายการต้องใช้ **Batch Insert / Bulk Upsert** (เช่น ทีละ 500 แถวต่อคำสั่ง SQL หรือใช้ `ANY($1::text[])` / `unnest`) เท่านั้น เพื่อให้ไฟล์ขนาดใหญ่ (5,000+ รายการ) นำเข้าเสร็จภายในไม่กี่วินาที
- **ระบบต้องรองรับทั้ง `TikTok`, `Shopee` และ `Facebook` เสมอ โดยแยกตรรกะทางการเงินของแต่ละแพลตฟอร์มออกจากกันอย่างเด็ดขาด (Strict Platform Financial Isolation — ห้ามแก้แพลตฟอร์มหนึ่งแล้วกระทบอีกแพลตฟอร์ม)**:
  - **ที่มาของไฟล์และโครงสร้างแต่ละแพลตฟอร์มต่างกันโดยสิ้นเชิง**:
    - **TikTok Shop**: ใช้ครบทั้ง **3 ไฟล์** (`ไฟล์ 1: ออเดอร์ Shipnity` + `ไฟล์ 2: สินค้า Shipnity` + `ไฟล์ 3: รายได้ TikTok Settlement`)
      - ออเดอร์ที่มีไฟล์ Settlement: ยอดชำระสุทธิ (`payout`) ดึงจากไฟล์ Settlement ของ TikTok 100% ซึ่ง TikTok มีการหักค่าปรับ ค่าขนส่งตีกลับ หรือเงินคืนจริง จึงอาจติดลบได้จริงตามไฟล์ของ TikTok
      - แถวชั่วคราว OMS (ที่ยังไม่มีไฟล์ Settlement): `payout = sales_amount - shipping_fee_seller` (ห้ามดึงคอลัมน์กำไรในสต็อกของ Shipnity มาใช้เด็ดขาด)
    - **Shopee & Facebook (ช่องทางจาก Shipnity)**: ใช้ **2 ไฟล์จาก Shipnity** (`oms_orders` + `oms_order_items`) ไม่มีไฟล์ที่ 3
      - **ยอดชำระสุทธิ (`payout`) ยึดตามเงินสดรับสุทธิจริงเพื่อการยื่นภาษี**: `payout = sales_amount - shipping_fee_seller` (`ยอดขาย - ค่าส่งที่ร้านจ่าย`) เพื่อไม่ให้การหักต้นทุนเสื้อผ้าในสต็อก (`COGS`) ของ Shipnity ในบิลเปลี่ยนไซส์ทำให้ยอดรับเงินสดติดลบหลอกตา
      - **เก็บต้นทุนสินค้าในสต็อก (`COGS`) ไว้เป็นข้อมูลอ้างอิงภายในหน้าบิล (`BillDocument.tsx`)**:
        - แสดง `ยอดการชำระเงินทั้งหมด (เงินรับสุทธิหลังหักค่าธรรมเนียม/ค่าส่ง)` เป็นตัวเลขหลัก
        - ด้านล่างแสดงกรอบ **ข้อมูลอ้างอิงภายใน: ต้นทุนสินค้าในสต็อก (COGS จาก Shipnity · ไม่หักจากยอดยื่นภาษี)** = `ยอดขาย - ค่าส่งที่ร้านจ่าย - กำไร Shipnity` คู่กับ `กำไรสุทธิหลังหักต้นทุนสต็อก (ตามไฟล์ Shipnity)` เพื่อให้ตรวจสอบเทียบกับไฟล์ Shipnity ได้ครบ 100%
      - **แยกหมวดปุ่มกรองตามแพลตฟอร์มใน `/bills`**:
        - **Facebook**: แยก `ข้อมูลครบ · พร้อมออกใบกำกับฯ` ออกจาก `เปลี่ยนสินค้า / ไม่มีราคาสินค้า` (`link_priority = 3`, บิลเปลี่ยนไซส์ที่ราคาสินค้า `฿0.00` มีเฉพาะค่าส่ง ไม่นำมายื่นภาษีขายและไม่ออกเลขใบกำกับฯ) และ `รวมทั้งหมดใน Facebook`
        - **Shopee**: แยก `ทั้งหมดใน Shopee`, `บิลขายปกติ · รับเงินจริง` (`payout > 0`), และ `ตีกลับเต็มจำนวน 100% · รับเงิน 0 บาท` (`payout = 0` จากการถูกหักยอดขายคืนเต็มจำนวน)
  - **กฎการเขียนโค้ดและแยกเงื่อนไข (Strict Separation in Code)**:
    - ทุกฟังก์ชันที่เกี่ยวข้องกับ `payout` และการคำนวณยอดเงิน ต้องแยกเงื่อนไขตามช่องทางชัดเจน:
      - `if (channel === 'TikTok') ...`
      - `else if (channel === 'Shopee') ...`
      - `else if (channel === 'Facebook') ...`
    - **ห้ามเหมารวมช่องทาง หรือเขียน `channel IN ('Shopee', 'Facebook')` สำหรับการคำนวณ `payout` เด็ดขาด**
    - เมื่อแก้ไขโค้ดของแพลตฟอร์มใด (เช่น Shopee) ต้องตรวจสอบและทดสอบเสมอว่าไม่กระทบอีกสองแพลตฟอร์ม (TikTok และ Facebook)
  - **กฎการเทียบความครบของข้อมูล (Completeness Check & Reconciliation)**:
    - **ห้ามนำจำนวนออเดอร์รวมใน Shipnity (`TikTok + Shopee + Facebook`) ไปเทียบกับไฟล์รายได้ TikTok โดยตรง** และห้ามนำออเดอร์ของ `Shopee` หรือ `Facebook` ไปนับเป็นบิลที่จับคู่ไฟล์รายได้ TikTok (`hasFile3`) เด็ดขาด
    - ออเดอร์ช่องทาง **`TikTok`** ต้องตรวจสอบความครบทั้ง **3 ไฟล์** (`ไฟล์ 1: ออเดอร์ Shipnity` + `ไฟล์ 2: สินค้า Shipnity` + `ไฟล์ 3: รายได้ TikTok`)
    - ออเดอร์ช่องทาง **`Shopee`** และ **`Facebook`** ใช้เฉพาะ **2 ไฟล์จาก Shipnity** (`ไฟล์ 1: ออเดอร์ Shipnity` + `ไฟล์ 2: สินค้า Shipnity`) ไม่ต้องใช้ไฟล์ที่ 3 ของ TikTok
    - เมื่อนำเข้าไฟล์รายได้ TikTok (`settlement`) ที่จับคู่กับ `oms_orders` เดิมแล้วลบแถวชั่วคราว `'คำสั่งซื้อ (OMS)'` ออก ต้องอัปเดต `daily_summaries` ทั้งวันที่โอนเงินจริง (`t.paid_date`) และวันที่ของออเดอร์เดิม (`o.paid_date`) เสมอเพื่อไม่ให้เกิดยอดค้างหรือยอดซ้ำในตารางสรุปรายวัน
- **กฎความเร็วสำหรับฐานข้อมูลขนาดใหญ่ (High-Volume Query & UI Responsiveness Rules — บังคับเมื่อข้อมูล 50,000–1,000,000+ รายการ)**:
  - **ห้ามครอบฟังก์ชันรอบคอลัมน์ที่มี Index ใน `WHERE` (SARGable Queries Only)**: ห้ามเขียน `COALESCE(NULLIF(t.channel, ''), 'TikTok') = $1` ใน `WHERE` เพราะจะทำลาย B-Tree Index จนเกิด Full Table Scan ให้ normalize ค่าตั้งแต่ตอนบันทึก (`NOT NULL DEFAULT 'TikTok'`) แล้วใช้ `t.channel = $1` และ `t.channel IN ('TikTok', 'Shopee', 'Facebook')` เสมอ
  - **ห้ามแกะ JSONB หรือเขียน `CASE WHEN` ซับซ้อนสดๆ ใน `SUM()` / `ORDER BY` บนตารางใหญ่**: ค่าที่ใช้กรอง রেียงลำดับ หรือรวมยอดบ่อย (เช่น `link_priority`, `shipping_positive`, `shipping_negative`) ต้องเก็บเป็นคอลัมน์จริงหรือ `GENERATED ALWAYS AS (...) STORED` พร้อมสร้าง Covering Index (`INCLUDE (...)`) ให้ PostgreSQL ทำ Index-Only Scan ได้ใน `< 50 ms`
  - **เรียงลำดับตัวกรองตามศักดิ์จากใหญ่ไปเล็ก (Top-Down Filter Hierarchy) และตัวเลขตัวแม่ห้ามถูกตัวลูกตัดทอน**:
    - ลำดับชั้นในหน้า `/bills`: `หมวดบิล 3 หมวด` (บนสุด) → `ช่องทางจำหน่าย (ทุกช่องทาง · TikTok · Shopee · Facebook) + สถานะยอด` (ตัวแม่) → `สถานะการผูกไฟล์ 4 กล่อง (ทั้งหมด · ข้อมูลครบ · รอไฟล์ฯ · มีเฉพาะฯ)` (ตัวลูก ล่างสุด)
    - ตัวเลข Badge ของตัวกรองระดับแม่ (`channelCounts` และ `categoryCounts`) ห้ามถูกตัวกรองระดับลูก (`linkStatus`) มาตัดทอนเด็ดขาด และเมื่อสลับปุ่มในแถวเดียวกัน ตัวเลขรวมของปุ่มข้างเคียงต้องคงที่และตรงกันเสมอ
    - การ์ดสรุปยอดรวมทุกหมวด (`periodNetSummary`) และตัวกรองทุกจุดต้องคำนวณแยกตามแต่ละช่องทาง (`ทุกช่องทาง`, `TikTok`, `Shopee`, `Facebook`) อย่างเท่าเทียมกัน ห้ามเขียนเงื่อนไขฟิลเตอร์เฉพาะ TikTok หรือล็อกเฉพาะ `channel === 'all'`
  - **ปุ่มสลับหมวด/ตัวกรองต้องตอบสนองทันที (Instant Optimistic Feedback)**: แท็บหมวดบิล สถานะการผูกไฟล์ และปุ่มช่องทางต้องอัปเดตสถานะปุ่มที่ถูกเลือกทันทีที่คลิก (`useTransition` + Optimistic State) โดยไม่ปล่อยให้หน้าจอค้างรอ Server ตอบกลับ

## 4. กฎการแสดงผลตัวเลขและการเงิน — เอามาแสดงเฉยๆ ไม่ต้องคำนวณอะไร (Display Exact Values from File Only — No Calculation)

- **ห้ามคำนวณยอดเงิน กลับเครื่องหมาย หรือเขียนสูตรบวกลบเองเด็ดขาด (เอามาแสดงเฉยๆ ไม่ต้องคำนวณอะไร)**:
  - ข้อมูลทุกช่องในระบบ ทั้งในหน้า `/bills`, `/days`, หน้ารายละเอียดบิล (`BillDocument.tsx`), ใบกำกับภาษี (`InvoiceDocument.tsx`) และฟังก์ชันคิวรี/แปลงข้อมูลทั้งหมด (`src/lib/queries.ts`, `src/lib/ingest/*`) **มีหน้าที่ดึงค่าตัวเลขจากไฟล์ Excel ที่นำเข้ามาแสดงผลเฉยๆ ตามจริง 100% เท่านั้น**
  - **ห้ามเขียนสูตรบวกลบคูณหารขึ้นมาคำนวณเอง**:
    - คอลัมน์ `รายได้` (`income`): ดึงจากช่อง `ยอดขาย` ในไฟล์ Excel
    - คอลัมน์ `ค่าขนส่ง` (`shippingCustomerFee`): ดึงจากช่อง `ค่าส่งที่เก็บลูกค้า` ในไฟล์ Excel
    - คอลัมน์ `ค่าธรรมเนียม` (`feeTotal`): ดึงจากช่อง `ค่าส่งที่ร้านจ่าย` ในไฟล์ Excel
    - คอลัมน์ `ยอดชำระสุทธิ` (`payout`):
      - **TikTok**: ดึงจากยอดเงินโอนสุทธิในไฟล์ Settlement ของ TikTok โดยตรง 100% (สำหรับรายการที่มี Settlement) หรือ `sales_amount - shipping_fee_seller` (สำหรับแถวชั่วคราว OMS ก่อนมี Settlement)
      - **Shopee & Facebook (ช่องทางจาก Shipnity)**: คำนวณจากเงินสดรับสุทธิจริง `sales_amount - shipping_fee_seller` (`ยอดขาย - ค่าส่งที่ร้านจ่าย`) เพื่อใช้ยื่นภาษีได้อย่างถูกต้อง และเก็บ `ต้นทุนสินค้าในสต็อก (COGS)` ไว้แสดงเป็นข้อมูลอ้างอิงภายในหน้าดูบิล (`BillDocument.tsx`) คู่กับกำไรในสต็อกตามไฟล์ Shipnity
  - ห้ามใช้ `Math.abs()` กลับเครื่องหมายบวกเป็นลบ/ลบเป็นบวกเอง ค่าทุกบรรทัดในใบกำกับภาษีต้องตรงกับหน้าบิล (`BillDocument.tsx`) 100%
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
