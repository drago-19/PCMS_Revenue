# docs/lessons.md — บทเรียนของโปรเจกต์ PCMS_Revenue

> 📘 บันทึกบทเรียน **เฉพาะโปรเจกต์นี้** (ไม่ใช่ global) — อ่านก่อนเริ่มรอบถัดไปเสมอ เพื่อไม่ให้ทำผิดซ้ำ
> 🧭 บทเรียนที่ใช้ได้ทุกโปรเจกต์ → ไปไว้ที่ `~/.AGENTS.d/standards/lessons.md` (GLOBAL)
> ⚖️ กฎโปรเจกต์ (ไฟล์นี้ + `AGENTS.md`) ชนะกฎสากลเมื่อขัดกัน

## ➕ กระบวนการเพิ่มบทเรียน

- [ ] ขึ้นต้นด้วย scope: `[PROJECT:PCMS_Revenue]`
- [ ] เขียน **"สัญญาณ/เหตุการณ์" + "สิ่งที่ควรทำ" + "ทำไม"** ย่อ ๆ
- [ ] แก้ที่ repo → `sync` → เปิด session ใหม่

## 📝 บทเรียน

- [PROJECT:PCMS_Revenue] `src/app/globals.css` ไม่เปิด Tailwind preflight โดยตั้งใจ (`@import "tailwindcss/theme" layer(theme); @import "tailwindcss/utilities" layer(utilities);`) เพื่อไม่ให้สไตล์เอกสารพิมพ์ (`BillDocument`, `InvoiceDocument`) และคลาส legacy พังระหว่างย้ายไปใช้ `shadcn/ui` และต้องครอบคลาส legacy ใน `@layer components` เพื่อให้ `@layer utilities` ของ Tailwind ชนะเสมอ
- [PROJECT:PCMS_Revenue] งาน refactor UI ห้ามเปลี่ยนเลขที่เอกสาร ยอด หรือลำดับบรรทัดของเอกสารที่พิมพ์ออก (`BillDocument.tsx`, `InvoiceDocument.tsx`) และปุ่ม/ไอคอนทุกชนิดที่ไม่ออกกระดาษต้องมีคลาส `no-print`
- [PROJECT:PCMS_Revenue] `Tooltip` ใน `src/components/ui/tooltip.tsx` ต้องครอบ `<TooltipProvider>` ภายในตัวคอมโพเนนต์ `Tooltip` เอง เพื่อกัน Runtime Error ตอน HMR/hydration และปุ่ม `CopyButton` ไม่ควรเด้ง `toast` ทับตารางบนหน้าจอมือถือ 390px เพราะมีสถานะไอคอน+Tooltip แจ้งเตือนในตัวอยู่แล้ว
- [PROJECT:PCMS_Revenue] ถ้ารัน `pnpm build` แล้วเจอ `EBUSY: resource busy or locked, rmdir '.next/standalone'` แปลว่ามีโปรเซส `node .next/standalone/server.js` รันค้างอยู่ ต้องปิดโปรเซสนั้นก่อนสั่ง build ใหม่
- [PROJECT:PCMS_Revenue] ใน `.gitignore` ต้องระบุ `/imports/` (มี `/` นำหน้า) เพื่อ ignore เฉพาะโฟลเดอร์เก็บไฟล์อัปโหลดที่ root ไม่ให้เผลอไปบัง API route `src/app/api/imports/*`
