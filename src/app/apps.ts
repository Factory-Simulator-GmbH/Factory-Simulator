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

type ItemSize = 'large' | 'small';

interface DraggableItems {
  id: string;
  label: string;
  size: ItemSize;
}

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
})
export class App implements AfterViewInit, OnInit {
  @ViewChild('gridTable', { static: true })
  gridTableRef!: ElementRef<HTMLTableElement>;

  mousePressed = false;
  isDraggingItem = false;
  activeDraggedItemId: string | null = null;

  readonly gridCellSizeVw = 2.5;
  gridCellSizePx = 0;
  readonly gridRowCount = 30;
  gridColumns = 0;

  conveyorGrid: boolean[][] = [];

  items: DraggableItems[] = [
    { id: 'f1', label: 'Fabrik', size: 'large' },
    { id: 'f2', label: 'Fabrik', size: 'large' },
    { id: 'f3', label: 'Fabrik', size: 'large' },
    { id: 'io1', label: 'I/O', size: 'small' },
    { id: 'io2', label: 'I/O', size: 'small' },
  ];

  // Gespeicherte Rasterposition
private itemStates: Record<string, { col: number; row: number; isAtStartPosition: boolean }> = {};
  // Ursprüngliche Basisposition jedes Items relativ zum Grid
  private itemBasePositions: Record<string, { x: number; y: number }> = {};

  private paintMode: 'on' | 'off' | null = null;
  private previewCells = new Set<string>();
  private touchedCells = new Set<string>();

  constructor(private ngZone: NgZone) {}

  ngOnInit(): void {
    this.updateGridCellSize();
  }

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

  private calculateColumnsAndCreateGrid(): void {
    this.gridColumns = 200;

    this.conveyorGrid = Array.from({ length: this.gridRowCount }, () =>
      Array.from({ length: this.gridColumns }, () => false)
    );
  }

  private pxToGrid(valuePx: number): number {
    if (!this.gridCellSizePx) return 0;
    return Math.round(valuePx / this.gridCellSizePx);
  }

  private captureItemBasePositions(): void {
    const gridRect = this.gridTableRef.nativeElement.getBoundingClientRect();

    for (const item of this.items) {
      const element = document.getElementById(item.id);
      if (!element) continue;

      // Transform kurz ignorieren, damit wir die echte Basisposition bekommen
      const oldTransform = element.style.transform;
      element.style.transform = '';

      const rect = element.getBoundingClientRect();

      this.itemBasePositions[item.id] = {
        x: rect.left - gridRect.left,
        y: rect.top - gridRect.top,
      };

      element.style.transform = oldTransform;
    }
  }

  private applyItemPosition(element: HTMLElement, col: number, row: number): void {
    const base = this.itemBasePositions[element.id] ?? { x: 0, y: 0 };

    const targetX = col * this.gridCellSizePx;
    const targetY = row * this.gridCellSizePx;

    const translateX = targetX - base.x;
    const translateY = targetY - base.y;

    element.style.transform = `translate(${translateX}px, ${translateY}px)`;
    element.setAttribute('data-x', String(translateX));
    element.setAttribute('data-y', String(translateY));
  }

  private saveItemGridPosition(element: HTMLElement): void {
  const base = this.itemBasePositions[element.id] ?? { x: 0, y: 0 };

  const translateX = Number(element.getAttribute('data-x') ?? '0');
  const translateY = Number(element.getAttribute('data-y') ?? '0');

  const absoluteX = base.x + translateX;
  const absoluteY = base.y + translateY;

  const col = this.pxToGrid(absoluteX);
  const row = this.pxToGrid(absoluteY);

  this.itemStates[element.id] = {
    col,
    row,
    isAtStartPosition: false,
  };
}

  private repositionAllItems(): void {
  for (const item of this.items) {
    const element = document.getElementById(item.id);
    if (!element) continue;

    const state = this.itemStates[item.id];

    if (!state || state.isAtStartPosition) {
      element.style.transform = '';
      element.setAttribute('data-x', '0');
      element.setAttribute('data-y', '0');
      continue;
    }

    this.applyItemPosition(element, state.col, state.row);
  }
}

  getItemSizePx(size: 'small' | 'large'): number {
    return size === 'large' ? this.gridCellSizePx * 3 : this.gridCellSizePx;
  }

  private updateGridCellSize(): void {
    this.gridCellSizePx = window.innerWidth * this.gridCellSizeVw / 100;
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updateGridCellSize();

    requestAnimationFrame(() => {
      this.captureItemBasePositions();
      this.repositionAllItems();
      this.setupInteractDragging();
    });
  }

  private isOverlapping(checkItem: HTMLElement) {
    return this.isOverlappingWithItem(checkItem) || this.isOverlappingWithConveyor(checkItem);
  }

  private isOverlappingWithItem(checkItem: HTMLElement) {
    const checkItemRect = checkItem.getBoundingClientRect();

    for (const item of this.items) {
      if (item.id === checkItem.id) continue;

      const itemRect = document.getElementById(item.id)?.getBoundingClientRect();
      if (!itemRect) continue;

      if (
        checkItemRect.top + 0.5 >= itemRect.bottom - 0.5 ||
        checkItemRect.right - 0.5 <= itemRect.left + 0.5 ||
        checkItemRect.bottom - 0.5 <= itemRect.top + 0.5 ||
        checkItemRect.left + 0.5 >= itemRect.right - 0.5
      ) {
        continue;
      }

      return true;
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

    if (this.touchedCells.has(k)) return;

    this.touchedCells.add(k);
    this.previewCells.add(k);
    this.conveyorGrid[rowIndex][colIndex] = this.paintMode === 'on';
  }

  onItemMouseDown(itemId: string): void {
    this.isDraggingItem = true;
    this.activeDraggedItemId = itemId;
  }

  @HostListener('document:mousedown')
  onDocumentMouseDown(): void {
    this.mousePressed = true;
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.mousePressed = false;
    this.paintMode = null;
    this.previewCells.clear();
    this.touchedCells.clear();
    this.isDraggingItem = false;
    this.activeDraggedItemId = null;
  }

  @HostListener('document:contextmenu', ['$event'])
  onContextMenu(event: MouseEvent): void {
    event.preventDefault();

    const target = event.target as HTMLElement;

    if (target && target.classList.contains('draggable-item')) {
      target.style.transform = '';
      target.setAttribute('data-x', '0');
      target.setAttribute('data-y', '0');
      this.itemStates[target.id] = {
        col: 0,
        row: 0,
        isAtStartPosition: true,
      };
    }
  }

  private setupInteractDragging(): void {
    interact('.draggable-item').unset();

    interact('.draggable-item').draggable({
      origin: this.gridTableRef.nativeElement,
      modifiers: [
        interact.modifiers.snap({
          targets: [
            interact.createSnapGrid({
              x: this.gridCellSizePx,
              y: this.gridCellSizePx,
            }),
          ],
          relativePoints: [{ x: 0, y: 0 }],
        }),
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
