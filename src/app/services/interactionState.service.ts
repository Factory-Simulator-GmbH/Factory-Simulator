import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class InteractionStateService {
  lastMouseButton = -1;
  mousePressed = false;
  isDraggingItem = false;
  activeDraggedItemId: string | null = null;

  paintMode: 'on' | 'off' | null = null;
  previewCells = new Set<string>();
  touchedCells = new Set<string>();
  pathCells: { row: number; col: number }[] = [];

  isNavigatingMinimap = false;

  resetInteractions(): void {
    this.isNavigatingMinimap = false;
    document.body.style.cursor = '';
    this.mousePressed = false;
    this.paintMode = null;
    this.previewCells.clear();
    this.touchedCells.clear();
    this.pathCells = [];
    this.isDraggingItem = false;
    if (this.activeDraggedItemId) {
      const el = document.getElementById(this.activeDraggedItemId);
      if (el) el.style.pointerEvents = '';
    }
    this.activeDraggedItemId = null;
  }
}