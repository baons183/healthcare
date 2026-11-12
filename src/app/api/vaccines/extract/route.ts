/**
 * POST /api/vaccines/extract
 * Body: { memberId: string, paths: string[] }  (đường dẫn ảnh trong bucket "documents")
 * Đọc ảnh sổ/phiếu tiêm chủng bằng Claude và trả về danh sách mũi tiêm để người dùng duyệt.
 * Không ghi gì vào database – người dùng xác nhận/sửa trên giao diện rồi mới lưu.
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { VACCINES } from "@/lib/vaccines";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "claude-opus-5-5";
const MAX_IMAGES = 6;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const CODES = [...VACCINES.map((v) => v.code), "other"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["records", "warnings"],
  properties: {
    records: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["vaccine_code", "vaccine_name", "dose_number", "administered_on", "facility", "lot_number", "next_due_on", "notes", "confidence"],
        properties: {
          vaccine_code: { type: "string", enum: CODES },
          vaccine_name: { type: "string" },
          dose_number: { type: ["integer", "null"] },
          administered_on: { type: ["string", "null"], description: "YYYY-MM-DD" },
          facility: { type: ["string", "null"] },
          lot_number: { type: ["string", "null"] },
          next_due_on: { type: ["string", "null"], description: "YYYY-MM-DD" },
          notes: { type: ["string", "null"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    warnings: { type: ["string", "null"] },
  },
} as const;

function systemPrompt(birthDate: string, fullName: string) {
  const catalog = VACCINES.map((v) => `- ${v.code}: ${v.name} (${v.diseases}); tên thường gặp: ${v.brands.join(", ")}`).join("\n");
  return `Bạn đọc ảnh sổ tiêm chủng / phiếu tiêm / giấy xác nhận tiêm chủng của Việt Nam (có thể viết tay, đóng dấu, in máy) và trích xuất các MŨI ĐÃ TIÊM.

Người được tiêm: ${fullName}, ngày sinh ${birthDate}.

Danh mục mã vắc xin (vaccine_code):
${catalog}
- other: không khớp mã nào ở trên

Quy tắc:
- Mỗi mũi đã tiêm là một record. Bỏ qua các ô/dòng chỉ là lịch hẹn mà chưa có ngày tiêm.
- Ngày Việt Nam viết dạng ngày/tháng/năm (dd/mm/yyyy, có thể năm 2 chữ số). Chuyển về YYYY-MM-DD. Ngày tiêm không thể trước ngày sinh và không ở tương lai.
- Ghép mã theo bệnh/tên vắc xin: "VGB sơ sinh"/"Viêm gan B 0" -> hepb0; "Lao"/"BCG" -> bcg; 5in1/6in1/DPT-VGB-Hib/Quinvaxem/ComBE Five/Hexaxim/Infanrix Hexa/Pentaxim và DPT nhắc lúc 18 tháng -> dtp; "OPV"/"bại liệt uống"/"IPV" -> polio; "Sởi" (9 tháng) -> measles; "MR"/"MMR"/"Sởi-Rubella" -> mmr; "VNNB"/"Viêm não Nhật Bản"/Jevax/Imojev -> je; Td/VAT/Tetraxim/Boostrix/Adacel (từ 4 tuổi) -> dtp_booster; cúm -> flu.
- vaccine_name: tên thương mại nếu đọc được, nếu không thì ghi tên như trên giấy.
- dose_number: số thứ tự mũi nếu ghi rõ trên giấy, nếu không thì null.
- Không bịa thông tin. Chữ không đọc rõ: vẫn ghi phần đọc được, đặt confidence "low" và ghi lý do vào notes.
- warnings: ghi chú ngắn bằng tiếng Việt nếu ảnh mờ, bị cắt, hoặc không phải giấy tiêm chủng; null nếu không có gì cần lưu ý.`;
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Chưa cấu hình ANTHROPIC_API_KEY trên server." }, { status: 500 });
  }

  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  let body: { memberId?: string; paths?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  const paths = (body.paths ?? []).slice(0, MAX_IMAGES);
  if (!body.memberId || paths.length === 0) {
    return NextResponse.json({ error: "Thiếu thành viên hoặc ảnh." }, { status: 400 });
  }

  // RLS đảm bảo người dùng chỉ đọc được thành viên trong gia đình mình
  const { data: member } = await sb
    .from("members")
    .select("id, family_id, full_name, birth_date")
    .eq("id", body.memberId)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "Không tìm thấy thành viên." }, { status: 404 });

  const prefix = `${member.family_id}/${member.id}/`;
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const path of paths) {
    if (!path.startsWith(prefix)) return NextResponse.json({ error: "Ảnh không thuộc thành viên này." }, { status: 403 });
    const { data: blob, error } = await sb.storage.from("documents").download(path);
    if (error || !blob) return NextResponse.json({ error: `Không tải được ảnh: ${error?.message ?? path}` }, { status: 400 });
    const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
    if (blob.type === "application/pdf") {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
    } else if ((IMAGE_TYPES as readonly string[]).includes(blob.type)) {
      content.push({ type: "image", source: { type: "base64", media_type: blob.type as ImageType, data } });
    } else {
      return NextResponse.json({ error: `Định dạng không hỗ trợ: ${blob.type}` }, { status: 400 });
    }
  }
  content.push({ type: "text", text: "Trích xuất các mũi đã tiêm từ (các) ảnh trên." });

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> },
      },
      system: systemPrompt(member.birth_date, member.full_name),
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "AI từ chối xử lý ảnh này. Hãy thử ảnh khác hoặc nhập tay." }, { status: 422 });
    }
    if (response.stop_reason === "max_tokens") {
      return NextResponse.json({ error: "Ảnh có quá nhiều dữ liệu, hãy chụp từng trang một." }, { status: 422 });
    }
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = JSON.parse(text) as { records: unknown[]; warnings: string | null };
    return NextResponse.json({ ...parsed, usage: response.usage });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Hệ thống AI đang bận, thử lại sau ít phút." }, { status: 429 });
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY không hợp lệ." }, { status: 500 });
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Lỗi AI (${e.status}): ${e.message}` }, { status: 502 });
    }
    if (e instanceof SyntaxError) {
      return NextResponse.json({ error: "AI trả về dữ liệu không đọc được, hãy thử lại." }, { status: 502 });
    }
    throw e;
  }
}
