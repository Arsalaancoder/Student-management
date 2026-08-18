import { supabase } from "./supabase"

export type NotificationType = 
  | 'new_assignment' 
  | 'assignment_reminder' 
  | 'submission_confirmation' 
  | 'assignment_returned' 
  | 'assignment_approved'
  | 'grade_published' 
  | 'new_submission' 
  | 'resubmission'

export const createNotification = async (userId: string, title: string, message: string, type: NotificationType) => {
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      title,
      message,
      type,
      is_read: false
    })

    if (error) {
      console.error("Error creating notification:", error)
      return false
    }

    // Future placeholder: sendEmailNotification(userId, title, message)
    
    return true
  } catch (err) {
    console.error("Exception creating notification:", err)
    return false
  }
}

export const createNotificationForSubject = async (subjectId: string, title: string, message: string, type: NotificationType) => {
  try {
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('student_id')
      .eq('subject_id', subjectId)

    if (!enrollments || enrollments.length === 0) return true

    const notifications = enrollments.map(e => ({
      user_id: e.student_id,
      title,
      message,
      type,
      is_read: false
    }))

    const { error } = await supabase.from('notifications').insert(notifications)
    
    if (error) {
      console.error("Error creating bulk notifications:", error)
      return false
    }

    return true
  } catch (err) {
    console.error("Exception creating bulk notifications:", err)
    return false
  }
}

export const markAsRead = async (notificationId: string) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
  
  if (error) throw error
}

export const markAllAsRead = async (userId: string) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)
  
  if (error) throw error
}
