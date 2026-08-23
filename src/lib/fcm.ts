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

export async function registerFCMTokenForStudent(userId: string): Promise<string | null> {
  try {
    if (typeof window === "undefined" || !userId) return null

    // 1. Check if Android TWA passed a native FCM token via URL parameter or localStorage
    const urlParams = new URLSearchParams(window.location.search)
    const nativeTokenFromUrl = urlParams.get("native_fcm_token")
    if (nativeTokenFromUrl) {
      localStorage.setItem("native_fcm_token", nativeTokenFromUrl)
    }

    const nativeToken = localStorage.getItem("native_fcm_token")
    if (nativeToken && userId) {
      // Deactivate this token for any other user to prevent cross-account push leaks
      await supabase
        .from("student_fcm_tokens" as any)
        .update({ is_active: false })
        .eq("fcm_token", nativeToken)
        .neq("student_id", userId)

      await supabase
        .from("student_fcm_tokens" as any)
        .upsert({
          student_id: userId,
          fcm_token: nativeToken,
          platform: "android", // NATIVE ANDROID APK TOKEN
          is_active: true,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: "student_id,fcm_token" })
        .then(({ error }) => {
          if (!error) console.log("[FCM Native] Registered native Android token for user:", userId)
          else console.warn("[FCM Native] Token store warning:", error)
        })
    }

    // 2. Register Web FCM Token as 'web' platform for Chrome / Edge / Safari / PWA
    if (!("Notification" in window)) {
      return nativeToken || null
    }

    if (Notification.permission === "granted" || (await Notification.requestPermission()) === "granted") {
      let messaging: any = null
      try {
        messaging = getMessaging(app)
      } catch (msgErr) {
        console.warn("FCM getMessaging warning:", msgErr)
        return nativeToken || null
      }

      let swRegistration: ServiceWorkerRegistration | undefined = undefined
      if ("serviceWorker" in navigator) {
        try {
          swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js")
        } catch (swErr) {
          swRegistration = await navigator.serviceWorker.ready.catch(() => undefined)
        }
      }

      const webToken = await getToken(messaging, {
        serviceWorkerRegistration: swRegistration
      }).catch(err => {
        console.warn("FCM getToken warning:", err)
        return null
      })

      if (webToken && userId && webToken !== nativeToken) {
        // Deactivate this web token for any other user to prevent cross-account push leaks
        await supabase
          .from("student_fcm_tokens" as any)
          .update({ is_active: false })
          .eq("fcm_token", webToken)
          .neq("student_id", userId)

        await supabase
          .from("student_fcm_tokens" as any)
          .upsert({
            student_id: userId,
            fcm_token: webToken,
            platform: "web", // DISTINCT WEB CHROME / BROWSER TOKEN
            is_active: true,
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: "student_id,fcm_token" })

        onMessage(messaging, (payload: any) => {
          const title = payload.notification?.title || payload.data?.title || "New Notification"
          const body = payload.notification?.body || payload.data?.body || "New update received"

          toast(title, { description: body })
        })

        return webToken
      }
    }

    return nativeToken || null
  } catch (err) {
    console.error("Exception during FCM registration:", err)
    return null
  }
}

export async function triggerDirectFCMTest(token: string, title?: string, body?: string): Promise<{
  success: boolean
  message: string
  sent_count?: number
  error?: any
}> {
  try {
    const { data, error } = await supabase.functions.invoke("send-fcm-notification", {
      body: {
        test_token: token,
        test_title: title || "EduTrack Direct Test",
        test_body: body || "Direct FCM notification test."
      }
    })

    if (error) {
      return { success: false, message: error.message, sent_count: 0, error }
    }

    return {
      success: data?.status === "success" || data?.sent_count > 0,
      sent_count: data?.sent_count ?? 0,
      message: data?.message || "Direct FCM test triggered.",
      error: data?.error
    }
  } catch (err: any) {
    return { success: false, message: err.message || "Failed direct FCM test.", sent_count: 0, error: err }
  }
}

export async function triggerFCMNotification(assignmentId: string): Promise<{
  success: boolean
  message: string
  sent_count?: number
  failed_count?: number
  eligible_tokens?: number
}> {
  try {
    const { data, error } = await supabase.functions.invoke("send-fcm-notification", {
      body: { assignment_id: assignmentId }
    })

    if (error) {
      console.warn("Edge function invocation warning:", error)
      return { success: false, message: error.message, sent_count: 0, failed_count: 0 }
    }

    return {
      success: true,
      sent_count: data?.sent_count ?? 0,
      failed_count: data?.failed_count ?? 0,
      eligible_tokens: data?.eligible_tokens ?? 0,
      message: data?.message || "Push notifications processed successfully."
    }
  } catch (err: any) {
    console.warn("Exception invoking send-fcm-notification function:", err)
    return { success: false, message: err.message || "Failed to trigger FCM.", sent_count: 0, failed_count: 0 }
  }
}

export async function triggerSubmissionNotification(submissionId: string): Promise<{
  success: boolean
  message: string
  sent_count?: number
  failed_count?: number
}> {
  try {
    const { data, error } = await supabase.functions.invoke("send-fcm-notification", {
      body: { submission_id: submissionId }
    })

    if (error) {
      console.warn("Edge function invocation warning for submission:", error)
      return { success: false, message: error.message, sent_count: 0, failed_count: 0 }
    }

    return {
      success: true,
      sent_count: data?.sent_count ?? 0,
      failed_count: data?.failed_count ?? 0,
      message: data?.message || "Submission notification sent."
    }
  } catch (err: any) {
    console.warn("Exception invoking send-fcm-notification for submission:", err)
    return { success: false, message: err.message || "Failed to trigger submission notification.", sent_count: 0, failed_count: 0 }
  }
}

export async function triggerGradeNotification(submissionId: string): Promise<{
  success: boolean
  message: string
  sent_count?: number
  failed_count?: number
}> {
  try {
    const { data, error } = await supabase.functions.invoke("send-fcm-notification", {
      body: { submission_id: submissionId, type: "assignment_graded" }
    })

    if (error) {
      console.warn("Edge function invocation warning for grade notification:", error)
      return { success: false, message: error.message, sent_count: 0, failed_count: 0 }
    }

    return {
      success: true,
      sent_count: data?.sent_count ?? 0,
      failed_count: data?.failed_count ?? 0,
      message: data?.message || "Grade notification sent."
    }
  } catch (err: any) {
    console.warn("Exception invoking send-fcm-notification for grade notification:", err)
    return { success: false, message: err.message || "Failed to trigger grade notification.", sent_count: 0, failed_count: 0 }
  }
}


