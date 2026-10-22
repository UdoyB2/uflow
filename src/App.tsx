import { useEffect, useMemo, useState, type ReactNode } from 'react'

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

type Task = {
  id: number
  title: string
  course: string
  time: string
  points: number
  color: 'coral' | 'blue' | 'yellow' | 'green'
  completed: boolean
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

const initialTasks: Task[] = [
  { id: 1, title: 'Submit database lab report', course: 'CSE 322', time: '9:00 AM', points: 20, color: 'coral', completed: true },
  { id: 2, title: 'Review system analysis chapter', course: 'CSE 326', time: '1:30 PM', points: 30, color: 'blue', completed: false },
  { id: 3, title: 'Prepare project presentation', course: 'UFlow project', time: '4:00 PM', points: 40, color: 'yellow', completed: false },
  { id: 4, title: 'Read software testing notes', course: 'CSE 324', time: '7:00 PM', points: 20, color: 'green', completed: false },
]

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
  calendar: { eyebrow: 'WEEKLY PLANNER', title: 'Plan your week', description: 'Classes, deadlines, and time for yourself.' },
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
}: {
  children?: ReactNode
  className?: string
  onClick?: () => void
  ariaLabel?: string
}) {
  return (
    <button aria-label={ariaLabel} className={`button ${className}`} onClick={onClick} type="button">
      {children}
    </button>
  )
}

