import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { ConveyorSegment } from '../../models/conveyor-segment.model';

@Component({
  selector: 'app-playground-grid',
  standalone: true,
  templateUrl: './playground-grid.component.html',
})
export class PlaygroundGridComponent {
  @ViewChild('gridTable', { static: true })
  gridTableRef!: ElementRef<HTMLTableElement>;

  @ViewChild('gridViewport', { static: true })
  gridViewportRef!: ElementRef<HTMLElement>;

  @Input({ required: true }) conveyorGrid!: ConveyorSegment[][];
  @Input({ required: true }) gridCellSizePx!: number;
  @Input({ required: true }) previewCells!: Set<string>;
  @Input({ required: true }) getConveyorSymbol!: (cell: ConveyorSegment) => string;
  @Input() zoomLevel: number = 1;
  @Input() isFullscreen = false;

  @Output() toggleFullscreen = new EventEmitter<void>();
  @Output() gridScroll = new EventEmitter<Event>();

  @Output() cellMouseDown = new EventEmitter<{ event: MouseEvent; rowIndex: number; colIndex: number }>();
  @Output() cellMouseEnter = new EventEmitter<{ rowIndex: number; colIndex: number }>();

  private key(r: number, c: number): string {
    return `${r}:${c}`;
  }

  isPaintPreview(r: number, c: number): boolean {
    return this.previewCells.has(this.key(r, c));
  }

  onMouseDown(event: MouseEvent, rowIndex: number, colIndex: number): void {
    this.cellMouseDown.emit({ event, rowIndex, colIndex });
  }

  onMouseEnter(rowIndex: number, colIndex: number): void {
    this.cellMouseEnter.emit({ rowIndex, colIndex });
  }

  onToggleFullscreen(): void {
    this.toggleFullscreen.emit();
  }

  onGridScroll(event: Event): void {
    this.gridScroll.emit(event);
  }
}
