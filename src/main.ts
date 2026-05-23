import 'phaser';
import { MainScene } from './scenes/MainScene';
import { ChatWidget } from './components/ChatWidget';
import { TitleScreen } from './ui/TitleScreen';

// モバイル fullscreen 要求（複数回トライで確実性向上）
const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

const requestFS = () => {
  const el = document.documentElement;
  const fsRequest = el.requestFullscreen || (el as any).webkitRequestFullscreen;
  if (fsRequest) {
    fsRequest.call(el).catch(() => {});
  }
};

if (isMobile) {
  // ポインタダウン時に fullscreen 要求
  document.addEventListener('pointerdown', requestFS, { once: true });
}

// モバイルブラウザのアドレスバー対応（優先度順）
const getGameHeight = () => {
  // 優先度1: clientHeight（実際の利用可能な高さ - 最も信頼性が高い）
  if (document.documentElement.clientHeight > 0) {
    return document.documentElement.clientHeight;
  }
  // 優先度2: visualViewport（アドレスバー動的対応）
  if (window.visualViewport?.height && window.visualViewport.height > 0) {
    return window.visualViewport.height;
  }
  // 優先度3: innerHeight（フォールバック）
  return window.innerHeight;
};

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: getGameHeight(),
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

  // MainScene の create 完了後に TitleScreen を起動する
  game.events.once('ready', () => {
    const mainScene = game.scene.getScene('MainScene') as MainScene;
    mainScene.events.once('create', () => {
      // scene 初期化完了後に fullscreen 要求を複数回試行
      if (isMobile) {
        requestFS();
        // 200ms 後に再度試行（初回失敗時のリトライ）
        setTimeout(() => requestFS(), 200);
        // ゲーム開始時（出撃時）にも再度試行
        mainScene.events.once('appPhaseChange', () => {
          if ((mainScene as any)._appPhase === 'playing') {
            setTimeout(() => requestFS(), 300);
          }
        });
      }
      new TitleScreen(mainScene).init();
    });
  });

  // モバイルブラウザでアドレスバーが表示/非表示になった時にゲームをリサイズ
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', () => {
      const height = vv.height || window.innerHeight;
      game.scale.resize(window.innerWidth, height);
    });
    vv.addEventListener('scroll', () => {
      const height = vv.height || window.innerHeight;
      game.scale.resize(window.innerWidth, height);
    });
  }

  // orientationchange でも対応（デバイス回転時）
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      const height = getGameHeight();
      game.scale.resize(window.innerWidth, height);
    }, 100);
  });

  window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, getGameHeight());
  });
});