function PageHeading({ page }: { page: Page }) {
  const detail = pageDetails[page]
  return (
    <header className="page-heading">
      <span>{detail.eyebrow}</span>
      <div role="heading" aria-level={1}>{detail.title}</div>
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

function Dashboard({
  tasks,
  toggleTask,
  navigate,
}: {
  tasks: Task[]
  toggleTask: (id: number) => void
  navigate: (page: Page) => void
}) {
  const completed = tasks.filter((task) => task.completed).length
  return (
    <>
      <PageHeading page="dashboard" />
      <section className="welcome-banner">
        <img src="/uflow-profile.jpg" alt="" />
        <span className="welcome-overlay" />
        <div className="welcome-copy">
          <span><Icon name="spark" size={13} /> YOUR DAILY FLOW</span>
          <div role="heading" aria-level={2}>Hey U B, make today count.</div>
          <p>You’re one task away from a new productivity streak.</p>
          <Button className="light-button" onClick={() => navigate('tasks')}>View today’s plan <Icon name="arrow" size={15} /></Button>
        </div>
        <div className="day-score"><strong>82</strong><span>FLOW SCORE</span></div>
      </section>

      <section className="stats-row">
        <article className="stat-card streak-stat">
          <span className="stat-icon"><Icon name="spark" /></span>
          <div><small>CURRENT STREAK</small><strong>4 days</strong><span>Keep showing up!</span></div>
          <em>+120 XP</em>
        </article>
        <article className="stat-card">
          <span className="stat-icon blue"><Icon name="clock" /></span>
          <div><small>FOCUS TODAY</small><strong>2h 35m</strong><span>12% above average</span></div>
        </article>
        <article className="stat-card">
          <span className="stat-icon green"><Icon name="task" /></span>
          <div><small>TASK PROGRESS</small><strong>{completed} of {tasks.length}</strong><ProgressBar value={(completed / tasks.length) * 100} color="green" /></div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel today-panel">
          <div className="panel-heading">
            <div><span>TODAY’S QUESTS</span><strong>Build your momentum</strong></div>
            <Button className="text-button" onClick={() => navigate('tasks')}>View all <Icon name="arrow" size={14} /></Button>
          </div>
          <div className="dashboard-task-list">
            {tasks.slice(0, 3).map((task) => (
              <div className={`dashboard-task ${task.completed ? 'done' : ''}`} key={task.id}>
                <TaskCheck checked={task.completed} onClick={() => toggleTask(task.id)} />
                <span className={`task-color ${task.color}`} />
                <div><strong>{task.title}</strong><span>{task.course} · {task.time}</span></div>
                <em>+{task.points} XP</em>
              </div>
            ))}
          </div>
          <div className="task-progress-copy"><span>{completed} completed today</span><b>{Math.round((completed / tasks.length) * 100)}%</b></div>
          <ProgressBar value={(completed / tasks.length) * 100} />
        </article>

        <article className="panel schedule-panel">
          <div className="panel-heading">
            <div><span>NEXT UP</span><strong>Today’s schedule</strong></div>
            <span className="date-chip">MAY 14</span>
          </div>
          <div className="timeline">
            <div><time>10:30</time><i className="yellow" /><span><b>Software Engineering</b><small>Room 405 · 45 min</small></span></div>
            <div><time>12:30</time><i className="coral" /><span><b>Lunch break</b><small>Campus café · 30 min</small></span></div>
            <div><time>03:00</time><i className="blue" /><span><b>Project group sync</b><small>Library · 1 hour</small></span></div>
          </div>
          <Button className="outline-button full-button" onClick={() => navigate('calendar')}>Open calendar <Icon name="calendar" size={15} /></Button>
        </article>

        <article className="focus-promo">
          <span className="promo-icon"><Icon name="clock" /></span>
          <div><small>FOCUS SESSION</small><strong>Ready for 25 minutes?</strong><p>Your next break is closer than you think.</p></div>
          <Button className="dark-round" ariaLabel="Start focus session" onClick={() => navigate('focus')}><Icon name="play" size={17} /></Button>
        </article>

        <article className="medicine-promo">
          <span className="promo-icon"><Icon name="pill" /></span>
          <div><small>NEXT MEDICINE · 8:00 PM</small><strong>Vitamin D</strong><p>1 tablet · After dinner</p></div>
          <Button className="text-button" onClick={() => navigate('medicine')}>Details <Icon name="arrow" size={14} /></Button>
        </article>
      </section>
    </>
  )
}

function TasksPage({
  tasks,
  toggleTask,
  addTask,
  updateTask,
  deleteTask,
}: {
  tasks: Task[]
  toggleTask: (id: number) => void
  addTask: (title: string) => void
  updateTask: (id: number, title: string) => void
  deleteTask: (id: number) => void
}) {
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all')
  const [composerOpen, setComposerOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const visibleTasks = tasks.filter((task) => filter === 'all' || (filter === 'done' ? task.completed : !task.completed))
  const completed = tasks.filter((task) => task.completed).length

  const submitTask = () => {
    if (!newTitle.trim()) return
    if (editingId) updateTask(editingId, newTitle.trim())
    else addTask(newTitle.trim())
    setNewTitle('')
    setEditingId(null)
    setComposerOpen(false)
  }

  const editTask = (task: Task) => {
    setEditingId(task.id)
    setNewTitle(task.title)
    setComposerOpen(true)
  }

  return (
    <>
      <div className="heading-with-action">
        <PageHeading page="tasks" />
        <Button className="primary-button" onClick={() => setComposerOpen(!composerOpen)}><Icon name="plus" size={17} /> New task</Button>
      </div>

      <section className="task-summary">
        <div><span>WEEKLY PROGRESS</span><strong>{completed}/{tasks.length} quests complete</strong><ProgressBar value={(completed / tasks.length) * 100} /></div>
        <div className="xp-badge"><Icon name="spark" /><span><small>XP EARNED</small><b>{completed * 20 + 180}</b></span></div>
      </section>

      {composerOpen && (
        <section className="task-composer">
          <span className="composer-icon"><Icon name="task" /></span>
          <label><span>{editingId ? 'Update your task' : 'What needs to be done?'}</span><input autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submitTask()} placeholder="e.g. Finish chapter 5 notes" /></label>
          {editingId && <Button className="outline-button" onClick={() => { setEditingId(null); setNewTitle(''); setComposerOpen(false) }}>Cancel</Button>}
          <Button className="primary-button" onClick={submitTask}>{editingId ? 'Save changes' : 'Add quest'} <Icon name="arrow" size={15} /></Button>
        </section>
      )}

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
          {visibleTasks.map((task) => (
            <div className={`full-task-row ${task.completed ? 'done' : ''}`} key={task.id}>
              <TaskCheck checked={task.completed} onClick={() => toggleTask(task.id)} />
              <span className={`course-badge ${task.color}`}><Icon name="book" size={16} /></span>
              <div><strong>{task.title}</strong><span>{task.course} · Today at {task.time}</span></div>
              <em>+{task.points} XP</em>
              <Button className="mini-edit-button" onClick={() => editTask(task)}>Edit</Button>
              <Button className="icon-button delete-button" ariaLabel={`Delete ${task.title}`} onClick={() => setDeleteId(task.id)}><Icon name="trash" size={16} /></Button>
            </div>
          ))}
          {visibleTasks.length === 0 && <div className="empty-state"><Icon name="spark" size={28} /><strong>All clear!</strong><span>No quests in this view.</span></div>}
        </div>
      </section>
      {deleteId !== null && (
        <div className="modal-layer">
          <Button className="modal-scrim" ariaLabel="Cancel deletion" onClick={() => setDeleteId(null)} />
          <section className="confirm-modal">
            <span className="danger-icon"><Icon name="trash" /></span>
            <div role="heading" aria-level={2}>Delete this task?</div>
            <p>This action cannot be undone. Your task and its reminder will be removed.</p>
            <div><Button className="outline-button" onClick={() => setDeleteId(null)}>Cancel</Button><Button className="danger-button" onClick={() => { deleteTask(deleteId); setDeleteId(null) }}>Delete task</Button></div>
          </section>
        </div>
      )}
    </>
  )
}

function CalendarPage() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [connected, setConnected] = useState(false)
  const days = [
    { day: 'MON', date: 13 },
    { day: 'TUE', date: 14 },
    { day: 'WED', date: 15 },
    { day: 'THU', date: 16 },
    { day: 'FRI', date: 17 },
  ]
  const events = [
    { day: 0, start: 0, span: 1, title: 'Data Structures', meta: '9:00 · Room 302', color: 'blue' },
    { day: 1, start: 1, span: 2, title: 'Software Engineering', meta: '10:30 · Room 405', color: 'yellow' },
    { day: 2, start: 3, span: 1, title: 'Project workshop', meta: '1:30 · Lab 2', color: 'coral' },
    { day: 3, start: 2, span: 1, title: 'System Analysis', meta: '12:00 · Room 210', color: 'green' },
    { day: 4, start: 4, span: 1, title: 'Deep focus', meta: '3:00 · Library', color: 'purple' },
  ]
  return (
    <>
      <div className="heading-with-action">
        <PageHeading page="calendar" />
        <div className="calendar-actions"><Button className={connected ? 'sync-button connected' : 'sync-button'} onClick={() => setConnected(!connected)}><Icon name={connected ? 'check' : 'calendar'} size={16} /> {connected ? 'Google Calendar synced' : 'Connect Google Calendar'}</Button><Button className="primary-button"><Icon name="plus" size={17} /> Add event</Button></div>
      </div>
      <section className="calendar-toolbar">
        <div><Button className="icon-button" onClick={() => setWeekOffset(weekOffset - 1)}><Icon name="chevron" size={17} /></Button><strong>{weekOffset === 0 ? 'May 13 — 17, 2026' : weekOffset < 0 ? 'May 6 — 10, 2026' : 'May 20 — 24, 2026'}</strong><Button className="icon-button next" onClick={() => setWeekOffset(weekOffset + 1)}><Icon name="chevron" size={17} /></Button></div>
        <div className="view-switch"><Button className="active">Week</Button><Button>Month</Button></div>
      </section>
      <section className="panel calendar-board">
        <div className="calendar-head"><span /><span className="all-day-label">ALL DAY</span>{days.map((day) => <div className={day.date === 14 ? 'today' : ''} key={day.day}><small>{day.day}</small><b>{day.date}</b></div>)}</div>
        <div className="calendar-body">
          <div className="time-labels">{['9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM'].map((time) => <span key={time}>{time}</span>)}</div>
          <div className="calendar-lines">{Array.from({ length: 7 }).map((_, index) => <i key={index} />)}</div>
          <div className="day-columns">{days.map((day) => <span className={day.date === 14 ? 'today-column' : ''} key={day.day} />)}</div>
          {events.map((event) => (
            <article className={`calendar-event ${event.color}`} key={event.title} style={{ '--day': event.day, '--start': event.start, '--span': event.span } as React.CSSProperties}>
              <strong>{event.title}</strong><span>{event.meta}</span>
            </article>
          ))}
          <span className="current-time"><i />12:18</span>
        </div>
      </section>
    </>
  )
}

function RemindersPage() {
  const [reminders, setReminders] = useState([
    { id: 1, title: 'Project presentation', when: 'Today · 3:30 PM', lead: '30 minutes before', status: 'upcoming', icon: 'task' as IconName, color: 'coral' },
    { id: 2, title: 'Software Engineering class', when: 'Today · 10:00 AM', lead: '30 minutes before', status: 'missed', icon: 'calendar' as IconName, color: 'blue' },
    { id: 3, title: 'Take Vitamin D', when: 'Today · 8:00 PM', lead: 'At scheduled time', status: 'upcoming', icon: 'pill' as IconName, color: 'yellow' },
  ])
  const [composerOpen, setComposerOpen] = useState(false)
  const [title, setTitle] = useState('')

  const addReminder = () => {
    if (!title.trim()) return
    setReminders([...reminders, { id: Date.now(), title: title.trim(), when: 'Tomorrow · 9:00 AM', lead: '15 minutes before', status: 'upcoming', icon: 'bell', color: 'green' }])
    setTitle('')
    setComposerOpen(false)
  }

  return (
    <>
      <div className="heading-with-action">
        <PageHeading page="reminders" />
        <Button className="primary-button" onClick={() => setComposerOpen(!composerOpen)}><Icon name="plus" size={17} /> Set reminder</Button>
      </div>
      {composerOpen && (
        <section className="reminder-composer panel">
          <label><span>REMINDER TITLE</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What should we remind you about?" /></label>
          <label><span>DATE</span><input type="date" defaultValue="2026-05-15" /></label>
          <label><span>TIME</span><input type="time" defaultValue="09:00" /></label>
          <Button className="primary-button" onClick={addReminder}>Save reminder</Button>
        </section>
      )}
      <section className="reminder-summary">
        <div><span className="summary-icon"><Icon name="bell" /></span><span><small>NEXT REMINDER</small><strong>Project presentation</strong><p>In 2 hours, 12 minutes</p></span></div>
        <Button className="light-button">Snooze for 10 min</Button>
      </section>
      <section className="reminder-layout">
        <article className="panel reminder-list">
          <div className="panel-heading"><div><span>TODAY</span><strong>Scheduled alerts</strong></div><span className="count-chip">{reminders.length}</span></div>
          {reminders.map((reminder) => (
            <div className={`reminder-row ${reminder.status}`} key={reminder.id}>
              <span className={`reminder-icon ${reminder.color}`}><Icon name={reminder.icon} /></span>
              <div><strong>{reminder.title}</strong><span>{reminder.when} · {reminder.lead}</span>{reminder.status === 'missed' && <em>Missed reminder — review now</em>}</div>
              <Button className="mini-edit-button">Edit</Button>
              <Button className="icon-button delete-button" onClick={() => setReminders(reminders.filter((item) => item.id !== reminder.id))} ariaLabel={`Delete ${reminder.title}`}><Icon name="trash" size={15} /></Button>
            </div>
          ))}
        </article>
        <aside className="panel reminder-settings">
          <span>NOTIFICATION SETTINGS</span>
          <strong>Stay in control.</strong>
          <label><span><b>Task deadlines</b><small>30 minutes before</small></span><input type="checkbox" defaultChecked /></label>
          <label><span><b>Class reminders</b><small>15 minutes before</small></span><input type="checkbox" defaultChecked /></label>
          <label><span><b>Missed alerts</b><small>Send a follow-up</small></span><input type="checkbox" defaultChecked /></label>
          <label><span><b>Focus completion</b><small>Sound and in-app alert</small></span><input type="checkbox" defaultChecked /></label>
        </aside>
      </section>
    </>
  )
}

function NotesPage() {
  const [notes, setNotes] = useState([
    { id: 1, title: 'Software engineering', body: 'Key principles of agile development, sprint planning, and iterative delivery.', date: 'Edited today', color: 'yellow' },
    { id: 2, title: 'UFlow project ideas', body: 'Improve the focus timer with ambient sounds and add a weekly reflection.', date: 'Edited yesterday', color: 'blue' },
    { id: 3, title: 'Exam preparation', body: 'Review chapters 4–8. Focus on diagrams, definitions, and sample questions.', date: 'May 12', color: 'coral' },
    { id: 4, title: 'Things to remember', body: 'Collect assignment brief from department office. Email project supervisor.', date: 'May 10', color: 'green' },
  ])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [documentName, setDocumentName] = useState('')
  const activeNote = notes.find((note) => note.id === editingId)

  const addNote = () => setNotes([{ id: Date.now(), title: 'Untitled note', body: 'Start writing your thoughts here...', date: 'Just now', color: 'yellow' }, ...notes])
  const updateNote = (field: 'title' | 'body', value: string) => setNotes(notes.map((note) => note.id === editingId ? { ...note, [field]: value, date: 'Edited just now' } : note))

  return (
    <>
      <div className="heading-with-action">
        <PageHeading page="notes" />
        <Button className="primary-button" onClick={addNote}><Icon name="plus" size={17} /> New note</Button>
      </div>
      <section className="notes-tools">
        <label className="page-search"><Icon name="search" size={18} /><input placeholder="Search your notes..." /></label>
        <label className="upload-button"><Icon name="book" size={16} /><span>{documentName || 'Upload document'}</span><input type="file" onChange={(event) => setDocumentName(event.target.files?.[0]?.name ?? '')} /></label>
        <span>{notes.length} notes</span>
      </section>
      <section className="notes-grid">
        {notes.map((note, index) => (
          <article className={`note-card ${note.color}`} key={note.id}>
            <div><span className="note-icon"><Icon name={index === 1 ? 'spark' : 'note'} /></span><span className="note-actions"><Button className="mini-edit-button" onClick={() => setEditingId(note.id)}>Edit</Button><Button className="icon-button" ariaLabel={`Delete ${note.title}`} onClick={() => setNotes(notes.filter((item) => item.id !== note.id))}><Icon name="trash" size={15} /></Button></span></div>
            <strong>{note.title}</strong>
            <p>{note.body}</p>
            <span>{note.date}<i>{note.body.split(' ').length} words</i></span>
          </article>
        ))}
        <Button className="new-note-card" onClick={addNote}><span><Icon name="plus" /></span><strong>Create a new note</strong><small>Capture your next great idea</small></Button>
      </section>
      {activeNote && (
        <div className="modal-layer">
          <Button className="modal-scrim" ariaLabel="Close note editor" onClick={() => setEditingId(null)} />
          <section className="note-editor">
            <div className="editor-top"><span><Icon name="note" /> EDIT NOTE</span><Button className="icon-button" onClick={() => setEditingId(null)} ariaLabel="Close editor"><Icon name="plus" /></Button></div>
            <input className="note-title-input" value={activeNote.title} onChange={(event) => updateNote('title', event.target.value)} />
            <textarea value={activeNote.body} onChange={(event) => updateNote('body', event.target.value)} />
            <div className="editor-footer"><span>Changes are saved automatically</span><Button className="primary-button" onClick={() => setEditingId(null)}>Done</Button></div>
          </section>
        </div>
      )}
    </>
  )
}

function FocusPage() {
  const [duration, setDuration] = useState(25)
  const [seconds, setSeconds] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    if (!running || seconds <= 0) return
    const timer = window.setInterval(() => setSeconds((value) => value - 1), 1000)
    return () => window.clearInterval(timer)
  }, [running, seconds])

  useEffect(() => {
    if (seconds === 0 && running) {
      setRunning(false)
      setCompleted(true)
    }
  }, [seconds, running])

  const chooseDuration = (minutes: number) => {
    setDuration(minutes)
    setSeconds(minutes * 60)
    setRunning(false)
    setCompleted(false)
  }
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0')
  const progress = ((duration * 60 - seconds) / (duration * 60)) * 100

  return (
    <>
      <PageHeading page="focus" />
      <section className="focus-layout">
        <article className="focus-studio">
          <div className="focus-modes">
            {[25, 50, 15].map((minutes) => <Button className={duration === minutes ? 'active' : ''} key={minutes} onClick={() => chooseDuration(minutes)}>{minutes === 25 ? 'Focus' : minutes === 50 ? 'Deep work' : 'Quick sprint'}<span>{minutes}m</span></Button>)}
          </div>
          <div className="timer-wrap" style={{ '--timer-progress': `${progress * 3.6}deg` } as React.CSSProperties}>
            <div className="timer-face"><span>TIME TO FOCUS</span><strong>{minutes}:{remainingSeconds}</strong><small>{running ? 'You’ve got this, U B.' : 'Select play when you’re ready.'}</small></div>
          </div>
          <div className="timer-actions">
            <Button className="secondary-round" ariaLabel="Reset timer" onClick={() => { setRunning(false); setSeconds(duration * 60) }}><Icon name="clock" /></Button>
            <Button className="timer-play" onClick={() => setRunning(!running)}><Icon name={running ? 'pause' : 'play'} size={22} /> {running ? 'Pause' : 'Start focus'}</Button>
            <Button className="secondary-round" ariaLabel="Skip timer" onClick={() => setSeconds(0)}><Icon name="arrow" /></Button>
          </div>
        </article>
        <aside className="focus-side">
          <article className="focus-goal">
            <span><Icon name="spark" /></span><small>TODAY’S GOAL</small><strong>2h 35m</strong><p>of 3 hours focused</p><ProgressBar value={86} color="blue" /><em>25 minutes to go</em>
          </article>
          <article className="focus-history panel">
            <span>THIS WEEK</span><strong>Focus rhythm</strong>
            <div className="bar-chart">{[58, 82, 45, 95, 68, 28, 12].map((height, index) => <i key={index} style={{ height: `${height}%` }}><small>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][index]}</small></i>)}</div>
            <p><b>8h 20m</b><span>Total focused this week</span></p>
          </article>
        </aside>
      </section>
      {completed && (
        <div className="completion-toast">
          <span><Icon name="spark" /></span>
          <div><strong>Focus session complete!</strong><p>Great work, U B. Take a short break before your next session.</p></div>
          <Button className="icon-button" onClick={() => setCompleted(false)} ariaLabel="Dismiss completion message"><Icon name="plus" /></Button>
        </div>
      )}
    </>
  )
}

