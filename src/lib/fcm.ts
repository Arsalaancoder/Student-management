// @ts-nocheck
import { initializeApp, getApps } from "firebase/app"
import { getMessaging, getToken, onMessage } from "firebase/messaging"
import { supabase } from "./supabase"
import { toast } from "sonner"

// Firebase Web Config extracted from google-services.json
const firebaseConfig = {
  apiKey: "AIzaSyBmvOscdWMl8Cs9oy0cUSb8fcQRrAo-NAw",
  authDomain: "edutrack-c69ba.firebaseapp.com",
  projectId: "edutrack-c69ba",
  storageBucket: "edutrack-c69ba.firebasestorage.app",
  messagingSenderId: "419803796985",
  appId: "1:419803796985:android:8c55f8070f3cc713df9928"
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

export async function registerFCMTokenForStudent(studentId: string): Promise<string | null> {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) {
      console.warn("FCM: Notifications not supported on this browser environment.")
      return null
    }

    if (Notification.permission === "denied") {
      console.log("FCM: Notification permission denied by user.")
      return null
    }

    const permission = await Notification.requestPermission()
    if (permission !== "granted") {
      console.log("FCM: Notification permission not granted.")
      return null
    }

    let messaging: any = null
    try {
      messaging = getMessaging(app)
    } catch (msgErr) {
      console.warn("FCM getMessaging warning:", msgErr)
      return null
    }

    // Retrieve FCM Token using Firebase Messaging
    const token = await getToken(messaging, {
      serviceWorkerRegistration: navigator.serviceWorker ? await navigator.serviceWorker.ready : undefined
    }).catch(err => {
      console.warn("FCM getToken warning:", err)
      return null
    })

    if (!token) {
      console.log("FCM: Could not obtain token from Firebase Web SDK.")
      return null
    }

    // Save token securely to Supabase student_fcm_tokens table (Phase 5 & 6)
    const { error } = await supabase
      .from("student_fcm_tokens" as any)
      .upsert({
        student_id: studentId,
        fcm_token: token,
        platform: "android",
        is_active: true,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: "student_id,fcm_token" })

    if (error) {
      console.error("Error saving FCM token to database:", error)
    } else {
      console.log("[FCM] Registered token for student:", studentId)
    }

    // Handle Foreground FCM Notifications (Phase 14)
    onMessage(messaging, (payload: any) => {
      console.log("[FCM Foreground Message]:", payload)
      const title = payload.notification?.title || payload.data?.title || "New Assignment"
      const body = payload.notification?.body || payload.data?.body || "New update received"

      toast(title, {
        description: body,
      })
    })

    return token
  } catch (err) {
    console.error("Exception during FCM registration:", err)
    return null
  }
}

export async function triggerFCMNotification(assignmentId: string): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("send-fcm-notification", {
      body: { assignment_id: assignmentId }
    })

    if (error) {
      console.warn("Edge function invocation warning:", error)
      return { success: false, message: error.message }
    }

    return { success: true, message: data?.message || "FCM notification triggered successfully." }
  } catch (err: any) {
    console.warn("Exception invoking send-fcm-notification function:", err)
    return { success: false, message: err.message || "Failed to trigger FCM." }
  }
}
