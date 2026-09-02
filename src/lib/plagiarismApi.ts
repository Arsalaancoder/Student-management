export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const res = reader.result as string
      const base64 = res.includes(",") ? res.split(",")[1] : res
      resolve(base64)
    }
    reader.onerror = (err) => reject(err)
    reader.readAsDataURL(file)
  })
}

export async function checkPlagiarismPreSubmission(
  file: File,
  assignmentId: string,
  studentId: string
): Promise<any> {
  const base64 = await fileToBase64(file)
  const endpoint = "/api/check-plagiarism-presubmit"

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 45000)

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type,
        assignmentId,
        studentId
      })
    })
    clearTimeout(timeoutId)

    const contentType = res.headers.get("content-type") || ""
    if (res.ok) {
      if (contentType.includes("application/json")) {
        const data = await res.json()
        console.log("[PLAGIARISM API] presubmit response success:", {
          status: res.status,
          contentType,
          allowed: data?.allowed,
          plagiarismStatus: data?.status,
          finalScore: data?.finalScore
        })
        return data
      } else {
        const text = await res.text()
        console.error("[PLAGIARISM API] non-JSON response:", { status: res.status, textPreview: text.substring(0, 100) })
        return {
          success: false,
          allowed: false,
          status: 'failed',
          errorCode: 'NON_JSON_RESPONSE',
          message: 'Originality service is temporarily unavailable. Your assignment has not been submitted. Please try again shortly.'
        }
      }
    } else {
      let errorData: any = {}
      if (contentType.includes("application/json")) {
        errorData = await res.json().catch(() => ({}))
      }
      console.error("[PLAGIARISM API] presubmit error response:", {
        status: res.status,
        contentType,
        errorCode: errorData.errorCode || errorData.errorType || 'HTTP_ERROR',
        message: errorData.message || errorData.error
      })
      return {
        success: false,
        allowed: false,
        status: 'failed',
        errorCode: errorData.errorCode || errorData.errorType || `HTTP_${res.status}`,
        message: errorData.message || errorData.error || `Originality service is temporarily unavailable. Your assignment has not been submitted. Please try again shortly.`
      }
    }
  } catch (err: any) {
    clearTimeout(timeoutId)
    console.error("[PLAGIARISM API] presubmit network exception:", { name: err.name, message: err.message })
    if (err.name === 'AbortError') {
      return {
        success: false,
        allowed: false,
        status: 'failed',
        errorCode: 'TIMEOUT',
        message: "Plagiarism check timed out. Please check your connection and try again."
      }
    }
    return {
      success: false,
      allowed: false,
      status: 'failed',
      errorCode: 'NETWORK_ERROR',
      message: err.message || "Originality service is temporarily unavailable. Your assignment has not been submitted. Please try again shortly."
    }
  }
}

export async function finalizePlagiarismCheck(payload: {
  checkId?: string
  submissionId: string
  targetFeaturesData?: any
  matchesToInsert?: any[]
  finalScore?: number
  status?: string
}): Promise<any> {
  const endpoint = "/api/finalize-plagiarism-check"

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 20000)

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(payload)
    })
    clearTimeout(timeoutId)

    const contentType = res.headers.get("content-type") || ""
    if (res.ok && contentType.includes("application/json")) {
      return await res.json()
    }
    return { success: true, message: 'Finalized successfully.' }
  } catch (err: any) {
    clearTimeout(timeoutId)
    console.warn("[Finalize API] Network error or timeout:", err?.message || err)
    return { success: false, error: err?.message }
  }
}

export async function triggerSimilarityCheck(submissionId: string): Promise<any> {
  const endpoint = "/api/check-similarity"
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ submissionId })
    })
    clearTimeout(timeoutId)

    const contentType = response.headers.get("content-type") || ""
    if (response.ok && contentType.includes("application/json")) {
      return await response.json()
    }
    const errText = await response.text().catch(() => "")
    throw new Error(`Similarity check server error: ${errText.substring(0, 100)}`)
  } catch (err: any) {
    clearTimeout(timeoutId)
    console.error("triggerSimilarityCheck error:", err)
    return { success: false, error: err?.message || "Similarity check unavailable" }
  }
}

export async function triggerPlagiarismRetry(submissionId: string): Promise<any> {
  return triggerSimilarityCheck(submissionId)
}
