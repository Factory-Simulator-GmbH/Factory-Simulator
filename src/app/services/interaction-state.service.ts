import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class InteractionStateService {
  // Mouse/Interaction State
  lastMouseButton = -1;
  mousePressed = false;
  isDraggingItem = false;
  activeDraggedItemId: string | null = null;
  lastRightClickTime = 0;
  lastRightClickId: string | null = null;

  // Conveyor Painting State
  paintMode: 'on' | 'off' | null = null;
  previewCells = new Set<string>();
  touchedCells = new Set<string>();
  pathCells: { row: number; col: number }[] = [];

  resetInteractions(): void {
    this.mousePressed = false;
    this.paintMode = null;
    this.previewCells.clear();
    this.touchedCells.clear();
    this.pathCells = [];
    this.isDraggingItem = false;
    this.activeDraggedItemId = null;
  }
}