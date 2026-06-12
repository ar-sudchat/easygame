// Leaderboard top 5 — เก็บใน PostgreSQL ผ่าน API (/api/board)
// ถ้า API ล่ม/ออฟไลน์ จะ fallback ไป localStorage ให้เล่นต่อได้
export interface BoardEntry {
  name: string
  score: number
  char: string
  stage: number
}

const LOCAL_KEY = 'easygame-board-v1'
export const BOARD_SIZE = 5

let cached: BoardEntry[] = []
let offline = false

export function isOffline() {
  return offline
}

function loadLocal(): BoardEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as BoardEntry[]
    return Array.isArray(list) ? list.slice(0, BOARD_SIZE) : []
  } catch {
    return []
  }
}

function saveLocal(entry: BoardEntry): { board: BoardEntry[]; rank: number } {
  const board = loadLocal()
  board.push(entry)
  board.sort((a, b) => b.score - a.score)
  const top = board.slice(0, BOARD_SIZE)
  localStorage.setItem(LOCAL_KEY, JSON.stringify(top))
  return { board: top, rank: top.indexOf(entry) }
}

/** ดึงบอร์ดล่าสุดจากเซิร์ฟเวอร์ (เรียกตอนเริ่มเกม/เปิดหน้าบอร์ด) */
export async function refreshBoard(): Promise<BoardEntry[]> {
  try {
    const res = await fetch('/api/board')
    if (!res.ok) throw new Error(`${res.status}`)
    cached = (await res.json()) as BoardEntry[]
    offline = false
  } catch {
    offline = true
    cached = loadLocal()
  }
  return cached
}

/** บอร์ดล่าสุดที่รู้จัก (sync — ใช้เช็คตอนจบเกม) */
export function currentBoard(): BoardEntry[] {
  return cached
}

export function qualifies(score: number): boolean {
  if (score <= 0) return false
  return cached.length < BOARD_SIZE || score > cached[cached.length - 1].score
}

/** บันทึกคะแนน คืนบอร์ดใหม่ + อันดับที่ได้ (-1 ถ้าไม่ติด) */
export async function saveEntry(entry: BoardEntry): Promise<{ board: BoardEntry[]; rank: number }> {
  try {
    const res = await fetch('/api/board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
    if (!res.ok) throw new Error(`${res.status}`)
    const board = (await res.json()) as BoardEntry[]
    cached = board
    offline = false
    const rank = board.findIndex(
      (e) => e.name === entry.name && e.score === entry.score && e.char === entry.char,
    )
    return { board, rank }
  } catch {
    offline = true
    const result = saveLocal(entry)
    cached = result.board
    return result
  }
}