function MedicinePage() {
  const [taken, setTaken] = useState<number[]>([1])
  const [medicines, setMedicines] = useState([
    { id: 1, name: 'Vitamin C', detail: '1 tablet · After breakfast', time: '8:00 AM', color: 'yellow' },
    { id: 2, name: 'Omega 3', detail: '1 capsule · With lunch', time: '1:00 PM', color: 'blue' },
    { id: 3, name: 'Vitamin D', detail: '1 tablet · After dinner', time: '8:00 PM', color: 'coral' },
  ])
  const [composerOpen, setComposerOpen] = useState(false)
  const [medicineName, setMedicineName] = useState('')
  const toggleTaken = (id: number) => setTaken(taken.includes(id) ? taken.filter((item) => item !== id) : [...taken, id])
  const addMedicine = () => {
    if (!medicineName.trim()) return
    setMedicines([...medicines, { id: Date.now(), name: medicineName.trim(), detail: '1 dose · With food', time: '9:00 AM', color: 'green' }])
    setMedicineName('')
    setComposerOpen(false)
  }
  return (
    <>
      <div className="heading-with-action">
        <PageHeading page="medicine" />
        <Button className="primary-button" onClick={() => setComposerOpen(!composerOpen)}><Icon name="plus" size={17} /> Add medicine</Button>
      </div>
      {composerOpen && (
        <section className="medicine-composer panel">
          <label><span>MEDICINE NAME</span><input autoFocus value={medicineName} onChange={(event) => setMedicineName(event.target.value)} placeholder="e.g. Vitamin B12" /></label>
          <label><span>DOSAGE</span><input defaultValue="1 tablet" /></label>
          <label><span>SCHEDULE TIME</span><input type="time" defaultValue="09:00" /></label>
          <label><span>INSTRUCTIONS</span><input defaultValue="With food" /></label>
          <Button className="primary-button" onClick={addMedicine}>Save schedule</Button>
        </section>
      )}
      <section className="health-summary">
        <div><span className="health-icon"><Icon name="heart" /></span><span><small>TODAY’S ROUTINE</small><strong>{taken.length} of {medicines.length} doses taken</strong></span></div>
        <span className="adherence"><b>92%</b><small>30-day adherence</small></span>
      </section>
      <section className="medicine-layout">
        <div className="medicine-list">
          {medicines.map((medicine) => {
            const isTaken = taken.includes(medicine.id)
            return (
              <article className={`medicine-card ${isTaken ? 'taken' : ''}`} key={medicine.id}>
                <span className={`medicine-icon ${medicine.color}`}><Icon name="pill" /></span>
                <div><span>{medicine.time}</span><strong>{medicine.name}</strong><p>{medicine.detail}</p></div>
                <Button className={isTaken ? 'taken-button' : 'outline-button'} onClick={() => toggleTaken(medicine.id)}>{isTaken && <Icon name="check" size={15} />}{isTaken ? 'Taken' : 'Mark as taken'}</Button>
              </article>
            )
          })}
        </div>
        <aside className="panel routine-card">
          <span>WEEKLY ROUTINE</span><strong>Consistency is care.</strong>
          <div className="routine-days">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <i className={index < 5 ? 'complete' : index === 5 ? 'current' : ''} key={`${day}-${index}`}><b>{day}</b><span>{index < 5 && <Icon name="check" size={12} />}</span></i>)}
          </div>
          <p><Icon name="spark" size={16} /> You’re on a 5-day care streak!</p>
          <Button className="outline-button full-button">Manage schedule <Icon name="arrow" size={14} /></Button>
        </aside>
      </section>
    </>
  )
}

