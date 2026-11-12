"use client";
import { useCallback, useEffect, useState } from "react";
import { listDewormings, listExtras, listIllnesses, listMeasurements, listMembers, listVaccinations } from "./data";
import type { Deworming, Illness, Measurement, Member, MemberExtras, Vaccination } from "./types";

export interface FamilyData {
  members: Member[];
  measurements: Measurement[];
  vaccinations: Vaccination[];
  illnesses: Illness[];
  dewormings: Deworming[];
  extras: MemberExtras;
}

export function useFamilyData(familyId: string | undefined) {
  const [data, setData] = useState<FamilyData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!familyId) return;
    try {
      const [members, measurements, vaccinations, illnesses, dewormings, extras] = await Promise.all([
        listMembers(familyId),
        listMeasurements({ familyId }),
        listVaccinations({ familyId }),
        listIllnesses({ familyId }),
        // bảng xổ giun có thể chưa được tạo (chưa chạy migration 0003)
        listDewormings({ familyId }).catch(() => [] as Deworming[]),
        listExtras({ familyId }),
      ]);
      setData({ members, measurements, vaccinations, illnesses, dewormings, extras });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [familyId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, reload };
}

export function byMember<T extends { member_id: string }>(rows: T[], memberId: string): T[] {
  return rows.filter((r) => r.member_id === memberId);
}

/** Lọc dữ liệu bổ sung của cả gia đình theo 1 thành viên */
export function extrasOf(e: MemberExtras, memberId: string): MemberExtras {
  return {
    medications: byMember(e.medications, memberId),
    temperatures: byMember(e.temperatures, memberId),
    milestones: byMember(e.milestones, memberId),
    checkups: byMember(e.checkups, memberId),
    vitals: byMember(e.vitals, memberId),
    pregnancies: byMember(e.pregnancies, memberId),
  };
}
