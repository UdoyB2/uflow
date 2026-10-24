// Reminder alerts: settings, ringtone and desktop notifications.
// Everything runs in the browser, so UFlow must be open in a tab for the in-app alert to ring.
// Alerts that reach a closed app come from Google Calendar (see googleCalendar.ts).

const PREFS_KEY = 'uflow-alert-prefs'
const FIRED_KEY = 'uflow-alerts-fired'

export type AlertPrefs = {
  /** UFlow pop-up, ringtone and desktop notification. */
  uflow: boolean
  /** Default for the "Also alert me through Google Calendar" tick box on new reminders. */
  google: boolean
  /** Which ringtone: one of TONES, or 'custom' for the student's own file. */
  tone: string
  /** Vibrate with the ringtone (Android phones only). */
  vibrate: boolean
  /** File name shown for the custom ringtone. */
  customName: string
}

const defaults: AlertPrefs = { uflow: true, google: true, tone: 'chime', vibrate: true, customName: '' }

export const getPrefs = (): AlertPrefs => {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }
  } catch {
    return defaults
  }
}

export const savePrefs = (prefs: AlertPrefs) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* storage can be blocked; the setting then lasts until the page is closed */
  }
}

/** Remembers which reminders already rang so a page refresh doesn’t ring them again. */
export const wasFired = (key: string) => {
  try {
    return (JSON.parse(localStorage.getItem(FIRED_KEY) || '[]') as string[]).includes(key)
  } catch {
    return false
  }
}

export const markFired = (key: string) => {
  try {
    const list = (JSON.parse(localStorage.getItem(FIRED_KEY) || '[]') as string[]).slice(-200)
    list.push(key)
    localStorage.setItem(FIRED_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

/* ---------- snoozes (medicine and tasks) and read notifications ---------- */

const SNOOZE_KEY = 'uflow-snoozes'
const SEEN_KEY = 'uflow-notices-seen'

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || '') as T
  } catch {
    return fallback
  }
}
const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage can be blocked; this only lasts until the page is closed */
  }
}

export const getSnooze = (key: string): number | undefined => readJson<Record<string, number>>(SNOOZE_KEY, {})[key]
export const setSnooze = (key: string, until: number) => {
  const all = readJson<Record<string, number>>(SNOOZE_KEY, {})
  const cutoff = Date.now() - 86400000
  for (const k of Object.keys(all)) if (all[k] < cutoff) delete all[k]
  all[key] = until
  writeJson(SNOOZE_KEY, all)
}

export const getSeen = () => readJson<string[]>(SEEN_KEY, [])
export const addSeen = (keys: string[]) => {
  const next = Array.from(new Set([...getSeen(), ...keys])).slice(-300)
  writeJson(SEEN_KEY, next)
  return next
}

/* ---------- ringtone (built-in tones are generated; students can also upload their own) ---------- */

type Note = { f: number; at: number; len: number; type?: OscillatorType; vol?: number }

export const TONES: { id: string; label: string; notes: Note[] }[] = [
  { id: 'chime', label: 'Chime', notes: [880, 1174.66, 1318.51].map((f, i) => ({ f, at: i * 0.18, len: 0.5 })) },
  { id: 'bell', label: 'Bell', notes: [{ f: 1046.5, at: 0, len: 1.3 }, { f: 2093, at: 0, len: 0.8, vol: 0.12 }, { f: 784, at: 0.55, len: 1.3 }, { f: 1568, at: 0.55, len: 0.8, vol: 0.12 }] },
  { id: 'melody', label: 'Melody', notes: [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].map((f, i) => ({ f, at: i * 0.2, len: 0.32, type: 'triangle' as const, vol: 0.4 })) },
  { id: 'beep', label: 'Beep', notes: [0, 0.3, 0.6].map((at) => ({ f: 1000, at, len: 0.18, type: 'square' as const, vol: 0.18 })) },
  { id: 'alarm', label: 'Alarm', notes: [0, 1, 2, 3, 4, 5].map((i) => ({ f: i % 2 ? 660 : 880, at: i * 0.16, len: 0.15, type: 'sawtooth' as const, vol: 0.16 })) },
  { id: 'soft', label: 'Soft', notes: [{ f: 440, at: 0, len: 0.9, vol: 0.25 }, { f: 554.37, at: 0.35, len: 0.9, vol: 0.25 }, { f: 659.25, at: 0.7, len: 1.1, vol: 0.25 }] },
]

export const MAX_TONE_MB = 5

let audio: AudioContext | null = null
let ringTimer: number | undefined
let stopTimer: number | undefined
let customPlayer: HTMLAudioElement | null = null
let customUrl: string | null = null

const getAudio = () => {
  if (!audio) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    audio = new Ctor()
  }
  return audio
}

