import 'phaser';
import { MainScene } from './scenes/MainScene';
import { ChatWidget } from './components/ChatWidget';

if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
  const requestFS = () => {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
  };
  document.addEventListener('pointerdown', requestFS, { once: true });
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: 'game-container',
  backgroundColor: '#0a0a2a',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0, x: 0 },
      debug: false
    }
  },
  scene: [MainScene]
};

window.addEventListener('load', () => {
  const game = new Phaser.Game(config);
  // 開発時のみデバッグ用にゲームインスタンスを公開
  if (import.meta.env.DEV) {
    (window as any).__game = game;
  }

  const chatRoot = document.getElementById('chat-widget-root');
  if (chatRoot) {
    new ChatWidget(chatRoot);
  }
});
