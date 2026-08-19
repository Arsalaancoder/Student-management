/**
 * Plagiarism API Service Call Helper
 * Dynamically resolves API endpoints for local node dev environment and Vercel production deployment.
 */

export async function triggerSimilarityCheck(submissionId: string): Promise<any> {
  const endpoints = [
    '/api/check-similarity',
    'http://localhost:3001/api/check-similarity'
  ];

  let lastError: any = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId })
      });

      if (response.ok) {
        return await response.json();
      } else {
        const errorData = await response.json().catch(() => ({}));
        lastError = new Error(errorData.error || `HTTP ${response.status}`);
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Failed to trigger similarity check");
}

export async function triggerPlagiarismRetry(submissionId: string): Promise<any> {
  const endpoints = [
    '/api/plagiarism/retry',
    '/api/plagiarism-retry',
    'http://localhost:3001/api/plagiarism/retry',
    'http://localhost:3001/api/check-similarity'
  ];

  let lastError: any = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId })
      });

      if (response.ok) {
        return await response.json();
      } else {
        const errorData = await response.json().catch(() => ({}));
        lastError = new Error(errorData.error || `HTTP ${response.status}`);
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Failed to retry plagiarism analysis");
}
