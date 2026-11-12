/**
 * Hiểu câu nói/gõ nhanh chỉ số huyết áp tiếng Việt.
 * VD: "160 trên 100 tim 110", "một trăm sáu mươi trên chín mươi lăm mạch tám mươi",
 *     "trăm sáu trên chín lăm", "160/100 110", "160 100 85"
 */

export interface BpParse {
  sys: number;
  dia: number;
  pulse: number | null;
  /** Cần người dùng xác nhận (số bất thường / có thể nghe nhầm) – không tự lưu */
  needsConfirm: boolean;
  /** Gợi ý sửa khi tâm trương quá thấp, VD nói "160 trên 20" -> 160/120 */
  suggestion?: { sys: number; dia: number };
  reason?: string;
}

const DIGIT: Record<string, number> = {
  không: 0, linh: 0, lẻ: 0,
  một: 1, mốt: 1,
  hai: 2,
  ba: 3,
  bốn: 4, tư: 4,
  năm: 5, lăm: 5, nhăm: 5,
  sáu: 6,
  bảy: 7, bẩy: 7,
  tám: 8,
  chín: 9,
};
const NUM_WORDS = new Set([...Object.keys(DIGIT), "mười", "mươi", "trăm"]);

/** Chuỗi từ chỉ số (đã tách) -> số. Trả về null nếu không hiểu. */
export function wordsToNumber(words: string[]): number | null {
  if (!words.length) return null;
  let hundreds = 0;
  let rest = words;
  const t = words.indexOf("trăm");
  if (t >= 0) {
    const before = words.slice(0, t);
    if (before.length > 1) return null;
    hundreds = before.length ? DIGIT[before[0]] : 1;
    if (hundreds === undefined) return null;
    rest = words.slice(t + 1);
  }
  const d = (w: string | undefined) => (w !== undefined && w in DIGIT ? DIGIT[w] : undefined);
  let tail: number | undefined;
  if (rest.length === 0) tail = 0;
  else if (rest[0] === "linh" || rest[0] === "lẻ") tail = rest.length === 2 ? d(rest[1]) : undefined;
  else if (rest[0] === "mười") tail = rest.length === 1 ? 10 : rest.length === 2 && d(rest[1]) !== undefined ? 10 + d(rest[1])! : undefined;
  else if (rest.length === 1) {
    const x = d(rest[0]);
    // "trăm sáu" = 160; không có "trăm" thì "sáu" = 6
    tail = x === undefined ? undefined : t >= 0 ? x * 10 : x;
  } else if (rest.length === 2 && rest[1] === "mươi") tail = d(rest[0]) !== undefined ? d(rest[0])! * 10 : undefined;
  else if (rest.length === 3 && rest[1] === "mươi") tail = d(rest[0]) !== undefined && d(rest[2]) !== undefined ? d(rest[0])! * 10 + d(rest[2])! : undefined;
  // "chín lăm" = 95
  else if (rest.length === 2) tail = d(rest[0]) !== undefined && d(rest[1]) !== undefined ? d(rest[0])! * 10 + d(rest[1])! : undefined;
  if (tail === undefined) return null;
  return hundreds * 100 + tail;
}

/** Tách câu thành các con số theo thứ tự + vị trí từ khóa nhịp tim */
function extractNumbers(text: string): { nums: number[]; pulseIdx: number | null } {
  const norm = text
    .toLowerCase()
    .normalize("NFC")
    .replace(/(\d)\s*[\/\\]\s*(\d)/g, "$1 trên $2")
    .replace(/[,.;:!?\-–]/g, " ");
  const tokens = norm.split(/\s+/).filter(Boolean);
  const nums: number[] = [];
  let pulseIdx: number | null = null;
  let run: string[] = [];
  const flush = () => {
    if (!run.length) return;
    const n = wordsToNumber(run);
    if (n !== null) nums.push(n);
    run = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    if (/^\d+$/.test(w)) {
      flush();
      nums.push(Number(w));
    } else if (NUM_WORDS.has(w)) {
      run.push(w);
    } else {
      flush();
      // "tim", "mạch", "nhịp (tim)" -> số kế tiếp là nhịp tim
      if (/^(tim|mạch|nhịp|pulse)$/.test(w)) pulseIdx = nums.length;
    }
  }
  flush();
  return { nums, pulseIdx };
}

export function parseBpSpeech(text: string): BpParse | null {
  const { nums, pulseIdx } = extractNumbers(text);
  if (nums.length < 2) return null;
  let sys: number;
  let dia: number;
  let pulse: number | null = null;
  if (pulseIdx !== null && pulseIdx < nums.length && pulseIdx >= 2) {
    [sys, dia] = nums;
    pulse = nums[pulseIdx];
  } else {
    [sys, dia] = nums;
    pulse = nums[2] ?? null;
  }
  if (dia > sys) [sys, dia] = [dia, sys];

  const reasons: string[] = [];
  let suggestion: BpParse["suggestion"];
  if (sys < 60 || sys > 260) reasons.push(`tâm thu ${sys}`);
  if (dia < 30 || dia > 160) {
    reasons.push(`tâm trương ${dia}`);
    // Nói tắt "160 trên 20" thường là 160/120
    if (dia < 30 && dia + 100 < sys) suggestion = { sys, dia: dia + 100 };
  }
  if (pulse !== null && (pulse < 30 || pulse > 220)) {
    reasons.push(`nhịp tim ${pulse}`);
    pulse = null;
  }
  return {
    sys,
    dia,
    pulse,
    needsConfirm: reasons.length > 0,
    suggestion,
    reason: reasons.length ? `Số chưa hợp lý (${reasons.join(", ")}) – kiểm tra lại.` : undefined,
  };
}
