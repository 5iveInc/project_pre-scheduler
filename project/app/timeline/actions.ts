"use server"

import { revalidatePath } from "next/cache"
import { updateProject, setCustomHolidays } from "@/database/db"

export async function saveCustomHolidaysAction(dates: string[]) {
  setCustomHolidays(dates)
  revalidatePath("/timeline")
}

export async function updateProjectTimelineAction(
  id: number,
  name: string,
  assigneeIds: number[],
  supportIds: number[],
  startDate: string | null,
  endDate: string | null,
  memo: string | null,
  volume: number | null,
) {
  if (!name.trim()) return
  updateProject(id, name.trim(), assigneeIds, supportIds, startDate || null, endDate || null, memo, volume)
  revalidatePath("/timeline")
  revalidatePath("/project")
}
