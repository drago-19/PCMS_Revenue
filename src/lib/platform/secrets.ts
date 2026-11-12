// เข้ารหัส credential ของแพลตฟอร์มก่อนเก็บลงฐานข้อมูล (AES-256-GCM)
//
// คีย์มาจาก env `PLATFORM_SECRET_KEY` (base64 ของ 32 ไบต์) — เก็บไว้นอกฐานข้อมูล
// ถ้าคีย์หลุดหรือ DB หลุดเพียงอย่างเดียว ข้อมูลที่เข้ารหัสไว้จะอ่านไม่ได้
//
// ค่าที่บันทึกมีรูปแบบ `v1:<base64(iv|tag|ciphertext)>` — ค่าเก่าที่ไม่มี prefix
// ถือเป็นข้อความธรรมดา (ระบบยังใช้งานได้ระหว่างทยอยเปลี่ยน)

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer | null {
  const raw = process.env.PLATFORM_SECRET_KEY?.trim();
  if (!raw) return null;
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    return null;
  }
  return key.length === 32 ? key : null;
}

export function isEncryptionConfigured(): boolean {
  return getKey() !== null;
}

export function isEncryptedValue(value: string): boolean {
  return value.startsWith(PREFIX);
}

/**
 * เข้ารหัสค่าลับ — ถ้ายังไม่ได้ตั้งคีย์ จะคืนค่าเดิมเพื่อไม่ให้ระบบหยุดทำงาน
 * (ควรตั้งคีย์ก่อนใช้งานจริงเสมอ)
 */
export function encryptSecret(plain: string): string {
  const key = getKey();
  if (!key || !plain) return plain;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** ถอดรหัสค่าลับ — ค่าเก่าที่ไม่ได้เข้ารหัสจะคืนกลับตามเดิม */
export function decryptSecret(value: string): string {
  if (!value || !isEncryptedValue(value)) return value;

  const key = getKey();
  if (!key) {
    throw new Error(
      "ไม่พบคีย์ถอดรหัส (PLATFORM_SECRET_KEY) — ตั้งค่าใน .env แล้วลองใหม่",
    );
  }

  const payload = Buffer.from(value.slice(PREFIX.length), "base64");
  if (payload.length <= IV_BYTES + TAG_BYTES) {
    throw new Error("ข้อมูลที่เข้ารหัสเสียหาย (สั้นเกินไป)");
  }

  const iv = payload.subarray(0, IV_BYTES);
  const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
