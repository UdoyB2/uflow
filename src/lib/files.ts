import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore'
import { db } from './firebase'

/**
 * PDF storage that works on Firebase’s free Spark plan.
 * Each PDF is cut into pieces (chunks) and saved as small Firestore documents:
 *   users/{uid}/files/{fileId}                 -> name, size, chunkCount
 *   users/{uid}/files/{fileId}/chunks/{000...} -> a slice of the file as text
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024
const CHUNK_CHARS = 800_000 // stays safely under Firestore’s 1 MiB document limit

const readAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

const chunksOf = (uid: string, fileId: string) => collection(db, 'users', uid, 'files', fileId, 'chunks')

export async function uploadPdf(uid: string, file: File, onProgress?: (percent: number) => void) {
  const base64 = await readAsBase64(file)
  const chunkCount = Math.max(1, Math.ceil(base64.length / CHUNK_CHARS))
  const fileId = doc(collection(db, 'users', uid, 'files')).id

  try {
    for (let index = 0; index < chunkCount; index++) {
      await setDoc(doc(chunksOf(uid, fileId), String(index).padStart(3, '0')), {
        data: base64.slice(index * CHUNK_CHARS, (index + 1) * CHUNK_CHARS),
      })
      onProgress?.(Math.round(((index + 1) / chunkCount) * 100))
    }
    // The file record is written last, so half-finished uploads never show in the list.
    await setDoc(doc(db, 'users', uid, 'files', fileId), {
      name: file.name,
      size: file.size,
      chunkCount,
      createdAt: Date.now(),
    })
  } catch (error) {
    const leftovers = await getDocs(chunksOf(uid, fileId)).catch(() => null)
    await Promise.all(leftovers?.docs.map((item) => deleteDoc(item.ref)) ?? []).catch(() => undefined)
    throw error
  }
}

export async function fetchPdfBlob(uid: string, fileId: string) {
  const snapshot = await getDocs(chunksOf(uid, fileId))
  const base64 = snapshot.docs
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => item.data().data as string)
    .join('')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: 'application/pdf' })
}

export async function deletePdf(uid: string, fileId: string) {
  const snapshot = await getDocs(chunksOf(uid, fileId))
  await deleteDoc(doc(db, 'users', uid, 'files', fileId))
  await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)))
}
