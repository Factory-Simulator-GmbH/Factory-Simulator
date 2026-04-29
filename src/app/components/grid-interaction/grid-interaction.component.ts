import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-grid-interaction',
  standalone: true,
  imports: [CommonModule],
  template: ``,
  styles: []
})
export class GridInteractionComponent {
  // Input: Grid state
  @Input() conveyorGrid: any[][] = [];
  @Input() previewCells = new Set<string>();
  @Input() paintMode: 'on' | 'off' | null = null;
  @Input() mousePressed = false;
  @Input() isDraggingItem = false;
  @Input() gridRowCount = 30;
  @Input() gridColumns = 50;

  // Output: Grid events
  @Output() cellMouseDown = new EventEmitter<{ event: MouseEvent; row: number; col: number }>();
  @Output() cellMouseEnter = new EventEmitter<{ row: number; col: number }>();

  onCellMouseDown(event: MouseEvent, rowIndex: number, colIndex: number): void {
    if (this.isDraggingItem) return;
    this.cellMouseDown.emit({ event, row: rowIndex, col: colIndex });
  }

  onCellMouseEnter(rowIndex: number, colIndex: number): void {
    if (!this.mousePressed || this.isDraggingItem || !this.paintMode) return;
    this.cellMouseEnter.emit({ row: rowIndex, col: colIndex });
  }

  isPreviewCell(row: number, col: number): boolean {
    return this.previewCells.has(`${row},${col}`);
  }

  isActiveCell(row: number, col: number): boolean {
    return this.conveyorGrid[row]?.[col]?.active ?? false;
  }
}