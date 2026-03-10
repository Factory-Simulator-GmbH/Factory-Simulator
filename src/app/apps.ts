import {AfterViewInit, Component, ElementRef, HostListener, ViewChild} from '@angular/core';
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
  // Referenz auf das HTML Grid
  @ViewChild('gridTable', {static: true})
  gridTableRef!: ElementRef<HTMLTableElement>;

  // Status Flags for Interaction
  mousePressed = false;
  isDraggingItem = false;

  // Grid Konstanten 
  readonly gridCellSizePx = 50;
  readonly gridRowCount = 10;
  gridColumns = 0;

  // Datenstruktur für Förderbänder
  conveyorGrid: boolean[][] = [];

  // List of availabel Items
  items: DraggableItems[] = [
    {id: 'f1', label: 'Fabrik', size: 'large'},
    {id: 'f2', label: 'Fabrik', size: 'large'},
    {id: 'f3', label: 'Fabrik', size: 'large'},
    {id: 'io1', label: 'I/O', size: 'small'},
    {id: 'io2', label: 'I/O', size: 'small'},
  ];

  // Intern drawing states
  private paintMode: 'on' | 'off' | null = null;
  private previewCells = new Set<string>();
  private touchedCells = new Set<string>();

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
//Clamp
  // Clear Key for lines in sets 
  private key(r: number, c: number) {
    return `${r}:${c}`;
  }

  // Check if a cell is in the paint preview
  isPaintPreview(r: number, c: number): boolean {
    return this.previewCells.has(this.key(r, c));
  }

  // Starts drawing  
  onCellMouseDown(event: MouseEvent, rowIndex: number, colIndex: number): void {
    if (this.isDraggingItem) return;

    if (event.button === 2) {
      this.paintMode = 'off';
    } else {
      this.paintMode = 'on';
    }

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

    const next = this.paintMode === 'on';
    this.conveyorGrid[rowIndex][colIndex] = next;
  }

  // Document further Mouse-Down Listener
  @HostListener('document:mousedown')
  onDocumentMouseDown(): void {
    this.mousePressed = true;
  }

  // Stoppt Mal Vorgang 
  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.mousePressed = false;
    this.paintMode = null;
    this.previewCells.clear();
    this.touchedCells.clear();
  }

  // suppreses standard context menu to allow right-click painting
  @HostListener('document:contextmenu', ['$event'])
  onContextMenu(event: MouseEvent) {
    event.preventDefault();
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
        start: () => {
          this.isDraggingItem = true;
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
        end: () => {
          this.isDraggingItem = false;
        },
      },
    });
  }
}