function AuthScreen({ onAuthenticate }: { onAuthenticate: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
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
    onAuthenticate()
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
          {mode === 'register' && <label className="auth-field"><span>FULL NAME</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="U B" /></label>}
          <label className="auth-field"><span>EMAIL ADDRESS</span><input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="student@example.com" type="email" /></label>
          <label className="auth-field"><span>PASSWORD</span><input value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submit()} placeholder="At least 6 characters" type="password" /></label>
          {error && <div className="auth-error"><Icon name="bell" size={15} /> {error}</div>}
          <div className="auth-options"><label><input type="checkbox" defaultChecked /> Keep me signed in</label>{mode === 'login' && <Button>Forgot password?</Button>}</div>
          <Button className="auth-submit" onClick={submit}>{mode === 'login' ? 'Sign in to UFlow' : 'Create my account'} <Icon name="arrow" size={16} /></Button>
          <div className="auth-divider"><span>OR CONTINUE WITH</span></div>
          <Button className="google-button"><b>G</b> Google</Button>
          <p className="auth-switch">{mode === 'login' ? 'New to UFlow?' : 'Already have an account?'} <Button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? 'Create account' : 'Sign in'}</Button></p>
          <Button className="demo-link" onClick={onAuthenticate}>Preview the student dashboard</Button>
        </div>
      </section>
    </main>
  )
}

