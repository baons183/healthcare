"use client";
import { useCallback, useEffect, useState } from "react";
import { listDewormings, listIllnesses, listMeasurements, listMembers, listVaccinations } from "./data";
import type { Deworming, Illness, Measurement, Member, Vaccination } from "./types";

export interface FamilyData {
  members: Member[];
  measurements: Measurement[];
  vaccinations: Vaccination[];
  illnesses: Illness[];
  dewormings: Deworming[];
}

export function useFamilyData(familyId: string | undefined) {
  const [data, setData] = useState<FamilyData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!familyId) return;
    try {
      const [members, measurements, vaccinations, illnesses, dewormings] = await Promise.all([
        listMembers(familyId),
        listMeasurements({ familyId }),
        listVaccinations({ familyId }),
        listIllnesses({ familyId }),
        // bảng xổ giun có thể chưa được tạo (chưa chạy migration 0003)
        listDewormings({ familyId }).catch(() => [] as Deworming[]),
      ]);
      setData({ members, measurements, vaccinations, illnesses, dewormings });
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
