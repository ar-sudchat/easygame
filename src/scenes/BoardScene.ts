import Phaser from 'phaser'
import { applyMute, playBgm, sfx } from '../audio'
import { currentBoard, isOffline, refreshBoard, saveEntry, type BoardEntry } from '../board'
import { sheetOf, specOf } from '../characters'

const FONT = '"Sukhumvit Set", "Thonburi", Arial, sans-serif'

interface Pending {
  score: number
  char: string
  stage: number
}

// บอร์ดอันดับ 1-5 พร้อมไอคอนตัวละครที่ใช้เล่น · ถ้าติดอันดับจะมีช่องใส่ชื่อ
export class BoardScene extends Phaser.Scene {
  private pending?: Pending
  private rows: Phaser.GameObjects.GameObject[] = []
  private nameInput?: HTMLDivElement

  constructor() {
    super('board')
  }

  init(data: { pending?: Pending }) {
    this.pending = data?.pending
  }

  create() {
    this.rows = []
    applyMute(this)
    playBgm(this, 'bgm-title')
    this.add
      .text(this.scale.width / 2, 60, 'อันดับสูงสุด', { fontFamily: FONT, fontSize: '36px', color: '#ffffff' })
      .setOrigin(0.5)

    this.renderRows(currentBoard(), -1)
    // ดึงข้อมูลล่าสุดจากเซิร์ฟเวอร์แล้ววาดทับ
    void refreshBoard().then((board) => {
      if (this.scene.isActive()) this.renderRows(board, -1)
      if (isOffline()) this.offlineBadge()
    })

    if (this.pending) {
      this.askName(this.pending)
    } else {
      this.showHint()
    }

    this.input.keyboard!.on('keydown-SPACE', () => {
      if (!this.nameInput) this.scene.start('select')
    })
  }

  private renderRows(board: BoardEntry[], highlight: number) {
    for (const r of this.rows) r.destroy()
    this.rows = []
    const cx = this.scale.width / 2
    const top = 120
    for (let i = 0; i < 5; i++) {
      const y = top + i * 62
      const entry = board[i]
      const isNew = i === highlight
      const bg = this.add
        .rectangle(cx, y, 520, 54, isNew ? 0x2f4858 : 0x1f2a40, 1)
        .setStrokeStyle(isNew ? 2 : 1, isNew ? 0x4ecca3 : 0x32425f)
      this.rows.push(bg)
      this.rows.push(
        this.add
          .text(cx - 230, y, `${i + 1}`, { fontFamily: FONT, fontSize: '24px', color: '#ffd460' })
          .setOrigin(0.5),
      )
      if (!entry) {
        this.rows.push(
          this.add
            .text(cx, y, '—', { fontFamily: FONT, fontSize: '20px', color: '#475569' })
            .setOrigin(0.5),
        )
        continue
      }
      const spec = specOf(entry.char)
      const icon = this.add.sprite(cx - 175, y, spec.iconSheet, 0)
      icon.setScale(46 / sheetOf(spec.iconSheet).frameHeight)
      this.rows.push(icon)
      this.rows.push(
        this.add
          .text(cx - 140, y, entry.name, { fontFamily: FONT, fontSize: '20px', color: '#ffffff' })
          .setOrigin(0, 0.5),
      )
      this.rows.push(
        this.add
          .text(cx + 160, y, `${entry.score}`, { fontFamily: FONT, fontSize: '22px', color: '#ffd460' })
          .setOrigin(1, 0.5),
      )
      this.rows.push(
        this.add
          .text(cx + 240, y, `ด่าน ${entry.stage}`, { fontFamily: FONT, fontSize: '16px', color: '#9ca3af' })
          .setOrigin(1, 0.5),
      )
    }
  }

  private askName(pending: Pending) {
    const cx = this.scale.width / 2
    this.add
      .text(cx, 452, `ติดอันดับ! ได้ ${pending.score} แต้ม — พิมพ์ชื่อแล้วกด ENTER`, {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#4ecca3',
      })
      .setOrigin(0.5)

    // ช่องกรอกชื่อเป็น overlay ติดจอจริง (position:fixed กลางจอล่าง) — ไม่ใช้ DOM ของ Phaser
    // เพราะตำแหน่งจะเพี้ยนหลุดจอเมื่อ canvas โดนย่อบนมือถือ/คีย์บอร์ดเด้งขึ้น
    const wrap = document.createElement('div')
    wrap.style.cssText =
      'position:fixed; left:50%; bottom:10%; transform:translateX(-50%);' +
      'display:flex; gap:10px; align-items:center; z-index:30;'
    wrap.innerHTML = `
      <input id="player-name" maxlength="16" placeholder="ชื่อของคุณ" autocomplete="off" style="
        width: min(240px, 50vw); height: 46px; padding: 0 12px; font-size: 20px;
        font-family: ${FONT}; color: #fff; background: #1f2a40;
        border: 2px solid #4ecca3; border-radius: 10px; outline: none; text-align: center;" />
      <button id="save-name" style="
        height: 50px; padding: 0 22px; font-size: 19px; font-family: ${FONT};
        color: #0f172a; background: #4ecca3; border: none; border-radius: 10px;
        cursor: pointer;">บันทึก</button>`
    document.body.appendChild(wrap)
    this.nameInput = wrap
    // ถ้าออกจาก scene ทางอื่น (เช่นเริ่มเกมใหม่) ต้องเก็บกวาด overlay ทิ้งด้วย
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => wrap.remove())

    const el = wrap.querySelector('#player-name') as HTMLInputElement
    setTimeout(() => el?.focus(), 50)

    let saving = false
    const submit = () => {
      if (saving) return
      saving = true
      const name = (el?.value || '').trim() || 'ไม่ระบุชื่อ'
      const entry: BoardEntry = { name, score: pending.score, char: pending.char, stage: pending.stage }
      void saveEntry(entry).then(({ board, rank }) => {
        wrap.remove()
        this.nameInput = undefined
        this.pending = undefined
        if (!this.scene.isActive()) return
        this.renderRows(board, rank)
        this.showHint()
        if (isOffline()) this.offlineBadge()
      })
    }
    el?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') submit()
      ev.stopPropagation() // กันปุ่มลามไปคุมเกม
    })
    const saveBtn = wrap.querySelector('#save-name') as HTMLButtonElement
    saveBtn?.addEventListener('click', submit)
  }

  private offlineBadge() {
    this.add
      .text(this.scale.width / 2, 92, 'ออฟไลน์ — คะแนนเก็บในเครื่องชั่วคราว', {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#f6a821',
      })
      .setOrigin(0.5)
  }

  private showHint() {
    const isTouch = this.sys.game.device.input.touch
    const btn = this.add
      .text(
        this.scale.width / 2,
        500,
        isTouch ? 'กลับหน้าเลือกตัวละคร' : 'กลับหน้าเลือกตัวละคร (SPACE)',
        { fontFamily: FONT, fontSize: isTouch ? '26px' : '18px', color: '#ffd460' },
      )
      .setOrigin(0.5)
      .setPadding(18, 12, 18, 12)
    btn.setBackgroundColor('#1f2a40')
    btn.setInteractive({ useHandCursor: true })
    btn.on('pointerdown', () => {
      sfx(this, 'sfx-click')
      this.scene.start('select')
    })
  }
}