function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [page, setPage] = useState<Page>('dashboard')
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const toggleTask = (id: number) => setTasks(tasks.map((task) => task.id === id ? { ...task, completed: !task.completed } : task))
  const addTask = (title: string) => setTasks([...tasks, { id: Date.now(), title, course: 'Personal', time: 'Today', points: 20, color: 'coral', completed: false }])
  const updateTask = (id: number, title: string) => setTasks(tasks.map((task) => task.id === id ? { ...task, title } : task))
  const deleteTask = (id: number) => setTasks(tasks.filter((task) => task.id !== id))
  const pageTitle = useMemo(() => navItems.find((item) => item.id === page)?.label ?? 'Home', [page])

  const navigate = (nextPage: Page) => {
    setPage(nextPage)
    setSidebarOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!authenticated) return <AuthScreen onAuthenticate={() => setAuthenticated(true)} />

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-top"><Brand /><Button className="mobile-close icon-button" onClick={() => setSidebarOpen(false)} ariaLabel="Close menu"><Icon name="plus" /></Button></div>
        <nav className="main-nav">
          <span className="nav-label">YOUR SPACE</span>
          {navItems.map((item) => (
            <Button className={page === item.id ? 'active' : ''} key={item.id} onClick={() => navigate(item.id)}>
              <Icon name={item.icon} size={19} /><span>{item.label}</span>{item.id === 'tasks' && <em>{tasks.filter((task) => !task.completed).length}</em>}
            </Button>
          ))}
        </nav>
        <article className="sidebar-goal">
          <span><Icon name="spark" size={17} /></span>
          <small>WEEKLY GOAL</small>
          <strong>18 of 25 tasks</strong>
          <ProgressBar value={72} />
          <p>7 tasks to your goal</p>
        </article>
        <div className="sidebar-user">
          <img src="/uflow-profile.jpg" alt="U B profile" />
          <span><strong>U B</strong><small>Level 8 · 1,240 XP</small></span>
          <Button ariaLabel="Sign out" onClick={() => setAuthenticated(false)}><Icon name="chevron" size={15} /></Button>
        </div>
      </aside>
      {sidebarOpen && <Button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} ariaLabel="Close navigation" />}

      <div className="app-main">
        <header className="topbar">
          <Button className="menu-button icon-button" onClick={() => setSidebarOpen(true)} ariaLabel="Open menu"><Icon name="menu" /></Button>
          <span className="mobile-title">{pageTitle}</span>
          <label className="global-search"><Icon name="search" size={17} /><input placeholder="Search tasks, notes, events..." /><kbd>⌘ K</kbd></label>
          <span className="sync-status"><i /> All synced</span>
          <Button className="notification-button icon-button" onClick={() => setNotificationsOpen(!notificationsOpen)} ariaLabel="Open notifications"><Icon name="bell" size={19} /><i /></Button>
          <Button className="top-add-button" onClick={() => navigate('tasks')}><Icon name="plus" size={17} /> Add new</Button>
        </header>

        <main className="content">
          {page === 'dashboard' && <Dashboard tasks={tasks} toggleTask={toggleTask} navigate={navigate} />}
          {page === 'tasks' && <TasksPage tasks={tasks} toggleTask={toggleTask} addTask={addTask} updateTask={updateTask} deleteTask={deleteTask} />}
          {page === 'calendar' && <CalendarPage />}
          {page === 'reminders' && <RemindersPage />}
          {page === 'notes' && <NotesPage />}
          {page === 'focus' && <FocusPage />}
          {page === 'medicine' && <MedicinePage />}
        </main>
      </div>

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
            <div className="drawer-heading"><div><span>NOTIFICATIONS</span><strong>You’re all caught up</strong></div><Button className="icon-button" onClick={() => setNotificationsOpen(false)} ariaLabel="Close notifications"><Icon name="plus" /></Button></div>
            <div className="notification-item new"><span className="coral"><Icon name="task" /></span><div><strong>Task due soon</strong><p>Project presentation is due at 4:00 PM.</p><small>10 minutes ago</small></div></div>
            <div className="notification-item"><span className="blue"><Icon name="calendar" /></span><div><strong>Class reminder</strong><p>Software Engineering starts in 30 minutes.</p><small>25 minutes ago</small></div></div>
            <div className="notification-item"><span className="yellow"><Icon name="pill" /></span><div><strong>Medicine reminder</strong><p>Vitamin D is scheduled for 8:00 PM.</p><small>1 hour ago</small></div></div>
            <Button className="outline-button full-button">Mark all as read</Button>
          </aside>
        </>
      )}
    </div>
  )
}

export default App
