import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  ViewChild,
} from '@angular/core';
import interact from 'interactjs';

// Definition of Item Sizes
type ItemSize = 'large' | 'small';

// Structure for draggable elements
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

  conveyorGrid: boolean[][] = [];

  // List of availabel Items
  items: DraggableItems[] = [
    {id: 'f1', label: 'Fabrik', size: 'large'},
    {id: 'f2', label: 'Fabrik', size: 'large'},
    {id: 'f3', label: 'Fabrik', size: 'large'},
    {id: 'io1', label: 'I/O', size: 'small'},
    {id: 'io2', label: 'I/O', size: 'small'},
  ];

  private itemPositions: Record<string, {x: number, y: number}> = {};

  // Intern drawing states
  private paintMode: 'on' | 'off' | null = null;
  private previewCells = new Set<string>();
  private touchedCells = new Set<string>();

  constructor(private ngZone: NgZone) {}

  // Initialisierung nach View Build
  ngAfterViewInit(): void {
    this.calculateColumnsAndCreateGrid();
    this.setupInteractDragging();
  }

  // calculates the number of columns and creates the grid
  private calculateColumnsAndCreateGrid(): void {
    const table = this.gridTableRef.nativeElement;
    const container = table.parentElement;
    const availableWidthPx = container?.clientWidth ?? 1000;

    this.gridColumns = Math.max(1, Math.floor(availableWidthPx / this.gridCellSizePx));

    this.conveyorGrid = Array.from({length: this.gridRowCount}, () =>
      Array.from({length: this.gridColumns}, () => false),
    );
  }

  private isOverlapping(checkItem: HTMLElement) {
    const checkItemRect = checkItem.getBoundingClientRect();
    for (let item of this.items) {
      if (item.id === checkItem.id) continue; // Skip self
      const itemRect = document.getElementById(item.id)?.getBoundingClientRect();
      if (!itemRect) continue;
      if (
        checkItemRect.top + 0.5 >= itemRect.bottom - 0.5 || // 0.5px toleranz für weniger bugs
        checkItemRect.right - 0.5 <= itemRect.left + 0.5 ||
        checkItemRect.bottom - 0.5 <= itemRect.top + 0.5 ||
        checkItemRect.left + 0.5 >= itemRect.right - 0.5
      ) continue; // kein overlap, weiter zum nächsten item
      return true; // overlap gefunden
    }
    return false;
  }

  // Eindeutiger Key für Zelle
  private key(r: number, c: number): string {
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

  // Wenn Maus auf Item gedrückt wird, direkt visuell "in der Hand"
  onItemMouseDown(itemId: string): void {
    this.isDraggingItem = true;
    this.activeDraggedItemId = itemId;
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
    this.isDraggingItem = false;
    this.activeDraggedItemId = null;
  }

  // suppreses standard context menu to allow right-click painting AND handles item reset
  @HostListener('document:contextmenu', ['$event'])
  onContextMenu(event: MouseEvent): void {
    event.preventDefault();

    // Der viel simplere Weg: Wir prüfen das Element, das wir direkt angeklickt haben
    const target = event.target as HTMLElement;

    // Wenn es ein ziehbares Item ist, setzen wir die Achsen auf 0 (Point Reset)
    if (target && target.classList.contains('draggable-item')) {
      target.style.transform = '';
      target.setAttribute('data-x', '0');
      target.setAttribute('data-y', '0');
    }
  }

  // configures interact.js Drag & Drop
  private setupInteractDragging(): void {
    interact('.draggable-item').draggable({
      origin: this.gridTableRef.nativeElement,
      modifiers: [
        // grid magnetic effect
        interact.modifiers.snap({
          targets: [interact.createSnapGrid({x: this.gridCellSizePx, y: this.gridCellSizePx})],
          relativePoints: [{x: 0, y: 0}],
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

          if (!this.isOverlapping(element)) {
            this.itemPositions[element.id] = {x: nextX, y: nextY};
          }
        },
        end: (event) => {
          this.ngZone.run(() => {
            this.isDraggingItem = false;
            this.activeDraggedItemId = null;
          });
          
          const element = event.target as HTMLElement;
          if (this.isOverlapping(element)) {
            // Zurücksetzen auf letzte gültige Position oder Startposition
            const pos = this.itemPositions[element.id] ?? {x: 0, y: 0};
            element.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
            element.setAttribute('data-x', String(pos.x));
            element.setAttribute('data-y', String(pos.y));
          }
          
          element.style.zIndex = '';
          element.style.position = '';
        },
      },
    });
  }
}