# Design System: PCMS Revenue — TikTok Shop Seller Center Edition

> เอกสาร Design Spec อ้างอิงตามมาตรฐาน `ui-design.md` และกฎบังคับใน `AGENTS.md`

## 1. Color Palette (TikTok Shop Seller Center Theme)

| Token | Hex | การใช้งาน |
|---|---|---|
| `--background` (`--bg`) | `#F1F4F9` | พื้นหลังแคนวาสหลัก (Slate อ่อน) เพื่อตัดกับตัวการ์ดสีขาว (`#FFFFFF`) อย่างชัดเจน |
| `--card` (`--surface`) | `#FFFFFF` | พื้นหลังการ์ด ตาราง และฟอร์ม |
| `--sidebar-bg` | `#0F1117` | พื้นหลังเมนูนำทางด้านซ้ายและแถบบนมือถือ (TikTok Onyx — ตัดกับแคนวาสชัดเจน) |
| `--foreground` (`--ink`) | `#0F172A` | สีตัวอักษรหลัก (คมชัด contrast > 15:1) |
| `--primary` (`--brand`) | `#FE2C55` | สีหลักแบรนด์ TikTok Razzmatazz (ปุ่ม CTA หลัก, จุดเน้นสำคัญ, Active indicator) |
| `--primary-dark` (`--brand-dark`) | `#C81038` | สีปุ่ม Primary เมื่อ hover/active |
| `--primary-soft` (`--brand-soft`) | `#FFF0F3` | พื้นหลังอ่อนของสีหลัก (Badge, Highlight) |
| `--tiktok-cyan` | `#00F2EA` | สี TikTok Cyan Neon สำหรับตกแต่ง Hero / Brand Mark / Dual-tone shadow |
| `--tiktok-teal` | `#0D9488` | สี TikTok Teal เข้มสำหรับลิงก์และข้อความคู่ขนานบนพื้นขาว (contrast ≥ 4.5:1) |
| `--tiktok-teal-soft` | `#F0FDFA` | พื้นหลังอ่อนโทนฟ้าอมเขียว |
| `--green` (`success`) | `#059669` | ยอดชำระสุทธิ / สถานะตรวจยอดผ่าน (พื้นหลัง `#ECFDF5`) |
| `--amber` (`warning`) | `#D97706` | คำเตือน / ยอดต้องตรวจสอบ (พื้นหลัง `#FFFBEB`) |
| `--red` (`destructive`) | `#DC2626` | ค่าธรรมเนียมหักลบ / ยอดไม่ตรง / ปุ่มลบ (พื้นหลัง `#FEF2F2`) |
| `--muted` | `#F1F5F9` | พื้นหลังส่วนหัวตาราง / แถบแบ่งกลุ่ม |
| `--muted-foreground` | `#475569` | ข้อความรอง / คำอธิบาย (contrast ≥ 7:1 บนพื้นขาว) |
| `--border` (`--line`) | `#CBD5E1` | เส้นขอบการ์ดและตาราง (เข้มชัด ไม่กลืนกับพื้นขาว) |
| `--ring` | `#FE2C55` | เส้น Focus ring สำหรับการเข้าถึงด้วยคีย์บอร์ด |

## 2. Typography

- **ข้อความและหัวข้อ (Thai + Latin)**: `"IBM Plex Sans Thai"`, `"Noto Sans Thai"`, `"Sarabun"`, system-ui
- **ตัวเลข รหัสออเดอร์ และจำนวนเงิน (`mono` / `tabular-nums`)**: `"JetBrains Mono"`, `"Cascadia Mono"`, Consolas, monospace พร้อม `font-variant-numeric: tabular-nums` ทุกจุดที่แสดงยอดเงิน ताकिหลักหน่วย-สิบ-ร้อยตรงแนวกันเสมอ
- **Scale**:
  - Page Title (`h1`): `24px–28px` (`font-weight: 800`, `letter-spacing: -0.025em`)
  - Hero Amount: `32px–40px` (`font-weight: 800`, `tabular-nums`)
  - Section / Card Title (`h2`): `16px–17px` (`font-weight: 700`)
  - Table & Body: `13.5px–14.5px` (ห้ามต่ำกว่า `12px` บนทุกหน้าจอตามกฎ `AGENTS.md`)

## 3. Spacing, Shape & Responsive Breakpoints

- **Spacing Scale**: `4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`
- **Border Radius**: Card `16px` (`--radius: 0.75rem`), Button/Input `10px`, Badge `999px` (pill)
- **Touch Targets**: ปุ่ม ลิงก์ และไอคอนที่คลิกได้ทุกจุดมีขนาดอย่างน้อย **`40×40px`** และระยะห่างระหว่างปุ่ม **`≥ 8px`**
- **Breakpoints (Mobile-First)**:
  - `360px` / `390px` (Mobile): Sidebar พับเก็บใน `Sheet` (Drawer ซ้าย), ตารางข้อมูล (`Table variant="stack"`) แปลงเป็น **Card List รายบิล** อ่านง่าย ไม่ต้องเลื่อนแนวนอน
  - `768px` (Tablet): Grid สถิติ 2 คอลัมน์, ตารางแสดงคอลัมน์ครบพร้อมปุ่มกดเปิดบิล/ใบกำกับภาษี
  - `1280px+` (Desktop): Sidebar แสดงด้านซ้ายคงที่ (`256px`), เนื้อหากลางกว้างสุด `1280px` พร้อม Grid 4 คอลัมน์สำหรับ KPI Cards

## 4. Motion & Micro-interactions

- **Duration**: `150ms–200ms` (`ease-out`)
- **Properties**: ใช้เฉพาะ `transform`, `opacity`, `background-color`, `border-color`, `box-shadow`
- **Accessibility**: รองรับ `@media (prefers-reduced-motion: reduce)` เพื่อปิดอนิเมชันเมื่อผู้ใช้ตั้งค่าลดการเคลื่อนไหว

## 5. Do's & Don'ts

- **Do**: แสดงปุ่ม `ดูบิล` และ `ใบกำกับภาษี` ในตารางทุกแถวให้คลิกเข้าถึงได้ในคลิกเดียว, แยกสีตัวเลขชัดเจน (รายได้ = สีเข้มปกติ, ค่าธรรมเนียม = สีแดงชมพู, ยอดชำระสุทธิ = สีเขียวเข้มเด่น)
- **Don't**: ห้ามแก้ไขโครงสร้าง ลำดับบรรทัด หรือยอดเงินในเอกสารพิมพ์จริง (`BillDocument`, `InvoiceDocument`) และห้ามแสดงปุ่มควบคุมลงกระดาษพิมพ์ (`@media print` ต้องซ่อน `.no-print` ทั้งหมด)
