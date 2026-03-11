import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnInit,
  ViewChild,
} from '@angular/core';
import interact from 'interactjs';

// Definition of Item Sizes
type ItemSize = 'large' | 'small';

// Direction type for conveyor belts
type Direction = 'up' | 'down' | 'left' | 'right';

// Structure for draggable elements
interface DraggableItems {
  id: string;
  label: string;
  size: ItemSize;
}

// Conveyor belt cell structure
interface ConveyorCell {
  active: boolean;
  entry: Direction | null;
  exit: Direction | null;
}

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
})
export class App implements AfterViewInit {
  // Reference to the HTML grid
  @ViewChild('gridTable', {static: true})
  gridTableRef!: ElementRef<HTMLTableElement>;

  // Status Flags for Interaction
  mousePressed = false;
  isDraggingItem = false;
  activeDraggedItemId: string | null = null;

  // Grid constants
  readonly gridCellSizePx = 50;
  readonly gridRowCount = 10;
  gridColumns = 0;

  conveyorGrid: ConveyorCell[][] = [];

  // List of availabel Items
  items: DraggableItems[] = [
    { id: 'f1', label: 'Fabrik', size: 'large' },
    { id: 'f2', label: 'Fabrik', size: 'large' },
    { id: 'f3', label: 'Fabrik', size: 'large' },
    { id: 'io1', label: 'I/O', size: 'small' },
    { id: 'io2', label: 'I/O', size: 'small' },
  ];

  // Intern drawing states
  private paintMode: 'on' | 'off' | null = null;
  private previewCells = new Set<string>();
  private touchedCells = new Set<string>();
  private pathCells: { row: number; col: number }[] = [];

  // Data structure for conveyor belts
  ngAfterViewInit(): void {
    this.calculateColumnsAndCreateGrid();

    requestAnimationFrame(() => {
      this.captureItemBasePositions();
      this.initializeItemStates();
      this.setupInteractDragging();
    });
  }
// Initialisiert die itemStates mit den Startpositionen der Items
  private initializeItemStates(): void {
  for (const item of this.items) {
    this.itemStates[item.id] = {
      col: 0,
      row: 0,
      isAtStartPosition: true,
    };
  }
}

  // calculates the number of columns and creates the grid
  private calculateColumnsAndCreateGrid(): void {
    this.gridColumns = 200;

    this.conveyorGrid = Array.from({length: this.gridRowCount}, () =>
      Array.from({length: this.gridColumns}, () => ({
        active: false,
        entry: null,
        exit: null,
      })),
    );
  }

  // Clear Key for lines in sets
  private key(r: number, c: number) {
    return `${r}:${c}`;
  }

  // Check if a cell is in the paint preview
  isPaintPreview(r: number, c: number): boolean {
    return this.previewCells.has(this.key(r, c));
  }

  // Starts painting or erasing based on mouse button
  onCellMouseDown(event: MouseEvent, rowIndex: number, colIndex: number): void {
    if (this.isDraggingItem) return;

    this.paintMode = event.button === 2 ? 'off' : 'on';

    event.preventDefault();
    this.mousePressed = true;
    this.previewCells.clear();
    this.touchedCells.clear();
    this.pathCells = [];

    this.applyPreview(rowIndex, colIndex);
  }

  // continue drawing when mouse is moved
  onCellMouseEnter(rowIndex: number, colIndex: number): void {
    if (!this.mousePressed || this.isDraggingItem || !this.paintMode) return;
    this.applyPreview(rowIndex, colIndex);
  }

  // Update Array State and preview
  private applyPreview(rowIndex: number, colIndex: number): void {
    const k = this.key(rowIndex, colIndex);

    if (this.touchedCells.has(k)) return;

    this.touchedCells.add(k);
    this.previewCells.add(k);
    this.conveyorGrid[rowIndex][colIndex] = this.paintMode === 'on';
  }

    if (this.paintMode === 'off') {
      this.conveyorGrid[rowIndex][colIndex] = {
        active: false,
        entry: null,
        exit: null,
      };
      return;
    }

    this.conveyorGrid[rowIndex][colIndex].active = true;
    this.pathCells.push({row: rowIndex, col: colIndex});

