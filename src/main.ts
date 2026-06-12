import Phaser from 'phaser'
import { BoardScene } from './scenes/BoardScene'
import { GameScene } from './scenes/GameScene'
import { SelectScene } from './scenes/SelectScene'

// ขนาดเกมอิงสัดส่วนจอจริง — มือถือจอกว้างจะไม่เหลือแถบดำข้างจอ
// ใช้ด้านยาว/ด้านสั้นเสมอ (เกมเป็นแนวนอน) — กันเคสเปิดหน้าเว็บตอนมือถือยังหันแนวตั้งแล้วค่อยหมุน
// สูงคงที่ 600 (พิกัด Y เดิมทั้งเกมใช้ได้) กว้างตามจอ: แคบสุด 4:3 (800) กว้างสุด 21:9 (1400)
const HEIGHT = 600
const landscapeRatio =
  Math.max(window.innerWidth, window.innerHeight) /
  Math.min(window.innerWidth, window.innerHeight)
const aspect = Phaser.Math.Clamp(landscapeRatio, 4 / 3, 21 / 9)
const WIDTH = Math.round((HEIGHT * aspect) / 2) * 2

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#16213e',
  pixelArt: true,
  dom: { createContainer: true }, // ใช้ช่องกรอกชื่อบนบอร์ดอันดับ
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  scene: [SelectScene, GameScene, BoardScene],
})

// สำหรับ debug ใน console
;(window as unknown as { __game: Phaser.Game }).__game = game
