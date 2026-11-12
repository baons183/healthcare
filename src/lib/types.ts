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

export type RefType = "general" | "vaccination" | "illness" | "measurement";

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
