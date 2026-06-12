import Phaser from 'phaser'
import {
  ENEMY_TYPES,
  sheetOf,
  specOf,
  type CharacterSpec,
  type EnemySpec,
} from '../characters'
import { applyMute, playBgm, sfx, stopBgm, toggleMute, voice } from '../audio'
import { qualifies, refreshBoard } from '../board'

const WORLD_W = 1500
const WORLD_H = 1125

// วงบีบแบบ PUBG: เริ่มนาทีที่ 1 หดจนจบด่าน อยู่นอกวงโดนดูดเลือด
const ZONE_START_MS = 60000
const ZONE_R_START = 900
const ZONE_R_END = 320 // ไม่บีบจนสุด เหลือที่ยืน
const ZONE_DMG_PER_TICK = 6

// กระโดด (ความสูงจำลองแกน z)
const JUMP_VELOCITY = 300
const JUMP_GRAVITY = 800
const COIN_FLOAT_Z = 42
const COIN_SCORE = 15
const HUD_DEPTH = 100000 // โลกใช้ depth = พิกัดเท้า (สูงสุด ~1500) — HUD ต้องอยู่เหนือเสมอ
const BAR_DEPTH = 90000

const STAGE_MS = 120000 // ด่านละ 2 นาที
const RUSH_MS = 30000 // 30 วิสุดท้าย = RUSH
const MAX_HP = 100

// Courier (default ของ Phaser) ไม่มี glyph สระ/วรรณยุกต์ไทย — ต้องระบุ font เอง
const FONT = '"Sukhumvit Set", "Thonburi", Arial, sans-serif'

const TREES = [
  { key: 'tree-round', height: 150 },
  { key: 'tree-oval', height: 165 },
  { key: 'tree-pine', height: 175 },
  { key: 'tree-slim', height: 110 },
  { key: 'tree-autumn', height: 150 },
]

type PowerType = 'speed' | 'gun' | 'shield' | 'freeze' | 'heal'

const POWERS: Record<PowerType, { nameTh: string; duration: number }> = {
  speed: { nameTh: 'วิ่งเร็ว', duration: 10000 },
  gun: { nameTh: 'ปืน', duration: 10000 },
  shield: { nameTh: 'เกราะ', duration: 10000 },
  freeze: { nameTh: 'แช่แข็ง', duration: 6000 },
  heal: { nameTh: 'ฮีล +40', duration: 1500 }, // ผลทันที — duration แค่โชว์ข้อความ
}

type Enemy = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody

// สภาพแวดล้อมตามด่าน — เรียงตามลำดับนี้เสมอ (ไม่สุ่ม) ครบแล้ววนกลับมาเริ่มใหม่
type BiomeFx = null | 'snow' | 'ember' | 'rain'
const BIOMES = [
  { name: 'ทุ่งหญ้า', ground: 'grass', tint: 0xffffff, fx: null as BiomeFx, speedMult: 1 },
  { name: 'หิมะ', ground: 'ground-snow', tint: 0xbdd9ff, fx: 'snow' as BiomeFx, speedMult: 1 },
  { name: 'ภูเขาไฟ', ground: 'ground-lava', tint: 0xff9977, fx: 'ember' as BiomeFx, speedMult: 1 },
  { name: 'ทะเลทราย', ground: 'ground-desert', tint: 0xe8d49a, fx: null as BiomeFx, speedMult: 1 },
  { name: 'ราตรี', ground: 'ground-night', tint: 0x8899cc, fx: null as BiomeFx, speedMult: 1 },
  // น้ำท่วม: ทุกตัวเดินช้าลง 15%
  { name: 'ฝนตกน้ำท่วม', ground: 'ground-flood', tint: 0x9fb8c8, fx: 'rain' as BiomeFx, speedMult: 0.85 },
  { name: 'สงคราม', ground: 'ground-war', tint: 0x998877, fx: null as BiomeFx, speedMult: 1 },
]

// เหตุการณ์ประจำด่าน — กำหนดตายตัว: ด่าน 1 ไม่มี · ด่าน 2 ต้นไม้ล้ม · ด่าน 3 +ต้นไม้ปืน · ด่าน 4+ +ระเบิด
type Hazard = 'bombs' | 'fallingTrees' | 'gunTrees'

// บอสออร์คยักษ์ — โผล่ตอน RUSH (30 วิสุดท้าย) ด่านละตัว
const BOSS: EnemySpec = {
  key: 'boss',
  walkAnim: 'orc-rage',
  rageAnim: 'orc-rage',
  deathSheet: 'orc-rage',
  deathFrame: 5,
  hp: 8,
  damage: 60,
  score: 200,
  displayHeight: 150,
  speed: 85,
  facing: 'left',
}

// Open world แบ่งด่าน: ด่านละ 1 นาที ยากขึ้นเรื่อย ๆ · 30 วิท้ายเป็น RUSH (ศัตรูคลั่ง+เร็ว หีบ ×2)
// ผู้เล่นมี HP 100 (หลอดเลือดเหนือหัว) · ตายแล้วติด leaderboard ได้
export class GameScene extends Phaser.Scene {
  private spec!: CharacterSpec
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  private chests!: Phaser.Physics.Arcade.Group
  private powerBoxes!: Phaser.Physics.Arcade.Group
  private rewardBoxes!: Phaser.Physics.Arcade.Group
  private enemies!: Phaser.Physics.Arcade.Group
  private bullets!: Phaser.Physics.Arcade.Group
  private obstacles!: Phaser.Physics.Arcade.StaticGroup
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>
  private scoreText!: Phaser.GameObjects.Text
  private powerText!: Phaser.GameObjects.Text
  private stageText!: Phaser.GameObjects.Text
  private rushText!: Phaser.GameObjects.Text
  private ground!: Phaser.GameObjects.TileSprite
  private minimap!: Phaser.Cameras.Scene2D.Camera
  private playerMarker!: Phaser.GameObjects.Image
  private shieldAura!: Phaser.GameObjects.Arc
  private bars!: Phaser.GameObjects.Graphics

  private score = 0
  private hp = MAX_HP
  private stage = 1
  private stageStart = 0
  private rush = false
  private gameOver = false
  // special = ของจากกล่องรางวัลใหญ่ — แรงกว่า/นานกว่าปกติ
  private power: { type: PowerType; until: number; special?: boolean } | null = null
  private nextShot = 0
  private invulnUntil = 0
  private acting = false
  // ช่องเก็บสกิลแบบ hotbar — เก็บพลังจากกล่อง ? ไว้กดใช้ทีหลัง
  private slots: (PowerType | null)[] = [null, null, null, null, null]
  private slotIcons: Phaser.GameObjects.Image[] = []
  // จอยสติ๊กลอยแบบ ROV — แตะซีกซ้ายจอแล้วลากนิ้วเป็นทิศทาง (analog)
  private joyVec = new Phaser.Math.Vector2()
  private joyPointerId = -1
  private joyBase!: Phaser.GameObjects.Arc
  private joyKnob!: Phaser.GameObjects.Arc
  // วงบีบ + บอส + สภาพแวดล้อม
  private zoneActive = false
  private zoneCenter = new Phaser.Math.Vector2()
  private zoneRadius = ZONE_R_START
  private zoneGfx!: Phaser.GameObjects.Graphics
  private zoneWarn!: Phaser.GameObjects.Text
  private nextZoneTick = 0
  private enraged = false
  private bossSpawned = false
  private biomeName = ''
  private biomeSpeedMult = 1
  private treeSprites: Phaser.GameObjects.Image[] = []
  private decorations: Phaser.GameObjects.Image[] = []
  private weatherFx: Phaser.GameObjects.Particles.ParticleEmitter | null = null
  // เหตุการณ์ประจำด่าน (อันตราย + กล่องรางวัลใหญ่)
  private hazardEvents: Phaser.Time.TimerEvent[] = []
  private gunTrees: Phaser.GameObjects.Image[] = []
  private enemyBullets!: Phaser.Physics.Arcade.Group
  // กระโดด + เหรียญลอย
  private jumpZ = 0
  private jumpVel = 0
  private jumpKey!: Phaser.Input.Keyboard.Key
  private touchJumpQueued = false
  private playerBaseOff = { x: 0, y: 0 }
  private playerShadow!: Phaser.GameObjects.Ellipse
  private skyCoins: { img: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Ellipse; gx: number; gy: number }[] = []

  constructor() {
    super('game')
  }

  preload() {
    this.load.image('grass', 'assets/grass.png')
    this.load.image('chest', 'assets/chest.png')
    for (const t of TREES) this.load.image(t.key, `assets/nature/${t.key}.png`)
    for (let i = 1; i <= 3; i++) this.load.image(`tuft${i}`, `assets/nature/tuft${i}.png`)
  }

  create() {
    this.score = 0
    this.hp = MAX_HP
    this.stage = 1
    this.rush = false
    this.gameOver = false
    this.power = null
    this.acting = false
    this.invulnUntil = 0
    this.spec = specOf(this.registry.get('char') as string)

    for (const t of TREES) this.textures.get(t.key).setFilter(Phaser.Textures.FilterMode.LINEAR)
    for (let i = 1; i <= 3; i++)
      this.textures.get(`tuft${i}`).setFilter(Phaser.Textures.FilterMode.LINEAR)

    this.makeBulletTexture()
    this.makePowerBoxTexture()
    this.makeRewardBoxTexture()
    this.makePowerIcons()
    this.makeArrowTexture()
    this.makeGroundTextures()
    this.makeCoinTexture()
    this.slots = [null, null, null, null, null]
    this.slotIcons = []
    this.joyVec.set(0, 0)
    this.joyPointerId = -1
    this.zoneActive = false
    this.enraged = false
    this.bossSpawned = false
    this.treeSprites = []
    this.decorations = []
    this.weatherFx = null
    this.hazardEvents = []
    this.gunTrees = []
    this.jumpZ = 0
    this.jumpVel = 0
    this.touchJumpQueued = false
    this.skyCoins = []
    this.input.addPointer(2) // ขยับ + แตะช่องสกิลพร้อมกันบนจอสัมผัส

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H)

