export type Gender = "male" | "female";
export type Role = "owner" | "editor" | "viewer";

export interface Family {
  id: string;
  name: string;
  owner_id: string;
  plan: string;
  role: Role; // vai trò của người dùng hiện tại
}

export interface Member {
  id: string;
  family_id: string;
  full_name: string;
  gender: Gender;
  birth_date: string; // yyyy-mm-dd
  blood_type: string | null;
  allergies: string | null;
  chronic_conditions: string | null;
  notes: string | null;
  color: string | null;
  emergency_contact?: string | null;
  emergency_phone?: string | null;
  insurance_number?: string | null;
  emergency_token?: string | null;
  bp_times?: string[]; // giờ nhắc đo huyết áp (migration 0007)
}

export interface Measurement {
  id: string;
  family_id: string;
  member_id: string;
  measured_on: string;
  height_cm: number | null;
  weight_kg: number | null;
  head_cm: number | null;
  notes: string | null;
}

export type Severity = "mild" | "moderate" | "severe";

export interface Illness {
  id: string;
  family_id: string;
  member_id: string;
  name: string;
  started_on: string;
  ended_on: string | null;
  severity: Severity;
  symptoms: string | null;
  diagnosis: string | null;
  treatment: string | null;
  facility: string | null;
  doctor: string | null;
  notes: string | null;
}

export interface Vaccination {
  id: string;
  family_id: string;
  member_id: string;
  vaccine_code: string | null;
  vaccine_name: string;
  dose_number: number | null;
  administered_on: string;
  facility: string | null;
  lot_number: string | null;
  next_due_on: string | null;
  notes: string | null;
}

export interface Deworming {
  id: string;
  family_id: string;
  member_id: string;
  given_on: string;
  medicine: string | null;
  notes: string | null;
}

export interface Medication {
  id: string;
  family_id: string;
  member_id: string;
  illness_id: string | null;
  name: string;
  dosage: string | null;
  times: string[]; // "HH:MM" giờ Việt Nam
  start_on: string;
  end_on: string | null;
  remind: boolean;
  notes: string | null;
}

export interface Temperature {
  id: string;
  family_id: string;
  member_id: string;
  illness_id: string | null;
  measured_at: string; // ISO timestamp
  temp_c: number;
  site: string | null;
  medicine: string | null;
  notes: string | null;
}

export interface Milestone {
  id: string;
  family_id: string;
  member_id: string;
  code: string;
  achieved_on: string;
  notes: string | null;
}

export type CheckupKind = "dental" | "eye" | "general" | "prenatal";

export interface Checkup {
  id: string;
  family_id: string;
  member_id: string;
  kind: CheckupKind;
  done_on: string;
  pregnancy_id: string | null;
  visit_code: string | null;
  facility: string | null;
  result: string | null;
  notes: string | null;
}

export type GlucoseContext = "fasting" | "after_meal" | "random";

export interface Vital {
  id: string;
  family_id: string;
  member_id: string;
  measured_at: string;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  glucose: number | null;
  glucose_context: GlucoseContext | null;
  cholesterol: number | null;
  ldl: number | null;
  hdl: number | null;
  triglycerides: number | null;
  notes: string | null;
}

export interface Pregnancy {
  id: string;
  family_id: string;
  member_id: string;
  lmp: string;
  due_date: string;
  pre_weight_kg: number | null;
  ended_on: string | null;
  outcome: string | null;
  notes: string | null;
}

/** Dữ liệu bổ sung của 1 thành viên (các bảng thêm ở migration 0005) */
export interface MemberExtras {
  medications: Medication[];
  temperatures: Temperature[];
  milestones: Milestone[];
  checkups: Checkup[];
  vitals: Vital[];
  pregnancies: Pregnancy[];
}

export const EMPTY_EXTRAS: MemberExtras = { medications: [], temperatures: [], milestones: [], checkups: [], vitals: [], pregnancies: [] };

/** Supabase trả numeric dưới dạng string – chuẩn hóa về number */
function num(v: unknown): number | null {
  return v === null || v === undefined || v === "" ? null : Number(v);
}
export function normalizeNumeric<T>(row: Record<string, unknown>, keys: string[]): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of keys) out[k] = num(row[k]);
  return out as T;
}

export type RefType ="general" | "vaccination" | "illness" | "measurement";

export interface DocumentFile {
  id: string;
  family_id: string;
  member_id: string;
  ref_type: RefType;
  ref_id: string | null;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

/** Supabase trả numeric dưới dạng string – chuẩn hóa về number */
export function normalizeMeasurement(m: Record<string, unknown>): Measurement {
  const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  return {
    ...(m as unknown as Measurement),
    height_cm: n(m.height_cm),
    weight_kg: n(m.weight_kg),
    head_cm: n(m.head_cm),
  };
}

export interface ReminderEvent {
  id: string;
  key: string;
  family_id: string;
  member_id: string;
  kind: "med" | "bp";
  ref_id: string | null;
  day: string;
  time: string;
  status: "pending" | "done" | "missed";
  sent_count: number;
  done_at: string | null;
}
