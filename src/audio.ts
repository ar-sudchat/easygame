import Phaser from 'phaser'

// เสียงทั้งหมด CC0 — BGM: Juhani Junkala (OpenGameArt) · SFX/jingle: Kenney.nl
const MUTE_KEY = 'easygame-muted'

export const AUDIO_FILES: { key: string; url: string }[] = [
  { key: 'bgm-title', url: 'assets/audio/bgm-title.m4a' },
  { key: 'bgm-game', url: 'assets/audio/bgm-game.m4a' },
  { key: 'bgm-rush', url: 'assets/audio/bgm-rush.m4a' },
  { key: 'sfx-chest', url: 'assets/audio/sfx-chest.ogg' },
  { key: 'sfx-powerbox', url: 'assets/audio/sfx-powerbox.ogg' },
  { key: 'sfx-skill', url: 'assets/audio/sfx-skill.ogg' },
  { key: 'sfx-shoot', url: 'assets/audio/sfx-shoot.ogg' },
  { key: 'sfx-hit', url: 'assets/audio/sfx-hit.ogg' },
  { key: 'sfx-die', url: 'assets/audio/sfx-die.ogg' },
  { key: 'sfx-hurt', url: 'assets/audio/sfx-hurt.ogg' },
  { key: 'sfx-click', url: 'assets/audio/sfx-click.ogg' },
  { key: 'sfx-freeze', url: 'assets/audio/sfx-freeze.ogg' },
  { key: 'sfx-heal', url: 'assets/audio/sfx-heal.ogg' },
  { key: 'jingle-stage', url: 'assets/audio/jingle-stage.ogg' },
  { key: 'jingle-lose', url: 'assets/audio/jingle-lose.ogg' },
]

// เสียงพากย์ฮา ๆ สไตล์อีสาน — แทนที่ไฟล์ใน public/assets/audio/voice/ ด้วยเสียงอัดเองได้เลย
// (ชื่อไฟล์เดิม จำนวนเปลี่ยนได้โดยแก้ count)
// คละ 2 สำเนียง: อีสาน + เขมรถิ่นไทย (บุรีรัมย์-สุรินทร์)
export const VOICE_GROUPS: Record<string, number> = {
  hurt: 9,
  kill: 9, // kill-9 = "เมียนปะ" คำฮิต
  power: 7, // power-7 = "เมียนปะ มีแล้วเด้อ"
  rush: 5,
  lose: 5,
  stage: 3,
}

const VOICE_COOLDOWN_MS = 2500
let lastVoiceAt = 0

let muted = false
try {
  muted = localStorage.getItem(MUTE_KEY) === '1'
} catch {
  /* private mode */
}

let bgmKey: string | null = null

export function loadAudio(scene: Phaser.Scene) {
  for (const f of AUDIO_FILES) scene.load.audio(f.key, f.url)
  for (const [group, count] of Object.entries(VOICE_GROUPS)) {
    for (let i = 1; i <= count; i++) {
      scene.load.audio(`voice-${group}-${i}`, `assets/audio/voice/${group}-${i}.m4a`)
    }
  }
}

/** เสียงพากย์สุ่มจากกลุ่ม — มี cooldown กันพูดรัวจนรำคาญ · force ใช้กับเหตุการณ์สำคัญ (ตาย/RUSH) */
export function voice(scene: Phaser.Scene, group: keyof typeof VOICE_GROUPS, force = false) {
  if (scene.sound.locked) return
  const now = Date.now()
  if (!force && now - lastVoiceAt < VOICE_COOLDOWN_MS) return
  lastVoiceAt = now
  const count = VOICE_GROUPS[group]
  const i = Phaser.Math.Between(1, count)
  scene.sound.play(`voice-${group}-${i}`, { volume: 0.85 })
}

export function applyMute(scene: Phaser.Scene) {
  scene.sound.mute = muted
}

export function isMuted() {
  return muted
}

export function toggleMute(scene: Phaser.Scene): boolean {
  muted = !muted
  scene.sound.mute = muted
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    /* private mode */
  }
  return muted
}

export function sfx(scene: Phaser.Scene, key: string, volume = 0.5) {
  if (scene.sound.locked) return // ก่อน gesture แรกของผู้ใช้ เบราว์เซอร์ยังไม่ปลดล็อกเสียง
  scene.sound.play(key, { volume })
}

/** เปิดเพลงวน (เปลี่ยนเพลงอัตโนมัติถ้า key ต่างจากที่เล่นอยู่) */
export function playBgm(scene: Phaser.Scene, key: string, volume = 0.3) {
  if (bgmKey === key) return
  stopBgm(scene)
  bgmKey = key
  const start = () => {
    if (bgmKey !== key) return // ถูกเปลี่ยนไปเพลงอื่นระหว่างรอปลดล็อก
    scene.sound.play(key, { loop: true, volume })
  }
  if (scene.sound.locked) scene.sound.once(Phaser.Sound.Events.UNLOCKED, start)
  else start()
}

export function stopBgm(scene: Phaser.Scene) {
  if (!bgmKey) return
  scene.sound.stopByKey(bgmKey)
  bgmKey = null
}
