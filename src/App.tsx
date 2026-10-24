import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { auth, firebaseReady } from './lib/firebase'
import { SYNC_ERROR_EVENT, useCollection } from './lib/useCollection'
import { MAX_FILE_BYTES, MAX_FILE_MB, deletePdf, fetchPdfBlob, uploadPdf } from './lib/files'
import {
  GoogleAuthError,
  connectGoogle,
  createGoogleEvent,
  createGoogleReminder,
  deleteGoogleEvent,
  updateGoogleReminder,
  disconnectGoogle,
  googleCalendarConfigured,
  googleConnected,
  googleWasLinked,
  listGoogleEvents,
  type GoogleEvent,
} from './lib/googleCalendar'
import {
  TONES,
  askDesktopPermission,
  clearCustomTone,
  desktopPermission,
  desktopSupported,
  addSeen,
  getPrefs,
  getSeen,
  getSnooze,
  markFired,
  playTestTone,
  saveCustomTone,
  savePrefs,
  setSnooze,
  showDesktopNotification,
  startRingtone,
  stopRingtone,
  unlockAudioOnFirstTouch,
  vibrationSupported,
  wasFired,
  type AlertPrefs,
} from './lib/alerts'

type Page = 'dashboard' | 'tasks' | 'calendar' | 'reminders' | 'notes' | 'focus' | 'medicine'
type IconName =
  | 'arrow'
  | 'bell'
  | 'book'
  | 'calendar'
  | 'check'
  | 'chevron'
  | 'clock'
  | 'grid'
  | 'heart'
  | 'menu'
  | 'note'
  | 'pause'
  | 'pill'
  | 'play'
  | 'plus'
  | 'search'
  | 'spark'
  | 'task'
  | 'trash'

type Tone = 'coral' | 'blue' | 'yellow' | 'green'
const tones: Tone[] = ['coral', 'blue', 'yellow', 'green']

type Task = {
  id: string
  createdAt: number
  title: string
  course: string
  time: string
  points: number
  color: Tone
  completed: boolean
  /** Optional due time (0 or missing means none). */
  dueAt?: number
  completedAt?: number
  viaGoogle?: boolean
  googleId?: string
}

type Reminder = { id: string; createdAt: number; title: string; remindAt: number; icon: IconName; color: Tone; viaGoogle?: boolean; googleId?: string }
type Note = { id: string; createdAt: number; title: string; body: string; color: Tone; updatedAt: number }
type PdfFile = { id: string; createdAt: number; name: string; size: number; chunkCount: number }
type Medicine = { id: string; createdAt: number; name: string; detail: string; time24: string; color: Tone; takenOn: string; takenDays?: string[]; viaGoogle?: boolean; googleId?: string }
type FocusSession = { id: string; createdAt: number; minutes: number; day: string }

