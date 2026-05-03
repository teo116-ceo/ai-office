import type { UploadedFile } from '@/types'
import { apiHeaders } from '@/utils/apiHeaders'

export const MAX_SERVER_ZIP_BYTES = 500 * 1024 * 1024

type ZipAnalysisResult = Pick<UploadedFile, 'kind' | 'summary' | 'promptContext' | 'warnings' | 'archive'>

export async function analyzeZipOnServer(file: File): Promise<ZipAnalysisResult> {
  const response = await fetch('/api/analyze-zip', {
    method: 'POST',
    headers: apiHeaders({
      'Content-Type': 'application/zip',
      'X-File-Name': encodeURIComponent(file.name),
      'X-File-Size': String(file.size),
    }),
    body: file,
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: 'ZIP analysis failed.' })) as { error?: string }
    throw new Error(errorBody.error ?? 'ZIP analysis failed.')
  }

  return response.json() as Promise<ZipAnalysisResult>
}
