import { Injectable } from '@angular/core';
import { FactoryGridService } from './factory-grid.service';
import { ConveyorSegment } from '../models/conveyor-segment.model';

@Injectable({
  providedIn: 'root'
})
export class ConveyorPainterService {
  paintMode: 'on' | 'off' | null = null;
  previewCells = new Set<string>();
  touchedCells = new Set<string>();
  pathCells: { row: number; col: number }[] = [];

  constructor(private gridService: FactoryGridService) {}

  startPainting(row: number, col: number, mode: 'on' | 'off'): void {
    this.paintMode = mode;
    this.previewCells.clear();
    this.touchedCells.clear();
    this.pathCells = [];
    this.applyPreview(row, col);
  }

  continuePainting(row: number, col: number): void {
    if (!this.paintMode) return;
    this.applyPreview(row, col);
  }

  stopPainting(): void {
    this.paintMode = null;
  }

  private applyPreview(rowIndex: number, colIndex: number): void {
    // Delegate to FactoryGridService
    // This is a placeholder - actual logic is in factory.page.ts
  }

  clearPreview(): void {
    this.previewCells.clear();
    this.touchedCells.clear();
    this.pathCells = [];
  }
}