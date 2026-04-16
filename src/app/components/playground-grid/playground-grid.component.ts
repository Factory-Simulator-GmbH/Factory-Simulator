import {Component, ElementRef, EventEmitter, Input, Output, ViewChild} from '@angular/core';
import {ConveyorSegment} from '../../models/conveyor-segment.model';

@Component({
  selector: 'app-playground-grid',
  standalone: true,
  templateUrl: './playground-grid.component.html',
})
export class PlaygroundGridComponent {

  // Reference to the HTML grid
  @ViewChild('gridTable', {static: true})
  gridTableRef!: ElementRef<HTMLTableElement>;

  @Input({required: true}) conveyorGrid!: ConveyorSegment[][];
  @Input({required: true}) gridCellSizePx!: number;
  @Input({required: true}) previewCells!: Set<string>;
  @Input({required: true}) getConveyorSymbol!: (cell: ConveyorSegment) => string;
  @Input() isFullscreen = false;
  @Output() toggleFullscreen = new EventEmitter<void>();

  @Output() cellMouseDown = new EventEmitter<{ event: MouseEvent; rowIndex: number; colIndex: number }>();
  @Output() cellMouseEnter = new EventEmitter<{ rowIndex: number; colIndex: number }>();

  // Clear Key for lines in sets
  private key(r: number, c: number): string {
    return `${r}:${c}`;
  }

  readonly resourceEmoji: Record<string, string> = {
    metall: '🔩',
    kupfer: '🟤',
    plastik: '🧴',
  };

  // Check if a cell is in the paint preview
  isPaintPreview(r: number, c: number): boolean {
    return this.previewCells.has(this.key(r, c));
  }

  // Starts painting or erasing based on mouse button
  onMouseDown(event: MouseEvent, rowIndex: number, colIndex: number): void {
    this.cellMouseDown.emit({event, rowIndex, colIndex});
  }

  // continue drawing when mouse is moved
  onMouseEnter(rowIndex: number, colIndex: number): void {
    this.cellMouseEnter.emit({rowIndex, colIndex});
  }

  onToggleFullscreen(): void {
    this.toggleFullscreen.emit();
  }
  
}
