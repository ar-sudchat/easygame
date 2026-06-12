// API server ของเกม — dev ใช้ Postgres local, ดีพลอยจริงแค่ตั้ง DATABASE_URL ใหม่
import express from 'express'
import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001
const BOARD_SIZE = 5
const ALLOWED_CHARS = ['wolf', 'duck', 'rabbit', 'bird']

const pool = new pg.Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : { host: 'localhost', database: 'easygame' }, // local dev: homebrew postgres ไม่ใช้รหัสผ่าน
)

// รัน schema ตอนบูต (idempotent) — retry เผื่อ DB container ขึ้นช้ากว่าแอป
async function initDb(attempts = 10) {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query(schema)
      console.log('db schema ready')
      return
    } catch (err) {
      console.error(`db init ${i}/${attempts} failed: ${err.message}`)
      if (i < attempts) await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

const app = express()
app.use(express.json())

// healthcheck ของ Coolify — ตอบเร็ว ไม่แตะ DB (DB ล่มเกมยังเล่นได้แบบ offline board)
app.get('/health', (_req, res) => res.status(200).send('ok'))

app.get('/api/board', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT name, score, char, stage
       FROM leaderboard
       ORDER BY score DESC, created_at ASC
       LIMIT $1`,
      [BOARD_SIZE],
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'db error' })
  }
})

app.post('/api/board', async (req, res) => {
  const { name, score, char, stage } = req.body ?? {}
  const cleanName = String(name ?? '').trim().slice(0, 16) || 'ไม่ระบุชื่อ'
  const cleanScore = Number.parseInt(score, 10)
  const cleanStage = Math.max(1, Number.parseInt(stage, 10) || 1)
  if (!Number.isFinite(cleanScore) || cleanScore < 0 || cleanScore > 1_000_000) {
    return res.status(400).json({ error: 'invalid score' })
  }
  if (!ALLOWED_CHARS.includes(char)) {
    return res.status(400).json({ error: 'invalid char' })
  }
  try {
    await pool.query(
      `INSERT INTO leaderboard (name, score, char, stage) VALUES ($1, $2, $3, $4)`,
      [cleanName, cleanScore, char, cleanStage],
    )
    // เก็บเฉพาะ top N — ลบส่วนเกินทิ้ง (ตารางเล็ก ใช้วิธีตรงไปตรงมาได้)
    await pool.query(
      `DELETE FROM leaderboard
       WHERE id NOT IN (
         SELECT id FROM leaderboard ORDER BY score DESC, created_at ASC LIMIT $1
       )`,
      [BOARD_SIZE],
    )
    const { rows } = await pool.query(
      `SELECT name, score, char, stage
       FROM leaderboard
       ORDER BY score DESC, created_at ASC
       LIMIT $1`,
      [BOARD_SIZE],
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'db error' })
  }
})

// โหมดดีพลอย: เสิร์ฟไฟล์เกมที่ build แล้วจาก dist/ (เซิร์ฟเวอร์เดียวจบ)
app.use(express.static(path.join(__dirname, '..', 'dist')))

void initDb()
app.listen(PORT, () => console.log(`game api on :${PORT}`))
