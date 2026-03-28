"use server"

import { revalidatePath } from "next/cache"
import { addProject, updateProject, setCustomHolidays, type KeyDate } from "@/database/db"

function parseKeyDates(json: string | null): KeyDate[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((kd) => kd && typeof kd.date === "string" && typeof kd.label === "string")
  } catch {
    return []
  }
}

export async function addProjectTimelineAction(formData: FormData) {
  const name = (formData.get("name") as string).trim()
  const assigneeIds = formData.getAll("assigneeId").map(Number).filter(Boolean)
  const supportIds = formData.getAll("supportId").map(Number).filter(Boolean)
  const startDate = (formData.get("startDate") as string) || null
  const endDate = (formData.get("endDate") as string) || null
  const memo = (formData.get("memo") as string) || null
  const volume = Number(formData.get("volume")) || null
  const keyDates = parseKeyDates(formData.get("keyDatesJson") as string | null)
  if (!name) throw new Error("案件名は必須です")
  addProject(name, assigneeIds, supportIds, startDate, endDate, memo, volume, keyDates)
  revalidatePath("/timeline")
  revalidatePath("/project")
}

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
  keyDates: KeyDate[] = [],
) {
  if (!name.trim()) return
  updateProject(id, name.trim(), assigneeIds, supportIds, startDate || null, endDate || null, memo, volume, keyDates)
  revalidatePath("/timeline")
  revalidatePath("/project")
}
