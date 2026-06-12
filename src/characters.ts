// สเปก sprite sheet ทั้งหมด (เฟรมขนาดเท่ากัน เรียงแนวนอน — สร้างโดยสคริปต์ตัดพื้นขาว)
export interface SheetDef {
  key: string
  url: string
  frameWidth: number
  frameHeight: number
  frames: number
}

export const SHEETS: SheetDef[] = [
  // ชุดแรก (4 เฟรม) — ใช้เป็นภาพไอคอน + อนิเมชันหน้าเลือกตัว
  { key: 'wolf', url: 'assets/chars/wolf.png', frameWidth: 171, frameHeight: 155, frames: 6 },
  { key: 'duck', url: 'assets/chars/duck.png', frameWidth: 209, frameHeight: 226, frames: 4 },
  { key: 'rabbit', url: 'assets/chars/rabbit.png', frameWidth: 182, frameHeight: 237, frames: 4 },
  { key: 'bird', url: 'assets/chars/bird.png', frameWidth: 199, frameHeight: 241, frames: 4 },
  // ชุดอนิเมชันเพิ่ม (6 เฟรม)
  { key: 'orc-rage', url: 'assets/chars/orc-rage.png', frameWidth: 171, frameHeight: 160, frames: 6 },
  { key: 'goblin-hurt', url: 'assets/chars/goblin-hurt.png', frameWidth: 171, frameHeight: 161, frames: 6 },
  { key: 'goblin-walk', url: 'assets/chars/goblin-walk.png', frameWidth: 171, frameHeight: 158, frames: 6 },
  { key: 'orc-walk', url: 'assets/chars/orc-walk.png', frameWidth: 171, frameHeight: 166, frames: 6 },
  { key: 'wolf-atk1', url: 'assets/chars/wolf-atk1.png', frameWidth: 171, frameHeight: 152, frames: 6 },
  { key: 'wolf-atk2', url: 'assets/chars/wolf-atk2.png', frameWidth: 171, frameHeight: 160, frames: 6 },
  { key: 'rabbit-punch', url: 'assets/chars/rabbit-punch.png', frameWidth: 165, frameHeight: 154, frames: 6 },
  { key: 'rabbit-run', url: 'assets/chars/rabbit-run.png', frameWidth: 151, frameHeight: 162, frames: 6 },
  { key: 'duck-potion', url: 'assets/chars/duck-potion.png', frameWidth: 170, frameHeight: 168, frames: 6 },
  { key: 'duck-run', url: 'assets/chars/duck-run.png', frameWidth: 164, frameHeight: 157, frames: 6 },
  { key: 'bird-walk', url: 'assets/chars/bird-walk.png', frameWidth: 164, frameHeight: 161, frames: 6 },
  { key: 'bird-hurt', url: 'assets/chars/bird-hurt.png', frameWidth: 171, frameHeight: 155, frames: 6 },
  { key: 'bird-run', url: 'assets/chars/bird-run.png', frameWidth: 159, frameHeight: 164, frames: 6 },
]

export function sheetOf(key: string): SheetDef {
  const s = SHEETS.find((s) => s.key === key)
  if (!s) throw new Error(`unknown sheet: ${key}`)
  return s
}

// อนิเมชัน: ชื่อ = sheet key (เฟรมทั้งแผ่น) ยกเว้นระบุ frames เอง
export interface AnimDef {
  animKey: string
  sheetKey: string
  frames?: number[]
  rate: number
  loop: boolean
}