const pct = (done: number, total: number) => (total ? (done / total) * 100 : 0)
const formatSize = (bytes: number) => (bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`)
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const formatTime = (time24: string) => {
  const [hours, minutes] = time24.split(':').map(Number)
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`
}
const formatWhen = (timestamp: number) => {
  const date = new Date(timestamp)
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return `Today · ${time}`
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${time}`
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${time}`
}
const formatEdited = (timestamp: number) => {
  const date = new Date(timestamp)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (now.getTime() - timestamp < 60000) return 'Edited just now'
  if (date.toDateString() === now.toDateString()) return 'Edited today'
  if (date.toDateString() === yesterday.toDateString()) return 'Edited yesterday'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const timeUntil = (timestamp: number, now: number) => {
  const minutes = Math.floor((timestamp - now) / 60000)
  if (minutes < 1) return 'Any moment now'
  if (minutes < 60) return `In ${plural(minutes, 'minute')}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `In ${plural(hours, 'hour')}, ${plural(minutes % 60, 'minute')}`
  return `In ${plural(Math.floor(hours / 24), 'day')}`
}
const firstName = (user: User) => (user.displayName || user.email?.split('@')[0] || 'there').split(' ')[0]

const authMessage = (error: unknown) => {
  const code = (error as { code?: string })?.code ?? ''
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Incorrect email or password.'
    case 'auth/email-already-in-use':
      return 'That email already has an account. Try signing in instead.'
    case 'auth/weak-password':
      return 'Choose a stronger password (at least 6 characters).'
    case 'auth/invalid-email':
      return 'Enter a valid email address.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.'
    case 'auth/network-request-failed':
      return 'Network problem. Check your connection and try again.'
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not turned on in Firebase yet.'
    case 'auth/unauthorized-domain':
      return 'This website address is not authorized in Firebase (Authentication > Settings > Authorized domains).'
    default:
      return 'Something went wrong. Please try again.'
  }
}

const iconPaths: Record<IconName, ReactNode> = {
  arrow: <path d="m9 18 6-6-6-6" />,
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  book: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5Zm16 0A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5Z" />,
  calendar: (
    <>
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  grid: (
    <>
      <rect width="7" height="7" x="3" y="3" rx="2" />
      <rect width="7" height="7" x="14" y="3" rx="2" />
      <rect width="7" height="7" x="3" y="14" rx="2" />
      <rect width="7" height="7" x="14" y="14" rx="2" />
    </>
  ),
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  note: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </>
  ),
  pause: (
    <>
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </>
  ),
  pill: (
    <>
      <path d="m10.5 20.5-7-7a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7Z" />
      <path d="m8 18 7-7" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  spark: <path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8Zm6 11 .7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7Z" />,
  task: (
    <>
      <rect width="18" height="18" x="3" y="3" rx="3" />
      <path d="m8 12 2.5 2.5L16 9" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5" />
    </>
  ),
}

const navItems: { id: Page; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Home', icon: 'grid' },
  { id: 'tasks', label: 'My tasks', icon: 'task' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'reminders', label: 'Reminders', icon: 'bell' },
  { id: 'notes', label: 'Notes', icon: 'note' },
  { id: 'focus', label: 'Focus', icon: 'clock' },
  { id: 'medicine', label: 'Medicine', icon: 'pill' },
]

const pageDetails: Record<Page, { eyebrow: string; title: string; description: string }> = {
  dashboard: { eyebrow: 'TUESDAY, MAY 14', title: 'Ready to flow, U B?', description: 'Here’s what’s happening with your day.' },
  tasks: { eyebrow: 'TASK MANAGER', title: 'Your quests', description: 'Small wins add up to a great semester.' },
  calendar: { eyebrow: 'WEEKLY PLANNER', title: 'Plan your week', description: 'Classes, deadlines, and time for yourself — synced with Google Calendar.' },
  reminders: { eyebrow: 'REMINDER CENTER', title: 'Never miss a beat', description: 'Plan alerts for tasks, classes, and everything important.' },
  notes: { eyebrow: 'NOTE LIBRARY', title: 'Ideas in one place', description: 'Capture what matters before it gets away.' },
  focus: { eyebrow: 'FOCUS STUDIO', title: 'Do one thing well', description: 'Put distractions aside and build momentum.' },
  medicine: { eyebrow: 'HEALTH ROUTINE', title: 'Take care of you', description: 'A gentle reminder for every dose.' },
}

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg aria-hidden="true" className="icon" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      {iconPaths[name]}
    </svg>
  )
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark"><Icon name="spark" size={18} /></span>
      <span>UFlow</span>
    </div>
  )
}

function Button({
  children,
  className = '',
  onClick,
  ariaLabel,
  disabled,
}: {
  children?: ReactNode
  className?: string
  onClick?: () => void
  ariaLabel?: string
  disabled?: boolean
}) {
  return (
    <button aria-label={ariaLabel} className={`button ${className}`} disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  )
}

function PageHeading({ page, name }: { page: Page; name?: string }) {
  const detail = pageDetails[page]
  const title = detail.title.replace('U B', name ?? 'there')
  const eyebrow = page === 'dashboard'
    ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()
    : detail.eyebrow
  return (
    <header className="page-heading">
      <span>{eyebrow}</span>
      <div role="heading" aria-level={1}>{title}</div>
      <p>{detail.description}</p>
    </header>
  )
}

function ProgressBar({ value, color = 'coral' }: { value: number; color?: string }) {
  return <span className="progress-track"><i className={`progress-fill ${color}`} style={{ width: `${value}%` }} /></span>
}

function TaskCheck({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <Button ariaLabel={checked ? 'Mark task incomplete' : 'Mark task complete'} className={`task-check ${checked ? 'checked' : ''}`} onClick={onClick}>
      {checked && <Icon name="check" size={13} />}
    </Button>
  )
}

type Overview = { tasks: Task[]; reminders: Reminder[]; medicines: Medicine[]; events: CalEvent[]; focus: FocusSession[] }

function Dashboard({ data, toggleTask, navigate, name }: { data: Overview; toggleTask: (id: string) => void; navigate: (page: Page) => void; name: string }) {
  const { tasks, reminders, medicines, events, focus } = data
  const today = todayKey()
  const nowMs = Date.now()
  const completed = tasks.filter((task) => task.completed).length
  const open = tasks.length - completed
  const xp = tasks.filter((task) => task.completed).reduce((sum, task) => sum + task.points, 0)
  const focusToday = focus.filter((session) => session.day === today).reduce((sum, session) => sum + session.minutes, 0)
  const takenToday = medicines.filter((medicine) => tookOn(medicine, today)).length

  // Streak: days in a row with a finished task or a focus session.
  const activeDays = new Set<string>([...tasks.filter((task) => task.completed && task.completedAt).map((task) => dayKey(task.completedAt as number)), ...focus.map((session) => session.day)])
  const streak = countStreak((day) => activeDays.has(day))

  // Flow score: average of task progress, focus vs your 3-hour goal, and today’s medicine (only counted if you have medicine).
  const parts = [Math.min(100, (focusToday / FOCUS_GOAL_MIN) * 100)]
  if (tasks.length) parts.push(pct(completed, tasks.length))
  if (medicines.length) parts.push(pct(takenToday, medicines.length))
  const score = Math.round(parts.reduce((sum, value) => sum + value, 0) / parts.length)

  const nudge =
    tasks.length === 0 ? 'Add your first task and get your day moving.'
    : open === 0 ? 'Every task is done. Enjoy the win!'
    : open === 1 ? 'You’re one task away from clearing your list.'
    : `${open} tasks left. Take them one at a time.`

  // Today’s schedule from your own data: events, reminders, medicine still to take, and tasks due today.
  const slots: { key: string; sort: number; time: string; tone: string; title: string; sub: string }[] = []
  for (const event of events) {
    if (dayKey(event.start) !== today) continue
    slots.push({ key: `e${event.id}`, sort: event.allDay ? 0 : event.start, time: event.allDay ? 'All day' : hhmm(event.start), tone: event.color === 'purple' ? 'blue' : event.color, title: event.title, sub: event.location || (event.allDay ? 'All-day event' : `${Math.max(1, Math.round((event.end - event.start) / 60000))} min`) })
  }
  for (const reminder of reminders) {
    if (dayKey(reminder.remindAt) === today) slots.push({ key: `r${reminder.id}`, sort: reminder.remindAt, time: hhmm(reminder.remindAt), tone: 'coral', title: reminder.title, sub: 'Reminder' })
  }
  for (const medicine of medicines) {
    if (!tookOn(medicine, today)) slots.push({ key: `m${medicine.id}`, sort: atTime(today, medicine.time24), time: medicine.time24, tone: 'yellow', title: medicine.name, sub: medicine.detail || 'Medicine' })
  }
  for (const task of tasks) {
    if (!task.completed && task.dueAt && dayKey(task.dueAt) === today) slots.push({ key: `t${task.id}`, sort: task.dueAt, time: hhmm(task.dueAt), tone: 'blue', title: task.title, sub: 'Task due' })
  }
  slots.sort((a, b) => a.sort - b.sort)

  const pendingMeds = medicines.filter((medicine) => !tookOn(medicine, today)).sort((a, b) => a.time24.localeCompare(b.time24))
  const nextMed = pendingMeds.find((medicine) => atTime(today, medicine.time24) >= nowMs - 30 * 60000) ?? pendingMeds[0]
  const shownTasks = [...tasks].sort((a, b) => Number(a.completed) - Number(b.completed)).slice(0, 3)

  return (
    <>
      <PageHeading page="dashboard" name={name} />
      <section className="welcome-banner">
        <img src="/uflow-profile.jpg" alt="" />
        <span className="welcome-overlay" />
        <div className="welcome-copy">
          <span><Icon name="spark" size={13} /> YOUR DAILY FLOW</span>
          <div role="heading" aria-level={2}>Hey {name}, make today count.</div>
          <p>{nudge}</p>
          <Button className="light-button" onClick={() => navigate('tasks')}>View today’s plan <Icon name="arrow" size={15} /></Button>
        </div>
        <div className="day-score" title="Average of task progress, focus time vs a 3-hour goal, and medicine taken today"><strong>{score}</strong><span>FLOW SCORE</span></div>
      </section>

      <section className="stats-row">
        <article className="stat-card streak-stat">
          <span className="stat-icon"><Icon name="spark" /></span>
          <div><small>CURRENT STREAK</small><strong>{plural(streak, 'day')}</strong><span>{streak > 0 ? 'Keep showing up!' : 'Finish a task or focus to start one'}</span></div>
          <em>{xp} XP</em>
        </article>
        <article className="stat-card">
          <span className="stat-icon blue"><Icon name="clock" /></span>
          <div><small>FOCUS TODAY</small><strong>{fmtMinutes(focusToday)}</strong><span>{Math.round((focusToday / FOCUS_GOAL_MIN) * 100)}% of your {FOCUS_GOAL_MIN / 60}h goal</span></div>
        </article>
        <article className="stat-card">
          <span className="stat-icon green"><Icon name="task" /></span>
          <div><small>TASK PROGRESS</small><strong>{completed} of {tasks.length}</strong><ProgressBar value={pct(completed, tasks.length)} color="green" /></div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel today-panel">
          <div className="panel-heading">
            <div><span>TODAY’S QUESTS</span><strong>Build your momentum</strong></div>
            <Button className="text-button" onClick={() => navigate('tasks')}>View all <Icon name="arrow" size={14} /></Button>
          </div>
          <div className="dashboard-task-list">
            {shownTasks.map((task) => (
              <div className={`dashboard-task ${task.completed ? 'done' : ''}`} key={task.id}>
                <TaskCheck checked={task.completed} onClick={() => toggleTask(task.id)} />
                <span className={`task-color ${task.color}`} />
                <div><strong>{task.title}</strong><span>{task.course} · {task.dueAt ? formatWhen(task.dueAt) : 'No due date'}</span></div>
                <em>+{task.points} XP</em>
              </div>
            ))}
            {tasks.length === 0 && <div className="empty-state"><Icon name="spark" size={28} /><strong>No quests yet</strong><span>Add your first task to get going.</span></div>}
          </div>
          <div className="task-progress-copy"><span>{completed} of {tasks.length} completed</span><b>{Math.round(pct(completed, tasks.length))}%</b></div>
          <ProgressBar value={pct(completed, tasks.length)} />
        </article>

        <article className="panel schedule-panel">
          <div className="panel-heading">
            <div><span>NEXT UP</span><strong>Today’s schedule</strong></div>
            <span className="date-chip">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}</span>
          </div>
          <div className="timeline wide">
            {slots.slice(0, 5).map((slot) => (
              <div key={slot.key}><time>{slot.time}</time><i className={slot.tone} /><span><b>{slot.title}</b><small>{slot.sub}</small></span></div>
            ))}
            {slots.length === 0 && <div className="empty-state"><Icon name="calendar" size={28} /><strong>Nothing planned today</strong><span>Events, reminders and doses will show up here.</span></div>}
            {slots.length > 5 && <p className="timeline-more">+{slots.length - 5} more today</p>}
          </div>
          <Button className="outline-button full-button" onClick={() => navigate('calendar')}>Open calendar <Icon name="calendar" size={15} /></Button>
        </article>

        <article className="focus-promo">
          <span className="promo-icon"><Icon name="clock" /></span>
          <div><small>FOCUS SESSION</small><strong>Ready for 25 minutes?</strong><p>{focusToday > 0 ? `${fmtMinutes(focusToday)} focused today. Keep it going.` : 'Start a session and build your streak.'}</p></div>
          <Button className="dark-round" ariaLabel="Start focus session" onClick={() => navigate('focus')}><Icon name="play" size={17} /></Button>
        </article>

        <article className="medicine-promo">
          <span className="promo-icon"><Icon name="pill" /></span>
          {nextMed ? (
            <div><small>NEXT MEDICINE · {formatTime(nextMed.time24).toUpperCase()}</small><strong>{nextMed.name}</strong><p>{nextMed.detail || 'Time for your dose'}</p></div>
          ) : (
            <div><small>MEDICINE</small><strong>{medicines.length ? 'All doses taken' : 'No medicine yet'}</strong><p>{medicines.length ? 'Nice work today.' : 'Add one to get dose alerts.'}</p></div>
          )}
          <Button className="text-button" onClick={() => navigate('medicine')}>Details <Icon name="arrow" size={14} /></Button>
        </article>
      </section>
    </>
  )
}

function TasksPage({ coll, toggleTask, email, launch, clearLaunch }: { coll: Coll<Task>; toggleTask: (id: string) => void; email: string | null; launch: boolean; clearLaunch: () => void }) {
  const tasks = coll.items
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all')
  const [composerOpen, setComposerOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('09:00')
  const [viaGoogle, setViaGoogle] = useState(getPrefs().google)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())
  const visibleTasks = tasks.filter((task) => filter === 'all' || (filter === 'done' ? task.completed : !task.completed))
  const completed = tasks.filter((task) => task.completed).length
  const xp = tasks.filter((task) => task.completed).reduce((sum, task) => sum + task.points, 0)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const resetForm = () => {
    setEditingId(null)
    setNewTitle('')
    setNewDate('')
    setNewTime('09:00')
    setViaGoogle(getPrefs().google)
  }

  useEffect(() => {
    if (!launch) return
    clearLaunch()
    resetForm()
    setComposerOpen(true)
  }, [launch, clearLaunch])

  const submitTask = async () => {
    const title = newTitle.trim()
    if (!title || busy) return
    const dueAt = newDate ? new Date(`${newDate}T${newTime || '09:00'}`).getTime() : 0
    setBusy(true)
    let message = ''
    if (editingId) {
      const task = tasks.find((item) => item.id === editingId)
      const patch: Partial<Omit<Task, 'id' | 'createdAt'>> = { title, dueAt }
      if (task?.googleId) {
        if (!googleConnected()) {
          message = 'Saved in UFlow, but its Google Calendar alert wasn’t updated because Google isn’t connected.'
        } else {
          try {
            if (dueAt) {
              await updateGoogleReminder(task.googleId, { title, icon: '✅', at: dueAt })
            } else {
              await deleteGoogleEvent(task.googleId)
              patch.googleId = ''
            }
          } catch (error) {
            message = `Saved in UFlow, but Google Calendar wasn’t updated. ${googleErrorText(error)}`
          }
        }
      } else if (dueAt && viaGoogle && !task?.completed) {
        const result = await makeGoogleAlert(title, dueAt, { icon: '✅', note: 'Task due, from UFlow' })
        if (result.googleId) {
          patch.googleId = result.googleId
          patch.viaGoogle = true
        }
        message = result.message
      }
      await coll.update(editingId, patch)
    } else {
      const data: Omit<Task, 'id' | 'createdAt'> = { title, course: 'Personal', time: '', points: 20, color: tones[tasks.length % tones.length], completed: false, dueAt }
      if (dueAt && viaGoogle) {
        data.viaGoogle = true
        const result = await makeGoogleAlert(title, dueAt, { icon: '✅', note: 'Task due, from UFlow' })
        if (result.googleId) data.googleId = result.googleId
        message = result.message
      }
      await coll.add(data)
    }
    setNotice(message)
    resetForm()
    setBusy(false)
    setComposerOpen(false)
  }

  const editTask = (task: Task) => {
    setEditingId(task.id)
    setNewTitle(task.title)
    setNewDate(task.dueAt ? dayKey(task.dueAt) : '')
    setNewTime(task.dueAt ? hhmm(task.dueAt) : '09:00')
    setViaGoogle(task.viaGoogle ?? getPrefs().google)
    setComposerOpen(true)
  }

  const confirmDelete = async () => {
    const task = tasks.find((item) => item.id === deleteId)
    setDeleteId(null)
    if (!task) return
    setNotice(await dropGoogleAlert(task.googleId, 'Deleted'))
    await coll.remove(task.id)
  }

  return (
    <>
      <div className="heading-with-action">
        <PageHeading page="tasks" />
        <Button className="primary-button" onClick={() => { if (composerOpen) { resetForm(); setComposerOpen(false) } else { resetForm(); setComposerOpen(true) } }}><Icon name="plus" size={17} /> New task</Button>
      </div>

      <section className="task-summary">
        <div><span>WEEKLY PROGRESS</span><strong>{completed}/{tasks.length} quests complete</strong><ProgressBar value={pct(completed, tasks.length)} /></div>
        <div className="xp-badge"><Icon name="spark" /><span><small>XP EARNED</small><b>{xp}</b></span></div>
      </section>

      {composerOpen && (
        <>
          <section className="task-composer">
            <span className="composer-icon"><Icon name="task" /></span>
            <label><span>{editingId ? 'Update your task' : 'What needs to be done?'}</span><input autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submitTask()} placeholder="e.g. Finish chapter 5 notes" /></label>
            <label className="due-field"><span>DUE DATE (OPTIONAL)</span><input type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} /></label>
            {newDate && <label className="due-field"><span>DUE TIME</span><input type="time" value={newTime} onChange={(event) => setNewTime(event.target.value)} /></label>}
            {editingId && <Button className="outline-button" onClick={() => { resetForm(); setComposerOpen(false) }}>Cancel</Button>}
            <Button className="primary-button" onClick={submitTask} disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Add quest'} <Icon name="arrow" size={15} /></Button>
          </section>
          {newDate && (
            <div className="composer-extra">
              <GoogleAlertTick checked={viaGoogle} onChange={setViaGoogle} email={email} hint="(alerts you at the due time, even when UFlow is closed)" />
            </div>
          )}
        </>
      )}
      {notice && <p className="cal-notice">{notice}</p>}

      <section className="panel task-manager">
        <div className="task-tabs">
          {(['all', 'active', 'done'] as const).map((item) => (
            <Button className={filter === item ? 'active' : ''} key={item} onClick={() => setFilter(item)}>
              {item === 'all' ? 'All tasks' : item === 'active' ? 'In progress' : 'Completed'}
              <span>{item === 'all' ? tasks.length : item === 'active' ? tasks.length - completed : completed}</span>
            </Button>
          ))}
        </div>
        <div className="full-task-list">
          {visibleTasks.map((task) => {
            const overdue = !task.completed && Boolean(task.dueAt) && (task.dueAt as number) < now
            return (
              <div className={`full-task-row ${task.completed ? 'done' : ''}`} key={task.id}>
                <TaskCheck checked={task.completed} onClick={() => toggleTask(task.id)} />
                <span className={`course-badge ${task.color}`}><Icon name="book" size={16} /></span>
                <div><strong>{task.title}</strong><span className={overdue ? 'due-late' : ''}>{task.course} · {task.dueAt ? `${overdue ? 'Overdue · ' : 'Due '}${formatWhen(task.dueAt)}` : 'No due date'}{task.googleId ? ' · Google alert' : ''}</span></div>
                <em>+{task.points} XP</em>
                <Button className="mini-edit-button" onClick={() => editTask(task)}>Edit</Button>
                <Button className="icon-button delete-button" ariaLabel={`Delete ${task.title}`} onClick={() => setDeleteId(task.id)}><Icon name="trash" size={16} /></Button>
              </div>
            )
          })}
          {visibleTasks.length === 0 && <div className="empty-state"><Icon name="spark" size={28} /><strong>All clear!</strong><span>No quests in this view.</span></div>}
        </div>
      </section>
      {deleteId !== null && (
        <div className="modal-layer">
          <Button className="modal-scrim" ariaLabel="Cancel deletion" onClick={() => setDeleteId(null)} />
          <section className="confirm-modal">
            <span className="danger-icon"><Icon name="trash" /></span>
            <div role="heading" aria-level={2}>Delete this task?</div>
            <p>This can’t be undone. The task and its Google Calendar alert (if it has one) will be removed.</p>
            <div><Button className="outline-button" onClick={() => setDeleteId(null)}>Cancel</Button><Button className="danger-button" onClick={confirmDelete}>Delete task</Button></div>
          </section>
        </div>
      )}
    </>
  )
}

type CalTone = Tone | 'purple'
type CalEvent = {
  id: string
  createdAt: number
  title: string
  start: number
  end: number
  allDay: boolean
  color: CalTone
  location: string
  googleId?: string
}
// One thing drawn on the calendar: either saved in UFlow or read from Google.
type CalItem = {
  key: string
  title: string
  start: number
  end: number
  allDay: boolean
  tone: CalTone | 'google'
  location: string
  source: 'uflow' | 'google'
  localId?: string
  googleId?: string
  link?: string
}

const calTones: CalTone[] = ['coral', 'blue', 'yellow', 'green', 'purple']
const HOUR_START = 7
const HOUR_END = 22
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, index) => HOUR_START + index)
const DAY_MS = 86400000

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
const mondayOf = (date: Date) => addDays(startOfDay(date), -((date.getDay() + 6) % 7))
const dateInputValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const hourLabel = (hour: number) => `${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`
const clock = (timestamp: number) => new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const itemRange = (item: CalItem) =>
  item.allDay ? 'All day' : `${clock(item.start)} – ${clock(item.end)}`

// Does this item touch the given day? All-day end dates are exclusive.
const touchesDay = (item: CalItem, day: Date) => {
  const from = day.getTime()
  const to = from + DAY_MS
  return item.allDay ? item.start < to && Math.max(item.end, item.start + DAY_MS) > from : item.start < to && item.end > from
}

// Puts overlapping timed events side by side instead of on top of each other.
function layoutDay(items: CalItem[], day: Date) {
  const from = day.getTime()
  const to = from + DAY_MS
  const sorted = items
    .map((item) => ({ item, start: Math.max(item.start, from), end: Math.min(Math.max(item.end, item.start + 15 * 60000), to) }))
    .sort((a, b) => a.start - b.start || b.end - a.end)
  const placed: { item: CalItem; start: number; end: number; col: number; cols: number }[] = []
  let cluster: typeof placed = []
  let clusterEnd = 0
  const closeCluster = () => {
    const cols = Math.max(1, ...cluster.map((entry) => entry.col + 1))
    cluster.forEach((entry) => (entry.cols = cols))
    cluster = []
  }
  for (const entry of sorted) {
    if (cluster.length && entry.start >= clusterEnd) closeCluster()
    const taken = new Set(cluster.filter((other) => other.end > entry.start).map((other) => other.col))
    let col = 0
    while (taken.has(col)) col += 1
    const next = { ...entry, col, cols: 1 }
    cluster.push(next)
    placed.push(next)
    clusterEnd = Math.max(clusterEnd, entry.end)
  }
  closeCluster()
  return placed
}

function CalendarPage({ uid, email, launch, clearLaunch }: { uid: string; email: string | null; launch: boolean; clearLaunch: () => void }) {
  const { items: saved, add, remove } = useCollection<CalEvent>(uid, 'events')
  const [view, setView] = useState<'week' | 'month'>('week')
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [now, setNow] = useState(Date.now())
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([])
  const [googleState, setGoogleState] = useState<'off' | 'connecting' | 'loading' | 'on' | 'expired'>(googleWasLinked() ? 'expired' : 'off')
  const [googleMessage, setGoogleMessage] = useState('')
  const [syncTick, setSyncTick] = useState(0)
  const [composer, setComposer] = useState<{ date: string } | null>(null)
  const [selected, setSelected] = useState<CalItem | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  // Form fields for the "Add event" window.
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayKey())
  const [allDay, setAllDay] = useState(false)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [location, setLocation] = useState('')
  const [color, setColor] = useState<CalTone>('blue')
  const [alsoGoogle, setAlsoGoogle] = useState(true)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  // The days on screen: seven for a week, a full grid of weeks for a month.
  const days = useMemo(() => {
    if (view === 'week') {
      const first = mondayOf(cursor)
      return Array.from({ length: 7 }, (_, index) => addDays(first, index))
    }
    const first = mondayOf(new Date(cursor.getFullYear(), cursor.getMonth(), 1))
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const count = Math.ceil((((last.getTime() - first.getTime()) / DAY_MS) + 1) / 7) * 7
    return Array.from({ length: count }, (_, index) => addDays(first, index))
  }, [view, cursor])
  const rangeStart = days[0].getTime()
  const rangeEnd = addDays(days[days.length - 1], 1).getTime()

  // Download Google events for what’s on screen whenever the view or connection changes.
  useEffect(() => {
    if (!googleConnected()) return
    let cancelled = false
    setGoogleState('loading')
    listGoogleEvents(new Date(rangeStart), new Date(rangeEnd))
      .then((events) => {
        if (cancelled) return
        setGoogleEvents(events)
        setGoogleState('on')
        setGoogleMessage('')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        if (error instanceof GoogleAuthError) {
          setGoogleState('expired')
          setGoogleEvents([])
        } else {
          setGoogleState('on')
        }
        setGoogleMessage(googleErrorText(error))
      })
    return () => {
      cancelled = true
    }
  }, [rangeStart, rangeEnd, syncTick])

  const connect = async () => {
    setGoogleMessage('')
    setGoogleState('connecting')
    try {
      await connectGoogle(email)
      setSyncTick((tick) => tick + 1)
    } catch (error) {
      setGoogleState(googleWasLinked() ? 'expired' : 'off')
      setGoogleMessage(googleErrorText(error))
    }
  }

  const disconnect = () => {
    disconnectGoogle()
    setGoogleEvents([])
    setGoogleState('off')
    setGoogleMessage('')
  }

  const items = useMemo<CalItem[]>(() => {
    const linked = new Set(saved.map((event) => event.googleId).filter(Boolean))
    const own: CalItem[] = saved.map((event) => ({
      key: `u-${event.id}`,
      title: event.title,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      tone: event.color,
      location: event.location,
      source: 'uflow',
      localId: event.id,
      googleId: event.googleId,
    }))
    const fromGoogle: CalItem[] = googleEvents
      .filter((event) => !linked.has(event.id))
      .map((event) => ({
        key: `g-${event.id}`,
        title: event.title,
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        tone: 'google',
        location: event.location ?? '',
        source: 'google',
        googleId: event.id,
        link: event.link,
      }))
    return [...own, ...fromGoogle]
  }, [saved, googleEvents])

  const move = (direction: number) =>
    setCursor(view === 'week' ? addDays(cursor, direction * 7) : new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1))

  const heading = (() => {
    if (view === 'month') return cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    const first = days[0]
    const last = days[6]
    const sameMonth = first.getMonth() === last.getMonth()
    const month = (date: Date) => date.toLocaleDateString('en-US', { month: 'short' })
    const left = sameMonth ? `${month(first)} ${first.getDate()}` : `${month(first)} ${first.getDate()}`
    const right = sameMonth ? `${last.getDate()}, ${last.getFullYear()}` : `${month(last)} ${last.getDate()}, ${last.getFullYear()}`
    return `${left} — ${right}`
  })()

  const openComposer = (day?: Date) => {
    const chosen = day ?? startOfDay(new Date())
    setTitle('')
    setDate(dateInputValue(chosen))
    setAllDay(false)
    setStartTime('09:00')
    setEndTime('10:00')
    setLocation('')
    setColor('blue')
    setAlsoGoogle(true)
    setFormError('')
    setComposer({ date: dateInputValue(chosen) })
  }

  useEffect(() => {
    if (!launch) return
    clearLaunch()
    openComposer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch])

  const saveEvent = async () => {
    if (!title.trim()) return setFormError('Give the event a title.')
    if (!date) return setFormError('Pick a date.')
    const start = allDay ? new Date(`${date}T00:00`).getTime() : new Date(`${date}T${startTime}`).getTime()
    const end = allDay ? start + DAY_MS : new Date(`${date}T${endTime}`).getTime()
    if (!allDay && !(end > start)) return setFormError('The end time must be after the start time.')
    setBusy(true)
    setFormError('')
    let googleId: string | undefined
    let googleFailure = ''
    if (alsoGoogle && googleConnected()) {
      try {
        googleId = await createGoogleEvent({ title: title.trim(), start, end, allDay, location: location.trim() })
      } catch (error) {
        googleFailure = googleErrorText(error)
        if (error instanceof GoogleAuthError) setGoogleState('expired')
      }
    }
    const event: Omit<CalEvent, 'id' | 'createdAt'> = { title: title.trim(), start, end, allDay, color, location: location.trim() }
    if (googleId) event.googleId = googleId
    await add(event)
    setBusy(false)
    setComposer(null)
    setGoogleMessage(googleFailure ? `Saved in UFlow, but not added to Google Calendar. ${googleFailure}` : '')
    if (new Date(start) < days[0] || new Date(start) >= new Date(rangeEnd)) setCursor(startOfDay(new Date(start)))
  }

  const deleteSelected = async () => {
    if (!selected) return
    setBusy(true)
    let failure = ''
    if (selected.googleId && googleConnected()) {
      try {
        await deleteGoogleEvent(selected.googleId)
      } catch (error) {
        failure = googleErrorText(error)
        if (error instanceof GoogleAuthError) setGoogleState('expired')
      }
    }
    if (selected.localId) await remove(selected.localId)
    if (selected.source === 'google' && !failure) setGoogleEvents((events) => events.filter((event) => event.id !== selected.googleId))
    setBusy(false)
    setSelected(null)
    setConfirmDelete(false)
    setGoogleMessage(failure ? `Couldn’t remove it from Google Calendar. ${failure}` : '')
  }

  const googleReady = googleConnected()
  const todayStart = startOfDay(new Date(now)).getTime()
  const nowMinutes = new Date(now).getHours() * 60 + new Date(now).getMinutes()
  const chip = (item: CalItem) => (
    <button className="cal-chip" data-tone={item.tone} key={item.key} onClick={(event) => { event.stopPropagation(); setConfirmDelete(false); setSelected(item) }} type="button">
      {!item.allDay && <b>{clock(item.start)}</b>} {item.title}
    </button>
  )

  return (
    <>
      <div className="heading-with-action">
        <PageHeading page="calendar" />
        <div className="calendar-actions">
          {googleReady ? (
            <>
              <Button className="sync-button connected" onClick={() => setSyncTick((tick) => tick + 1)} ariaLabel="Sync Google Calendar now">
                <Icon name="check" size={16} /> {googleState === 'loading' ? 'Syncing…' : 'Google Calendar synced'}
              </Button>
              <Button className="text-button muted-link" onClick={disconnect}>Disconnect</Button>
            </>
          ) : (
            <Button className="sync-button" onClick={connect} disabled={googleState === 'connecting'}>
              <Icon name="calendar" size={16} /> {googleState === 'connecting' ? 'Connecting…' : (googleState === 'expired' || googleWasLinked()) ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
            </Button>
          )}
          <Button className="primary-button" onClick={() => openComposer()}><Icon name="plus" size={17} /> <span className="cal-btn-text">Add event</span></Button>
        </div>
      </div>

      {!googleCalendarConfigured && googleState !== 'on' && (
        <p className="cal-notice">Google Calendar isn’t set up yet. Add <code>VITE_GOOGLE_CLIENT_ID</code> to <code>.env.local</code> (steps are in GOOGLE_CALENDAR_SETUP.md). Events you add here still save to your account.</p>
      )}
      {googleMessage && <p className="cal-notice error">{googleMessage}</p>}
      {googleState === 'expired' && !googleMessage && googleCalendarConfigured && <p className="cal-notice">Google asks you to reconnect about once an hour. Click “Reconnect Google Calendar” to bring your classes back.</p>}

      <section className="calendar-toolbar">
        <div>
          <Button className="icon-button" onClick={() => move(-1)} ariaLabel="Previous"><Icon name="chevron" size={17} /></Button>
          <strong>{heading}</strong>
          <Button className="icon-button next" onClick={() => move(1)} ariaLabel="Next"><Icon name="chevron" size={17} /></Button>
          <Button className="outline-button" onClick={() => setCursor(startOfDay(new Date()))}>Today</Button>
        </div>
        <div className="view-switch">
          <Button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Week</Button>
          <Button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Month</Button>
        </div>
      </section>

      {view === 'week' ? (
        <section className="panel cal-board">
          <div className="cal-scroll">
            <div className="cal-grid">
              <div className="cal-head">
                <span />
                {days.map((day) => (
                  <div className={day.getTime() === todayStart ? 'today' : ''} key={day.getTime()}>
                    <small>{day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</small>
                    <b>{day.getDate()}</b>
                  </div>
                ))}
              </div>
              <div className="cal-allday">
                <span>ALL DAY</span>
                {days.map((day) => (
                  <div key={day.getTime()}>{items.filter((item) => item.allDay && touchesDay(item, day)).map(chip)}</div>
                ))}
              </div>
              <div className="cal-body">
                <div className="cal-hours">{HOURS.map((hour) => <span key={hour}>{hourLabel(hour)}</span>)}</div>
                {days.map((day) => {
                  const isToday = day.getTime() === todayStart
                  const timed = items.filter((item) => !item.allDay && touchesDay(item, day))
                  return (
                    <div className={`cal-col ${isToday ? 'today-column' : ''}`} key={day.getTime()} onClick={() => openComposer(day)}>
                      {layoutDay(timed, day).map(({ item, start, end, col, cols }) => {
                        const top = Math.max(0, (start - day.getTime()) / 3600000 - HOUR_START)
                        const bottom = Math.min(HOUR_END - HOUR_START, (end - day.getTime()) / 3600000 - HOUR_START)
                        if (bottom <= 0 || top >= HOUR_END - HOUR_START) return null
                        return (
                          <article
                            className="cal-event"
                            data-tone={item.tone}
                            key={item.key}
                            onClick={(event) => { event.stopPropagation(); setConfirmDelete(false); setSelected(item) }}
                            style={{ top: `calc(var(--row) * ${top})`, height: `max(1.5rem, calc(var(--row) * ${bottom - top} - 2px))`, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` }}
                          >
                            <strong>{item.title}</strong>
                            <span>{clock(item.start)}{item.location ? ` · ${item.location}` : ''}</span>
                          </article>
                        )
                      })}
                      {isToday && nowMinutes >= HOUR_START * 60 && nowMinutes < HOUR_END * 60 && (
                        <span className="cal-now" style={{ top: `calc(var(--row) * ${(nowMinutes - HOUR_START * 60) / 60})` }} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="panel cal-month">
          {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((name) => <small key={name}>{name}</small>)}
          {days.map((day) => {
            const dayItems = items.filter((item) => touchesDay(item, day)).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start)
            return (
              <div className={`cal-cell ${day.getMonth() !== cursor.getMonth() ? 'faded' : ''} ${day.getTime() === todayStart ? 'today' : ''}`} key={day.getTime()} onClick={() => openComposer(day)}>
                <b>{day.getDate()}</b>
                {dayItems.slice(0, 3).map(chip)}
                {dayItems.length > 3 && <em>+{dayItems.length - 3} more</em>}
              </div>
            )
          })}
        </section>
      )}

      {composer && (
        <div className="modal-layer">
          <Button className="modal-scrim" ariaLabel="Close" onClick={() => setComposer(null)} />
          <section className="note-editor cal-form">
            <div className="editor-top"><span><Icon name="calendar" size={14} /> NEW EVENT</span><Button className="icon-button" onClick={() => setComposer(null)} ariaLabel="Close"><Icon name="plus" /></Button></div>
            <input className="note-title-input" autoFocus placeholder="Event title (for example, CSE 322 lecture)" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && saveEvent()} />
            <div className="cal-fields">
              <label><span>DATE</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
              <label className="cal-check"><input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} /> All day</label>
              {!allDay && <label><span>STARTS</span><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>}
              {!allDay && <label><span>ENDS</span><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>}
              <label className="wide"><span>LOCATION (OPTIONAL)</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Room 302, library, Zoom…" /></label>
              <div className="wide"><span className="cal-label">COLOUR</span><div className="cal-swatches">{calTones.map((tone) => <button aria-label={tone} aria-pressed={color === tone} className="cal-swatch" data-tone={tone} key={tone} onClick={() => setColor(tone)} type="button" />)}</div></div>
              {googleReady && <label className="cal-check wide"><input type="checkbox" checked={alsoGoogle} onChange={(event) => setAlsoGoogle(event.target.checked)} /> Also add to my Google Calendar</label>}
            </div>
            {formError && <p className="auth-error cal-error">{formError}</p>}
            <div className="editor-footer"><span>{googleReady ? 'Saved to your UFlow account' : 'Connect Google to also add it there'}</span><Button className="primary-button" onClick={saveEvent} disabled={busy}>{busy ? 'Saving…' : 'Save event'}</Button></div>
          </section>
        </div>
      )}

      {selected && (
        <div className="modal-layer">
          <Button className="modal-scrim" ariaLabel="Close" onClick={() => setSelected(null)} />
          <section className="confirm-modal cal-details">
            <span className="cal-dot" data-tone={selected.tone} />
            <div role="heading" aria-level={2}>{selected.title}</div>
            <p>
              {new Date(selected.start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}<br />
              {itemRange(selected)}
              {selected.location && <><br />{selected.location}</>}
            </p>
            <p className="cal-source">{selected.source === 'google' ? 'From your Google Calendar' : selected.googleId ? 'Saved in UFlow and Google Calendar' : 'Saved in UFlow only'}</p>
            {confirmDelete && <p className="cal-warn">{selected.googleId && !googleReady ? 'Reconnect Google Calendar first, otherwise it will stay in Google.' : selected.googleId ? 'This will also remove it from Google Calendar.' : 'This can’t be undone.'}</p>}
            <div>
              {selected.link && <a className="outline-button" href={selected.link} rel="noreferrer" target="_blank">Open in Google</a>}
              <Button className="outline-button" onClick={() => { setSelected(null); setConfirmDelete(false) }}>Close</Button>
              {selected.source === 'google' && !googleReady ? null : confirmDelete
                ? <Button className="danger-button" onClick={deleteSelected} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</Button>
                : <Button className="danger-button" onClick={() => setConfirmDelete(true)}>Delete</Button>}
            </div>
          </section>
        </div>
      )}
    </>
  )
}

