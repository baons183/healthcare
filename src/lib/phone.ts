/** Chuẩn hóa SĐT Việt Nam về E.164: 0912 345 678 -> +84912345678 */
export function toE164(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  let n = digits;
  if (n.startsWith("0")) n = "84" + n.slice(1);
  else if (!n.startsWith("84") && n.length === 9) n = "84" + n;
  if (n.length < 10 || n.length > 15) return null;
  return "+" + n;
}

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
