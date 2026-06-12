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
  private nameInput?: Phaser.GameObjects.DOMElement

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
      .text(400, 60, 'อันดับสูงสุด', { fontFamily: FONT, fontSize: '36px', color: '#ffffff' })
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
    const top = 120
    for (let i = 0; i < 5; i++) {
      const y = top + i * 62
      const entry = board[i]
      const isNew = i === highlight
      const bg = this.add
        .rectangle(400, y, 520, 54, isNew ? 0x2f4858 : 0x1f2a40, 1)
        .setStrokeStyle(isNew ? 2 : 1, isNew ? 0x4ecca3 : 0x32425f)
      this.rows.push(bg)
      this.rows.push(
        this.add
          .text(170, y, `${i + 1}`, { fontFamily: FONT, fontSize: '24px', color: '#ffd460' })
          .setOrigin(0.5),
      )
      if (!entry) {
        this.rows.push(
          this.add
            .text(400, y, '—', { fontFamily: FONT, fontSize: '20px', color: '#475569' })
            .setOrigin(0.5),
        )
        continue
      }
      const spec = specOf(entry.char)
      const icon = this.add.sprite(225, y, spec.iconSheet, 0)
      icon.setScale(46 / sheetOf(spec.iconSheet).frameHeight)
      this.rows.push(icon)
      this.rows.push(
        this.add
          .text(260, y, entry.name, { fontFamily: FONT, fontSize: '20px', color: '#ffffff' })
          .setOrigin(0, 0.5),
      )
      this.rows.push(
        this.add
          .text(560, y, `${entry.score}`, { fontFamily: FONT, fontSize: '22px', color: '#ffd460' })
          .setOrigin(1, 0.5),
      )
      this.rows.push(
        this.add
          .text(640, y, `ด่าน ${entry.stage}`, { fontFamily: FONT, fontSize: '16px', color: '#9ca3af' })
          .setOrigin(1, 0.5),
      )
    }
  }

  private askName(pending: Pending) {
    this.add
      .text(400, 452, `ติดอันดับ! ได้ ${pending.score} แต้ม — พิมพ์ชื่อแล้วกด ENTER`, {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#4ecca3',
      })
      .setOrigin(0.5)

    this.nameInput = this.add.dom(400, 495).createFromHTML(
      `<div style="display:flex; gap:8px; align-items:center;">
        <input id="player-name" maxlength="16" placeholder="ชื่อของคุณ" style="
          width: 220px; height: 38px; padding: 0 12px; font-size: 18px;
          font-family: ${FONT}; color: #fff; background: #1f2a40;
          border: 1px solid #4ecca3; border-radius: 8px; outline: none; text-align: center;" />
        <button id="save-name" style="
          height: 40px; padding: 0 18px; font-size: 17px; font-family: ${FONT};
          color: #0f172a; background: #4ecca3; border: none; border-radius: 8px;
          cursor: pointer;">บันทึก</button>
      </div>`,
    )
    const el = this.nameInput.getChildByID('player-name') as HTMLInputElement
    setTimeout(() => el?.focus(), 50)

    let saving = false
    const submit = () => {
      if (saving) return
      saving = true
      const name = (el?.value || '').trim() || 'ไม่ระบุชื่อ'
      const entry: BoardEntry = { name, score: pending.score, char: pending.char, stage: pending.stage }
      void saveEntry(entry).then(({ board, rank }) => {
        this.nameInput?.destroy()
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
    const saveBtn = this.nameInput.getChildByID('save-name') as HTMLButtonElement
    saveBtn?.addEventListener('click', submit)
  }

  private offlineBadge() {
    this.add
      .text(400, 92, 'ออฟไลน์ — คะแนนเก็บในเครื่องชั่วคราว', {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#f6a821',
      })
      .setOrigin(0.5)
  }

  private showHint() {
    const btn = this.add
      .text(400, 500, 'กลับหน้าเลือกตัวละคร (SPACE)', { fontFamily: FONT, fontSize: '18px', color: '#ffd460' })
      .setOrigin(0.5)
      .setPadding(14, 8, 14, 8)
    btn.setBackgroundColor('#1f2a40')
    btn.setInteractive({ useHandCursor: true })
    btn.on('pointerdown', () => {
      sfx(this, 'sfx-click')
      this.scene.start('select')
    })
  }
}
