import { useState } from "react"
import { Outlet, Link, useLocation } from "react-router-dom"
import { 
  LayoutDashboard, 
  FileText, 
  CheckSquare, 
  Search, 
  Menu,
  LogOut,
  User,
  Plus,
  Zap,
  BarChart3
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useAuth } from "@/contexts/AuthContext"
import NotificationBell from "@/components/notifications/NotificationBell"
import EduTrackLogo from "@/components/EduTrackLogo"

interface SidebarItem {
  icon: React.ElementType
  label: string
  href: string
}

export default function DashboardLayout({ type = "student" }: { type?: "student" | "professor" }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  const studentLinks: SidebarItem[] = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/student/dashboard" },
    { icon: FileText, label: "Assignments", href: "/student/assignments" },
    { icon: CheckSquare, label: "Grades", href: "/student/grades" },
    { icon: Zap, label: "Credit Wallet", href: "/student/credits" },
    { icon: BarChart3, label: "Analytics", href: "/student/analytics" },
    { icon: User, label: "Profile", href: "/student/profile" },
  ]

  const professorLinks: SidebarItem[] = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/professor/dashboard" },
    { icon: FileText, label: "Assignments", href: "/professor/assignments" },
    { icon: CheckSquare, label: "Submissions", href: "/professor/submissions" },
    { icon: BarChart3, label: "Analytics", href: "/professor/analytics" },
    { icon: User, label: "Profile", href: "/professor/profile" },
  ]

  const { profile, signOut } = useAuth()

  const links = type === "student" ? studentLinks : professorLinks

  return (
    <div className="min-h-screen bg-[#F4F7FE] flex p-4 gap-4">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 md:hidden rounded-[2rem]"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-4 left-4 z-50 w-64 bg-white rounded-[2rem] shadow-sm transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:flex-shrink-0 flex flex-col
        ${sidebarOpen ? "translate-x-0" : "-translate-x-[120%]"}
      `}>
        <div className="h-24 flex items-center px-6">
          <Link to={`/${type}/dashboard`}>
            <EduTrackLogo size="md" />
          </Link>
        </div>

        <nav className="px-4 flex-1 space-y-1 mt-2 overflow-y-auto pb-4">
          {links.map((link) => {
            // Check if the link is active — also handle sub-routes (e.g. /professor/subjects/123)
            const isActive = location.pathname === link.href || 
              (link.href !== `/${type}/dashboard` && location.pathname.startsWith(link.href))
            return (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-4 px-5 py-3.5 rounded-2xl text-sm font-semibold transition-all ${
                  isActive 
                    ? "bg-[#E6F0FF] text-[#1E5EFF] shadow-sm" 
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <link.icon className="h-5 w-5 flex-shrink-0" />
                {link.label}
              </Link>
            )
          })}
        </nav>
        {/* No Settings link — removed per requirements */}
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#F4F7FE] rounded-[2rem] overflow-hidden relative">
        {/* Top Header */}
        <header className="h-24 flex items-center justify-between px-6 lg:px-10 z-10">
          <div className="flex items-center gap-4 flex-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="md:hidden rounded-full bg-white shadow-sm"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            
            <div className="hidden sm:flex max-w-md w-full relative">
              <Search className="absolute left-4 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search..."
                className="w-full pl-12 h-11 bg-white border-none rounded-full shadow-sm focus-visible:ring-1 focus-visible:ring-primary/20"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            {type === "professor" && (
              <Button asChild variant="ghost" className="relative h-11 px-4 rounded-full bg-[#FCE8F3] text-[#D84C93] hover:bg-[#FCE8F3]/80 hover:text-[#D84C93] font-semibold gap-2 hidden lg:flex shadow-sm">
                <Link to="/professor/assignments/create">
                  <Plus className="h-4 w-4" />
                  Create Assignment
                </Link>
              </Button>
            )}

            <NotificationBell />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
                  <Avatar className="h-11 w-11 border-2 border-white shadow-sm">
                    <AvatarImage src={profile?.profile_photo_url || ""} alt="User avatar" />
                    <AvatarFallback className="bg-primary/10 text-primary uppercase">
                      {profile?.full_name ? profile.full_name.charAt(0) : (type === "student" ? "S" : "P")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:flex flex-col">
                    <span className="text-xs text-muted-foreground font-medium">Hello</span>
                    <span className="text-sm font-bold leading-none text-foreground capitalize">
                      {profile?.full_name || "User"}
                    </span>
                  </div>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 rounded-2xl" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none capitalize">
                      {profile?.full_name || "User"}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {profile?.email || "No email"}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-1">
                      {profile?.role || type}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="rounded-xl cursor-pointer">
                  <Link to={`/${type}/profile`} className="w-full">
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="rounded-xl text-destructive focus:text-destructive cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto px-6 lg:px-10 pb-8 scrollbar-hide">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
