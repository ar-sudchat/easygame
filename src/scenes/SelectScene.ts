import Phaser from 'phaser'
import { applyMute, isMuted, loadAudio, playBgm, sfx, toggleMute } from '../audio'
import { ANIMS, PLAYABLE, SHEETS, sheetOf } from '../characters'

const FONT = '"Sukhumvit Set", "Thonburi", Arial, sans-serif'

// หน้าเลือกตัวละคร: ← → หรือคลิก แล้ว ENTER เริ่มเกม · B ดูอันดับ
export class SelectScene extends Phaser.Scene {
  private index = 0
  private cards: Phaser.GameObjects.Container[] = []
  private ring!: Phaser.GameObjects.Graphics

  constructor() {
    super('select')
  }

  preload() {
    for (const s of SHEETS) {
      this.load.spritesheet(s.key, s.url, { frameWidth: s.frameWidth, frameHeight: s.frameHeight })
    }
    loadAudio(this)
  }

  create() {
    // ภาพการ์ตูนถูกย่อหลายเท่า ต้องใช้ LINEAR ไม่งั้นเป็นรอยหยัก (pixelArt:true ตั้ง NEAREST ทั้งเกม)
    for (const s of SHEETS) {
      this.textures.get(s.key).setFilter(Phaser.Textures.FilterMode.LINEAR)
    }
    // อนิเมชันใช้ร่วมกันทุก scene — สร้างครั้งเดียว
    for (const a of ANIMS) {
      if (this.anims.exists(a.animKey)) continue
      const def = sheetOf(a.sheetKey)
      const frames = a.frames ?? [...Array(def.frames).keys()]
      this.anims.create({
        key: a.animKey,
        frames: frames.map((f) => ({ key: a.sheetKey, frame: f })),
        frameRate: a.rate,
        repeat: a.loop ? -1 : 0,
      })
    }

    this.add
      .text(400, 80, 'เลือกตัวละคร', { fontFamily: FONT, fontSize: '40px', color: '#ffffff' })
      .setOrigin(0.5)

    this.ring = this.add.graphics()

    const positions = [145, 315, 485, 655]
    PLAYABLE.forEach((c, i) => {
      const def = sheetOf(c.iconSheet)
      const sprite = this.add.sprite(0, 0, c.iconSheet, 0)
      sprite.setScale(130 / def.frameHeight)
      const label = this.add
        .text(0, 100, c.nameTh, { fontFamily: FONT, fontSize: '22px', color: '#ffffff' })
        .setOrigin(0.5)
      const card = this.add.container(positions[i], 290, [sprite, label])
      card.setSize(150, 230)
      card.setInteractive({ useHandCursor: true })
      card.on('pointerover', () => this.select(i))
      card.on('pointerdown', () => {
        sfx(this, 'sfx-click')
        this.select(i)
        this.start()
      })
      this.cards.push(card)
    })

    this.add
      .text(400, 450, '← → เลือก · ENTER หรือแตะตัวละคร เพื่อเริ่ม', {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#9ca3af',
      })
      .setOrigin(0.5)
    const boardBtn = this.add
      .text(400, 505, 'ดูอันดับสูงสุด (B)', { fontFamily: FONT, fontSize: '18px', color: '#ffd460' })
      .setOrigin(0.5)
      .setPadding(14, 8, 14, 8)
    boardBtn.setBackgroundColor('#1f2a40')
    boardBtn.setInteractive({ useHandCursor: true })
    boardBtn.on('pointerdown', () => {
      sfx(this, 'sfx-click')
      this.scene.start('board')
    })

    // เสียง: เปิดเพลงไตเติล + ปุ่มเปิด/ปิดเสียง
    applyMute(this)
    playBgm(this, 'bgm-title')
    const muteBtn = this.add
      .text(770, 18, isMuted() ? 'เสียง: ปิด (M)' : 'เสียง: เปิด (M)', {
        fontFamily: FONT,
        fontSize: '15px',
        color: '#9ca3af',
      })
      .setOrigin(1, 0)
      .setPadding(10, 6, 10, 6)
    muteBtn.setBackgroundColor('#1f2a40')
    muteBtn.setInteractive({ useHandCursor: true })
    const flip = () => muteBtn.setText(toggleMute(this) ? 'เสียง: ปิด (M)' : 'เสียง: เปิด (M)')
    muteBtn.on('pointerdown', flip)
    this.input.keyboard!.on('keydown-M', flip)

    this.input.keyboard!.on('keydown-LEFT', () =>
      this.select((this.index + PLAYABLE.length - 1) % PLAYABLE.length),
    )
    this.input.keyboard!.on('keydown-RIGHT', () => this.select((this.index + 1) % PLAYABLE.length))
    this.input.keyboard!.on('keydown-ENTER', () => this.start())
    this.input.keyboard!.on('keydown-SPACE', () => this.start())
    this.input.keyboard!.on('keydown-B', () => this.scene.start('board'))

    this.select(0)
  }

  private select(i: number) {
    this.index = i
    this.cards.forEach((card, j) => {
      const sprite = card.list[0] as Phaser.GameObjects.Sprite
      if (j === i) {
        sprite.play(PLAYABLE[j].selectAnim)
        card.setScale(1.08)
      } else {
        sprite.stop()
        sprite.setFrame(0)
        card.setScale(1)
      }
    })
    this.ring.clear()
    this.ring.lineStyle(3, 0x4ecca3)
    const card = this.cards[i]
    this.ring.strokeRoundedRect(card.x - 80, card.y - 115, 160, 235, 16)
  }

  private start() {
    this.registry.set('char', PLAYABLE[this.index].key)
    this.scene.start('game')
  }
}
