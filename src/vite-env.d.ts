/// <reference types="vite/client" />

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.mp4' {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  readonly VITE_DIFY_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface GameStateSnapshot {
  shipCount: number;
  selectedUnitId: string | null;
  selectedUnitHp: number | null;
  missionReach: boolean;
  missionAllLinked: boolean;
  missionData: boolean;
  elapsedSeconds: number;
  gameMode: 'control' | 'combat';
  gameStatus: 'briefing' | 'active' | 'won';
}

interface Window {
  __gameState?: GameStateSnapshot;
  __chatWidget?: import('./components/ChatWidget').ChatWidget;
}
