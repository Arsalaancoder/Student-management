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
        return await res.json()
      } else {
        const text = await res.text()
        throw new Error(`Server returned non-JSON response (${res.status}): ${text.substring(0, 80)}`)
      }
    } else {
      if (contentType.includes("application/json")) {
        const errorData = await res.json().catch(() => ({}))
        return {
          success: false,
          allowed: false,
          status: 'failed',
          message: errorData.message || errorData.error || `Originality service is temporarily unavailable. Your assignment has not been submitted. Please try again shortly.`
        }
      }
      throw new Error(`Originality service is temporarily unavailable. Your assignment has not been submitted. Please try again shortly.`)
    }
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      throw new Error("Plagiarism check timed out. Please check your connection and try again.")
    }
    throw err || new Error("Plagiarism checking service is temporarily unavailable. Please try again.")
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