    this.ground = this.add
      .tileSprite(this.scale.width / 2, 300, this.scale.width, 600, 'grass')
      .setTileScale(3)
      .setScrollFactor(0)
      .setDepth(-1)

    this.player = this.physics.add.sprite(WORLD_W / 2, WORLD_H / 2, this.spec.iconSheet, 0)
    this.applyPlayerSheet(this.anims.get(this.spec.walkAnim).frames[0].textureKey)
    this.player.setCollideWorldBounds(true)
    this.playerShadow = this.add.ellipse(0, 0, 46, 16, 0x000000, 0.25)
    this.player.setFrame(0)
    this.player.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.acting = false
    })

    this.shieldAura = this.add
      .circle(0, 0, 52)
      .setStrokeStyle(4, 0x4ecca3, 0.9)
      .setVisible(false)

    for (let i = 0; i < 70; i++) {
      const x = Phaser.Math.Between(30, WORLD_W - 30)
      const y = Phaser.Math.Between(30, WORLD_H - 30)
      const img = this.add.image(x, y, `tuft${Phaser.Math.Between(1, 3)}`)
      img.setScale((26 / img.height) * Phaser.Math.FloatBetween(0.9, 1.7))
      img.setDepth(y)
      this.decorations.push(img)
    }

    this.obstacles = this.physics.add.staticGroup()
    for (let i = 0; i < 40; i++) this.spawnTree()

    this.chests = this.physics.add.group()
    for (let i = 0; i < 18; i++) this.spawnChest()

    this.powerBoxes = this.physics.add.group()
    for (let i = 0; i < 5; i++) this.spawnPowerBox()

    this.rewardBoxes = this.physics.add.group()

    this.enemies = this.physics.add.group()
    for (let i = 0; i < 7; i++) this.spawnEnemy()

    this.bullets = this.physics.add.group()
    this.enemyBullets = this.physics.add.group()

    this.physics.add.collider(this.player, this.obstacles)
    this.physics.add.collider(this.enemies, this.obstacles)
    this.physics.add.collider(this.bullets, this.obstacles, (b) => b.destroy())
    this.physics.add.collider(this.enemyBullets, this.obstacles, (b) => b.destroy())

    // กระสุนจากต้นไม้ปืนซ่อน
    this.physics.add.overlap(this.player, this.enemyBullets, (_p, bObj) => {
      const b = bObj as Phaser.GameObjects.Image
      b.destroy()
      if (this.gameOver || this.power?.type === 'shield') return
      if (this.time.now < this.invulnUntil) return
      this.hp -= 10
      this.floatText(this.player.x, this.player.y - this.player.displayHeight / 2 - 22, '-10', '#ff6b6b')
      sfx(this, 'sfx-hurt', 0.4)
      this.player.setTint(0xff7070)
      this.time.delayedCall(150, () => !this.gameOver && this.player.clearTint())
      if (this.hp <= 0) {
        this.hp = 0
        this.endGame()
      }
    })

    this.physics.add.overlap(this.player, this.chests, (_p, chest) => {
      const pts = this.rush ? 20 : 10 // RUSH ได้ ×2
      this.floatText((chest as Phaser.GameObjects.Image).x, (chest as Phaser.GameObjects.Image).y - 18, `+${pts}`, '#ffd460', 15)
      chest.destroy()
      sfx(this, 'sfx-chest', 0.45)
      this.score += pts
      this.scoreText.setText(`สมบัติ: ${this.score}`)
      this.spawnChest()
    })

    this.physics.add.overlap(this.player, this.powerBoxes, (_p, box) => {
      const idx = this.slots.indexOf(null)
      if (idx === -1) return // ช่องเต็ม — กล่องยังอยู่ เก็บใหม่ได้เมื่อมีที่ว่าง
      const b = box as Phaser.GameObjects.Image
      this.tweens.killTweensOf(b)
      b.destroy()
      sfx(this, 'sfx-powerbox', 0.5)
      voice(this, 'power')
      this.healPlayer(10) // โบนัสพยาบาล: เก็บกล่องได้เลือดคืนทันที (+ตัวเลขเด้งบอก)
      const types = Object.keys(POWERS) as PowerType[]
      this.slots[idx] = types[Phaser.Math.Between(0, types.length - 1)]
      this.refreshHotbar()
      this.playAction(this.spec.pickupAnims)
      this.time.delayedCall(8000, () => !this.gameOver && this.spawnPowerBox())
    })

    this.physics.add.overlap(this.player, this.rewardBoxes, (_p, box) => {
      this.collectRewardBox(box as Phaser.Types.Physics.Arcade.ImageWithDynamicBody)
    })

    this.physics.add.overlap(this.player, this.enemies, (_p, eObj) => {
      this.touchEnemy(eObj as Enemy)
    })

    this.physics.add.overlap(this.bullets, this.enemies, (bullet, eObj) => {
      const dmg = ((bullet as Phaser.GameObjects.Image).getData('dmg') as number) ?? 1
      bullet.destroy()
      this.damageEnemy(eObj as Enemy, dmg)
    })

    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)

    const mmW = 110
    const mmH = Math.round((mmW * WORLD_H) / WORLD_W)
    this.minimap = this.cameras
      .add(this.scale.width - mmW - 12, 12, mmW, mmH)
      .setZoom(mmW / WORLD_W)
      .setBackgroundColor(0x10241a)
    this.minimap.centerOn(WORLD_W / 2, WORLD_H / 2)
    this.minimap.ignore(this.ground)
    this.minimap.ignore(this.decorations)
    this.minimap.ignore(this.shieldAura)

    // วงบีบ — วาดใน world space (โผล่บน minimap ด้วย ช่วยมองหาเขตปลอดภัย)
    this.zoneGfx = this.add.graphics().setDepth(80000)

    // เหรียญลอย — ต้อง spawn หลัง minimap ถูกสร้าง (ใช้ minimap.ignore กับเงา)
    for (let i = 0; i < 12; i++) this.spawnSkyCoin()

    this.playerMarker = this.add
      .image(this.player.x, this.player.y, this.spec.iconSheet, 0)
      .setScale(150 / sheetOf(this.spec.iconSheet).frameHeight)
      .setDepth(HUD_DEPTH)
    this.cameras.main.ignore(this.playerMarker)

    // หลอดเลือด (วาดใหม่ทุกเฟรมใน update)
    this.bars = this.add.graphics().setDepth(BAR_DEPTH)
    this.minimap.ignore(this.bars)

    this.scoreText = this.hud(
      this.add.text(16, 12, 'สมบัติ: 0', { fontFamily: FONT, fontSize: '20px', color: '#ffffff' }),
    )
    this.powerText = this.hud(
      this.add.text(16, 40, '', { fontFamily: FONT, fontSize: '18px', color: '#ffd460' }),
    )
    const hudCx = this.scale.width / 2
    this.stageText = this.hud(
      this.add
        .text(hudCx, 14, '', { fontFamily: FONT, fontSize: '20px', color: '#ffffff' })
        .setOrigin(0.5, 0),
    )
    this.rushText = this.hud(
      this.add
        .text(hudCx, 42, 'RUSH ×2!', { fontFamily: FONT, fontSize: '18px', color: '#ff6b6b' })
        .setOrigin(0.5, 0)
        .setVisible(false),
    )
    this.zoneWarn = this.hud(
      this.add
        .text(hudCx, 70, 'อยู่นอกวง! รีบวิ่งเข้าวงฟ้า', { fontFamily: FONT, fontSize: '17px', color: '#ff6b6b' })
        .setOrigin(0.5, 0)
        .setVisible(false),
    )
    this.tweens.add({ targets: this.rushText, alpha: 0.25, duration: 380, yoyo: true, repeat: -1 })

    this.createHotbar()
    this.createJoystick()
    this.applyBiome(0) // ด่าน 1 = ทุ่งหญ้าเสมอ
    this.setupHazards()

    this.stageStart = this.time.now
    void refreshBoard() // ให้ qualifies() ตอนจบเกมมีข้อมูลล่าสุด

    applyMute(this)
    playBgm(this, 'bgm-game')
    this.input.keyboard!.on('keydown-M', () => toggleMute(this))

    // ศัตรูสุ่มทิศใหม่เป็นระยะ (ตอนไม่ไล่ผู้เล่นและไม่โดนแช่แข็ง)
    this.time.addEvent({
      delay: 1800,
      loop: true,
      callback: () => {
        if (this.power?.type === 'freeze') return
        for (const e of this.aliveEnemies()) {
          if (Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) >= this.chaseRadius()) {
            e.setVelocity(Phaser.Math.Between(-80, 80), Phaser.Math.Between(-80, 80))
          }
        }
      },
    })

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = {
      up: this.input.keyboard!.addKey('W'),
      down: this.input.keyboard!.addKey('S'),
      left: this.input.keyboard!.addKey('A'),
      right: this.input.keyboard!.addKey('D'),
    }
    const slotKeys = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE']
    slotKeys.forEach((k, i) =>
      this.input.keyboard!.on(`keydown-${k}`, () => this.useSlot(i)),
    )
    this.jumpKey = this.input.keyboard!.addKey('SPACE')
    this.createJumpButton()
  }

  // ----- กระโดด + เหรียญลอย -----

  private createJumpButton() {
    const isTouch = this.sys.game.device.input.touch
    // ปุ่มใหญ่มุมขวาล่างแบบปุ่มโจมตี ROV — สกิล 1-5 เรียงโค้งรอบปุ่มนี้ (ดู createHotbar)
    const jx = this.scale.width - 72
    const jy = 506
    const btn = this.hud(this.add.circle(jx, jy, 44, 0x1f2a40, 0.8).setStrokeStyle(2, 0x7d8db1))
    const arrow = this.hud(this.add.image(jx, jy, 'dpad-arrow').setScale(0.8).setAlpha(0.9))
    btn.setVisible(isTouch)
    arrow.setVisible(isTouch)
    btn.setInteractive({ useHandCursor: true })
    btn.on('pointerdown', () => {
      this.touchJumpQueued = true
    })
  }

  private spawnSkyCoin() {
    const { x: gx, y: gy } = this.randomPointAwayFromPlayer(100)
    const img = this.add.image(gx, gy - COIN_FLOAT_Z, 'coin').setDepth(gy)
    const shadow = this.add.ellipse(gx, gy + 4, 15, 7, 0x000000, 0.22).setDepth(gy - 1)
    this.minimap.ignore(shadow)
    this.tweens.add({ targets: img, y: gy - COIN_FLOAT_Z - 7, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    this.skyCoins.push({ img, shadow, gx, gy })
  }

  private collectSkyCoin(i: number) {
    const coin = this.skyCoins[i]
    this.skyCoins.splice(i, 1)
    this.tweens.killTweensOf(coin.img)
    this.floatText(coin.gx, coin.gy - COIN_FLOAT_Z - 12, `+${COIN_SCORE}`, '#ffd460', 15)
    coin.img.destroy()
    coin.shadow.destroy()
    sfx(this, 'sfx-chest', 0.4)
    this.score += COIN_SCORE
    this.scoreText.setText(`สมบัติ: ${this.score}`)
    this.time.delayedCall(6000, () => !this.gameOver && this.spawnSkyCoin())
  }

  /** ฟิสิกส์กระโดดแกน z จำลอง: ดัน body offset ลง → sprite ลอยขึ้นโดย hitbox อยู่ที่พื้นเหมือนเดิม */
  private updateJump() {
    const wantJump = Phaser.Input.Keyboard.JustDown(this.jumpKey) || this.touchJumpQueued
    this.touchJumpQueued = false
    if (wantJump && this.jumpZ === 0 && !this.gameOver) {
      this.jumpVel = JUMP_VELOCITY
      this.jumpZ = 0.01
      sfx(this, 'sfx-click', 0.35)
    }
    if (this.jumpZ > 0) {
      const dt = this.game.loop.delta / 1000
      this.jumpVel -= JUMP_GRAVITY * dt
      this.jumpZ += this.jumpVel * dt
      if (this.jumpZ <= 0) {
        this.jumpZ = 0
        this.jumpVel = 0
      }
    }
    this.player.body.setOffset(this.playerBaseOff.x, this.playerBaseOff.y + this.jumpZ / this.player.scaleY)

    // เงาที่พื้น + เก็บเหรียญลอยตอนตัวลอย
    const groundY = this.player.y + this.jumpZ
    this.playerShadow
      .setPosition(this.player.x, groundY + this.player.displayHeight / 2 - 6)
      .setScale(Math.max(0.55, 1 - this.jumpZ / 260))
      .setDepth(groundY + this.player.displayHeight / 2 - 1)
    if (this.jumpZ > 22) {
      for (let i = this.skyCoins.length - 1; i >= 0; i--) {
        const c = this.skyCoins[i]
        if (Phaser.Math.Distance.Between(this.player.x, groundY, c.gx, c.gy) < 50) {
          this.collectSkyCoin(i)
        }
      }
    }
  }

  // ----- UI จอสัมผัส (มือถือ/iPad) -----

  private createHotbar() {
    const size = 46
    const W = this.scale.width
    const isTouch = this.sys.game.device.input.touch
    // จอสัมผัส: สกิลปุ่มกลมเรียงโค้งรอบปุ่มกระโดดมุมขวาล่าง (แบบ ROV นิ้วโป้งขวาเอื้อมถึงหมด)
    // เดสก์ท็อป: แถวตรงกลางล่าง กดเลข 1-5
    const spots: { x: number; y: number }[] = []
    if (isTouch) {
      const cx = W - 72
      const cy = 506
      const r = 160 // ห่างพอให้ปุ่มไม่เกยกัน (ระยะตามโค้ง ~62px ต่อปุ่ม)
      for (let i = 0; i < 5; i++) {
        const ang = Math.PI + (i * (Math.PI / 2)) / 4 // กวาด 180° → 270° (ซ้ายของปุ่ม → เหนือปุ่ม)
        spots.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r })
      }
    } else {
      const gap = 6
      const startX = W / 2 - ((size + gap) * 5 - gap) / 2 + size / 2
      for (let i = 0; i < 5; i++) spots.push({ x: startX + i * (size + gap), y: 566 })
    }
    for (let i = 0; i < 5; i++) {
      const { x, y } = spots[i]
      const bg = this.hud(
        isTouch
          ? this.add.circle(x, y, 26, 0x1f2a40, 0.85).setStrokeStyle(2, 0x4b5d7a)
          : this.add
              .rectangle(x, y, size, size, 0x1f2a40, 0.85)
              .setStrokeStyle(2, 0x4b5d7a),
      )
      bg.setInteractive({ useHandCursor: true })
      bg.on('pointerdown', () => this.useSlot(i))
      // เลขช่องโชว์เฉพาะเดสก์ท็อป (ไว้กดคีย์ 1-5) — จอสัมผัสแตะปุ่มตรง ๆ
      if (!isTouch) {
        this.hud(
          this.add
            .text(x - size / 2 + 5, y - size / 2 + 2, `${i + 1}`, {
              fontFamily: FONT,
              fontSize: '12px',
              color: '#7d8db1',
            }),
        )
      }
      const icon = this.hud(this.add.image(x, y, 'icon-speed').setVisible(false))
      this.slotIcons.push(icon)
    }
    this.refreshHotbar()
  }

  private refreshHotbar() {
    this.slots.forEach((type, i) => {
      const icon = this.slotIcons[i]
      if (!icon) return
      if (type) icon.setTexture(`icon-${type}`).setVisible(true)
      else icon.setVisible(false)
    })
  }

  private createJoystick() {
    // จอยสติ๊กลอยแบบ ROV — เฉพาะจอสัมผัส: แตะซีกซ้ายจอตรงไหนก็ได้ ฐานจะมาอยู่ใต้นิ้ว แล้วลากเป็นทิศ
    if (!this.sys.game.device.input.touch) return
    const R = 58
    this.joyBase = this.hud(this.add.circle(0, 0, R, 0x1f2a40, 0.4).setStrokeStyle(2, 0x7d8db1, 0.7))
    this.joyKnob = this.hud(this.add.circle(0, 0, 26, 0xaebadb, 0.85))
    this.joyBase.setVisible(false)
    this.joyKnob.setVisible(false)
    this.input.on(
      'pointerdown',
      (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        if (over.length || this.joyPointerId !== -1) return // กดโดนปุ่ม UI อยู่ ไม่ใช่จอย
        if (p.x > this.scale.width * 0.55) return // ซีกขวาสงวนให้ปุ่มกระโดด/สกิล
        this.joyPointerId = p.id
        this.joyBase.setPosition(p.x, p.y).setVisible(true)
        this.joyKnob.setPosition(p.x, p.y).setVisible(true)
      },
    )
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.joyPointerId) return
      const v = new Phaser.Math.Vector2(p.x - this.joyBase.x, p.y - this.joyBase.y)
      if (v.length() > R) v.setLength(R)
      this.joyKnob.setPosition(this.joyBase.x + v.x, this.joyBase.y + v.y)
      this.joyVec.set(v.x / R, v.y / R)
    })
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.joyPointerId) return
      this.joyPointerId = -1
      this.joyVec.set(0, 0)
      this.joyBase.setVisible(false)
      this.joyKnob.setVisible(false)
    }
    this.input.on('pointerup', release)
    this.input.on('pointerupoutside', release)
  }

  // ----- sheet/ขนาด -----

  /** applySheet สำหรับผู้เล่น — จำ offset ฐานไว้ใช้ชดเชยตอนกระโดด */
  private applyPlayerSheet(sheetKey: string) {
    this.applySheet(this.player, sheetKey, this.spec.displayHeight)
    const def = sheetOf(sheetKey)
    this.playerBaseOff = { x: def.frameWidth * 0.25, y: def.frameHeight * 0.48 }
  }

  /** ปรับ scale + hitbox ให้คงขนาดในเกมเมื่อสลับ sheet ที่เฟรมไม่เท่ากัน */
  private applySheet(
    sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
    sheetKey: string,
    displayHeight: number,
  ) {
    const def = sheetOf(sheetKey)
    sprite.setScale(displayHeight / def.frameHeight)
    sprite.body
      .setSize(def.frameWidth * 0.5, def.frameHeight * 0.5)
      .setOffset(def.frameWidth * 0.25, def.frameHeight * 0.48)
  }

  private animSheetKey(animKey: string): string {
    return this.anims.get(animKey).frames[0].textureKey
  }

  /** เล่นท่าพิเศษครั้งเดียว (สุ่มจากรายการ) แล้วกลับสู่ท่าเดิน */
  private playAction(animKeys?: string[]) {
    if (!animKeys?.length || this.acting || this.gameOver) return
    const key = animKeys[Phaser.Math.Between(0, animKeys.length - 1)]
    this.acting = true
    this.applyPlayerSheet(this.animSheetKey(key))
    this.player.play(key)
  }

  // ----- texture วาดด้วยโค้ด -----

  private makeBulletTexture() {
    if (this.textures.exists('bullet')) return
    const g = this.make.graphics({ x: 0, y: 0 }, false)
    g.fillStyle(0xffd460)
    g.fillCircle(5, 5, 5)
    g.lineStyle(2, 0xb45309)
    g.strokeCircle(5, 5, 4)
    g.generateTexture('bullet', 10, 10)
    g.destroy()
  }

  private makePowerBoxTexture() {
    if (this.textures.exists('powerbox')) return
    // วาดด้วย canvas 2D ตรง ๆ — RenderTexture saveTexture แล้ว destroy จะพา GL texture ตายทั้งเฟรม
    const size = 44
    const c = this.textures.createCanvas('powerbox', size, size)!
    const ctx = c.getContext()
    ctx.fillStyle = '#f6a821'
    ctx.beginPath()
    ctx.roundRect(0, 0, size, size, 8)
    ctx.fill()
    ctx.strokeStyle = '#92400e'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(1.5, 1.5, size - 3, size - 3, 8)
    ctx.stroke()
    ctx.fillStyle = '#fbd38d'
    for (const [px, py] of [[7, 7], [size - 11, 7], [7, size - 11], [size - 11, size - 11]]) {
      ctx.fillRect(px, py, 4, 4)
    }
    ctx.fillStyle = '#ffffff'
    ctx.font = `28px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('?', size / 2, size / 2 + 1)
    c.refresh()
  }

  /** กล่องรางวัลใหญ่ — กล่องของขวัญสีทองผูกโบว์แดง */
  private makeRewardBoxTexture() {
    if (this.textures.exists('rewardbox')) return
    const W = 58
    const H = 62
    const c = this.textures.createCanvas('rewardbox', W, H)!
    const ctx = c.getContext()
    ctx.fillStyle = '#f6a821' // ตัวกล่อง
    ctx.beginPath()
    ctx.roundRect(3, 18, W - 6, H - 21, 6)
    ctx.fill()
    ctx.fillStyle = '#ffc14d' // ฝากล่อง
    ctx.beginPath()
    ctx.roundRect(0, 10, W, 14, 5)
    ctx.fill()
    ctx.strokeStyle = '#92400e'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.roundRect(1.5, 11.5, W - 3, 11, 5)
    ctx.stroke()
    ctx.beginPath()
    ctx.roundRect(4.5, 19.5, W - 9, H - 24, 6)
    ctx.stroke()
    ctx.fillStyle = '#e94560' // ริบบิ้น
    ctx.fillRect(W / 2 - 5, 10, 10, H - 13)
    ctx.beginPath()
    ctx.ellipse(W / 2 - 9, 7, 8, 5.5, -0.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(W / 2 + 9, 7, 8, 5.5, 0.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#b91c3c' // ปมโบว์
    ctx.beginPath()
    ctx.arc(W / 2, 8, 4, 0, Math.PI * 2)
    ctx.fill()
    c.refresh()
  }

  private makeCoinTexture() {
    if (this.textures.exists('coin')) return
    const c = this.textures.createCanvas('coin', 22, 22)!
    const ctx = c.getContext()
    ctx.fillStyle = '#f6c945'
    ctx.beginPath()
    ctx.arc(11, 11, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#b8860b'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(11, 11, 9, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = '#fff3c4'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(11, 11, 5.5, Math.PI * 1.1, Math.PI * 1.7)
    ctx.stroke()
    c.refresh()
  }

  /** ไอคอนสกิลในช่อง hotbar — วาดด้วย canvas ล้วน */
  private makePowerIcons() {
    const S = 32
    const draw = (key: string, fn: (ctx: CanvasRenderingContext2D) => void) => {
      if (this.textures.exists(key)) return
      const c = this.textures.createCanvas(key, S, S)!
      const ctx = c.getContext()
      ctx.lineJoin = 'round'
      fn(ctx)
      c.refresh()
    }
    draw('icon-speed', (ctx) => {
      // สายฟ้า
      ctx.fillStyle = '#ffd460'
      ctx.beginPath()
      ctx.moveTo(19, 2)
      ctx.lineTo(7, 19)
      ctx.lineTo(14, 19)
      ctx.lineTo(12, 30)
      ctx.lineTo(25, 12)
      ctx.lineTo(17, 12)
      ctx.closePath()
      ctx.fill()
    })
    draw('icon-gun', (ctx) => {
      // เป้าเล็ง
      ctx.strokeStyle = '#ff9f43'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(16, 16, 9, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(16, 2); ctx.lineTo(16, 9)
      ctx.moveTo(16, 23); ctx.lineTo(16, 30)
      ctx.moveTo(2, 16); ctx.lineTo(9, 16)
      ctx.moveTo(23, 16); ctx.lineTo(30, 16)
      ctx.stroke()
      ctx.fillStyle = '#ff9f43'
      ctx.beginPath()
      ctx.arc(16, 16, 3, 0, Math.PI * 2)
      ctx.fill()
    })
    draw('icon-shield', (ctx) => {
      // โล่
      ctx.fillStyle = '#4ecca3'
      ctx.beginPath()
      ctx.moveTo(16, 2)
      ctx.lineTo(28, 7)
      ctx.lineTo(28, 16)
      ctx.bezierCurveTo(28, 24, 22, 28, 16, 30)
      ctx.bezierCurveTo(10, 28, 4, 24, 4, 16)
      ctx.lineTo(4, 7)
      ctx.closePath()
      ctx.fill()
    })
    draw('icon-freeze', (ctx) => {
      // เกล็ดหิมะ
      ctx.strokeStyle = '#8fd3ff'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      for (let a = 0; a < 6; a++) {
        const ang = (a * Math.PI) / 3
        ctx.beginPath()
        ctx.moveTo(16, 16)
        ctx.lineTo(16 + Math.cos(ang) * 13, 16 + Math.sin(ang) * 13)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(16, 16, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#8fd3ff'
      ctx.fill()
    })
    draw('icon-heal', (ctx) => {
      // กากบาทพยาบาล
      ctx.fillStyle = '#e94560'
      ctx.beginPath()
      ctx.roundRect(12, 4, 8, 24, 3)
      ctx.fill()
      ctx.beginPath()
      ctx.roundRect(4, 12, 24, 8, 3)
      ctx.fill()
    })
  }

  private makeArrowTexture() {
    if (this.textures.exists('dpad-arrow')) return
    const S = 64
    const c = this.textures.createCanvas('dpad-arrow', S, S)!
    const ctx = c.getContext()
    ctx.fillStyle = '#1f2a40'
    ctx.strokeStyle = '#7d8db1'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(2, 2, S - 4, S - 4, 14)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#e2e8f0'
    ctx.beginPath()
    ctx.moveTo(S / 2, 14)
    ctx.lineTo(S - 16, S - 22)
    ctx.lineTo(16, S - 22)
    ctx.closePath()
    ctx.fill()
    c.refresh()
  }

  // ----- สภาพแวดล้อม/วงบีบ/บอส -----

  /** พื้นแต่ละสภาพแวดล้อม — วาดด้วย canvas (สีพื้น + จุดประปราย) */
  private makeGroundTextures() {
    const make = (key: string, base: string, dots: string[]) => {
      if (this.textures.exists(key)) return
      const c = this.textures.createCanvas(key, 64, 64)!
      const ctx = c.getContext()
      ctx.fillStyle = base
      ctx.fillRect(0, 0, 64, 64)
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = dots[i % dots.length]
        ctx.beginPath()
        ctx.arc(Math.floor(Math.random() * 60) + 2, Math.floor(Math.random() * 60) + 2, 1.6, 0, Math.PI * 2)
        ctx.fill()
      }
      c.refresh()
    }
    make('ground-snow', '#dfe8f2', ['#ffffff', '#c9d6ea'])
    make('ground-lava', '#3a2226', ['#ff5533', '#552e2e', '#7a3a30'])
    make('ground-desert', '#d8c27e', ['#c4ad6a', '#e3d296'])
    make('ground-night', '#15291c', ['#1d3a2a', '#10231a'])
    make('ground-flood', '#3f6f86', ['#5d93ab', '#7fb3c8', '#34607a'])
    make('ground-war', '#4a4038', ['#2e2722', '#5d5046', '#6b3a2e'])
    if (!this.textures.exists('bomb')) {
      const c = this.textures.createCanvas('bomb', 26, 30)!
      const ctx = c.getContext()
      ctx.fillStyle = '#1f2430'
      ctx.beginPath()
      ctx.arc(13, 17, 11, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#3a4356' // ไฮไลต์
      ctx.beginPath()
      ctx.arc(9, 13, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#8b6f47' // สายชนวน
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(13, 6)
      ctx.quadraticCurveTo(19, 2, 23, 5)
      ctx.stroke()
      ctx.fillStyle = '#ffb347' // ประกายไฟ
      ctx.beginPath()
      ctx.arc(23.5, 4.5, 2.5, 0, Math.PI * 2)
      ctx.fill()
      c.refresh()
    }
    if (!this.textures.exists('dot')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false)
      g.fillStyle(0xffffff)
      g.fillCircle(4, 4, 4)
      g.generateTexture('dot', 8, 8)
      g.destroy()
    }
  }

  private applyBiome(idx: number) {
    const b = BIOMES[idx]
    this.biomeName = b.name
    this.biomeSpeedMult = b.speedMult
    this.ground.setTexture(b.ground)
    for (const t of this.treeSprites) t.setTint(b.tint)
    for (const d of this.decorations) d.setTint(b.tint)

    this.weatherFx?.destroy()
    this.weatherFx = null
    const W = this.scale.width
    if (b.fx === 'snow') {
      this.weatherFx = this.add.particles(0, 0, 'dot', {
        x: { min: 0, max: W },
        y: -10,
        lifespan: 7000,
        speedY: { min: 25, max: 70 },
        speedX: { min: -20, max: 20 },
        scale: { start: 0.8, end: 0.4 },
        alpha: { start: 0.9, end: 0.4 },
        frequency: 110,
      })
    } else if (b.fx === 'ember') {
      this.weatherFx = this.add.particles(0, 0, 'dot', {
        x: { min: 0, max: W },
        y: 610,
        lifespan: 5000,
        speedY: { min: -70, max: -30 },
        speedX: { min: -15, max: 15 },
        tint: 0xff7744,
        scale: { start: 0.6, end: 0.15 },
        alpha: { start: 0.9, end: 0 },
        frequency: 90,
      })
    } else if (b.fx === 'rain') {
      this.weatherFx = this.add.particles(0, 0, 'dot', {
        x: { min: -50, max: W + 50 },
        y: -10,
        lifespan: 1600,
        speedY: { min: 380, max: 480 },
        speedX: { min: 40, max: 80 },
        tint: 0x9fd0ff,
        scale: { start: 0.45, end: 0.3 },
        alpha: { start: 0.55, end: 0.25 },
        frequency: 24,
      })
    }
    if (this.weatherFx) {
      this.weatherFx.setScrollFactor(0).setDepth(HUD_DEPTH - 5)
      this.minimap.ignore(this.weatherFx)
    }
  }

  // ----- เหตุการณ์ประจำด่าน (กำหนดตายตัวตามด่าน ไม่สุ่ม) -----

  private setupHazards() {
    for (const ev of this.hazardEvents) ev.remove()
    this.hazardEvents = []
    this.gunTrees = []

    // ด่าน 1 ไม่มีอันตราย · ด่าน 2 ต้นไม้ล้ม · ด่าน 3 +ต้นไม้ปืน · ด่าน 4 เป็นต้นไป +ระเบิด
    const picked = new Set<Hazard>()
    if (this.stage >= 2) picked.add('fallingTrees')
    if (this.stage >= 3) picked.add('gunTrees')
    if (this.stage >= 4) picked.add('bombs')

    if (picked.has('bombs')) {
      this.hazardEvents.push(
        this.time.addEvent({
          delay: Phaser.Math.Between(4500, 7000),
          loop: true,
          callback: () => this.spawnBomb(),
        }),
      )
    }
    if (picked.has('fallingTrees')) {
      this.hazardEvents.push(
        this.time.addEvent({
          delay: Phaser.Math.Between(9000, 13000),
          loop: true,
          callback: () => this.dropTreeNearPlayer(),
        }),
      )
    }
    if (picked.has('gunTrees')) {
      // เลือกต้นไม้ 3 ต้นซ่อนปืน — ไม่มีอะไรบอก จนกว่าจะเดินใกล้
      const pool = [...this.treeSprites]
      for (let i = 0; i < 3 && pool.length; i++) {
        const t = pool.splice(Phaser.Math.Between(0, pool.length - 1), 1)[0]
        this.gunTrees.push(t)
      }
      this.hazardEvents.push(
        this.time.addEvent({ delay: 1600, loop: true, callback: () => this.gunTreeTick() }),
      )
    }

    // กล่องรางวัลใหญ่หล่นจากฟ้า — ด่านละ 2 ครั้ง เวลาสุ่ม (ครึ่งแรก 1 ครั้ง ครึ่งหลัง 1 ครั้ง)
    for (const delay of [Phaser.Math.Between(10000, 55000), Phaser.Math.Between(62000, 105000)]) {
      this.hazardEvents.push(this.time.addEvent({ delay, callback: () => this.dropRewardBox() }))
    }
  }

  /** กล่องรางวัลใหญ่หล่นจากฟ้า — เก็บแล้วได้หลายรางวัล ทุกอย่างเป็นแบบพิเศษ */
  private dropRewardBox() {
    if (this.gameOver) return
    const tx = Phaser.Math.Clamp(this.player.x + Phaser.Math.Between(-220, 220), 60, WORLD_W - 60)
    const ty = Phaser.Math.Clamp(this.player.y + Phaser.Math.Between(-160, 160), 60, WORLD_H - 60)
    const banner = this.hud(
      this.add
        .text(this.scale.width / 2, 110, 'กล่องรางวัลใหญ่หล่นลงมา!', { fontFamily: FONT, fontSize: '24px', color: '#ffd460', stroke: '#0f172a', strokeThickness: 4 })
        .setOrigin(0.5),
    )
    this.tweens.add({ targets: banner, alpha: 0, delay: 1800, duration: 700, onComplete: () => banner.destroy() })
    const shadow = this.add.ellipse(tx, ty, 20, 12, 0x000000, 0.3).setDepth(ty - 1)
    this.tweens.add({ targets: shadow, scaleX: 3.4, scaleY: 3.4, duration: 1400 })
    const falling = this.add.image(tx, ty - 520, 'rewardbox').setDepth(99999)
    this.tweens.add({
      targets: falling,
      y: ty - 8,
      duration: 1400,
      ease: 'Quad.in',
      onComplete: () => {
        shadow.destroy()
        falling.destroy()
        if (this.gameOver) return
        this.cameras.main.shake(120, 0.004)
        sfx(this, 'sfx-powerbox', 0.6)
        const box = this.rewardBoxes.create(tx, ty, 'rewardbox') as Phaser.Types.Physics.Arcade.ImageWithDynamicBody
        box.setDepth(ty)
        // เด้งตุ้บตอนลงพื้น + ลอยเรียกแขก + ประกายระยิบให้เห็นแต่ไกล
        this.tweens.add({ targets: box, scaleX: 1.12, scaleY: 0.88, duration: 100, yoyo: true })
        this.tweens.add({ targets: box, y: ty - 6, duration: 650, delay: 250, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
        const sparkle = this.add.particles(tx, ty - 20, 'dot', {
          speed: { min: 15, max: 45 },
          lifespan: 800,
          quantity: 1,
          frequency: 160,
          tint: [0xffd460, 0xfff3c4, 0xff8ad8],
          scale: { start: 0.5, end: 0 },
        })
        sparkle.setDepth(ty + 1)
        this.minimap.ignore(sparkle)
        box.setData('fx', sparkle)
      },
    })
  }

  /** เปิดกล่องรางวัลใหญ่: เลือดเต็ม + สมบัติโบนัส + สกิลพิเศษสุ่ม (แรง/นานกว่าปกติ) */
  private collectRewardBox(box: Phaser.Types.Physics.Arcade.ImageWithDynamicBody) {
    if (this.gameOver) return
    const { x, y } = box
    this.tweens.killTweensOf(box)
    ;(box.getData('fx') as Phaser.GameObjects.Particles.ParticleEmitter | undefined)?.destroy()
    box.destroy()
    sfx(this, 'jingle-stage', 0.5)
    voice(this, 'power')
    this.add
      .particles(x, y, 'dot', {
        speed: { min: 70, max: 220 },
        lifespan: 650,
        quantity: 22,
        tint: [0xffd460, 0xff8ad8, 0x8fd3ff],
        scale: { start: 0.9, end: 0 },
        emitting: false,
      })
      .explode(22)
    // รางวัลที่ 1: ยาพิเศษ — เลือดเต็มหลอด
    this.healPlayer(MAX_HP)
    // รางวัลที่ 2: สมบัติโบนัส (RUSH ได้ ×2)
    const bonus = this.rush ? 120 : 60
    this.score += bonus
    this.scoreText.setText(`สมบัติ: ${this.score}`)
    this.floatText(x, y - 44, `+${bonus}`, '#ffd460', 22)
    // รางวัลที่ 3: สกิลพิเศษสุ่ม — แรงกว่า นานกว่าของธรรมดา
    const specials: PowerType[] = ['gun', 'speed', 'shield', 'freeze']
    const t = specials[Phaser.Math.Between(0, specials.length - 1)]
    this.activatePower(t, true)
    sfx(this, t === 'freeze' ? 'sfx-freeze' : 'sfx-skill', 0.5)
    this.floatText(
      this.player.x,
      this.player.y - this.player.displayHeight / 2 - 46,
      `${POWERS[t].nameTh}พิเศษ!`,
      '#ff8ad8',
      20,
    )
    this.playAction(this.spec.pickupAnims)
  }

  /** ระเบิดหล่นจากฟ้า — เงาบอกตำแหน่ง ~1.1 วิ โดนแล้วเลือดหายครึ่ง */
  private spawnBomb() {
    if (this.gameOver) return
    const tx = Phaser.Math.Clamp(this.player.x + Phaser.Math.Between(-170, 170), 40, WORLD_W - 40)
    const ty = Phaser.Math.Clamp(this.player.y + Phaser.Math.Between(-130, 130), 40, WORLD_H - 40)
    const shadow = this.add.ellipse(tx, ty, 14, 9, 0x000000, 0.35).setDepth(ty - 1)
    this.tweens.add({ targets: shadow, scaleX: 4.5, scaleY: 4.5, duration: 1100 })
    const bomb = this.add.image(tx, ty - 470, 'bomb').setDepth(99999).setScale(1.4)
    this.tweens.add({
      targets: bomb,
      y: ty - 10,
      duration: 1100,
      ease: 'Quad.in',
      onComplete: () => {
        shadow.destroy()
        bomb.destroy()
        if (this.gameOver) return
        const flash = this.add.circle(tx, ty, 62, 0xffaa33, 0.85).setDepth(99998)
        this.tweens.add({ targets: flash, alpha: 0, scale: 1.6, duration: 260, onComplete: () => flash.destroy() })
        this.add
          .particles(tx, ty, 'dot', {
            speed: { min: 90, max: 230 },
            lifespan: 480,
            quantity: 14,
            tint: 0xff8844,
            scale: { start: 0.8, end: 0 },
            emitting: false,
          })
          .explode(14)
        this.cameras.main.shake(180, 0.008)
        sfx(this, 'sfx-hit', 0.8)
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, tx, ty) < 80) {
          const before = this.hp
          this.hp = Math.max(1, Math.floor(this.hp / 2)) // เสียเลือดครึ่งหนึ่ง (ระเบิดไม่ฆ่าโดยตรง)
          this.floatText(this.player.x, this.player.y - this.player.displayHeight / 2 - 22, `-${before - this.hp}`, '#ff6b6b', 22)
          voice(this, 'hurt', true)
          this.player.setTint(0xff7070)
          this.time.delayedCall(200, () => !this.gameOver && this.player.clearTint())
          this.tweens.add({ targets: this.player, alpha: 0.35, duration: 120, yoyo: true, repeat: 3 })
        }
      },
    })
  }

  /** ต้นไม้ใกล้ตัวค่อย ๆ เอียง... แล้วล้มทับ — โดนเต็ม ๆ = จบเกมแบบเนียน ๆ */
  private dropTreeNearPlayer() {
    if (this.gameOver) return
    const candidates = this.treeSprites.filter(
      (t) => t.active && Phaser.Math.Distance.Between(t.x, t.y, this.player.x, this.player.y) < 480,
    )
    if (!candidates.length) return
    const tree = candidates[Phaser.Math.Between(0, candidates.length - 1)]
    this.treeSprites.splice(this.treeSprites.indexOf(tree), 1)
    const gunIdx = this.gunTrees.indexOf(tree)
    if (gunIdx >= 0) this.gunTrees.splice(gunIdx, 1)

    const dir = this.player.x >= tree.x ? 1 : -1 // ล้มเข้าหาผู้เล่น
    // หมุนรอบโคนต้น: ย้าย origin ไปที่ฐานแล้วชดเชยตำแหน่ง
    tree.setOrigin(0.5, 1)
    tree.y += tree.displayHeight / 2
    ;(tree.body as Phaser.Physics.Arcade.StaticBody).enable = false

    this.tweens.add({
      targets: tree,
      angle: dir * 7, // เอียงนิด ๆ ก่อน — สังเกตทันก็หนีทัน
      duration: 750,
      ease: 'Sine.inOut',
      onComplete: () => {
        this.tweens.add({
          targets: tree,
          angle: dir * 88,
          duration: 360,
          ease: 'Quad.in',
          onComplete: () => {
            this.cameras.main.shake(140, 0.006)
            sfx(this, 'sfx-die', 0.6)
            const len = tree.displayHeight
            const dx = (this.player.x - tree.x) * dir
            if (!this.gameOver && Math.abs(this.player.y - tree.y) < 46 && dx > 5 && dx < len) {
              this.endGame() // โดนทับ
            }
            this.time.delayedCall(1800, () =>
              this.tweens.add({ targets: tree, alpha: 0, duration: 700, onComplete: () => tree.destroy() }),
            )
          },
        })
      },
    })
  }

  /** ต้นไม้ปืนซ่อน — ยิงเมื่อผู้เล่นเข้าใกล้ */
  private gunTreeTick() {
    if (this.gameOver) return
    for (const t of this.gunTrees) {
      if (!t.active) continue
      if (Phaser.Math.Distance.Between(t.x, t.y, this.player.x, this.player.y) > 380) continue
      const bullet = this.enemyBullets.create(
        t.x,
        t.y - t.displayHeight * 0.5,
        'bullet',
      ) as Phaser.Types.Physics.Arcade.ImageWithDynamicBody
      bullet.setTint(0xff5555).setDepth(t.y + t.displayHeight)
      this.physics.moveToObject(bullet, this.player, 300)
      this.time.delayedCall(2600, () => bullet.active && bullet.destroy())
      sfx(this, 'sfx-shoot', 0.12)
    }
  }

  private spawnBoss() {
    const { x, y } = this.randomPointAwayFromPlayer(420)
    const boss = this.enemies.create(x, y, 'orc-rage', 0) as Enemy
    boss.setData('spec', BOSS)
    boss.setData('hp', BOSS.hp)
    boss.setData('boss', true)
    this.applySheet(boss, 'orc-rage', BOSS.displayHeight)
    boss.play('orc-rage')
    boss.setBounce(1, 1)
    boss.setCollideWorldBounds(true)
    // เกิดมาแบบจัดเต็ม: เด้งตัวให้รู้ว่าบอสมา
    boss.setScale(boss.scaleX * 0.2)
    this.tweens.add({ targets: boss, scaleX: BOSS.displayHeight / sheetOf('orc-rage').frameHeight, scaleY: BOSS.displayHeight / sheetOf('orc-rage').frameHeight, duration: 500, ease: 'Back.out' })
  }

  /** ก๊อบลิน/ออร์คเปลี่ยนร่างคลั่งตอนวงบีบเริ่ม (นาทีที่ 1) */
  private setEnraged(on: boolean) {
    if (this.enraged === on) return
    this.enraged = on
    for (const e of this.aliveEnemies()) this.applyRushVisual(e, on)
  }

  private updateZone(elapsed: number) {
    if (!this.zoneActive) {
      this.zoneActive = true
      this.zoneCenter.set(
        Phaser.Math.Between(350, WORLD_W - 350),
        Phaser.Math.Between(300, WORLD_H - 300),
      )
      this.nextZoneTick = this.time.now + 1000
    }
    const progress = Phaser.Math.Clamp((elapsed - ZONE_START_MS) / (STAGE_MS - ZONE_START_MS), 0, 1)
    // ยกกำลัง 1.5 = ช่วงแรกหดช้า ๆ ค่อยเร่งตอนท้าย
    this.zoneRadius = ZONE_R_START + (ZONE_R_END - ZONE_R_START) * Math.pow(progress, 1.5)

    this.zoneGfx.clear()
    this.zoneGfx.lineStyle(4, 0x66e0ff, 0.9)
    this.zoneGfx.strokeCircle(this.zoneCenter.x, this.zoneCenter.y, this.zoneRadius)
    this.zoneGfx.lineStyle(10, 0x66e0ff, 0.18)
    this.zoneGfx.strokeCircle(this.zoneCenter.x, this.zoneCenter.y, this.zoneRadius + 7)

    const outside =
      Phaser.Math.Distance.Between(this.player.x, this.player.y, this.zoneCenter.x, this.zoneCenter.y) >
      this.zoneRadius
    this.zoneWarn.setVisible(outside)
    if (outside && this.time.now >= this.nextZoneTick) {
      this.nextZoneTick = this.time.now + 1000
      this.hp -= ZONE_DMG_PER_TICK
      this.floatText(this.player.x, this.player.y - this.player.displayHeight / 2 - 22, `-${ZONE_DMG_PER_TICK}`, '#ff6b6b', 15)
      sfx(this, 'sfx-hurt', 0.3)
      this.player.setTint(0xff7070)
      this.time.delayedCall(150, () => !this.gameOver && this.player.clearTint())
      if (this.hp <= 0) {
        this.hp = 0
        this.endGame()
      }
    }
  }

  private clearZone() {
    this.zoneActive = false
    this.zoneGfx.clear()
    this.zoneWarn.setVisible(false)
  }

  // ----- ด่าน/RUSH -----

  private chaseRadius() {
    return Math.min(300 + (this.stage - 1) * 20, 450)
  }

  private enemySpeedMult() {
    return (1 + (this.stage - 1) * 0.07) * (this.rush ? 1.35 : this.enraged ? 1.2 : 1) * this.biomeSpeedMult
  }

  private startStage(n: number) {
    this.stage = n
    this.stageStart = this.time.now
    this.setRush(false)
    this.setEnraged(false)
    this.clearZone()
    this.bossSpawned = false
    // บอสที่เหลือจากด่านก่อนหายไป (ไม่งั้นสะสมจนเล่นไม่ได้)
    for (const e of this.aliveEnemies()) {
      if (e.getData('boss')) {
        e.setData('dead', true)
        e.body.enable = false
        this.tweens.add({ targets: e, alpha: 0, duration: 600, onComplete: () => e.destroy() })
      }
    }
    // ปลูกต้นไม้ทดแทนต้นที่ล้มไปด่านก่อน — ต้นไม้ล้ม/ต้นไม้ปืนต้องมีต้นให้ใช้เสมอ
    while (this.treeSprites.length < 40) this.spawnTree()
    // ด่านเรียงตามลำดับ BIOMES เสมอ (ไม่สุ่ม) ครบ 7 ด่านแล้ววนใหม่
    this.applyBiome((n - 1) % BIOMES.length)
    this.setupHazards()
    // รางวัลผ่านด่าน: เลือดเต็มหลอด
    this.hp = MAX_HP
    this.floatText(this.player.x, this.player.y - this.player.displayHeight / 2 - 22, 'ผ่านด่าน! เลือดเต็ม', '#7cfc9b', 20)
    sfx(this, 'jingle-stage', 0.45)
    voice(this, 'stage', true)
    for (let i = 0; i < 3; i++) {
      if (this.enemies.countActive() < 24) this.spawnEnemy()
    }
    const banner = this.hud(
      this.add
        .text(this.scale.width / 2, 200, `ด่าน ${n} · ${this.biomeName}!`, { fontFamily: FONT, fontSize: '44px', color: '#ffd460' })
        .setOrigin(0.5),
    )
    this.tweens.add({ targets: banner, alpha: 0, duration: 1600, onComplete: () => banner.destroy() })
  }

  private setRush(on: boolean) {
    if (this.rush === on) return
    this.rush = on
    this.rushText.setVisible(on)
    playBgm(this, on ? 'bgm-rush' : 'bgm-game') // เพลงเร่งจังหวะช่วง RUSH
    if (on) {
      voice(this, 'rush', true)
      if (!this.bossSpawned) {
        this.bossSpawned = true
        this.spawnBoss()
      }
    }
  }

  private applyRushVisual(e: Enemy, on: boolean) {
    const spec = e.getData('spec') as EnemySpec
    if (spec.rageAnim) {
      const anim = on ? spec.rageAnim : spec.walkAnim
      this.applySheet(e, this.animSheetKey(anim), spec.displayHeight)
      if (this.power?.type !== 'freeze') e.play(anim)
    } else {
      if (on) e.setTint(0xffb0b0)
      else if (this.power?.type !== 'freeze') e.clearTint()
    }
  }

  // ----- กล่องพลัง -----

  /** กดใช้สกิลจากช่องที่ i (แตะหรือกดเลข 1-5) */
  private useSlot(i: number) {
    const type = this.slots[i]
    if (!type || this.gameOver) return
    this.slots[i] = null
    this.refreshHotbar()
    sfx(this, type === 'freeze' ? 'sfx-freeze' : type === 'heal' ? 'sfx-heal' : 'sfx-skill', 0.5)
    this.activatePower(type)
  }

  private activatePower(type: PowerType, special = false) {
    if (this.power?.type === 'freeze' && type !== 'freeze') this.unfreezeEnemies()
    // ของพิเศษจากกล่องรางวัลใหญ่อยู่นาน ×2
    this.power = { type, until: this.time.now + POWERS[type].duration * (special ? 2 : 1), special }

    if (type === 'heal') this.hp = Math.min(MAX_HP, this.hp + (special ? MAX_HP : 40))
    if (type === 'freeze') this.freezeEnemies()
    this.shieldAura.setVisible(type === 'shield')
  }

  private clearPower() {
    if (this.power?.type === 'freeze') this.unfreezeEnemies()
    this.power = null
    this.shieldAura.setVisible(false)
    this.powerText.setText('')
  }

  private freezeEnemies() {
    for (const e of this.aliveEnemies()) {
      e.setVelocity(0, 0)
      e.anims.pause()
      e.setTint(0x8fd3ff)
    }
  }

  private unfreezeEnemies() {
    for (const e of this.aliveEnemies()) {
      e.clearTint()
      e.anims.resume()
      this.applyRushVisual(e, this.enraged)
    }
  }

  private fireAtNearestEnemy(special = false) {
    let nearest: Enemy | null = null
    let best = 500
    for (const e of this.aliveEnemies()) {
      const d = Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y)
      if (d < best) {
        best = d
        nearest = e
      }
    }
    if (!nearest) return
    const bullet = this.bullets.create(this.player.x, this.player.y, 'bullet') as Phaser.Types.Physics.Arcade.ImageWithDynamicBody
    bullet.setDepth(this.player.y + 10)
    // ปืนพิเศษ: ลูกใหญ่ สีชมพู แรง ×2 วิ่งเร็วกว่า
    if (special) {
      bullet.setScale(1.6).setTint(0xff8ad8)
      bullet.setData('dmg', 2)
    }
    this.physics.moveToObject(bullet, nearest, special ? 650 : 520)
    this.time.delayedCall(1200, () => bullet.active && bullet.destroy())
    sfx(this, 'sfx-shoot', 0.2)
    this.playAction(this.spec.shotAnims)
  }

  // ----- ศัตรู/ดาเมจ -----

  private touchEnemy(e: Enemy) {
    if (e.getData('dead') || this.gameOver) return
    if (this.power?.type === 'freeze') return
    const spec = e.getData('spec') as EnemySpec
    if (this.power?.type === 'shield') {
      const ang = Phaser.Math.Angle.Between(this.player.x, this.player.y, e.x, e.y)
      e.setVelocity(Math.cos(ang) * 400, Math.sin(ang) * 400)
      return
    }
    if (this.time.now < this.invulnUntil) return

    this.hp -= spec.damage
    this.invulnUntil = this.time.now + 1200
    this.floatText(this.player.x, this.player.y - this.player.displayHeight / 2 - 22, `-${spec.damage}`, '#ff6b6b')
    sfx(this, 'sfx-hurt', 0.55)
    voice(this, 'hurt')
    // กระเด็นออกจากศัตรู + กะพริบช่วงอมตะ
    const ang = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y)
    this.player.setVelocity(Math.cos(ang) * 350, Math.sin(ang) * 350)
    if (this.spec.hurtAnim) this.playAction([this.spec.hurtAnim])
    else {
      this.player.setTint(0xff7070)
      this.time.delayedCall(180, () => !this.gameOver && this.player.clearTint())
    }
    this.tweens.add({ targets: this.player, alpha: 0.35, duration: 120, yoyo: true, repeat: 4 })

    if (this.hp <= 0) {
      this.hp = 0
      this.endGame()
    }
  }

  private damageEnemy(e: Enemy, dmg = 1) {
    if (e.getData('dead')) return
    const spec = e.getData('spec') as EnemySpec
    const hp = (e.getData('hp') as number) - dmg
    e.setData('hp', hp)
    sfx(this, 'sfx-hit', 0.4)
    if (hp > 0) {
      e.setTintFill(0xffffff)
      this.time.delayedCall(120, () => {
        if (!e.getData('dead') && e.active) {
          e.clearTint()
          this.applyRushVisual(e, this.enraged)
        }
      })
      return
    }
    e.setData('dead', true)
    e.body.enable = false
    e.anims.stop()
    e.setTexture(spec.deathSheet, spec.deathFrame)
    sfx(this, 'sfx-die', 0.5)
    voice(this, 'kill')
    this.score += spec.score
    this.scoreText.setText(`สมบัติ: ${this.score}`)
    this.tweens.add({
      targets: e,
      alpha: 0,
      duration: 700,
      delay: 450,
      onComplete: () => e.destroy(),
    })
    this.time.delayedCall(1500, () => !this.gameOver && this.spawnEnemy())
  }

  private aliveEnemies() {
    return (this.enemies.getChildren() as Enemy[]).filter((e) => !e.getData('dead'))
  }

  // ----- helper -----

  /** ตัวเลขลอย (ดาเมจ/ฮีล/แต้ม) — ลอยขึ้นแล้วจางหาย */
  private floatText(x: number, y: number, str: string, color: string, size = 18) {
    const t = this.add
      .text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#0f172a', strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(95000)
    this.minimap.ignore(t)
    this.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 950, ease: 'Quad.out', onComplete: () => t.destroy() })
  }

  /** พยาบาลประจำทีม: ฮีล + เด้งตัวเลขบอกหัว */
  private healPlayer(amount: number) {
    const gained = Math.min(amount, MAX_HP - this.hp)
    this.hp += gained
    this.floatText(
      this.player.x,
      this.player.y - this.player.displayHeight / 2 - 22,
      gained > 0 ? `+${gained}` : 'เลือดเต็ม',
      '#7cfc9b',
    )
  }

  private hud<T extends Phaser.GameObjects.GameObject & { setScrollFactor(v: number): T; setDepth(v: number): T }>(
    obj: T,
  ): T {
    obj.setScrollFactor(0).setDepth(HUD_DEPTH)
    this.minimap.ignore(obj)
    return obj
  }

  private randomPointAwayFromPlayer(minDist: number) {
    let x = 0
    let y = 0
    do {
      x = Phaser.Math.Between(60, WORLD_W - 60)
      y = Phaser.Math.Between(60, WORLD_H - 60)
    } while (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < minDist)
    return { x, y }
  }

  private spawnTree() {
    const { x, y } = this.randomPointAwayFromPlayer(150)
    const t = TREES[Phaser.Math.Between(0, TREES.length - 1)]
    const tree = this.obstacles.create(x, y, t.key) as Phaser.Types.Physics.Arcade.ImageWithStaticBody
    const h = t.height * Phaser.Math.FloatBetween(0.85, 1.2)
    tree.setScale(h / tree.height)
    tree.setDepth(y + tree.displayHeight / 2)
    const bw = tree.displayWidth * 0.35
    const bh = tree.displayHeight * 0.14
    tree.body.setSize(bw, bh)
    tree.body.setOffset((tree.displayWidth - bw) / 2, tree.displayHeight - bh)
    this.treeSprites.push(tree)
  }

  private spawnChest() {
    const { x, y } = this.randomPointAwayFromPlayer(80)
    const chest = this.chests.create(x, y, 'chest') as Phaser.Types.Physics.Arcade.ImageWithDynamicBody
    chest.setScale(2).setDepth(y)
  }

  private spawnPowerBox() {
    const { x, y } = this.randomPointAwayFromPlayer(150)
    const box = this.powerBoxes.create(x, y, 'powerbox') as Phaser.Types.Physics.Arcade.ImageWithDynamicBody
    box.setDepth(y)
    this.tweens.add({ targets: box, y: y - 7, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
  }

  private spawnEnemy() {
    // ด่าน 1 มีแต่ก๊อบลิน · ด่าน 2+ มีออร์ค 35%
    const spec =
      this.stage >= 2 && Math.random() < 0.35 ? ENEMY_TYPES[1] : ENEMY_TYPES[0]
    const { x, y } = this.randomPointAwayFromPlayer(350)
    const sheet = this.animSheetKey(spec.walkAnim)
    const enemy = this.enemies.create(x, y, sheet, 0) as Enemy
    enemy.setData('spec', spec)
    enemy.setData('hp', spec.hp)
    this.applySheet(enemy, sheet, spec.displayHeight)
    enemy.play(spec.walkAnim)
    enemy.setVelocity(Phaser.Math.Between(-80, 80), Phaser.Math.Between(-80, 80))
    enemy.setBounce(1, 1)
    enemy.setCollideWorldBounds(true)
    if (this.enraged) this.applyRushVisual(enemy, true)
    if (this.power?.type === 'freeze') {
      enemy.setVelocity(0, 0)
      enemy.anims.pause()
      enemy.setTint(0x8fd3ff)
    }
  }

  private endGame() {
    if (this.gameOver) return
    this.gameOver = true
    this.clearPower()
    stopBgm(this)
    sfx(this, 'jingle-lose', 0.5)
    voice(this, 'lose', true)
    this.physics.pause()
    this.player.stop()
    this.player.setTint(0x888888)
    for (const e of this.enemies.getChildren() as Phaser.GameObjects.Sprite[]) e.stop()
    const cx = this.scale.width / 2
    this.hud(
      this.add
        .text(cx, 240, 'จบเกม!', { fontFamily: FONT, fontSize: '48px', color: '#e94560' })
        .setOrigin(0.5),
    )
    this.hud(
      this.add
        .text(cx, 295, `ได้สมบัติ ${this.score} · ถึงด่าน ${this.stage}`, {
          fontFamily: FONT,
          fontSize: '20px',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    )
    if (qualifies(this.score)) {
      this.hud(
        this.add
          .text(cx, 327, 'ติดอันดับสูงสุด!', { fontFamily: FONT, fontSize: '18px', color: '#4ecca3' })
          .setOrigin(0.5),
      )
    }
    // ปุ่มแตะได้ (มือถือ) + คีย์ลัดเดิม
    const goBoard = () =>
      this.scene.start('board', {
        pending: qualifies(this.score)
          ? { score: this.score, char: this.spec.key, stage: this.stage }
          : undefined,
      })
    this.textButton(cx - 145, 375, 'เริ่มใหม่ (SPACE)', () => this.scene.restart())
    this.textButton(cx + 30, 375, 'ตัวละคร (C)', () => this.scene.start('select'))
    this.textButton(cx + 175, 375, qualifies(this.score) ? 'ใส่ชื่อ (B)' : 'อันดับ (B)', goBoard)
    this.input.keyboard!.once('keydown-SPACE', () => this.scene.restart())
    this.input.keyboard!.once('keydown-C', () => this.scene.start('select'))
    this.input.keyboard!.once('keydown-B', goBoard)
  }

  private textButton(x: number, y: number, label: string, cb: () => void) {
    const txt = this.add
      .text(x, y, label, { fontFamily: FONT, fontSize: '19px', color: '#ffd460' })
      .setOrigin(0.5)
      .setPadding(14, 8, 14, 8)
    txt.setBackgroundColor('#1f2a40')
    this.hud(txt)
    txt.setInteractive({ useHandCursor: true })
    txt.on('pointerdown', () => {
      sfx(this, 'sfx-click')
      cb()
    })
    return txt
  }

  private drawBars() {
    this.bars.clear()
    // หลอดเลือดผู้เล่น
    const px = this.player.x
    const py = this.player.y - this.player.displayHeight / 2 - 14
    const w = 56
    const pct = this.hp / MAX_HP
    this.bars.fillStyle(0x0f172a, 0.75)
    this.bars.fillRoundedRect(px - w / 2 - 1, py - 1, w + 2, 9, 4)
    this.bars.fillStyle(pct > 0.5 ? 0x4ecca3 : pct > 0.25 ? 0xf6a821 : 0xe94560)
    if (pct > 0) this.bars.fillRoundedRect(px - w / 2, py, Math.max(w * pct, 6), 7, 3)
    // หลอดเลือดศัตรู: ออร์คโชว์หลังโดนยิง · บอสโชว์ตลอด (หลอดใหญ่)
    for (const e of this.aliveEnemies()) {
      const spec = e.getData('spec') as EnemySpec
      const hp = e.getData('hp') as number
      const isBoss = !!e.getData('boss')
      if (hp >= spec.hp && !isBoss) continue
      const ew = isBoss ? 90 : 40
      const eh = isBoss ? 8 : 5
      const ex = e.x
      const ey = e.y - e.displayHeight / 2 - (isBoss ? 16 : 10)
      this.bars.fillStyle(0x0f172a, 0.75)
      this.bars.fillRect(ex - ew / 2 - 1, ey - 1, ew + 2, eh + 2)
      this.bars.fillStyle(isBoss ? 0xb84df0 : 0xe94560)
      this.bars.fillRect(ex - ew / 2, ey, ew * (hp / spec.hp), eh)
    }
  }

  update() {
    this.ground.setTilePosition(this.cameras.main.scrollX / 3, this.cameras.main.scrollY / 3)
    this.playerMarker.setPosition(this.player.x, this.player.y)
    this.player.setDepth(this.player.y + this.jumpZ + this.player.displayHeight / 2)
    this.shieldAura.setPosition(this.player.x, this.player.y).setDepth(this.player.depth + 1)
    this.updateJump()
    this.drawBars()

    if (this.gameOver) return

    // นาฬิกาด่าน + RUSH 30 วิท้าย
    const elapsed = this.time.now - this.stageStart
    if (elapsed >= STAGE_MS) {
      this.startStage(this.stage + 1)
    } else {
      this.setRush(elapsed >= STAGE_MS - RUSH_MS)
      this.setEnraged(elapsed >= ZONE_START_MS)
      if (elapsed >= ZONE_START_MS) this.updateZone(elapsed)
      const remain = Math.ceil((STAGE_MS - elapsed) / 1000)
      this.stageText.setText(
        `ด่าน ${this.stage} ${this.biomeName} · ${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, '0')}`,
      )
    }

    if (this.power) {
      const left = this.power.until - this.time.now
      if (left <= 0) {
        this.clearPower()
      } else {
        const label = POWERS[this.power.type].nameTh + (this.power.special ? 'พิเศษ' : '')
        this.powerText.setText(
          this.power.type === 'heal' ? label : `${label} ${Math.ceil(left / 1000)}s`,
        )
        if (this.power.type === 'gun' && this.time.now >= this.nextShot) {
          this.fireAtNearestEnemy(this.power.special)
          // ปืนพิเศษยิงรัวกว่าปกติ
          this.nextShot = this.time.now + (this.power.special ? 150 : 350)
        }
      }
    }

    const speed =
      this.spec.speed *
      (this.power?.type === 'speed' ? (this.power.special ? 2.2 : 1.7) : 1) *
      this.biomeSpeedMult
    const left = this.cursors.left.isDown || this.wasd.left.isDown
    const right = this.cursors.right.isDown || this.wasd.right.isDown
    const up = this.cursors.up.isDown || this.wasd.up.isDown
    const down = this.cursors.down.isDown || this.wasd.down.isDown
    const joyOn = this.joyVec.lengthSq() > 0.02 // deadzone กันนิ้วสั่น

    // ตอนโดนตีจะกระเด็น — อย่าทับ velocity ถ้าเพิ่งโดน (300ms แรกของช่วงอมตะ)
    const knockedBack = this.time.now < this.invulnUntil - 900
    if (!knockedBack) {
      if (joyOn) {
        // จอยสติ๊ก: ทิศ + ความแรงตามระยะลาก (เดินช้า/วิ่งเร็วได้ในตัว)
        this.player.setVelocity(this.joyVec.x * speed, this.joyVec.y * speed)
      } else {
        this.player.setVelocity(
          (right ? speed : 0) - (left ? speed : 0),
          (down ? speed : 0) - (up ? speed : 0),
        )
      }
    }

    const moving = left || right || up || down || joyOn
    if (!this.acting) {
      const walkSheet = this.animSheetKey(this.spec.walkAnim)
      if (this.player.texture.key !== walkSheet) {
        this.applyPlayerSheet(walkSheet)
        this.player.setTexture(walkSheet, 0)
      }
      if (moving) this.player.anims.play(this.spec.walkAnim, true)
      else {
        this.player.stop()
        this.player.setFrame(0)
      }
    }
    if (left || (joyOn && this.joyVec.x < -0.1)) this.player.setFlipX(this.spec.facing === 'right')
    if (right || (joyOn && this.joyVec.x > 0.1)) this.player.setFlipX(this.spec.facing === 'left')

    if (this.power?.type !== 'freeze') {
      const mult = this.enemySpeedMult()
      for (const e of this.aliveEnemies()) {
        const spec = e.getData('spec') as EnemySpec
        if (Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) < this.chaseRadius()) {
          this.physics.moveToObject(e, this.player, spec.speed * mult)
        }
        e.setFlipX(spec.facing === 'left' ? e.body.velocity.x > 0 : e.body.velocity.x < 0)
        e.setDepth(e.y + e.displayHeight / 2)
      }
    }
  }
}
