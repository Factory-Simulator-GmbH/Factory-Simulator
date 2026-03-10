import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  ViewChild,
} from '@angular/core';
import interact from 'interactjs';

// Definition der Objektgrößen
type ItemSize = 'large' | 'small';

// Struktur für ziehbare Elemente
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

  // Status Flags für Interaktion
  mousePressed = false;
  isDraggingItem = false;
  activeDraggedItemId: string | null = null;

  // Grid Konstanten
  readonly gridCellSizePx = 50;
  readonly gridRowCount = 10;
  gridColumns = 0;

  // Datenstruktur für Förderbänder
  conveyorGrid: boolean[][] = [];

  // Liste der verfügbaren Items
  items: DraggableItems[] = [
    {id: 'f1', label: 'Fabrik', size: 'large'},
    {id: 'f2', label: 'Fabrik', size: 'large'},
    {id: 'f3', label: 'Fabrik', size: 'large'},
    {id: 'io1', label: 'I/O', size: 'small'},
    {id: 'io2', label: 'I/O', size: 'small'},
  ];

  // Interne Mal Zustände
  private paintMode: 'on' | 'off' | null = null;
  private previewCells = new Set<string>();
  private touchedCells = new Set<string>();

  constructor(private ngZone: NgZone) {}

  // Initialisierung nach View Build
  ngAfterViewInit(): void {
    this.calculateColumnsAndCreateGrid();
    this.setupInteractDragging();
  }

  // Berechnet Spaltenanzahl und erstellt Grid
  private calculateColumnsAndCreateGrid(): void {
    const table = this.gridTableRef.nativeElement;
    const container = table.parentElement;
    const availableWidthPx = container?.clientWidth ?? 1000;

    this.gridColumns = Math.max(1, Math.floor(availableWidthPx / this.gridCellSizePx));

    this.conveyorGrid = Array.from({length: this.gridRowCount}, () =>
      Array.from({length: this.gridColumns}, () => false),
    );
  }

  // Eindeutiger Key für Zelle
  private key(r: number, c: number): string {
    return `${r}:${c}`;
  }

  // Prüft auf aktive Mal Vorschau
  isPaintPreview(r: number, c: number): boolean {
    return this.previewCells.has(this.key(r, c));
  }

  // Startet Mal Vorgang
  onCellMouseDown(event: MouseEvent, rowIndex: number, colIndex: number): void {
    if (this.isDraggingItem) return;

    this.paintMode = event.button === 2 ? 'off' : 'on';

    event.preventDefault();
    this.mousePressed = true;
    this.previewCells.clear();
    this.touchedCells.clear();

    this.applyPreview(rowIndex, colIndex);
  }

  // Führt Malen beim Ziehen fort
  onCellMouseEnter(rowIndex: number, colIndex: number): void {
    if (!this.mousePressed || this.isDraggingItem || !this.paintMode) return;
    this.applyPreview(rowIndex, colIndex);
  }

  // Aktualisiert Array State und Vorschau
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

  // Dokument weiter Mouse-Down Listener
  @HostListener('document:mousedown')
  onDocumentMouseDown(): void {
    this.mousePressed = true;
  }

  // Stoppt Mal Vorgang / Drag Status
  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.mousePressed = false;
    this.paintMode = null;
    this.previewCells.clear();
    this.touchedCells.clear();
    this.isDraggingItem = false;
    this.activeDraggedItemId = null;
  }

  // Unterdrückt Standard Kontextmenü
  @HostListener('document:contextmenu', ['$event'])
  onContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  // Konfiguriert interact.js Drag & Drop
  private setupInteractDragging(): void {
    interact('.draggable-item').draggable({
      origin: this.gridTableRef.nativeElement,
      modifiers: [
        interact.modifiers.snap({
          targets: [interact.createSnapGrid({x: this.gridCellSizePx, y: this.gridCellSizePx})],
          relativePoints: [{x: 0, y: 0}],
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
          element.style.zIndex = '';
          element.style.position = '';
        },
      },
    });
  }
}