"use server"

import { revalidatePath } from "next/cache"
import { addProject, updateProjectDates, setCustomHolidays, setUserPaidLeaves, type KeyDate, type ProjectLink } from "@/database/db"

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

function parseLinks(json: string | null): ProjectLink[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((l) => l && typeof l.label === "string" && typeof l.url === "string")
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
  const links = parseLinks(formData.get("linksJson") as string | null)
  const rawStatus = formData.get("status") as string | null
  const status = rawStatus === "受注済" ? "受注済" : "相談中"
  if (!name) throw new Error("案件名は必須です")
  await addProject(name, assigneeIds, supportIds, startDate, endDate, memo, volume, keyDates, status, links)
  revalidatePath("/")
  revalidatePath("/timeline")
  revalidatePath("/project")
}

export async function saveCustomHolidaysAction(dates: string[]) {
  await setCustomHolidays(dates)
  revalidatePath("/timeline")
}

export async function saveUserPaidLeavesAction(userId: number, dates: string[]) {
  await setUserPaidLeaves(userId, dates)
  revalidatePath("/timeline")
}

export async function updateProjectDatesAction(
  id: number,
  startDate: string | null,
  endDate: string | null,
) {
  await updateProjectDates(id, startDate, endDate)
  revalidatePath("/")
  revalidatePath("/timeline")
  revalidatePath("/project")
}