const googleErrorText = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Something went wrong with Google Calendar.'
  if (/has not been used|is disabled|accessNotConfigured/i.test(message)) return 'Google Calendar API is switched off for your project. Enable it in Google Cloud (see GOOGLE_CALENDAR_SETUP.md, step 1).'
  return message
}

/* ---------- shared helpers: days, medicine history, Google alerts ---------- */

type Coll<T extends { id: string; createdAt: number }> = {
  items: T[]
  add: (data: Omit<T, 'id' | 'createdAt'>) => Promise<{ id: string } | void>
  update: (id: string, data: Partial<Omit<T, 'id' | 'createdAt'>>) => Promise<unknown>
  remove: (id: string) => Promise<unknown>
}

const dayKey = (value: number | Date) => {
  const d = new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const atTime = (day: string, time24: string) => new Date(`${day}T${time24}`).getTime()
const fmtMinutes = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`)
const hhmm = (timestamp: number) => new Date(timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const FOCUS_GOAL_MIN = 180
const ALERT_WINDOW_MS = 120000

const tookOn = (medicine: Medicine, day: string) => medicine.takenOn === day || Boolean(medicine.takenDays?.includes(day))
const dayComplete = (medicines: Medicine[], day: string) => {
  const due = medicines.filter((medicine) => dayKey(medicine.createdAt) <= day)
  return due.length > 0 && due.every((medicine) => tookOn(medicine, day))
}
/** Counts back from today (or yesterday, if today isn’t finished yet) while each day is good. */
const countStreak = (good: (day: string) => boolean) => {
  const cursor = new Date()
  if (!good(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (streak < 400 && good(dayKey(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

const markMedicine = (coll: Coll<Medicine>, medicine: Medicine, taken: boolean) => {
  const today = todayKey()
  const days = new Set(medicine.takenDays ?? [])
  if (medicine.takenOn) days.add(medicine.takenOn)
  if (taken) days.add(today)
  else days.delete(today)
  return coll.update(medicine.id, { takenOn: taken ? today : '', takenDays: Array.from(days).slice(-120) })
}

type GoogleAlertOptions = { daily?: boolean; note?: string; icon?: string }

/** Creates the Google Calendar alert for something just saved. Never throws; returns a message to show if it couldn’t. */
async function makeGoogleAlert(title: string, at: number, options: GoogleAlertOptions): Promise<{ googleId?: string; message: string }> {
  if (!googleConnected()) return { message: 'Saved in UFlow. Connect Google Calendar to add its phone alert.' }
  try {
    return { googleId: await createGoogleReminder(title, at, options), message: '' }
  } catch (error) {
    return { message: `Saved in UFlow, but the Google Calendar alert wasn’t created. ${googleErrorText(error)}` }
  }
}

/** Removes a Google Calendar alert. Returns a message to show if it couldn’t. */
async function dropGoogleAlert(googleId: string | undefined, verb = 'Removed'): Promise<string> {
  if (!googleId) return ''
  if (!googleConnected()) return `${verb} in UFlow. Its Google Calendar alert is still there; connect Google Calendar and delete it there if you don’t want it.`
  try {
    await deleteGoogleEvent(googleId)
    return ''
  } catch (error) {
    return `${verb} in UFlow, but not in Google Calendar. ${googleErrorText(error)}`
  }
}

/** The "Also alert me through Google Calendar" tick box, with a Connect button when Google isn’t connected. */
function GoogleAlertTick({ checked, onChange, email, hint }: { checked: boolean; onChange: (value: boolean) => void; email: string | null; hint: string }) {
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  if (!googleCalendarConfigured) return null
  const connect = async () => {
    setConnecting(true)
    setError('')
    try {
      await connectGoogle(email)
    } catch (err) {
      setError(googleErrorText(err))
    }
    setConnecting(false)
  }
  return (
    <div className="reminder-google-row">
      <label className="tick-row">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span>Also alert me through Google Calendar <small>{hint}</small></span>
      </label>
      {checked && !googleConnected() && (
        <Button className="sync-button" onClick={connect} disabled={connecting}><Icon name="calendar" size={16} /> {connecting ? 'Connecting…' : googleWasLinked() ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}</Button>
      )}
      {error && <small className="tone-error">{error}</small>}
    </div>
  )
}

/* ---------- what is due, and the alert pop-ups ---------- */

type AlertItem = { key: string; at: number; kind: 'reminder' | 'medicine' | 'task'; id: string; title: string; detail: string }

/** Everything that can alert: reminders, today’s untaken medicine, and unfinished tasks with a due time. */
function dueItems(reminders: Reminder[], medicines: Medicine[], tasks: Task[]): AlertItem[] {
  const today = todayKey()
  const out: AlertItem[] = []
  for (const reminder of reminders) out.push({ key: `r:${reminder.id}`, at: reminder.remindAt, kind: 'reminder', id: reminder.id, title: reminder.title, detail: 'Reminder' })
  for (const medicine of medicines) {
    if (tookOn(medicine, today)) continue
    const key = `m:${medicine.id}:${today}`
    out.push({ key, at: getSnooze(key) ?? atTime(today, medicine.time24), kind: 'medicine', id: medicine.id, title: medicine.name, detail: medicine.detail || 'Time for your dose' })
  }
  for (const task of tasks) {
    if (task.completed || !task.dueAt) continue
    const key = `t:${task.id}:${task.dueAt}`
    out.push({ key, at: getSnooze(key) ?? task.dueAt, kind: 'task', id: task.id, title: task.title, detail: 'Task due' })
  }
  return out
}

type Notice = { key: string; at: number; late: boolean; kind: AlertItem['kind']; title: string; text: string }

const noticePage: Record<AlertItem['kind'], { page: Page; tone: Tone; icon: IconName }> = {
  reminder: { page: 'reminders', tone: 'coral', icon: 'bell' },
  medicine: { page: 'medicine', tone: 'yellow', icon: 'pill' },
  task: { page: 'tasks', tone: 'blue', icon: 'task' },
}

/** The notification drawer: things that are late, or coming up in the next 24 hours. */
function buildNotices(items: AlertItem[], nowMs: number): Notice[] {
  const DAY = 86400000
  return items
    .filter((item) => item.at > nowMs - 3 * DAY && item.at < nowMs + DAY)
    .map((item) => {
      const late = item.at <= nowMs
      const text =
        item.kind === 'reminder' ? (late ? 'Missed reminder' : 'Coming up')
        : item.kind === 'medicine' ? (late ? 'Dose is due and not marked as taken' : 'Dose coming up')
        : late ? 'Task is overdue' : 'Task due soon'
      return { key: `${item.key}@${item.at}`, at: item.at, late, kind: item.kind, title: item.title, text }
    })
    .sort((a, b) => (a.late === b.late ? (a.late ? b.at - a.at : a.at - b.at) : a.late ? -1 : 1))
}

/** Moves a reminder later (Snooze), keeping its Google Calendar alert in step when possible. */
async function snoozeReminder(coll: Coll<Reminder>, reminder: Reminder, minutes = 10) {
  const remindAt = Math.max(Date.now(), reminder.remindAt) + minutes * 60000
  await coll.update(reminder.id, { remindAt })
  if (reminder.googleId && googleConnected()) {
    try {
      await updateGoogleReminder(reminder.googleId, { at: remindAt })
    } catch {
      /* the UFlow alert still moves; the Google one can be fixed in Google Calendar */
    }
  }
}

type AlertData = { reminders: Coll<Reminder>; medicines: Coll<Medicine>; tasks: Coll<Task>; toggleTask: (id: string) => void }

/** Watches everything on every page. Rings and pops up when something is due (only things due within the last 2 minutes). */
function AlertCenter({ data }: { data: AlertData }) {
  const [ringing, setRinging] = useState<AlertItem[]>([])
  const latest = useRef(data)
  latest.current = data

  useEffect(() => unlockAudioOnFirstTouch(), [])

  useEffect(() => {
    const check = () => {
      const { reminders, medicines, tasks } = latest.current
      const due = dueItems(reminders.items, medicines.items, tasks.items).filter((item) => {
        const late = Date.now() - item.at
        return late >= 0 && late < ALERT_WINDOW_MS && !wasFired(`${item.key}@${item.at}`)
      })
      if (due.length === 0) return
      due.forEach((item) => markFired(`${item.key}@${item.at}`))
      if (!getPrefs().uflow) return
      setRinging((current) => [...current, ...due.filter((item) => !current.some((other) => other.key === item.key))])
      startRingtone()
      due.forEach((item) => showDesktopNotification(item.kind === 'medicine' ? 'Time for your medicine' : item.kind === 'task' ? 'Task due' : 'UFlow reminder', item.title))
    }
    check()
    const timer = window.setInterval(check, 5000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (ringing.length === 0) stopRingtone()
  }, [ringing.length])

  const close = (key: string) => setRinging((current) => current.filter((item) => item.key !== key))

  const snooze = (item: AlertItem) => {
    if (item.kind === 'reminder') {
      const reminder = latest.current.reminders.items.find((entry) => entry.id === item.id)
      if (reminder) void snoozeReminder(latest.current.reminders, reminder)
    } else {
      setSnooze(item.key, Date.now() + 10 * 60000)
    }
    close(item.key)
  }

  const finish = (item: AlertItem) => {
    if (item.kind === 'medicine') {
      const medicine = latest.current.medicines.items.find((entry) => entry.id === item.id)
      if (medicine) void markMedicine(latest.current.medicines, medicine, true)
    } else if (item.kind === 'task') {
      latest.current.toggleTask(item.id)
    }
    close(item.key)
  }

  if (ringing.length === 0) return null
  return (
    <div className="alert-stack" role="alert">
      {ringing.map((item) => (
        <div className="alert-toast" key={item.key}>
          <span className="alert-toast-icon"><Icon name={noticePage[item.kind].icon} size={18} /></span>
          <div>
            <small>{item.kind === 'medicine' ? 'MEDICINE TIME' : item.kind === 'task' ? 'TASK DUE' : 'REMINDER'}</small>
            <strong>{item.title}</strong>
            {item.kind === 'medicine' && <p>{item.detail}</p>}
            <div className="alert-toast-actions">
              {item.kind !== 'reminder' && <Button className="primary-button" onClick={() => finish(item)}>{item.kind === 'medicine' ? 'Mark as taken' : 'Mark done'}</Button>}
              <Button className="light-button" onClick={() => snooze(item)}>Snooze 10 min</Button>
              <Button className={item.kind === 'reminder' ? 'primary-button' : 'text-button'} onClick={() => close(item.key)}>{item.kind === 'reminder' ? 'Got it' : 'Dismiss'}</Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function RemindersPage({ coll, email, launch, clearLaunch }: { coll: Coll<Reminder>; email: string | null; launch: boolean; clearLaunch: () => void }) {
  const { items: reminders, add, update, remove } = coll
  const [composerOpen, setComposerOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayKey())
  const [time, setTime] = useState('09:00')
  const [now, setNow] = useState(Date.now())
  const [prefs, setPrefs] = useState<AlertPrefs>(getPrefs)
  const [viaGoogle, setViaGoogle] = useState(prefs.google)
  const [permission, setPermission] = useState(desktopPermission())
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [toneError, setToneError] = useState('')
  const toneFile = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!launch) return
    clearLaunch()
    setViaGoogle(getPrefs().google)
    setComposerOpen(true)
  }, [launch, clearLaunch])

  const changePrefs = (patch: Partial<AlertPrefs>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    savePrefs(next)
  }

  const sorted = [...reminders].sort((a, b) => a.remindAt - b.remindAt)
  const next = sorted.find((reminder) => reminder.remindAt > now)
  const googleReady = googleConnected()
  const pending = reminders.filter((reminder) => reminder.viaGoogle && !reminder.googleId && reminder.remindAt > now)

  const addReminder = async () => {
    if (!title.trim() || !date || !time || busy) return
    setBusy(true)
    const remindAt = new Date(`${date}T${time}`).getTime()
    const data: Omit<Reminder, 'id' | 'createdAt'> = { title: title.trim(), remindAt, icon: 'bell', color: tones[reminders.length % tones.length] }
    let message = ''
    if (viaGoogle) {
      data.viaGoogle = true
      const result = await makeGoogleAlert(data.title, remindAt, { icon: '🔔', note: 'Reminder from UFlow' })
      if (result.googleId) data.googleId = result.googleId
      message = result.message
    }
    await add(data)
    setNotice(message)
    setTitle('')
    setBusy(false)
    setComposerOpen(false)
  }

  const addPending = async () => {
    setBusy(true)
    let failure = ''
    for (const reminder of pending) {
      try {
        const googleId = await createGoogleReminder(reminder.title, reminder.remindAt, { icon: '🔔', note: 'Reminder from UFlow' })
        await update(reminder.id, { googleId })
      } catch (error) {
        failure = googleErrorText(error)
        break
      }
    }
    setNotice(failure ? `Some alerts weren’t added. ${failure}` : '')
    setBusy(false)
  }

  const removeReminder = async (reminder: Reminder) => {
    setNotice(await dropGoogleAlert(reminder.googleId, 'Deleted'))
    await remove(reminder.id)
  }

  const chooseTone = (tone: string) => {
    changePrefs({ tone })
    setToneError('')
    playTestTone({ tone })
  }

  const pickToneFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const customName = await saveCustomTone(file)
      changePrefs({ tone: 'custom', customName })
      setToneError('')
      playTestTone({ tone: 'custom' })
    } catch (error) {
      setToneError(error instanceof Error ? error.message : 'Couldn’t use that file.')
    }
  }

  const removeTone = async () => {
    await clearCustomTone()
    changePrefs({ tone: 'chime', customName: '' })
  }

  const turnOnDesktop = async () => setPermission(await askDesktopPermission())

  return (
    <>
      <div className="heading-with-action">
        <PageHeading page="reminders" />
        <Button className="primary-button" onClick={() => { setViaGoogle(prefs.google); setComposerOpen(!composerOpen) }}><Icon name="plus" size={17} /> Set reminder</Button>
      </div>
      {composerOpen && (
        <section className="reminder-composer panel">
          <label><span>REMINDER TITLE</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addReminder()} placeholder="What should we remind you about?" /></label>
          <label><span>DATE</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label><span>TIME</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
          <Button className="primary-button" onClick={addReminder} disabled={busy}>{busy ? 'Saving…' : 'Save reminder'}</Button>
          <GoogleAlertTick checked={viaGoogle} onChange={setViaGoogle} email={email} hint="(rings on your phone even when UFlow is closed)" />
        </section>
      )}
      {notice && <p className="cal-notice">{notice}</p>}
      {pending.length > 0 && googleReady && (
        <p className="cal-notice">
          {plural(pending.length, 'reminder')} {pending.length === 1 ? 'is' : 'are'} waiting for a Google Calendar alert.{' '}
          <button className="inline-link" type="button" onClick={addPending} disabled={busy}>Add {pending.length === 1 ? 'it' : 'them'} now</button>
        </p>
      )}
      <section className="reminder-summary">
        <div><span className="summary-icon"><Icon name="bell" /></span><span><small>NEXT REMINDER</small><strong>{next ? next.title : 'Nothing scheduled'}</strong><p>{next ? timeUntil(next.remindAt, now) : 'Add a reminder to stay on track.'}</p></span></div>
        {next && <Button className="light-button" onClick={() => snoozeReminder(coll, next)}>Snooze for 10 min</Button>}
      </section>
      <section className="reminder-layout">
        <article className="panel reminder-list">
          <div className="panel-heading"><div><span>YOUR REMINDERS</span><strong>Scheduled alerts</strong></div><span className="count-chip">{reminders.length}</span></div>
          {sorted.map((reminder) => {
            const status = reminder.remindAt < now ? 'missed' : 'upcoming'
            return (
              <div className={`reminder-row ${status}`} key={reminder.id}>
                <span className={`reminder-icon ${reminder.color}`}><Icon name={reminder.icon} /></span>
                <div>
                  <strong>{reminder.title}</strong>
                  <span>{formatWhen(reminder.remindAt)} · {reminder.googleId ? 'UFlow + Google Calendar' : reminder.viaGoogle ? 'UFlow · Google alert pending' : 'UFlow only'}</span>
                  {status === 'missed' && <em>Missed reminder — review now</em>}
                </div>
                <Button className="icon-button delete-button" onClick={() => removeReminder(reminder)} ariaLabel={`Delete ${reminder.title}`}><Icon name="trash" size={15} /></Button>
              </div>
            )
          })}
          {reminders.length === 0 && <div className="empty-state"><Icon name="bell" size={28} /><strong>No reminders yet</strong><span>Tap “Set reminder” to add your first one.</span></div>}
        </article>
        <aside className="panel reminder-settings">
          <span>NOTIFICATION SETTINGS</span>
          <strong>Stay in control.</strong>
          <label><span><b>UFlow pop-up and ringtone</b><small>Reminders, medicine, tasks and focus. Needs UFlow open in a tab</small></span><input type="checkbox" checked={prefs.uflow} onChange={(event) => changePrefs({ uflow: event.target.checked })} /></label>
          <label><span><b>Google Calendar alerts</b><small>{googleCalendarConfigured ? 'Ticked by default for new reminders, tasks and medicine' : 'Add your Google client ID first'}</small></span><input type="checkbox" checked={prefs.google} disabled={!googleCalendarConfigured} onChange={(event) => changePrefs({ google: event.target.checked })} /></label>
          <label><span><b>Vibration</b><small>{vibrationSupported() ? 'Buzz along with the ringtone' : 'Not available on this device (Android phones only)'}</small></span><input type="checkbox" checked={prefs.vibrate} disabled={!vibrationSupported()} onChange={(event) => { changePrefs({ vibrate: event.target.checked }); if (event.target.checked) playTestTone({ vibrate: true }) }} /></label>
          <div className="tone-picker">
            <span>RINGTONE</span>
            <select className="tone-select" value={prefs.tone} onChange={(event) => chooseTone(event.target.value)} aria-label="Choose ringtone">
              {TONES.map((tone) => <option key={tone.id} value={tone.id}>{tone.label}</option>)}
              {prefs.customName && <option value="custom">My sound: {prefs.customName}</option>}
            </select>
            <div className="tone-actions">
              <Button className="outline-button" onClick={() => toneFile.current?.click()}>{prefs.customName ? 'Replace my sound' : 'Upload my own sound'}</Button>
              {prefs.customName && <Button className="text-button muted-link" onClick={removeTone}>Remove</Button>}
            </div>
            <input ref={toneFile} type="file" accept="audio/*" hidden onChange={pickToneFile} />
            <small>MP3, WAV, M4A or OGG, up to 5 MB. It’s saved on this device only, so upload it again on your phone or other computer.</small>
            {toneError && <small className="tone-error">{toneError}</small>}
          </div>
          <div className="alert-tools">
            <Button className="outline-button" onClick={() => playTestTone()}>Test ringtone</Button>
            {desktopSupported() && permission !== 'granted' && (
              <Button className="outline-button" onClick={turnOnDesktop} disabled={permission === 'denied'}>{permission === 'denied' ? 'Desktop alerts blocked' : 'Turn on desktop alerts'}</Button>
            )}
            {permission === 'granted' && <small>Desktop alerts are on.</small>}
          </div>
        </aside>
      </section>
    </>
  )
}

function NotesPage({ uid, launch, clearLaunch }: { uid: string; launch: boolean; clearLaunch: () => void }) {
  const { items: notes, add, update, remove } = useCollection<Note>(uid, 'notes', true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ title: '', body: '' })
  const { items: files } = useCollection<PdfFile>(uid, 'files', true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const [search, setSearch] = useState('')
  const saveTimer = useRef<number | undefined>(undefined)
  const dirty = useRef(false)
  const activeNote = notes.find((note) => note.id === editingId)
  const visibleNotes = notes.filter((note) => `${note.title} ${note.body}`.toLowerCase().includes(search.trim().toLowerCase()))

  const saveDraft = (id: string, next: { title: string; body: string }) => {
    dirty.current = false
    update(id, { title: next.title, body: next.body, updatedAt: Date.now() })
  }

  const addNote = async () => {
    const created = await add({ title: 'Untitled note', body: '', color: tones[notes.length % tones.length], updatedAt: Date.now() })
    if (created) {
      setDraft({ title: 'Untitled note', body: '' })
      setEditingId(created.id)
    }
  }

  useEffect(() => {
    if (!launch) return
    clearLaunch()
    void addNote()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch])

  const openEditor = (note: Note) => {
    setDraft({ title: note.title, body: note.body })
    setEditingId(note.id)
  }

  const changeDraft = (field: 'title' | 'body', value: string) => {
    if (!editingId) return
    const next = { ...draft, [field]: value }
    const id = editingId
    setDraft(next)
    dirty.current = true
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => saveDraft(id, next), 600)
  }

  const closeEditor = () => {
    window.clearTimeout(saveTimer.current)
    if (editingId && dirty.current) saveDraft(editingId, draft)
    setEditingId(null)
  }

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Please choose a PDF file.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setUploadError(`That file is ${formatSize(file.size)}. The limit is ${MAX_FILE_MB} MB.`)
      return
    }
    setUploadError('')
    setProgress(0)
    setUploading(true)
    try {
      await uploadPdf(uid, file, setProgress)
    } catch (error) {
      console.error(error)
      setUploadError('Upload failed. Check your connection and try again.')
    } finally {
      setUploading(false)
    }
  }

  const openFile = async (file: PdfFile) => {
    const tab = window.open('', '_blank')
    try {
      const url = URL.createObjectURL(await fetchPdfBlob(uid, file.id))
      if (tab) {
        tab.location.href = url
      } else {
        const link = document.createElement('a')
        link.href = url
        link.download = file.name
        link.click()
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (error) {
      console.error(error)
      tab?.close()
      setUploadError('Could not open that file. Try again.')
    }
  }

  const removeFile = async (file: PdfFile) => {
    if (!window.confirm(`Delete “${file.name}”?`)) return
    try {
      await deletePdf(uid, file.id)
    } catch (error) {
      console.error(error)
      setUploadError('Could not delete that file. Try again.')
    }
  }

  const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0)

  return (
    <>
      <div className="heading-with-action">
        <PageHeading page="notes" />
        <Button className="primary-button" onClick={addNote}><Icon name="plus" size={17} /> New note</Button>
      </div>
      <section className="notes-tools">
        <label className="page-search"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your notes..." /></label>
        <label className="upload-button"><Icon name="book" size={16} /><span>{uploading ? `Uploading ${progress}%` : 'Upload PDF'}</span><input type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={handleUpload} /></label>
        <span>{plural(notes.length, 'note')}</span>
      </section>
      <section className="notes-grid">
        {visibleNotes.map((note, index) => (
          <article className={`note-card ${note.color}`} key={note.id}>
            <div><span className="note-icon"><Icon name={index === 1 ? 'spark' : 'note'} /></span><span className="note-actions"><Button className="mini-edit-button" onClick={() => openEditor(note)}>Edit</Button><Button className="icon-button" ariaLabel={`Delete ${note.title}`} onClick={() => remove(note.id)}><Icon name="trash" size={15} /></Button></span></div>
            <strong>{note.title}</strong>
            <p>{note.body || 'Empty note'}</p>
            <span>{formatEdited(note.updatedAt)}<i>{plural(wordCount(note.body), 'word')}</i></span>
          </article>
        ))}
        <Button className="new-note-card" onClick={addNote}><span><Icon name="plus" /></span><strong>Create a new note</strong><small>Capture your next great idea</small></Button>
      </section>
      <section className="panel documents-panel">
        <div className="panel-heading"><div><span>YOUR FILES</span><strong>PDF documents</strong></div><span className="count-chip">{files.length}</span></div>
        {uploadError && <div className="inline-error"><Icon name="bell" size={15} /> {uploadError}</div>}
        {files.map((file) => (
          <div className="doc-row" key={file.id}>
            <span className="doc-icon"><Icon name="book" size={18} /></span>
            <div><strong>{file.name}</strong><span>{formatSize(file.size)} · Added {new Date(file.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></div>
            <Button className="mini-edit-button" onClick={() => openFile(file)}>Open</Button>
            <Button className="icon-button delete-button" ariaLabel={`Delete ${file.name}`} onClick={() => removeFile(file)}><Icon name="trash" size={15} /></Button>
          </div>
        ))}
        {files.length === 0 && !uploadError && <div className="empty-state"><Icon name="book" size={28} /><strong>No PDFs yet</strong><span>Tap “Upload PDF” to add lecture slides or study guides (up to {MAX_FILE_MB} MB each).</span></div>}
      </section>
      {activeNote && (
        <div className="modal-layer">
          <Button className="modal-scrim" ariaLabel="Close note editor" onClick={closeEditor} />
          <section className="note-editor">
            <div className="editor-top"><span><Icon name="note" /> EDIT NOTE</span><Button className="icon-button" onClick={closeEditor} ariaLabel="Close editor"><Icon name="plus" /></Button></div>
            <input className="note-title-input" value={draft.title} onChange={(event) => changeDraft('title', event.target.value)} />
            <textarea value={draft.body} onChange={(event) => changeDraft('body', event.target.value)} placeholder="Start writing your thoughts here..." />
            <div className="editor-footer"><span>Changes are saved automatically</span><Button className="primary-button" onClick={closeEditor}>Done</Button></div>
          </section>
        </div>
      )}
    </>
  )
}

/** The focus timer lives in the workspace so it keeps running (and rings) on every page. */
function useFocusTimer(onComplete: (minutes: number) => void, name: string) {
  const [duration, setDuration] = useState(25)
  const [seconds, setSeconds] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [doneMinutes, setDoneMinutes] = useState<number | null>(null)
  const endAt = useRef(0)
  const callback = useRef(onComplete)
  callback.current = onComplete

  const finish = (minutes: number) => {
    endAt.current = 0
    setRunning(false)
    setSeconds(duration * 60)
    setDoneMinutes(minutes)
    callback.current(minutes)
    if (getPrefs().uflow) {
      startRingtone(10)
      showDesktopNotification('Focus session complete', `Great work, ${name}.`)
    }
  }
  const finishRef = useRef(finish)
  finishRef.current = finish

  useEffect(() => {
    if (!running) return
    // Counts against the clock, so it stays accurate even when the tab is in the background.
    const tick = () => {
      if (!endAt.current) return
      const left = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000))
      setSeconds(left)
      if (left === 0) finishRef.current(duration)
    }
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [running, duration])

  const choose = (minutes: number) => {
    endAt.current = 0
    setDuration(minutes)
    setSeconds(minutes * 60)
    setRunning(false)
  }
  const toggle = () => {
    if (running) {
      setRunning(false)
    } else {
      endAt.current = Date.now() + seconds * 1000
      setRunning(true)
    }
  }
  const reset = () => {
    endAt.current = 0
    setRunning(false)
    setSeconds(duration * 60)
  }
  // Ends the session now and counts the whole minutes already focused (under one minute isn’t counted).
  const finishEarly = () => {
    const elapsed = duration * 60 - seconds
    if (elapsed >= 60) finish(Math.floor(elapsed / 60))
    else reset()
  }
  const dismiss = () => {
    stopRingtone()
    setDoneMinutes(null)
  }
  return { duration, seconds, running, doneMinutes, choose, toggle, reset, finishEarly, dismiss }
}

type FocusTimer = ReturnType<typeof useFocusTimer>

function FocusPage({ name, timer, sessions }: { name: string; timer: FocusTimer; sessions: FocusSession[] }) {
  const { duration, seconds, running } = timer
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0')
  const progress = ((duration * 60 - seconds) / (duration * 60)) * 100

  const today = todayKey()
  const todayMin = sessions.filter((session) => session.day === today).reduce((sum, session) => sum + session.minutes, 0)
  const monday = mondayOf(new Date())
  const week = Array.from({ length: 7 }, (_, index) => {
    const key = dayKey(addDays(monday, index))
    return { key, minutes: sessions.filter((session) => session.day === key).reduce((sum, session) => sum + session.minutes, 0) }
  })
  const weekTotal = week.reduce((sum, day) => sum + day.minutes, 0)
  const tallest = Math.max(60, ...week.map((day) => day.minutes))
  const left = FOCUS_GOAL_MIN - todayMin

  return (
    <>
      <PageHeading page="focus" />
      <section className="focus-layout">
        <article className="focus-studio">
          <div className="focus-modes">
            {[25, 50, 15].map((option) => <Button className={duration === option ? 'active' : ''} key={option} onClick={() => timer.choose(option)}>{option === 25 ? 'Focus' : option === 50 ? 'Deep work' : 'Quick sprint'}<span>{option}m</span></Button>)}
          </div>
          <div className="timer-wrap" style={{ '--timer-progress': `${progress * 3.6}deg` } as React.CSSProperties}>
            <div className="timer-face"><span>TIME TO FOCUS</span><strong>{minutes}:{remainingSeconds}</strong><small>{running ? `You’ve got this, ${name}.` : 'Select play when you’re ready.'}</small></div>
          </div>
          <div className="timer-actions">
            <Button className="secondary-round" ariaLabel="Reset timer" onClick={timer.reset}><Icon name="clock" /></Button>
            <Button className="timer-play" onClick={timer.toggle}><Icon name={running ? 'pause' : 'play'} size={22} /> {running ? 'Pause' : 'Start focus'}</Button>
            <Button className="secondary-round" ariaLabel="Finish early and save the time so far" onClick={timer.finishEarly}><Icon name="arrow" /></Button>
          </div>
        </article>
        <aside className="focus-side">
          <article className="focus-goal">
            <span><Icon name="spark" /></span><small>TODAY’S GOAL</small><strong>{fmtMinutes(todayMin)}</strong><p>of {FOCUS_GOAL_MIN / 60} hours focused</p><ProgressBar value={Math.min(100, pct(todayMin, FOCUS_GOAL_MIN))} color="blue" /><em>{left > 0 ? `${fmtMinutes(left)} to go` : 'Goal reached. Great work!'}</em>
          </article>
          <article className="focus-history panel">
            <span>THIS WEEK</span><strong>Focus rhythm</strong>
            <div className="bar-chart">{week.map((day, index) => <i className={day.key === today ? 'today' : ''} key={day.key} title={fmtMinutes(day.minutes)} style={{ height: `${Math.max(5, Math.round((day.minutes / tallest) * 100))}%` }}><small>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][index]}</small></i>)}</div>
            <p><b>{fmtMinutes(weekTotal)}</b><span>Total focused this week</span></p>
          </article>
        </aside>
      </section>
    </>
  )
}

function MedicinePage({ coll, email, launch, clearLaunch }: { coll: Coll<Medicine>; email: string | null; launch: boolean; clearLaunch: () => void }) {
  const { items } = coll
  const medicines = [...items].sort((a, b) => a.time24.localeCompare(b.time24))
  const today = todayKey()
  const [composerOpen, setComposerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [managing, setManaging] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [medicineName, setMedicineName] = useState('')
  const [dosage, setDosage] = useState('1 tablet')
  const [time24, setTime24] = useState('09:00')
  const [instructions, setInstructions] = useState('With food')
  const [viaGoogle, setViaGoogle] = useState(getPrefs().google)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const takenCount = medicines.filter((medicine) => tookOn(medicine, today)).length

  const resetForm = () => {
    setEditingId(null)
    setMedicineName('')
    setDosage('1 tablet')
    setTime24('09:00')
    setInstructions('With food')
    setViaGoogle(getPrefs().google)
  }

  useEffect(() => {
    if (!launch) return
    clearLaunch()
    resetForm()
    setComposerOpen(true)
  }, [launch, clearLaunch])

  const toggleTaken = (medicine: Medicine) => markMedicine(coll, medicine, !tookOn(medicine, today))

  const saveMedicine = async () => {
    const title = medicineName.trim()
    if (!title || !time24 || busy) return
    setBusy(true)
    const detail = [dosage.trim(), instructions.trim()].filter(Boolean).join(' · ')
    const options = { daily: true, icon: '💊', note: detail ? `${detail} (daily, from UFlow)` : 'Daily medicine, from UFlow' }
    let message = ''
    if (editingId) {
      const existing = items.find((item) => item.id === editingId)
      const patch: Partial<Omit<Medicine, 'id' | 'createdAt'>> = { name: title, detail, time24, viaGoogle }
      if (existing?.googleId) {
        if (!googleConnected()) {
          message = 'Saved in UFlow, but its Google Calendar alert wasn’t updated because Google isn’t connected.'
        } else {
          try {
            if (viaGoogle) {
              await updateGoogleReminder(existing.googleId, { title, icon: '💊', at: atTime(today, time24), note: options.note })
            } else {
              await deleteGoogleEvent(existing.googleId)
              patch.googleId = ''
            }
          } catch (error) {
            message = `Saved in UFlow, but Google Calendar wasn’t updated. ${googleErrorText(error)}`
          }
        }
      } else if (viaGoogle) {
        const result = await makeGoogleAlert(title, atTime(today, time24), options)
        if (result.googleId) patch.googleId = result.googleId
        message = result.message
      }
      await coll.update(editingId, patch)
    } else {
      const data: Omit<Medicine, 'id' | 'createdAt'> = { name: title, detail, time24, color: tones[items.length % tones.length], takenOn: '', takenDays: [] }
      if (viaGoogle) {
        data.viaGoogle = true
        const result = await makeGoogleAlert(title, atTime(today, time24), options)
        if (result.googleId) data.googleId = result.googleId
        message = result.message
      }
      await coll.add(data)
    }
    setNotice(message)
    resetForm()
    setBusy(false)
    setComposerOpen(false)
  }

  const editMedicine = (medicine: Medicine) => {
    const [first, ...rest] = medicine.detail.split(' · ')
    setEditingId(medicine.id)
    setMedicineName(medicine.name)
    setDosage(first ?? '')
    setInstructions(rest.join(' · '))
    setTime24(medicine.time24)
    setViaGoogle(Boolean(medicine.googleId) || (medicine.viaGoogle ?? getPrefs().google))
    setComposerOpen(true)
  }

  const deleteMedicine = async (medicine: Medicine) => {
    if (confirmId !== medicine.id) {
      setConfirmId(medicine.id)
      return
    }
    setConfirmId(null)
    setNotice(await dropGoogleAlert(medicine.googleId, 'Deleted'))
    await coll.remove(medicine.id)
  }

  // This week, Monday to Sunday, from what you actually marked as taken.
  const monday = mondayOf(new Date())
  const week = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((letter, index) => {
    const day = addDays(monday, index)
    const key = dayKey(day)
    const scheduled = medicines.some((medicine) => dayKey(medicine.createdAt) <= key)
    const state = key > today || !scheduled ? 'idle' : dayComplete(medicines, key) ? 'complete' : key === today ? 'current' : 'missed'
    return { letter, key, state }
  })
  const streak = countStreak((day) => dayComplete(medicines, day))

  return (
    <>
      <div className="heading-with-action">
        <PageHeading page="medicine" />
        <Button className="primary-button" onClick={() => { resetForm(); setComposerOpen(!composerOpen || editingId !== null) }}><Icon name="plus" size={17} /> Add medicine</Button>
      </div>
      {composerOpen && (
        <section className="medicine-composer panel">
          <label><span>MEDICINE NAME</span><input autoFocus value={medicineName} onChange={(event) => setMedicineName(event.target.value)} placeholder="e.g. Vitamin B12" /></label>
          <label><span>DOSAGE</span><input value={dosage} onChange={(event) => setDosage(event.target.value)} /></label>
          <label><span>SCHEDULE TIME</span><input type="time" value={time24} onChange={(event) => setTime24(event.target.value)} /></label>
          <label><span>INSTRUCTIONS</span><input value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label>
          <Button className="primary-button" onClick={saveMedicine} disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Save schedule'}</Button>
          <GoogleAlertTick checked={viaGoogle} onChange={setViaGoogle} email={email} hint="(repeats every day on your phone, even when UFlow is closed)" />
        </section>
      )}
      {notice && <p className="cal-notice">{notice}</p>}
      <section className="health-summary">
        <div><span className="health-icon"><Icon name="heart" /></span><span><small>TODAY’S ROUTINE</small><strong>{takenCount} of {medicines.length} doses taken</strong></span></div>
        <span className="adherence"><b>{Math.round(pct(takenCount, medicines.length))}%</b><small>taken today</small></span>
      </section>
      <section className="medicine-layout">
        <div className="medicine-list">
          {medicines.length === 0 && <div className="empty-state"><Icon name="pill" size={28} /><strong>No medicines yet</strong><span>Tap “Add medicine” to set up your routine.</span></div>}
          {medicines.map((medicine) => {
            const isTaken = tookOn(medicine, today)
            return (
              <article className={`medicine-card ${isTaken ? 'taken' : ''}`} key={medicine.id}>
                <span className={`medicine-icon ${medicine.color}`}><Icon name="pill" /></span>
                <div><span>{formatTime(medicine.time24)}</span><strong>{medicine.name}</strong><p>{medicine.detail}{medicine.googleId ? ' · Google alert on' : ''}</p></div>
                {managing ? (
                  <div className="medicine-manage">
                    <Button className="mini-edit-button" onClick={() => editMedicine(medicine)}>Edit</Button>
                    <Button className={confirmId === medicine.id ? 'danger-button' : 'icon-button delete-button'} ariaLabel={`Delete ${medicine.name}`} onClick={() => deleteMedicine(medicine)}>{confirmId === medicine.id ? 'Confirm delete' : <Icon name="trash" size={15} />}</Button>
                  </div>
                ) : (
                  <Button className={isTaken ? 'taken-button' : 'outline-button'} onClick={() => toggleTaken(medicine)}>{isTaken && <Icon name="check" size={15} />}{isTaken ? 'Taken' : 'Mark as taken'}</Button>
                )}
              </article>
            )
          })}
        </div>
        <aside className="panel routine-card">
          <span>WEEKLY ROUTINE</span><strong>Consistency is care.</strong>
          <div className="routine-days">
            {week.map((day, index) => <i className={day.state} key={`${day.letter}-${index}`}><b>{day.letter}</b><span>{day.state === 'complete' && <Icon name="check" size={12} />}</span></i>)}
          </div>
          <p><Icon name="spark" size={16} /> {medicines.length === 0 ? 'Add a medicine to start tracking.' : streak > 0 ? `You’re on a ${streak}-day care streak!` : 'Take every dose today to start a streak.'}</p>
          <Button className="outline-button full-button" onClick={() => { setManaging(!managing); setConfirmId(null) }}>{managing ? 'Done managing' : 'Manage schedule'} <Icon name="arrow" size={14} /></Button>
        </aside>
      </section>
    </>
  )
}

function AuthScreen({ onProfileSaved }: { onProfileSaved: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [keepSignedIn, setKeepSignedIn] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    setInfo('')
    if (mode === 'register' && !name.trim()) {
      setError('Please enter your name.')
      return
    }
    if (!email.includes('@')) {
      setError('Enter a valid email address.')
      return
    }
    if (password.length < 6) {
      setError('Password must contain at least 6 characters.')
      return
    }
    setError('')
    setBusy(true)
    try {
      await setPersistence(auth, keepSignedIn ? browserLocalPersistence : browserSessionPersistence)
      if (mode === 'register') {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
        await updateProfile(credential.user, { displayName: name.trim() })
        onProfileSaved()
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      }
    } catch (err) {
      setError(authMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const signInWithGoogle = async () => {
    if (busy) return
    setError('')
    setInfo('')
    setBusy(true)
    try {
      await setPersistence(auth, keepSignedIn ? browserLocalPersistence : browserSessionPersistence)
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (err) {
      const code = (err as { code?: string })?.code
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') setError(authMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const resetPassword = async () => {
    if (!email.includes('@')) {
      setError('Type your email above first, then tap “Forgot password?”.')
      return
    }
    try {
      await sendPasswordResetEmail(auth, email.trim())
      setError('')
      setInfo('Password reset email sent. Check your inbox and spam folder.')
    } catch (err) {
      setInfo('')
      setError(authMessage(err))
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-visual">
        <img src="/uflow-profile.jpg" alt="" />
        <span className="auth-shade" />
        <div className="auth-visual-copy">
          <Brand />
          <div><span><Icon name="spark" size={15} /> MADE FOR STUDENT LIFE</span><div role="heading" aria-level={1}>One calm place for your busy week.</div><p>Plan classes, finish tasks, focus deeply, and take care of yourself—all in your flow.</p></div>
          <small>UFlow Planner · Your semester, beautifully organized.</small>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-mobile-brand"><Brand /></div>
        <div className="auth-card">
          <span className="auth-kicker">{mode === 'login' ? 'WELCOME BACK' : 'START YOUR FLOW'}</span>
          <div role="heading" aria-level={2}>{mode === 'login' ? 'Good to see you again.' : 'Create your account.'}</div>
          <p>{mode === 'login' ? 'Sign in to continue to your UFlow workspace.' : 'Everything you need for a more organized semester.'}</p>
          {mode === 'register' && <label className="auth-field"><span>FULL NAME</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label>}
          <label className="auth-field"><span>EMAIL ADDRESS</span><input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="student@example.com" type="email" /></label>
          <label className="auth-field"><span>PASSWORD</span><input value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submit()} placeholder="At least 6 characters" type="password" /></label>
          {error && <div className="auth-error"><Icon name="bell" size={15} /> {error}</div>}
          {info && <div className="auth-info"><Icon name="check" size={15} /> {info}</div>}
          <div className="auth-options"><label><input type="checkbox" checked={keepSignedIn} onChange={(event) => setKeepSignedIn(event.target.checked)} /> Keep me signed in</label>{mode === 'login' && <Button onClick={resetPassword}>Forgot password?</Button>}</div>
          <Button className="auth-submit" disabled={busy} onClick={submit}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in to UFlow' : 'Create my account'} <Icon name="arrow" size={16} /></Button>
          <div className="auth-divider"><span>OR CONTINUE WITH</span></div>
          <Button className="google-button" disabled={busy} onClick={signInWithGoogle}><b>G</b> Google</Button>
          <p className="auth-switch">{mode === 'login' ? 'New to UFlow?' : 'Already have an account?'} <Button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setInfo('') }}>{mode === 'login' ? 'Create account' : 'Sign in'}</Button></p>
        </div>
      </section>
    </main>
  )
}

function SetupNeeded() {
  return (
    <main className="boot-screen">
      <section className="setup-card">
        <Brand />
        <div role="heading" aria-level={1}>Connect Firebase to start</div>
        <p>This app needs your Firebase keys. Create a file named <b>.env.local</b> in the project folder (copy <b>.env.example</b>) and fill in the six values from your Firebase project, then restart <b>npm run dev</b>.</p>
        <p>On Vercel, add the same six names under Settings → Environment Variables, then redeploy.</p>
      </section>
    </main>
  )
}

type SearchData = { tasks: Task[]; notes: Note[]; reminders: Reminder[]; medicines: Medicine[]; events: CalEvent[] }

function GlobalSearch({ data, go }: { data: SearchData; go: (page: Page) => void }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const q = query.trim().toLowerCase()
  const results: { key: string; label: string; title: string; sub: string; page: Page }[] = []
  if (q) {
    const has = (text: string) => text.toLowerCase().includes(q)
    data.tasks.filter((item) => has(item.title)).forEach((item) => results.push({ key: `t${item.id}`, label: 'Task', title: item.title, sub: item.completed ? 'Completed' : item.dueAt ? `Due ${formatWhen(item.dueAt)}` : 'No due date', page: 'tasks' }))
    data.reminders.filter((item) => has(item.title)).forEach((item) => results.push({ key: `r${item.id}`, label: 'Reminder', title: item.title, sub: formatWhen(item.remindAt), page: 'reminders' }))
    data.events.filter((item) => has(item.title) || has(item.location)).forEach((item) => results.push({ key: `e${item.id}`, label: 'Event', title: item.title, sub: formatWhen(item.start), page: 'calendar' }))
    data.medicines.filter((item) => has(item.name)).forEach((item) => results.push({ key: `m${item.id}`, label: 'Medicine', title: item.name, sub: formatTime(item.time24), page: 'medicine' }))
    data.notes.filter((item) => has(item.title) || has(item.body)).forEach((item) => results.push({ key: `n${item.id}`, label: 'Note', title: item.title || 'Untitled note', sub: item.body.slice(0, 60), page: 'notes' }))
  }

  const open = (page: Page) => {
    go(page)
    setQuery('')
    input.current?.blur()
  }

  return (
    <div className="global-search-wrap">
      <label className="global-search">
        <Icon name="search" size={17} />
        <input
          ref={input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { setQuery(''); input.current?.blur() }
            if (event.key === 'Enter' && results[0]) open(results[0].page)
          }}
          placeholder="Search tasks, notes, events..."
        />
        <kbd>{isMac ? '⌘ K' : 'Ctrl K'}</kbd>
      </label>
      {focused && q && (
        <div className="search-results" role="listbox">
          {results.slice(0, 8).map((result) => (
            <button className="search-result" key={result.key} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => open(result.page)}>
              <em>{result.label}</em>
              <span><b>{result.title}</b>{result.sub && <small>{result.sub}</small>}</span>
            </button>
          ))}
          {results.length === 0 && <p className="search-empty">Nothing found for “{query.trim()}”.</p>}
        </div>
      )}
    </div>
  )
}

function Workspace({ user }: { user: User }) {
  const [page, setPage] = useState<Page>('dashboard')
  const tasks = useCollection<Task>(user.uid, 'tasks')
  const reminders = useCollection<Reminder>(user.uid, 'reminders')
  const medicines = useCollection<Medicine>(user.uid, 'medicines')
  const events = useCollection<CalEvent>(user.uid, 'events')
  const notes = useCollection<Note>(user.uid, 'notes', true)
  const focus = useCollection<FocusSession>(user.uid, 'focus')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [launch, setLaunch] = useState<Page | null>(null)
  const [syncError, setSyncError] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [seen, setSeen] = useState<string[]>(getSeen)
  const name = firstName(user)
  const displayName = user.displayName || user.email?.split('@')[0] || 'Student'
  const taskList = tasks.items
  const completedTasks = taskList.filter((task) => task.completed)
  const xp = completedTasks.reduce((sum, task) => sum + task.points, 0)
  const level = Math.floor(xp / 200) + 1
  const timer = useFocusTimer((minutes) => { void focus.add({ minutes, day: todayKey() }) }, name)

  useEffect(() => {
    let errorTimer: number | undefined
    const onError = () => {
      setSyncError(true)
      window.clearTimeout(errorTimer)
      errorTimer = window.setTimeout(() => setSyncError(false), 8000)
    }
    window.addEventListener(SYNC_ERROR_EVENT, onError)
    const clock = window.setInterval(() => setNow(Date.now()), 30000)
    return () => {
      window.removeEventListener(SYNC_ERROR_EVENT, onError)
      window.clearTimeout(errorTimer)
      window.clearInterval(clock)
    }
  }, [])

  const toggleTask = (id: string) => {
    const task = taskList.find((item) => item.id === id)
    if (!task) return
    const completed = !task.completed
    const patch: Partial<Omit<Task, 'id' | 'createdAt'>> = { completed, completedAt: completed ? Date.now() : 0 }
    // A finished task shouldn’t keep ringing on your phone.
    if (completed && task.googleId && googleConnected()) {
      deleteGoogleEvent(task.googleId).catch(() => undefined)
      patch.googleId = ''
    }
    void tasks.update(id, patch)
  }

  const pageTitle = useMemo(() => navItems.find((item) => item.id === page)?.label ?? 'Home', [page])

  const navigate = (nextPage: Page) => {
    setPage(nextPage)
    setSidebarOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const startNew = (target: Page) => {
    navigate(target)
    setLaunch(target)
    setAddOpen(false)
  }
  const clearLaunch = () => setLaunch(null)

  const notices = buildNotices(dueItems(reminders.items, medicines.items, taskList), now)
  const unseen = notices.filter((notice) => !seen.includes(notice.key))
  const markAllRead = () => setSeen(addSeen(notices.map((notice) => notice.key)))

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-top"><Brand /><Button className="mobile-close icon-button" onClick={() => setSidebarOpen(false)} ariaLabel="Close menu"><Icon name="plus" /></Button></div>
        <nav className="main-nav">
          <span className="nav-label">YOUR SPACE</span>
          {navItems.map((item) => (
            <Button className={page === item.id ? 'active' : ''} key={item.id} onClick={() => navigate(item.id)}>
              <Icon name={item.icon} size={19} /><span>{item.label}</span>{item.id === 'tasks' && <em>{taskList.filter((task) => !task.completed).length}</em>}
            </Button>
          ))}
        </nav>
        <article className="sidebar-goal">
          <span><Icon name="spark" size={17} /></span>
          <small>WEEKLY GOAL</small>
          <strong>{completedTasks.length} of {taskList.length} tasks</strong>
          <ProgressBar value={pct(completedTasks.length, taskList.length)} />
          <p>{plural(taskList.length - completedTasks.length, 'task')} to your goal</p>
        </article>
        <div className="sidebar-user">
          <img src={user.photoURL || '/uflow-profile.jpg'} alt={`${displayName} profile`} referrerPolicy="no-referrer" />
          <span><strong>{displayName}</strong><small>Level {level} · {xp} XP</small></span>
          <Button ariaLabel="Sign out" onClick={() => signOut(auth)}><Icon name="chevron" size={15} /></Button>
        </div>
      </aside>
      {sidebarOpen && <Button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} ariaLabel="Close navigation" />}

      <div className="app-main">
        <header className="topbar">
          <Button className="menu-button icon-button" onClick={() => setSidebarOpen(true)} ariaLabel="Open menu"><Icon name="menu" /></Button>
          <span className="mobile-title">{pageTitle}</span>
          <GlobalSearch data={{ tasks: taskList, notes: notes.items, reminders: reminders.items, medicines: medicines.items, events: events.items }} go={navigate} />
          <span className={`sync-status ${syncError ? 'error' : ''}`}><i /> {syncError ? 'Couldn’t save' : 'All synced'}</span>
          <Button className="notification-button icon-button" onClick={() => setNotificationsOpen(!notificationsOpen)} ariaLabel="Open notifications"><Icon name="bell" size={19} />{unseen.length > 0 && <i />}</Button>
          <div className="add-wrap">
            <Button className="top-add-button" onClick={() => setAddOpen(!addOpen)}><Icon name="plus" size={17} /> Add new</Button>
            {addOpen && (
              <>
                <Button className="menu-scrim" ariaLabel="Close add menu" onClick={() => setAddOpen(false)} />
                <div className="add-menu">
                  <Button onClick={() => startNew('tasks')}><Icon name="task" size={16} /> New task</Button>
                  <Button onClick={() => startNew('reminders')}><Icon name="bell" size={16} /> Set reminder</Button>
                  <Button onClick={() => startNew('medicine')}><Icon name="pill" size={16} /> Add medicine</Button>
                  <Button onClick={() => startNew('calendar')}><Icon name="calendar" size={16} /> Add event</Button>
                  <Button onClick={() => startNew('notes')}><Icon name="note" size={16} /> New note</Button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="content">
          {page === 'dashboard' && <Dashboard data={{ tasks: taskList, reminders: reminders.items, medicines: medicines.items, events: events.items, focus: focus.items }} toggleTask={toggleTask} navigate={navigate} name={name} />}
          {page === 'tasks' && <TasksPage coll={tasks} toggleTask={toggleTask} email={user.email} launch={launch === 'tasks'} clearLaunch={clearLaunch} />}
          {page === 'calendar' && <CalendarPage uid={user.uid} email={user.email} launch={launch === 'calendar'} clearLaunch={clearLaunch} />}
          {page === 'reminders' && <RemindersPage coll={reminders} email={user.email} launch={launch === 'reminders'} clearLaunch={clearLaunch} />}
          {page === 'notes' && <NotesPage uid={user.uid} launch={launch === 'notes'} clearLaunch={clearLaunch} />}
          {page === 'focus' && <FocusPage name={name} timer={timer} sessions={focus.items} />}
          {page === 'medicine' && <MedicinePage coll={medicines} email={user.email} launch={launch === 'medicine'} clearLaunch={clearLaunch} />}
        </main>
      </div>

      <AlertCenter data={{ reminders, medicines, tasks, toggleTask }} />

      {timer.doneMinutes !== null && (
        <div className="completion-toast">
          <span><Icon name="spark" /></span>
          <div><strong>Focus session complete!</strong><p>Great work, {name}. {fmtMinutes(timer.doneMinutes)} added to today’s focus. Take a short break.</p></div>
          <Button className="icon-button" onClick={timer.dismiss} ariaLabel="Dismiss completion message"><Icon name="plus" /></Button>
        </div>
      )}

      <nav className="mobile-nav">
        {navItems.slice(0, 5).map((item) => (
          <Button className={page === item.id ? 'active' : ''} key={item.id} onClick={() => navigate(item.id)}>
            <Icon name={item.icon} size={19} /><span>{item.label === 'My tasks' ? 'Tasks' : item.label}</span>
          </Button>
        ))}
      </nav>

      {notificationsOpen && (
        <>
          <Button className="drawer-scrim" onClick={() => setNotificationsOpen(false)} ariaLabel="Close notifications" />
          <aside className="notification-drawer">
            <div className="drawer-heading"><div><span>NOTIFICATIONS</span><strong>{notices.length === 0 ? 'You’re all caught up' : unseen.length > 0 ? `${unseen.length} new` : 'Nothing new'}</strong></div><Button className="icon-button" onClick={() => setNotificationsOpen(false)} ariaLabel="Close notifications"><Icon name="plus" /></Button></div>
            {notices.map((notice) => {
              const look = noticePage[notice.kind]
              return (
                <div className={`notification-item clickable ${seen.includes(notice.key) ? '' : 'new'}`} key={notice.key} role="button" tabIndex={0} onClick={() => { navigate(look.page); setNotificationsOpen(false) }} onKeyDown={(event) => { if (event.key === 'Enter') { navigate(look.page); setNotificationsOpen(false) } }}>
                  <span className={look.tone}><Icon name={look.icon} /></span>
                  <div><strong>{notice.title}</strong><p>{notice.text}</p><small>{formatWhen(notice.at)}</small></div>
                </div>
              )
            })}
            {notices.length === 0 && <div className="empty-state"><Icon name="bell" size={28} /><strong>Nothing to show</strong><span>Missed and upcoming reminders, doses and tasks appear here.</span></div>}
            <Button className="outline-button full-button" onClick={markAllRead} disabled={unseen.length === 0}>Mark all as read</Button>
          </aside>
        </>
      )}
    </div>
  )
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [, refresh] = useState(0)

  useEffect(() => {
    if (!firebaseReady) {
      setReady(true)
      return
    }
    return onAuthStateChanged(auth, (next) => {
      setUser(next)
      setReady(true)
    })
  }, [])

  if (!firebaseReady) return <SetupNeeded />
  if (!ready) return <main className="boot-screen"><Brand /></main>
  if (!user) return <AuthScreen onProfileSaved={() => refresh((count) => count + 1)} />
  return <Workspace user={user} />
}

export default App
