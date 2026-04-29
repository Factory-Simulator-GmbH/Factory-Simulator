import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DragDropManagerService {
  // Drag State
  dragOffset = { x: 0, y: 0 };
  currentDragPosition: { row: number; col: number } | null = null;
  ghostElement: HTMLElement | null = null;

  startDrag(event: MouseEvent, itemId: string): void {
    this.dragOffset = { x: event.offsetX, y: event.offsetY };
  }

  updateDragPosition(event: MouseEvent, gridRect: DOMRect, cellSize: number, zoom: number): void {
    const col = Math.floor((event.clientX - gridRect.left) / (cellSize * zoom));
    const row = Math.floor((event.clientY - gridRect.top) / (cellSize * zoom));
    this.currentDragPosition = { row, col };
  }

  endDrag(): void {
    this.currentDragPosition = null;
  }
}