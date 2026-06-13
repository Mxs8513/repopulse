// Client-side API failure classification. Turns the browser's opaque
// "Failed to fetch" (and bare HTTP failures) into messages that name the
// route, the status, a safe reason, and what to do next.

export interface ClassifiedApiError {
  route: string
  status: number | null
  message: string
}

/**
 * Classify a thrown fetch() error — typically TypeError("Failed to fetch"),
 * which means the request never got an HTTP response (server restarted,
 * connection dropped, navigation aborted it).
 */
export function classifyFetchFailure(route: string, error: unknown): ClassifiedApiError {
  const raw = error instanceof Error ? error.message : String(error)
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(raw)) {
    return {
      route,
      status: null,
      message:
        `Network error calling ${route} — the request never reached the server. ` +
        'The dev server may have restarted (common after .env or code changes). Retry the action.',
    }
  }
  if (/abort/i.test(raw)) {
    return {
      route,
      status: null,
      message: `Request to ${route} was cancelled before completing. Retry the action.`,
    }
  }
  return { route, status: null, message: `Unexpected error calling ${route}: ${raw}. Retry the action.` }
}

/** Describe a non-OK HTTP response using the server's structured error when present. */
export function describeHttpFailure(
  route: string,
  status: number,
  serverError?: string | null
): ClassifiedApiError {
  const base = serverError?.trim()
    ? serverError.trim()
    : status === 429
      ? 'Rate limited.'
      : status >= 500
        ? 'The server hit an internal error.'
        : 'The request was rejected.'
  return {
    route,
    status,
    message: `${route} returned HTTP ${status}: ${base}${/retry|resets/i.test(base) ? '' : ' Retry after fixing the cause.'}`,
  }
}

/**
 * fetch + JSON wrapper used by agent workflow pages. Throws Error with a
 * classified, user-readable message; never the bare "Failed to fetch".
 */
export async function callApi<T>(route: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(route, init)
  } catch (error) {
    throw new Error(classifyFetchFailure(route, error).message)
  }
  let data: any = null
  try {
    data = await res.json()
  } catch {
    // non-JSON body; fall through with null
  }
  if (!res.ok) {
    throw new Error(describeHttpFailure(route, res.status, data?.error).message)
  }
  return data as T
}
