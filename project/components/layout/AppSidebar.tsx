"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { HomeIcon, UsersIcon, FolderIcon, GanttChartIcon, CircleAlertIcon } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const navItems = [
  { href: "/", label: "ダッシュボード", icon: HomeIcon },
  { href: "/user", label: "ユーザー一覧", icon: UsersIcon },
  { href: "/project", label: "案件一覧", icon: FolderIcon },
  { href: "/timeline", label: "タイムライン", icon: GanttChartIcon },
  { href: "https://github.com/5iveInc/project_pre-scheduler/issues", label: "Issue", icon: CircleAlertIcon, external: true },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4">
        <span className="text-base font-bold">5ive</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                render={<Link href={item.href} {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} />}
                isActive={pathname === item.href}
                tooltip={item.label}
              >
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  )
}
