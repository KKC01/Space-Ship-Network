import type { MainScene } from '../scenes/MainScene';

/**
 * カメラ操作（ドラッグパン、ホイールズーム、クリック判定）を管理する。
 * クリック処理（ユニット/惑星/隕石選択）は MainScene 側のロジックに委譲する。
 */
export class CameraController {
  private scene: MainScene;

  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private camStartX: number = 0;
  private camStartY: number = 0;
  private isDragging: boolean = false;

  private clickHandler: ((worldX: number, worldY: number) => void) | null = null;

  constructor(scene: MainScene) {
    this.scene = scene;
  }

  /**
   * pointer/wheel イベントを Phaser シーンに登録する。
   * MainScene.create() の最後で呼ぶ。
   */
  attach(): void {
    this.scene.input.on('pointerdown', this.onPointerDown, this);
    this.scene.input.on('pointermove', this.onPointerMove, this);
    this.scene.input.on('pointerup', this.onPointerUp, this);
    this.scene.input.on('wheel', (_p: any, _g: any, _dx: number, deltaY: number) => {
      let newZoom = this.scene.cameras.main.zoom - (deltaY * 0.001);
      newZoom = Phaser.Math.Clamp(newZoom, 0.15, 4.0);
      this.scene.cameras.main.setZoom(newZoom);
    });
  }

  /**
   * クリック（ドラッグなし）時に呼ぶコールバックを登録する。
   * @param cb worldX/worldY を受け取り、選択処理を行う関数
   */
  setClickHandler(cb: (worldX: number, worldY: number) => void): void {
    this.clickHandler = cb;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.scene.isGameOver()) return;
    this.isDragging = true;
    this.dragStartX = pointer.x;
    this.dragStartY = pointer.y;
    this.camStartX = this.scene.cameras.main.scrollX;
    this.camStartY = this.scene.cameras.main.scrollY;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.isDragging) {
      const dx = pointer.x - this.dragStartX;
      const dy = pointer.y - this.dragStartY;
      this.scene.cameras.main.scrollX = this.camStartX - dx / this.scene.cameras.main.zoom;
      this.scene.cameras.main.scrollY = this.camStartY - dy / this.scene.cameras.main.zoom;
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    this.isDragging = false;
    if (this.scene.isGameOver()) return;

    const dx = pointer.x - this.dragStartX;
    const dy = pointer.y - this.dragStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 10) {
      if (this.clickHandler) {
        this.clickHandler(pointer.worldX, pointer.worldY);
      }
    }
  }
}