    this.rebuildPathDirections();
  }

  private rebuildPathDirections(): void {
    for (const {row, col} of this.pathCells) {
      this.conveyorGrid[row][col].entry = null;
      this.conveyorGrid[row][col].exit = null;
    }

    for (let i = 0; i < this.pathCells.length; i++) {
      const current = this.pathCells[i];
      const prev = this.pathCells[i - 1] ?? null;
      const next = this.pathCells[i + 1] ?? null;

      const cell = this.conveyorGrid[current.row][current.col];

      if (prev) {
        cell.entry = this.getDirection(prev.row, prev.col, current.row, current.col);
      }

      if (next) {
        cell.exit = this.getDirection(current.row, current.col, next.row, next.col);
      }
    }
  }

  private getDirection(
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
  ): Direction | null {
    if (toRow === fromRow - 1 && toCol === fromCol) return 'up';
    if (toRow === fromRow + 1 && toCol === fromCol) return 'down';
    if (toRow === fromRow && toCol === fromCol - 1) return 'left';
    if (toRow === fromRow && toCol === fromCol + 1) return 'right';
    return null;
  }

  getConveyorSymbol(cell: ConveyorCell): string {
    if (!cell.active) return '';

    if (cell.entry && cell.exit) {
      if (
        (cell.entry === 'left' && cell.exit === 'right') ||
        (cell.entry === 'right' && cell.exit === 'left')
      ) {
        return '─';
      }

  private isOverlapping(checkItem: HTMLElement) {
    return this.isOverlappingWithItem(checkItem) || this.isOverlappingWithConveyor(checkItem);
  }

  private isOverlappingWithItem(checkItem: HTMLElement) {
    const checkItemRect = checkItem.getBoundingClientRect();
      if (
        (cell.entry === 'up' && cell.exit === 'down') ||
        (cell.entry === 'down' && cell.exit === 'up')
      ) {
        return '│';
      }

      if (
        (cell.entry === 'up' && cell.exit === 'right') ||
        (cell.entry === 'left' && cell.exit === 'down')
      ) {
        return '┌';
      }

      if (
        (cell.entry === 'up' && cell.exit === 'left') ||
        (cell.entry === 'right' && cell.exit === 'down')
      ) {
        return '┐';
      }

      if (
        (cell.entry === 'down' && cell.exit === 'right') ||
        (cell.entry === 'left' && cell.exit === 'up')
      ) {
        return '└';
      }

      if (
        (cell.entry === 'down' && cell.exit === 'left') ||
        (cell.entry === 'right' && cell.exit === 'up')
      ) {
        return '┘';
      }
    }

    return false;
  }

  private isOverlappingWithConveyor(checkItem: HTMLElement) {
    const checkItemRect = checkItem.getBoundingClientRect();
    const conveyorTableRect = this.gridTableRef.nativeElement.getBoundingClientRect();

    // Position relativ zum Grid
    const x = checkItemRect.left - conveyorTableRect.left;
    const y = checkItemRect.top - conveyorTableRect.top;
    const width = checkItemRect.width;
    const height = checkItemRect.height;

    // Start- und End-Koordinaten im Grid
    const colStart = Math.floor((x + 1) / this.gridCellSizePx); // 1px Toleranz für weniger Bugs
    const rowStart = Math.floor((y + 1) / this.gridCellSizePx);
    const colEnd = Math.floor((x + width - 1) / this.gridCellSizePx);
    const rowEnd = Math.floor((y + height - 1) / this.gridCellSizePx);

    console.log('x:', x, 'y:', y, 'width:', width, 'height:', height);
    console.log('colStart:', colStart, 'colEnd:', colEnd, 'rowStart:', rowStart, 'rowEnd:', rowEnd);

    // Conveyor-Overlap prüfen
    for (let row = rowStart; row <= rowEnd; row++) {
      for (let col = colStart; col <= colEnd; col++) {
        if (
          row >= 0 && row < this.gridRowCount &&
          col >= 0 && col < this.gridColumns &&
          this.conveyorGrid[row][col]
        ) {
          return true;
        }
      }
    }

    return false;
  }

  // Eindeutiger Key für Zelle
  private key(r: number, c: number): string {
    return `${r}:${c}`;
  }

  isPaintPreview(r: number, c: number): boolean {
    return this.previewCells.has(this.key(r, c));
  }

  onCellMouseDown(event: MouseEvent, rowIndex: number, colIndex: number): void {
    if (this.isDraggingItem) return;

    this.paintMode = event.button === 2 ? 'off' : 'on';

    event.preventDefault();
    this.mousePressed = true;
    this.previewCells.clear();
    this.touchedCells.clear();

    this.applyPreview(rowIndex, colIndex);
  }

  onCellMouseEnter(rowIndex: number, colIndex: number): void {
    if (!this.mousePressed || this.isDraggingItem || !this.paintMode) return;
    this.applyPreview(rowIndex, colIndex);
  }

  private applyPreview(rowIndex: number, colIndex: number): void {
    const k = this.key(rowIndex, colIndex);
    if (!cell.entry && cell.exit) {
      if (cell.exit === 'left' || cell.exit === 'right') return '─';
      if (cell.exit === 'up' || cell.exit === 'down') return '│';
    }

    if (cell.entry && !cell.exit) {
      if (cell.entry === 'right') return '→';
      if (cell.entry === 'left') return '←';
      if (cell.entry === 'up') return '↑';
      if (cell.entry === 'down') return '↓';
    }

    if (cell.entry === 'left' || cell.entry === 'right') return '─';
    if (cell.entry === 'up' || cell.entry === 'down') return '│';

    return '';
  }

  // Document further Mouse-Down Listener
  @HostListener('document:mousedown')
  onDocumentMouseDown(): void {
    this.mousePressed = true;
  }

  // Stoping painting when mouse is released
  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.mousePressed = false;
    this.paintMode = null;
    this.previewCells.clear();
    this.touchedCells.clear();
    this.pathCells = [];
  }

  // suppreses standard context menu to allow right-click painting AND handles item reset
  @HostListener('document:contextmenu', ['$event'])
  onContextMenu(event: MouseEvent): void {
    event.preventDefault();

    const target = event.target as HTMLElement;

    if (target && target.classList.contains('draggable-item')) {
      target.style.transform = '';
      target.setAttribute('data-x', '0');
      target.setAttribute('data-y', '0');
    }
  }

  // configures interact.js Drag & Drop
  private setupInteractDragging(): void {
    interact('.draggable-item').unset();

    interact('.draggable-item').draggable({
      origin: this.gridTableRef.nativeElement,
      modifiers: [
        // grid magnetic effect
        interact.modifiers.snap({
          targets: [
            interact.createSnapGrid({
              x: this.gridCellSizePx,
              y: this.gridCellSizePx,
            }),
          ],
          relativePoints: [{ x: 0, y: 0 }],
        }),
        // grid boundaries restriction
        interact.modifiers.restrictRect({
          restriction: '.factory-surface',
          endOnly: true,
        }),
      ],
      listeners: {
        start: (event) => {
          const element = event.target as HTMLElement;
          const itemId = element.getAttribute('data-item-id');

          this.ngZone.run(() => {
            this.isDraggingItem = true;
            this.activeDraggedItemId = itemId;
          });

          element.style.position = 'relative';
          element.style.zIndex = '60';
        },

        move: (event) => {
          const element = event.target as HTMLElement;

          const currentX = Number(element.getAttribute('data-x') ?? '0');
          const currentY = Number(element.getAttribute('data-y') ?? '0');

          const nextX = currentX + event.dx;
          const nextY = currentY + event.dy;

          element.style.transform = `translate(${nextX}px, ${nextY}px)`;
          element.setAttribute('data-x', String(nextX));
          element.setAttribute('data-y', String(nextY));
        },

        end: (event) => {
          this.ngZone.run(() => {
            this.isDraggingItem = false;
            this.activeDraggedItemId = null;
          });

          const element = event.target as HTMLElement;

          if (this.isOverlapping(element)) {
            const state = this.itemStates[element.id];

            if (!state || state.isAtStartPosition) {
              element.style.transform = '';
              element.setAttribute('data-x', '0');
              element.setAttribute('data-y', '0');
            } else {
              this.applyItemPosition(element, state.col, state.row);
            }
          } else {
            this.saveItemGridPosition(element);
            const pos = this.itemStates[element.id];
            this.applyItemPosition(element, pos.col, pos.row);
          }

          element.style.zIndex = '';
          element.style.position = '';
        },
      },
    });
  }
}
