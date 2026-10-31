/**
 * เหตุการณ์กลางสำหรับบอกแถบ loading ระดับหน้าเว็บ (`NavigationProgress`) ว่า
 * "กำลังจะเปลี่ยนหน้า" — ใช้เฉพาะกรณีที่การนำทางไม่ได้มาจากการคลิก <Link>
 * (เช่น router.push หลังกดปุ่มค้นหา / แบ่งหน้า / เลือกวันที่)
 */
export const NAVIGATION_START_EVENT = "pcms:navigation-start";

export function notifyNavigationStart(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NAVIGATION_START_EVENT));
}

type PendingListener = () => void;

const pendingListeners = new Set<PendingListener>();
let navigationPending = false;

/**
 * สถานะ "กำลังไปหน้าใหม่" แบบ external store เพื่อให้ component ใด ๆ (เช่น skeleton ของตาราง)
 * อ่านได้โดยไม่ต้องพึ่ง Suspense/Provider และไม่ทำให้ RSC ทั้งก้อนถูกแทนที่
 */
export function setNavigationPending(pending: boolean): void {
  if (navigationPending === pending) return;
  navigationPending = pending;
  for (const listener of pendingListeners) listener();
}

export function subscribeNavigationPending(listener: PendingListener): () => void {
  pendingListeners.add(listener);
  return () => {
    pendingListeners.delete(listener);
  };
}

export function getNavigationPendingSnapshot(): boolean {
  return navigationPending;
}

export function getNavigationPendingServerSnapshot(): boolean {
  return false;
}