/** Browsers keep sound blocked until the page has been clicked once. This unlocks it on the first click or key press. */
export function unlockAudioOnFirstTouch() {
  const unlock = () => {
    void getAudio()?.resume()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
  return () => {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
}

/* The custom sound is kept in this browser (IndexedDB), so it stays on this device only. */
const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('uflow-alerts', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('tones')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const dbRun = async <T,>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const request = action(db.transaction('tones', mode).objectStore('tones'))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveCustomTone(file: File) {
  if (!file.type.startsWith('audio/')) throw new Error('Choose an audio file (MP3, WAV, M4A or OGG).')
  if (file.size > MAX_TONE_MB * 1024 * 1024) throw new Error(`That file is over ${MAX_TONE_MB} MB. Choose a shorter sound.`)
  await dbRun('readwrite', (store) => store.put(file, 'custom'))
  if (customUrl) URL.revokeObjectURL(customUrl)
  customUrl = null
  return file.name
}

export async function clearCustomTone() {
  await dbRun('readwrite', (store) => store.delete('custom')).catch(() => undefined)
  if (customUrl) URL.revokeObjectURL(customUrl)
  customUrl = null
}

async function customToneUrl() {
  if (customUrl) return customUrl
  const blob = (await dbRun('readonly', (store) => store.get('custom')).catch(() => undefined)) as Blob | undefined
  if (!blob) return null
  customUrl = URL.createObjectURL(blob)
  return customUrl
}

const playNotes = (notes: Note[]) => {
  const ctx = getAudio()
  if (!ctx || ctx.state !== 'running') return
  const start = ctx.currentTime
  for (const note of notes) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = note.type ?? 'sine'
    osc.frequency.value = note.f
    const at = start + note.at
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(note.vol ?? 0.35, at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + note.len)
    osc.connect(gain).connect(ctx.destination)
    osc.start(at)
    osc.stop(at + note.len + 0.05)
  }
}

/* ---------- vibration (Android Chrome; iPhones don’t allow it) ---------- */

export const vibrationSupported = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
const buzz = () => {
  try {
    navigator.vibrate?.([500, 200, 500, 200, 500])
  } catch {
    /* ignore */
  }
}
const stopBuzz = () => {
  try {
    navigator.vibrate?.(0)
  } catch {
    /* ignore */
  }
}

const stopCustom = () => {
  if (customPlayer) {
    customPlayer.pause()
    customPlayer.currentTime = 0
  }
}

export function stopRingtone() {
  window.clearInterval(ringTimer)
  window.clearTimeout(stopTimer)
  ringTimer = undefined
  stopTimer = undefined
  stopCustom()
  stopBuzz()
}

async function playOnce(prefs: AlertPrefs, loop: boolean) {
  if (prefs.tone === 'custom') {
    const url = await customToneUrl()
    if (url) {
      customPlayer ??= new Audio()
      if (customPlayer.src !== url) customPlayer.src = url
      customPlayer.loop = loop
      customPlayer.currentTime = 0
      await customPlayer.play().catch(() => undefined)
      return
    }
  }
  const tone = TONES.find((item) => item.id === prefs.tone) ?? TONES[0]
  await getAudio()?.resume()
  playNotes(tone.notes)
}

/** Rings for up to 30 seconds (or until stopRingtone()), with vibration if switched on. */
export function startRingtone(maxSeconds = 30) {
  if (ringTimer !== undefined) return
  const prefs = getPrefs()
  const round = () => {
    // A custom sound loops by itself; built-in tones repeat every 2.5 seconds.
    if (prefs.tone !== 'custom') void playOnce(prefs, false)
    if (prefs.vibrate) buzz()
  }
  if (prefs.tone === 'custom') void playOnce(prefs, true)
  round()
  ringTimer = window.setInterval(round, 2500)
  stopTimer = window.setTimeout(stopRingtone, maxSeconds * 1000)
}

/** Plays the chosen tone once (about 5 seconds for a custom file), with a short buzz. */
export function playTestTone(overrides: Partial<AlertPrefs> = {}) {
  stopRingtone()
  const prefs = { ...getPrefs(), ...overrides }
  void playOnce(prefs, false)
  if (prefs.vibrate) buzz()
  if (prefs.tone === 'custom') stopTimer = window.setTimeout(stopRingtone, 5000)
}

/* ---------- desktop notifications ---------- */

export const desktopSupported = () => typeof Notification !== 'undefined'
export const desktopPermission = () => (desktopSupported() ? Notification.permission : 'denied')

export async function askDesktopPermission() {
  if (!desktopSupported()) return 'denied' as NotificationPermission
  return Notification.requestPermission()
}

export function showDesktopNotification(title: string, body: string) {
  if (!desktopSupported() || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, tag: `uflow-${title}-${body}`, requireInteraction: true })
  } catch {
    /* Android Chrome only allows notifications from a service worker; the pop-up still shows */
  }
}
