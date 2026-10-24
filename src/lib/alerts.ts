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
}

const defaults: AlertPrefs = { uflow: true, google: true }

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

/* ---------- ringtone (generated, no sound file needed) ---------- */

let audio: AudioContext | null = null
let ringTimer: number | undefined
let stopTimer: number | undefined

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

const chime = () => {
  const ctx = getAudio()
  if (!ctx || ctx.state !== 'running') return
  const start = ctx.currentTime
  ;[880, 1174.66, 1318.51].forEach((frequency, index) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = frequency
    const at = start + index * 0.18
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5)
    osc.connect(gain).connect(ctx.destination)
    osc.start(at)
    osc.stop(at + 0.55)
  })
}

export function stopRingtone() {
  window.clearInterval(ringTimer)
  window.clearTimeout(stopTimer)
  ringTimer = undefined
  stopTimer = undefined
}

/** Repeats the chime every 2.5 seconds for up to 30 seconds, or until stopRingtone(). */
export function startRingtone(maxSeconds = 30) {
  if (ringTimer !== undefined) return
  void getAudio()?.resume().then(chime)
  ringTimer = window.setInterval(chime, 2500)
  stopTimer = window.setTimeout(stopRingtone, maxSeconds * 1000)
}

export function playTestTone() {
  void getAudio()?.resume().then(chime)
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