export const ANIMS: AnimDef[] = [
  // เดิน/วิ่ง (วน)
  { animKey: 'wolf-walk', sheetKey: 'wolf', rate: 8, loop: true },
  { animKey: 'duck-run', sheetKey: 'duck-run', rate: 10, loop: true },
  { animKey: 'rabbit-run', sheetKey: 'rabbit-run', rate: 10, loop: true },
  { animKey: 'bird-run', sheetKey: 'bird-run', rate: 10, loop: true },
  { animKey: 'goblin-walk', sheetKey: 'goblin-walk', rate: 8, loop: true },
  { animKey: 'orc-walk', sheetKey: 'orc-walk', rate: 7, loop: true },
  { animKey: 'orc-rage', sheetKey: 'orc-rage', rate: 9, loop: true },
  // หน้าเลือกตัว (วน)
  { animKey: 'duck-idle', sheetKey: 'duck', rate: 6, loop: true },
  { animKey: 'rabbit-idle', sheetKey: 'rabbit', rate: 6, loop: true },
  { animKey: 'bird-idle', sheetKey: 'bird', rate: 6, loop: true },
  // ท่าพิเศษ (เล่นครั้งเดียว)
  { animKey: 'wolf-atk1', sheetKey: 'wolf-atk1', rate: 14, loop: false },
  { animKey: 'wolf-atk2', sheetKey: 'wolf-atk2', rate: 14, loop: false },
  { animKey: 'rabbit-punch', sheetKey: 'rabbit-punch', rate: 14, loop: false },
  { animKey: 'duck-potion', sheetKey: 'duck-potion', rate: 12, loop: false },
  { animKey: 'bird-hurt', sheetKey: 'bird-hurt', frames: [0, 1, 2], rate: 10, loop: false },
]

export interface CharacterSpec {
  key: string
  nameTh: string
  speed: number
  displayHeight: number
  /** ทิศที่ตัวละครหันในภาพต้นฉบับ */
  facing: 'left' | 'right'
  /** sheet ไอคอน (เฟรม 0) + อนิเมชันหน้าเลือกตัว */
  iconSheet: string
  selectAnim: string
  /** อนิเมชันเดินในเกม */
  walkAnim: string
  /** ท่าตอนยิงปืน (สุ่ม) */
  shotAnims?: string[]
  /** ท่าตอนเก็บกล่องพลัง */
  pickupAnims?: string[]
  /** ท่าตอนโดนตี */
  hurtAnim?: string
}

export const PLAYABLE: CharacterSpec[] = [
  {
    key: 'wolf', nameTh: 'หมาป่า', speed: 300, displayHeight: 78, facing: 'right',
    iconSheet: 'wolf', selectAnim: 'wolf-walk', walkAnim: 'wolf-walk',
    shotAnims: ['wolf-atk1', 'wolf-atk2'],
  },
  {
    key: 'duck', nameTh: 'เป็ด', speed: 260, displayHeight: 78, facing: 'right',
    iconSheet: 'duck', selectAnim: 'duck-idle', walkAnim: 'duck-run',
    pickupAnims: ['duck-potion'],
  },
  {
    key: 'rabbit', nameTh: 'กระต่าย', speed: 320, displayHeight: 78, facing: 'right',
    iconSheet: 'rabbit', selectAnim: 'rabbit-idle', walkAnim: 'rabbit-run',
    shotAnims: ['rabbit-punch'],
  },
  {
    key: 'bird', nameTh: 'นก', speed: 285, displayHeight: 76, facing: 'right',
    iconSheet: 'bird', selectAnim: 'bird-idle', walkAnim: 'bird-run',
    hurtAnim: 'bird-hurt',
  },
]

export function specOf(key: string): CharacterSpec {
  return PLAYABLE.find((c) => c.key === key) ?? PLAYABLE[0]
}

// ศัตรู 2 ชนิด: ก๊อบลินเล็กเร็ว · ออร์คใหญ่อึด (มีร่างคลั่งช่วง RUSH)
export interface EnemySpec {
  key: string
  walkAnim: string
  rageAnim?: string
  /** sheet+เฟรมตอนตาย */
  deathSheet: string
  deathFrame: number
  hp: number
  damage: number
  score: number
  displayHeight: number
  speed: number
  facing: 'left' | 'right'
}

export const ENEMY_TYPES: EnemySpec[] = [
  {
    key: 'goblin2', walkAnim: 'goblin-walk', deathSheet: 'goblin-hurt', deathFrame: 5,
    hp: 1, damage: 25, score: 20, displayHeight: 62, speed: 140, facing: 'right',
  },
  {
    key: 'orc', walkAnim: 'orc-walk', rageAnim: 'orc-rage', deathSheet: 'orc-rage', deathFrame: 5,
    hp: 2, damage: 40, score: 40, displayHeight: 88, speed: 105, facing: 'left',
  },
]
