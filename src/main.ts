import Phaser from 'phaser'
import { BoardScene } from './scenes/BoardScene'
import { GameScene } from './scenes/GameScene'
import { SelectScene } from './scenes/SelectScene'

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 800,
  height: 600,
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
