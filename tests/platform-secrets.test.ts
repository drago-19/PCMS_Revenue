import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedValue,
  isEncryptionConfigured,
} from "../src/lib/platform/secrets";

const KEY = randomBytes(32).toString("base64");

function withKey<T>(fn: () => T): T {
  const previous = process.env.PLATFORM_SECRET_KEY;
  process.env.PLATFORM_SECRET_KEY = KEY;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.PLATFORM_SECRET_KEY;
    else process.env.PLATFORM_SECRET_KEY = previous;
  }
}

test("encryptSecret/decryptSecret: เข้ารหัสแล้วถอดกลับได้ค่าเดิม", () => {
  withKey(() => {
    const plain = "tt-app-secret-1234567890";
    const encrypted = encryptSecret(plain);
    assert.notEqual(encrypted, plain);
    assert.ok(isEncryptedValue(encrypted));
    assert.equal(decryptSecret(encrypted), plain);
  });
});

test("encryptSecret: ค่าเดียวกันเข้ารหัสได้ผลต่างกันทุกครั้ง (IV สุ่ม)", () => {
  withKey(() => {
    const a = encryptSecret("same-secret");
    const b = encryptSecret("same-secret");
    assert.notEqual(a, b);
    assert.equal(decryptSecret(a), "same-secret");
    assert.equal(decryptSecret(b), "same-secret");
  });
});

test("decryptSecret: ค่าเก่าที่เป็นข้อความธรรมดายังอ่านได้ (ไม่ทำให้ข้อมูลเดิมเสีย)", () => {
  withKey(() => {
    assert.equal(decryptSecret("legacy-plain-secret"), "legacy-plain-secret");
    assert.equal(isEncryptedValue("legacy-plain-secret"), false);
  });
});

test("decryptSecret: คีย์ผิดต้องถอดไม่ได้ (ไม่คืนค่าเพี้ยน)", () => {
  withKey(() => {
    const encrypted = encryptSecret("top-secret");
    process.env.PLATFORM_SECRET_KEY = randomBytes(32).toString("base64");
    assert.throws(() => decryptSecret(encrypted));
  });
});

test("ไม่มีคีย์: ยังใช้งานได้แต่ไม่เข้ารหัส และรายงานว่ายังไม่ได้ตั้งค่า", () => {
  const previous = process.env.PLATFORM_SECRET_KEY;
  delete process.env.PLATFORM_SECRET_KEY;
  try {
    assert.equal(isEncryptionConfigured(), false);
    assert.equal(encryptSecret("plain"), "plain");
  } finally {
    if (previous !== undefined) process.env.PLATFORM_SECRET_KEY = previous;
  }
});

test("คีย์ที่ยาวไม่ใช่ 32 ไบต์ถือว่าใช้ไม่ได้", () => {
  const previous = process.env.PLATFORM_SECRET_KEY;
  process.env.PLATFORM_SECRET_KEY = Buffer.from("too-short").toString("base64");
  try {
    assert.equal(isEncryptionConfigured(), false);
  } finally {
    if (previous === undefined) delete process.env.PLATFORM_SECRET_KEY;
    else process.env.PLATFORM_SECRET_KEY = previous;
  }
});
