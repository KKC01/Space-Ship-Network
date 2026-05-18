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
  private activePointers: Map<number, Phaser.Input.Pointer> = new Map();
  private pinchStartDistance: number = 0;
  private pinchStartZoom: number = 0;
  private suppressTapAfterGesture: boolean = false;

  private clickHandler: ((worldX: number, worldY: number) => void) | null = null;
  private readonly minZoom = 0.15;
  private readonly maxZoom = 4.0;

  constructor(scene: MainScene) {
    this.scene = scene;
  }

  /**
   * pointer/wheel イベントを Phaser シーンに登録する。
   * MainScene.create() の最後で呼ぶ。
   */
  attach(): void {
    this.scene.input.addPointer(2);
    this.scene.input.on('pointerdown', this.onPointerDown, this);
    this.scene.input.on('pointermove', this.onPointerMove, this);
    this.scene.input.on('pointerup', this.onPointerUp, this);
    this.scene.input.on('wheel', (_p: any, _g: any, _dx: number, deltaY: number) => {
      this.setZoom(this.scene.cameras.main.zoom - (deltaY * 0.001));
    });
    this.bindMobileZoomControls();
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
    this.activePointers.set(pointer.id, pointer);

    if (this.activePointers.size >= 2) {
      this.isDragging = false;
      this.startPinch();
      return;
    }

    this.isDragging = true;
    this.suppressTapAfterGesture = false;
    this.dragStartX = pointer.x;
    this.dragStartY = pointer.y;
    this.camStartX = this.scene.cameras.main.scrollX;
    this.camStartY = this.scene.cameras.main.scrollY;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.activePointers.has(pointer.id)) {
      this.activePointers.set(pointer.id, pointer);
    }

    if (this.activePointers.size >= 2) {
      this.handlePinchZoom();
      return;
    }

    if (this.isDragging) {
      const dx = pointer.x - this.dragStartX;
      const dy = pointer.y - this.dragStartY;
      if (Math.sqrt(dx * dx + dy * dy) >= 10) {
        this.suppressTapAfterGesture = true;
      }
      this.scene.cameras.main.scrollX = this.camStartX - dx / this.scene.cameras.main.zoom;
      this.scene.cameras.main.scrollY = this.camStartY - dy / this.scene.cameras.main.zoom;
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    const wasMultiTouch = this.activePointers.size >= 2;
    this.activePointers.delete(pointer.id);
    this.isDragging = false;

    if (wasMultiTouch || this.pinchStartDistance > 0) {
      this.suppressTapAfterGesture = true;
      this.pinchStartDistance = 0;
      if (this.activePointers.size === 1) {
        const remainingPointer = Array.from(this.activePointers.values())[0];
        this.dragStartX = remainingPointer.x;
        this.dragStartY = remainingPointer.y;
        this.camStartX = this.scene.cameras.main.scrollX;
        this.camStartY = this.scene.cameras.main.scrollY;
        this.isDragging = true;
      }
      return;
    }

    if (this.scene.isGameOver()) return;

    const dx = pointer.x - this.dragStartX;
    const dy = pointer.y - this.dragStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 10 && !this.suppressTapAfterGesture) {
      if (this.clickHandler) {
        this.clickHandler(pointer.worldX, pointer.worldY);
      }
    }
  }

  private bindMobileZoomControls(): void {
    const zoomIn = document.getElementById('mobile-zoom-in');
    const zoomOut = document.getElementById('mobile-zoom-out');
    const zoomReset = document.getElementById('mobile-zoom-reset');

    zoomIn?.addEventListener('click', () => this.zoomBy(1.2));
    zoomOut?.addEventListener('click', () => this.zoomBy(1 / 1.2));
    zoomReset?.addEventListener('click', () => this.setZoom(this.isCompactViewport() ? 0.32 : 0.4));
  }

  private startPinch(): void {
    const [p1, p2] = Array.from(this.activePointers.values());
    this.pinchStartDistance = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
    this.pinchStartZoom = this.scene.cameras.main.zoom;
    this.suppressTapAfterGesture = true;
  }

  private handlePinchZoom(): void {
    const [p1, p2] = Array.from(this.activePointers.values());
    const distance = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
    if (this.pinchStartDistance <= 0) {
      this.startPinch();
      return;
    }
    const zoomRatio = distance / this.pinchStartDistance;
    this.setZoom(this.pinchStartZoom * zoomRatio);
  }

  private zoomBy(multiplier: number): void {
    this.setZoom(this.scene.cameras.main.zoom * multiplier);
  }

  private setZoom(zoom: number): void {
    const newZoom = Phaser.Math.Clamp(zoom, this.minZoom, this.maxZoom);
    this.scene.cameras.main.setZoom(newZoom);
  }

  private isCompactViewport(): boolean {
    return window.matchMedia('(max-width: 720px), (pointer: coarse)').matches;
  }
}
