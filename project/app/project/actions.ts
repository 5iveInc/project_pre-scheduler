"use server"

import { revalidatePath } from "next/cache"
import { addProject, addChildProject, updateProject, deleteProjects, archiveProjects, unarchiveProjects, type KeyDate } from "@/database/db"

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

export async function addProjectAction(formData: FormData) {
  const name = (formData.get("name") as string).trim()
  const assigneeIds = formData.getAll("assigneeId").map(Number).filter(Boolean)
  const supportIds = formData.getAll("supportId").map(Number).filter(Boolean)
  const startDate = (formData.get("startDate") as string) || null
  const endDate = (formData.get("endDate") as string) || null
  const memo = (formData.get("memo") as string) || null
  const volume = Number(formData.get("volume")) || null
  const keyDates = parseKeyDates(formData.get("keyDatesJson") as string | null)
  const rawStatus = formData.get("status") as string | null
  const status = rawStatus === "受注済" ? "受注済" : "相談中"

  if (!name) throw new Error("案件名は必須です")

  await addProject(name, assigneeIds, supportIds, startDate, endDate, memo, volume, keyDates, status)
  revalidatePath("/")
  revalidatePath("/project")
  revalidatePath("/timeline")
}

export async function addChildProjectAction(parentId: number, formData: FormData) {
  const name = (formData.get("name") as string).trim()
  const assigneeIds = formData.getAll("assigneeId").map(Number).filter(Boolean)
  const supportIds = formData.getAll("supportId").map(Number).filter(Boolean)
  const startDate = (formData.get("startDate") as string) || null
  const endDate = (formData.get("endDate") as string) || null
  const memo = (formData.get("memo") as string) || null
  const volume = Number(formData.get("volume")) || null
  const keyDates = parseKeyDates(formData.get("keyDatesJson") as string | null)
  const rawStatus = formData.get("status") as string | null
  const status = rawStatus === "受注済" ? "受注済" : "相談中"

  if (!name) throw new Error("案件名は必須です")

  await addChildProject(parentId, name, assigneeIds, supportIds, startDate, endDate, memo, volume, keyDates, status)
  revalidatePath("/")
  revalidatePath("/project")
  revalidatePath("/timeline")
}

export async function updateProjectAction(
  id: number,
  name: string,
  assigneeIds: number[],
  supportIds: number[],
  startDate: string | null,
  endDate: string | null,
  memo: string | null,
  volume: number | null,
  keyDates: KeyDate[] = [],
  status: "相談中" | "受注済" = "相談中",
) {
  if (!name.trim()) return
  await updateProject(id, name.trim(), assigneeIds, supportIds, startDate || null, endDate || null, memo, volume, keyDates, status)
  revalidatePath("/")
  revalidatePath("/project")
  revalidatePath("/timeline")
}

export async function deleteProjectsAction(ids: number[]) {
  if (ids.length === 0) return
  await deleteProjects(ids)
  revalidatePath("/")
  revalidatePath("/project")
  revalidatePath("/timeline")
}

export async function archiveProjectsAction(ids: number[]) {
  if (ids.length === 0) return
  await archiveProjects(ids)
  revalidatePath("/")
  revalidatePath("/project")
  revalidatePath("/timeline")
}

export async function unarchiveProjectsAction(ids: number[]) {
  if (ids.length === 0) return
  await unarchiveProjects(ids)
  revalidatePath("/")
  revalidatePath("/project")
  revalidatePath("/timeline")
}
