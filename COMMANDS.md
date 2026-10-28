# คู่มือรวมคำสั่งใช้งานระบบ PCMS Revenue (Cheat Sheet)

เอกสารสรุปคำสั่งทั้งหมดที่ใช้บ่อย สำหรับ **แก้โค้ด**, **Build ขึ้นเซิร์ฟเวอร์จริง**, **เปิด/จัดการ Database** และ **ตรวจสอบระบบ**

---

## 1. สรุปพอร์ตของระบบ (จำง่ายๆ 3 พอร์ตหลัก)

| พอร์ต | URL สำหรับเปิดใช้งาน | หน้าที่ | คำสั่งที่รันอยู่เบื้องหลัง |
| :--- | :--- | :--- | :--- |
| **`3001`** | `http://localhost:3001` | **โหมดแก้โค้ด (Dev Mode)** แก้ปุ๊บเห็นผลปั๊บ (Hot Reload) | `pnpm dev` |
| **`3002`** | `http://localhost:3002` | **เซิร์ฟเวอร์จริง (Production Docker)** ตัวที่ Build แล้ว โหลดไว ใช้ต่อออก Cloudflare (`https://revenue.goldpulse-ai.com`) | `pnpm run deploy:app` |
| **`54324`** | `http://localhost:54324` | **หน้าเว็บดู/จัดการฐานข้อมูล (Supabase Studio)** ของฐานข้อมูล `pcms_revenue` | `docker compose -f docker-compose.studio.yml up -d` |
| **`5432`** | `localhost:5432` | **PostgreSQL Database Engine** (ตัวเก็บข้อมูลจริง เบื้องหลัง) | คอนเทนเนอร์ `supabase-db` |

---

## 2. คำสั่งเวลา "แก้โค้ด" (พอร์ต `3001`)

เวลาต้องการแก้ไขหน้าเว็บหรือโค้ดและดูผลทันที:

```powershell
# เปิดโหมดแก้โค้ด (เข้าดูที่ http://localhost:3001)
pnpm dev
```
> 💡 **หมายเหตุสำหรับ Windows PowerShell**: ถ้าพิมพ์ `pnpm` หรือ `npx` แล้วติด Error สีแดงเรื่อง `ExecutionPolicy` ให้เติม `.cmd` ต่อท้าย เช่น `pnpm.cmd dev` หรือ `npx.cmd tsc --noEmit`

---

## 3. คำสั่งเวลา "แก้โค้ดเสร็จแล้ว จะ Build อัปเดตขึ้นพอร์ต `3002`"

เมื่อแก้โค้ดที่พอร์ต `3001` จนพอใจแล้ว และต้องการเอาขึ้นเซิร์ฟเวอร์จริงที่พอร์ต `3002` (รวมถึงหน้าเว็บผ่านโดเมน Cloudflare):

```powershell
# 1. เช็กว่าโค้ดไม่มี Error และรันเทสต์ผ่าน
npx.cmd tsc --noEmit
pnpm.cmd test

# 2. สั่ง Build และอัปเดต Docker Container พอร์ต 3002 ทันที (คำสั่งเดียวจบ)
pnpm.cmd run deploy:app
```
*(คำสั่ง `pnpm run deploy:app` คือคำสั่งลัดของ `docker compose up -d --build app`)*

---

## 4. คำสั่งจัดการ Database และหน้าเว็บดูข้อมูล (พอร์ต `5432` และ `54324`)

### 4.1 เช็กว่า Database ทำงานอยู่ไหม
```powershell
docker ps --filter "name=supabase-db" --filter "name=pcms-revenue"
```

### 4.2 เปิด / รีสตาร์ทตัวฐานข้อมูลหลัก (PostgreSQL พอร์ต `5432`)
```powershell
# ถ้าคอนเทนเนอร์ supabase-db หยุดทำงาน ให้สั่งเปิดด้วยคำสั่งนี้:
docker start supabase-db
```

### 4.3 เปิดหน้าเว็บจัดการฐานข้อมูล (Supabase Studio พอร์ต `54324`)
```powershell
# เปิดหน้าเว็บ Studio สำหรับดูตารางข้อมูลที่ http://localhost:54324
docker compose -f docker-compose.studio.yml up -d

# ถ้าต้องการรีสตาร์ทหน้า Studio
docker compose -f docker-compose.studio.yml restart

# ถ้าต้องการปิดหน้า Studio ชั่วคราว (ข้อมูลใน DB ไม่หาย)
docker compose -f docker-compose.studio.yml down
```

### 4.4 เข้าไปรันคำสั่ง SQL ใน Database โดยตรงผ่าน Terminal (ถ้าต้องการเช็กข้อมูลเร็วๆ)
```powershell
docker exec -it supabase-db psql -U postgres -d pcms_revenue
```
*(พิมพ์ `\dt` เพื่อดูตารางทั้งหมด และพิมพ์ `\q` เพื่อออกจากหน้า SQL)*

---

## 5. คำสั่งควบคุมเซิร์ฟเวอร์แอป (Docker พอร์ต `3002`)

```powershell
# เปิดเซิร์ฟเวอร์แอป (หรือสั่ง Build ใหม่พร้อมเปิด)
docker compose up -d --build app

# ดูสถานะว่าแอปทำงานปกติไหม
docker compose ps

# ดู Log การทำงานของแอปแบบสดๆ (กด Ctrl+C เพื่อออก)
docker compose logs -f app

# รีสตาร์ทแอปโดยไม่ต้อง Build ใหม่
docker compose restart app

# หยุดการทำงานของแอปพอร์ต 3002
docker compose stop app
```

---

## 6. คำสั่งตรวจสอบความถูกต้องของโค้ด (Quality Gate)

```powershell
# 1. ตรวจ TypeScript ทั้งโปรเจกต์ (ต้องได้ 0 error)
npx.cmd tsc --noEmit

# 2. รันชุดทดสอบอัตโนมัติ (Unit & Integration Tests)
pnpm.cmd test

# 3. ทดสอบ Build โปรเจกต์บนเครื่อง
pnpm.cmd build
```

---

## 7. คำสั่งนำเข้าไฟล์ Excel ผ่าน Terminal (กรณีไม่อัปโหลดผ่านหน้าเว็บ)

```powershell
# นำเข้าไฟล์เดียว
pnpm.cmd run import:file -- "C:\path\to\ไฟล์.xlsx"

# นำเข้าทุกไฟล์ในโฟลเดอร์
pnpm.cmd run import:dir -- "C:\path\to\โฟลเดอร์"
```

---

## 8. สรุปลำดับขั้นตอนเวลาทำงานปกติ (Workflow สั้นๆ)

1. **เริ่มทำงาน**: เปิด `pnpm.cmd dev` → เปิดเบราว์เซอร์ที่ `http://localhost:3001`
2. **ดูตารางฐานข้อมูล**: เปิด `http://localhost:54324` (ถ้าเข้าไม่ได้ รัน `docker compose -f docker-compose.studio.yml up -d`)
3. **เมื่อแก้โค้ดเสร็จ**:
   - รัน `npx.cmd tsc --noEmit` และ `pnpm.cmd test`
   - รัน `pnpm.cmd run deploy:app` เพื่ออัปเดตขึ้น `http://localhost:3002` (และ Cloudflare Tunnel)
