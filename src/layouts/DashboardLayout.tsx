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
  BarChart3,
  ShieldAlert,
  Users,
  X
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
    { icon: ShieldAlert, label: "Plagiarism Monitor", href: "/professor/plagiarism" },
    { icon: Users, label: "Student Progress", href: "/professor/student-progress" },
    { icon: User, label: "Profile", href: "/professor/profile" },
  ]

  const { profile, signOut } = useAuth()

  const links = type === "student" ? studentLinks : professorLinks

  return (
    <div className="min-h-screen bg-[#F4F7FE] flex p-2 sm:p-4 gap-2 sm:gap-4 pb-20 md:pb-4">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-2 left-2 z-50 w-72 sm:w-64 bg-white rounded-[2rem] shadow-xl transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:flex-shrink-0 flex flex-col
        ${sidebarOpen ? "translate-x-0" : "-translate-x-[120%]"}
      `}>
        <div className="h-20 sm:h-24 flex items-center justify-between px-6">
          <Link to={`/${type}/dashboard`} onClick={() => setSidebarOpen(false)}>
            <EduTrackLogo size="md" />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden rounded-full hover:bg-slate-100"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5 text-slate-500" />
          </Button>
        </div>

        <nav className="px-4 flex-1 space-y-1.5 mt-2 overflow-y-auto pb-4 custom-scrollbar">
          {links.map((link) => {
            const isActive = location.pathname === link.href ||
              (link.href !== `/${type}/dashboard` && location.pathname.startsWith(link.href))
            return (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-4 px-5 py-3.5 rounded-2xl text-sm font-semibold transition-all ${isActive
                    ? "bg-[#E6F0FF] text-[#1E5EFF] shadow-xs"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
              >
                <link.icon className="h-5 w-5 flex-shrink-0" />
                {link.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#F4F7FE] rounded-[1.5rem] sm:rounded-[2rem] overflow-hidden relative">
        {/* Top Header */}
        <header className="h-16 sm:h-24 flex items-center justify-between px-3 sm:px-6 lg:px-10 z-10 shrink-0">
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden rounded-2xl bg-white shadow-xs h-10 w-10 shrink-0"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5 text-slate-700" />
            </Button>

            <div className="md:hidden flex items-center min-w-0">
              <EduTrackLogo size="xs" iconOnly />
            </div>

            <div className="hidden sm:flex max-w-md w-full relative">
              <Search className="absolute left-4 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search..."
                className="w-full pl-12 h-11 bg-white border-none rounded-full shadow-xs focus-visible:ring-1 focus-visible:ring-primary/20"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-6 shrink-0">
            {type === "professor" && (
              <Button asChild variant="ghost" className="relative h-11 px-4 rounded-full bg-[#FCE8F3] text-[#D84C93] hover:bg-[#FCE8F3]/80 hover:text-[#D84C93] font-semibold gap-2 hidden lg:flex shadow-xs">
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
                  <Avatar className="h-9 w-9 sm:h-11 sm:w-11 border-2 border-white shadow-xs">
                    <AvatarImage src={profile?.profile_photo_url || ""} alt="User avatar" />
                    <AvatarFallback className="bg-primary/10 text-primary uppercase font-bold">
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
              <DropdownMenuContent className="w-56 rounded-2xl shadow-xl" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-bold leading-none capitalize text-[#0B1E43]">
                      {profile?.full_name || "User"}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground truncate">
                      {profile?.email || "No email"}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-primary font-bold mt-1">
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
        <main className="flex-1 overflow-auto px-3 sm:px-6 lg:px-10 pb-8 custom-scrollbar">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-100 md:hidden px-2 py-2 flex items-center justify-around shadow-lg">
        {links.map((link) => {
          const isActive = location.pathname === link.href ||
            (link.href !== `/${type}/dashboard` && location.pathname.startsWith(link.href))
          return (
            <Link
              key={link.href}
              to={link.href}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${isActive ? "text-[#1E5EFF] font-bold" : "text-slate-500 font-medium hover:text-slate-900"
                }`}
            >
              <link.icon className={`h-5 w-5 ${isActive ? "scale-110" : ""} transition-transform`} />
              <span className="text-[10px] tracking-tight">{link.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
