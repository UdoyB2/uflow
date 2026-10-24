import { useCallback, useEffect, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from './firebase'

type Base = { id: string; createdAt: number }

// Fired whenever a read or write fails, so the top bar can show "Couldn’t save".
export const SYNC_ERROR_EVENT = 'uflow-sync-error'
const reportError = (error: unknown) => {
  console.error('UFlow sync error:', error)
  window.dispatchEvent(new Event(SYNC_ERROR_EVENT))
}

/**
 * Live list of documents at users/{uid}/{name}.
 * Changes appear instantly and sync across every device the user is signed in on.
 */
export function useCollection<T extends Base>(uid: string, name: string, newestFirst = false) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    return onSnapshot(
      collection(db, 'users', uid, name),
      (snapshot) => {
        const next = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as unknown as T)
        next.sort((a, b) => (newestFirst ? b.createdAt - a.createdAt : a.createdAt - b.createdAt))
        setItems(next)
        setLoading(false)
      },
      (error) => {
        reportError(error)
        setLoading(false)
      },
    )
  }, [uid, name, newestFirst])

  const add = useCallback(
    (data: Omit<T, 'id' | 'createdAt'>) =>
      addDoc(collection(db, 'users', uid, name), { ...data, createdAt: Date.now() } as Record<string, unknown>).catch(reportError),
    [uid, name],
  )

  const update = useCallback(
    (id: string, data: Partial<Omit<T, 'id' | 'createdAt'>>) =>
      updateDoc(doc(db, 'users', uid, name, id), data as Record<string, unknown>).catch(reportError),
    [uid, name],
  )

  const remove = useCallback(
    (id: string) => deleteDoc(doc(db, 'users', uid, name, id)).catch(reportError),
    [uid, name],
  )

  return { items, loading, add, update, remove }
}
