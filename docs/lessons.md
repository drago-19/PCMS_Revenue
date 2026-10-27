# docs/lessons.md — บทเรียนของโปรเจกต์ PCMS_Revenue

> 📘 บันทึกบทเรียน **เฉพาะโปรเจกต์นี้** (ไม่ใช่ global) — อ่านก่อนเริ่มรอบถัดไปเสมอ เพื่อไม่ให้ทำผิดซ้ำ
> 🧭 บทเรียนที่ใช้ได้ทุกโปรเจกต์ → ไปไว้ที่ `~/.AGENTS.d/standards/lessons.md` (GLOBAL)
> ⚖️ กฎโปรเจกต์ (ไฟล์นี้ + `AGENTS.md`) ชนะกฎสากลเมื่อขัดกัน

## ➕ กระบวนการเพิ่มบทเรียน

- [ ] ขึ้นต้นด้วย scope: `[PROJECT:PCMS_Revenue]`
- [ ] เขียน **"สัญญาณ/เหตุการณ์" + "สิ่งที่ควรทำ" + "ทำไม"** ย่อ ๆ
- [ ] แก้ที่ repo → `sync` → เปิด session ใหม่

## 📝 บทเรียน

- [PROJECT:PCMS_Revenue] `src/app/globals.css` ไม่เปิด Tailwind preflight โดยตั้งใจ (`@import "tailwindcss/theme" layer(theme); @import "tailwindcss/utilities" layer(utilities);`) เพื่อไม่ให้สไตล์เอกสารพิมพ์ (`BillDocument`, `InvoiceDocument`) และคลาส legacy พังระหว่างย้ายไปใช้ `shadcn/ui` และต้องครอบคลาส legacy ทั้งหมด (รวมถึง `.truncate`, `.muted`, `.small`, `.strong`, `.positive`, `.danger`, `.mono`) ไว้ใน `@layer components` เสมอ ห้ามวางนอก `@layer` เพราะ unlayered CSS จะทับ `@layer utilities` ของ Tailwind (เช่น `.truncate { display: block }` ไปทับ `inline-flex` บน `DatePickerField`)
- [PROJECT:PCMS_Revenue] งาน refactor UI ห้ามเปลี่ยนเลขที่เอกสาร ยอด หรือลำดับบรรทัดของเอกสารที่พิมพ์ออก (`BillDocument.tsx`, `InvoiceDocument.tsx`) และปุ่ม/ไอคอนทุกชนิดที่ไม่ออกกระดาษต้องมีคลาส `no-print`
- [PROJECT:PCMS_Revenue] `Tooltip` ใน `src/components/ui/tooltip.tsx` ต้องครอบ `<TooltipProvider>` ภายในตัวคอมโพเนนต์ `Tooltip` เอง เพื่อกัน Runtime Error ตอน HMR/hydration และปุ่ม `CopyButton` ไม่ควรเด้ง `toast` ทับตารางบนหน้าจอมือถือ 390px เพราะมีสถานะไอคอน+Tooltip แจ้งเตือนในตัวอยู่แล้ว
- [PROJECT:PCMS_Revenue] ถ้ารัน `pnpm build` แล้วเจอ `EBUSY: resource busy or locked, rmdir '.next/standalone'` แปลว่ามีโปรเซส `node .next/standalone/server.js` รันค้างอยู่ ต้องปิดโปรเซสนั้นก่อนสั่ง build ใหม่
- [PROJECT:PCMS_Revenue] ใน `.gitignore` ต้องระบุ `/imports/` (มี `/` นำหน้า) เพื่อ ignore เฉพาะโฟลเดอร์เก็บไฟล์อัปโหลดที่ root ไม่ให้เผลอไปบัง API route `src/app/api/imports/*`
- [PROJECT:PCMS_Revenue] ใน `DialogContent` และ `SheetContent` มีปุ่มปิด (`×`) แบบ `absolute top-3 right-3 size-10` — ดังนั้น `DialogHeader` และ `SheetHeader` ต้องมี `pr-11` / `pr-12` เสมอเมื่อเปิดปุ่มปิด เพื่อไม่ให้ `Badge` หรือข้อความด้านขวาบนถูกปุ่มกากบาท `×` ทับ (และห้ามใส่ negative margin บน `.copy-btn`)
- [PROJECT:PCMS_Revenue] การนำเข้าไฟล์ Excel ขนาดใหญ่ (เช่น 5,000+ แถว) ห้ามวนลูปรัน `DELETE` / `INSERT` / `nextval` ทีละแถวเด็ดขาด เพราะจะเกิด ~20,000 SQL queries ต่อไฟล์และช้ามาก ให้ใช้ Batch Insert / Bulk Upsert (ชุดละ 500 แถว + `ANY($1::text[])` + `unnest`) ใน `src/lib/ingest/import-service.ts` เสมอ
- [PROJECT:PCMS_Revenue] ใน Next.js 16 ไฟล์ `middleware.ts` ถูกเปลี่ยนชื่อเป็น `src/proxy.ts` (`export function proxy(request: NextRequest)`) และเมื่อเก็บค่า bcrypt hash (`$2b$12$...`) ในไฟล์ `.env` ที่ใช้ร่วมกับ `docker compose` ให้เข้ารหัสเป็น Base64 ก่อนใส่ใน `AUTH_PASSWORD_HASH` เพื่อไม่ให้ Docker Compose แปลเครื่องหมาย `$` เป็นตัวแปรว่างเปล่า
- [PROJECT:PCMS_Revenue] ห้ามเปิด `next dev -p 3001` ซ้อนทับกับ Docker container `pcms-revenue-app` บนพอร์ต `3001` เพราะ `cloudflared` บน Windows จะวิ่งเข้า IPv6 `[::1]:3001` ของ `next dev` ซึ่งใช้ชื่อไฟล์ CSS ไม่เปลี่ยนตามเนื้อหา (`src_app_globals_*.css`) ทำให้ Cloudflare CDN จำไฟล์ CSS เก่าจนหน้าเพี้ยน ต้องรันผ่าน `pcms-revenue-app` ตัวเดียวเพื่อให้ได้ไฟล์ CSS แบบ Content-Hash (`067au25oyi5lm.css`) เสมอ
