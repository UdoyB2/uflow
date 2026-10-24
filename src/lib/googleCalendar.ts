// Google Calendar helper.
// Uses Google Identity Services to ask the student for permission, then talks to the
// Google Calendar REST API directly from the browser. Nothing is sent to any server of ours.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const LINKED_KEY = 'uflow-gcal-linked'

export const googleCalendarConfigured = Boolean(CLIENT_ID)

export class GoogleAuthError extends Error {
  constructor() {
    super('Your Google session expired. Reconnect to keep syncing.')
  }
}

export type GoogleEvent = {
  id: string
  title: string
  start: number
  end: number
  allDay: boolean
  link?: string
  location?: string
}

type NewEvent = { title: string; start: number; end: number; allDay: boolean; location?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GoogleGlobal = any

let token: { value: string; expires: number } | null = null
let scriptPromise: Promise<void> | null = null

export const googleConnected = () => Boolean(token && token.expires > Date.now() + 30000)

/** True if the student connected before, even though the 1-hour token has since expired. */
export const googleWasLinked = () => {
  try {
    return localStorage.getItem(LINKED_KEY) === '1'
  } catch {
    return false
  }
}

const setLinked = (value: boolean) => {
  try {
    if (value) localStorage.setItem(LINKED_KEY, '1')
    else localStorage.removeItem(LINKED_KEY)
  } catch {
    /* storage can be blocked; the feature still works for this visit */
  }
}

function loadScript(): Promise<void> {
  if ((window as unknown as { google?: GoogleGlobal }).google?.accounts?.oauth2) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Couldn’t load Google sign-in. Check your internet connection.'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

/** Opens Google’s permission popup. Must be called from a button click. */
export async function connectGoogle(emailHint?: string | null): Promise<void> {
  if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID is missing. See GOOGLE_CALENDAR_SETUP.md.')
  await loadScript()
  const google = (window as unknown as { google: GoogleGlobal }).google
  await new Promise<void>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      login_hint: emailHint || undefined,
      callback: (response: { access_token?: string; expires_in?: number | string; error?: string; error_description?: string }) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || 'Google sign-in was cancelled.'))
          return
        }
        token = { value: response.access_token, expires: Date.now() + Number(response.expires_in ?? 3600) * 1000 }
        setLinked(true)
        resolve()
      },
      error_callback: (error: { type?: string; message?: string }) => {
        reject(new Error(error.type === 'popup_closed' ? 'The Google window was closed before finishing.' : error.message || 'Google sign-in failed.'))
      },
    })
    client.requestAccessToken()
  })
}

export function disconnectGoogle() {
  const google = (window as unknown as { google?: GoogleGlobal }).google
  if (token && google?.accounts?.oauth2) google.accounts.oauth2.revoke(token.value, () => undefined)
  token = null
  setLinked(false)
}

async function request(url: string, init: RequestInit = {}) {
  if (!googleConnected() || !token) throw new GoogleAuthError()
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (response.status === 401) {
    token = null
    throw new GoogleAuthError()
  }
  if (!response.ok) {
    if (response.status === 404 || response.status === 410) return null
    const body = await response.json().catch(() => null)
    throw new Error(body?.error?.message || `Google Calendar returned an error (${response.status}).`)
  }
  return response.status === 204 ? null : response.json()
}

const dayString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const parseDay = (value: string) => {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

type RawEvent = {
  id: string
  status?: string
  summary?: string
  location?: string
  htmlLink?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
}

export async function listGoogleEvents(from: Date, to: Date): Promise<GoogleEvent[]> {
  const events: GoogleEvent[] = []
  let pageToken = ''
  do {
    const params = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const data = (await request(`${API}?${params}`)) as { items?: RawEvent[]; nextPageToken?: string } | null
    for (const item of data?.items ?? []) {
      if (item.status === 'cancelled' || !item.start || !item.end) continue
      const allDay = Boolean(item.start.date)
      events.push({
        id: item.id,
        title: item.summary || '(No title)',
        start: allDay ? parseDay(item.start.date as string) : new Date(item.start.dateTime as string).getTime(),
        end: allDay ? parseDay((item.end.date || item.start.date) as string) : new Date(item.end.dateTime as string).getTime(),
        allDay,
        link: item.htmlLink,
        location: item.location,
      })
    }
    pageToken = data?.nextPageToken ?? ''
  } while (pageToken)
  return events
}

/** Adds an event to the student’s primary Google calendar and returns its Google id. */
export async function createGoogleEvent(event: NewEvent): Promise<string> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const body = event.allDay
    ? {
        summary: event.title,
        location: event.location || undefined,
        start: { date: dayString(new Date(event.start)) },
        // Google treats the end date of an all-day event as exclusive.
        end: { date: dayString(new Date(event.end)) },
      }
    : {
        summary: event.title,
        location: event.location || undefined,
        start: { dateTime: new Date(event.start).toISOString(), timeZone },
        end: { dateTime: new Date(event.end).toISOString(), timeZone },
      }
  const data = (await request(API, { method: 'POST', body: JSON.stringify(body) })) as { id: string } | null
  if (!data) throw new Error('Google Calendar didn’t accept the event.')
  return data.id
}

export async function deleteGoogleEvent(id: string): Promise<void> {
  await request(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
