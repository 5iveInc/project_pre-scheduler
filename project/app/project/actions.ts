"use server"

import { revalidatePath } from "next/cache"
import { addProject, addChildProject, updateProject, deleteProjects, archiveProjects, unarchiveProjects, addStakeholder, removeStakeholder, type KeyDate, type ProjectLink, type AssigneeType } from "@/database/db"

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

export async function addProjectAction(formData: FormData) {
  const name = (formData.get("name") as string).trim()
  const assigneeIds = formData.getAll("assigneeId").map(Number).filter(Boolean)
  const clientName = (formData.get("clientName") as string) || null
  const startDate = (formData.get("startDate") as string) || null
  const endDate = (formData.get("endDate") as string) || null
  const memo = (formData.get("memo") as string) || null
  const volume = Number(formData.get("volume")) || null
  const keyDates = parseKeyDates(formData.get("keyDatesJson") as string | null)
  const links = parseLinks(formData.get("linksJson") as string | null)
  const rawStatus = formData.get("status") as string | null
  const status = rawStatus === "受注済" ? "受注済" : "相談中"

  if (!name) throw new Error("案件名は必須です")

  await addProject(name, assigneeIds, clientName, startDate, endDate, memo, volume, keyDates, status, links)
  revalidatePath("/")
  revalidatePath("/project")
  revalidatePath("/timeline")
}

export async function addChildProjectAction(parentId: number, formData: FormData) {
  const name = (formData.get("name") as string).trim()
  const rawAssigneeType = formData.get("assigneeType") as string | null
  const assigneeType: AssigneeType = rawAssigneeType === "client" || rawAssigneeType === "stakeholder" ? rawAssigneeType : "5ive"
  const assigneeIds = assigneeType === "5ive" ? formData.getAll("assigneeId").map(Number).filter(Boolean) : []
  const stakeholderAssigneeIds = assigneeType === "stakeholder" ? formData.getAll("stakeholderAssigneeId").map(Number).filter(Boolean) : []
  const startDate = (formData.get("startDate") as string) || null
  const endDate = (formData.get("endDate") as string) || null
  const memo = (formData.get("memo") as string) || null
  const volume = Number(formData.get("volume")) || null
  const keyDates = parseKeyDates(formData.get("keyDatesJson") as string | null)
  const rawStatus = formData.get("status") as string | null
  const status = rawStatus === "受注済" ? "受注済" : "相談中"

  if (!name) throw new Error("案件名は必須です")

  await addChildProject(parentId, name, assigneeIds, startDate, endDate, memo, volume, keyDates, status, assigneeType, stakeholderAssigneeIds)
  revalidatePath("/")
  revalidatePath("/project")
  revalidatePath("/timeline")
}

export async function updateProjectAction(
  id: number,
  name: string,
  assigneeIds: number[],
  clientName: string | null,
  startDate: string | null,
  endDate: string | null,
  memo: string | null,
  volume: number | null,
  keyDates: KeyDate[] = [],
  status: "相談中" | "受注済" = "相談中",
  links: ProjectLink[] = [],
  assigneeType: AssigneeType = "5ive",
  stakeholderAssigneeIds: number[] = [],
) {
  if (!name.trim()) return
  await updateProject(id, name.trim(), assigneeIds, clientName, startDate || null, endDate || null, memo, volume, keyDates, status, links, assigneeType, stakeholderAssigneeIds)
  revalidatePath("/")
  revalidatePath("/project")
  revalidatePath("/timeline")
}

export async function addStakeholderAction(projectId: number, name: string) {
  const stakeholder = await addStakeholder(projectId, name)
  revalidatePath("/")
  revalidatePath("/project")
  revalidatePath("/timeline")
  return stakeholder
}

export async function removeStakeholderAction(id: number) {
  await removeStakeholder(id)
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
