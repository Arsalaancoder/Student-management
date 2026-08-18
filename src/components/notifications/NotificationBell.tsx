import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { markAsRead, markAllAsRead } from "@/lib/notifications"
import { Bell, Clock, BookOpen, AlertCircle, FileText, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"

export default function NotificationBell() {
  const { profile } = useAuth()
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!profile) return

    const fetchNotifications = async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(20)

      if (error) {
        console.error("Error fetching notifications:", error)
        return
      }

      setNotifications(data || [])
      setUnreadCount(data?.filter(n => !n.is_read).length || 0)
    }

    fetchNotifications()

    // Real-time subscription
    const subscription = supabase
      .channel('public:notifications')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications',
        filter: `user_id=eq.${profile.id}`
      }, (payload) => {
        setNotifications(prev => [payload.new, ...prev].slice(0, 20))
        setUnreadCount(prev => prev + 1)
        toast(payload.new.title, {
          description: payload.new.message,
        })
      })
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'notifications',
        filter: `user_id=eq.${profile.id}`
      }, (payload) => {
        setNotifications(prev => prev.map(n => n.id === payload.new.id ? payload.new : n))
        if (payload.new.is_read && !payload.old.is_read) {
          setUnreadCount(prev => Math.max(0, prev - 1))
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [profile])

  const handleMarkAsRead = async (id: string, isRead: boolean) => {
    if (isRead) return
    try {
      await markAsRead(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (err) {
      console.error("Failed to mark as read", err)
    }
  }

  const handleMarkAllAsRead = async () => {
    if (!profile || unreadCount === 0) return
    try {
      await markAllAsRead(profile.id)
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch (err) {
      console.error("Failed to mark all as read", err)
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'new_assignment': return <BookOpen className="h-4 w-4 text-blue-500" />
      case 'assignment_reminder': return <Clock className="h-4 w-4 text-orange-500" />
      case 'submission_confirmation': return <FileText className="h-4 w-4 text-indigo-500" />
      case 'assignment_returned': return <AlertCircle className="h-4 w-4 text-red-500" />
      case 'grade_published': return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'new_submission': return <FileText className="h-4 w-4 text-purple-500" />
      case 'resubmission': return <FileText className="h-4 w-4 text-teal-500" />
      default: return <Bell className="h-4 w-4 text-slate-500" />
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-slate-400 hover:text-slate-600 rounded-full h-10 w-10">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-white"></span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 sm:w-96 p-0 rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
        <div className="flex items-center justify-between p-4 bg-slate-50 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            Notifications
            {unreadCount > 0 && (
              <span className="bg-primary text-primary-foreground text-[10px] px-2 py-0.5 rounded-full">
                {unreadCount} new
              </span>
            )}
          </h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-primary hover:bg-transparent hover:text-primary/80" onClick={handleMarkAllAsRead}>
              Mark all as read
            </Button>
          )}
        </div>
        
        <div className="max-h-[60vh] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-slate-500 flex flex-col items-center gap-2">
              <Bell className="h-8 w-8 opacity-20" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-slate-50">
              {notifications.map(n => (
                <div 
                  key={n.id} 
                  className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer flex gap-3 ${!n.is_read ? 'bg-indigo-50/30' : ''}`}
                  onClick={() => handleMarkAsRead(n.id, n.is_read)}
                >
                  <div className={`mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${!n.is_read ? 'bg-white shadow-sm' : 'bg-slate-100'}`}>
                    {getIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm truncate pr-2 ${!n.is_read ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                        {n.title}
                      </p>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                        {new Date(n.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className={`text-xs mt-1 line-clamp-2 ${!n.is_read ? 'text-slate-600 font-medium' : 'text-slate-500'}`}>
                      {n.message}
                    </p>
                  </div>
                  {!n.is_read && (
                    <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
