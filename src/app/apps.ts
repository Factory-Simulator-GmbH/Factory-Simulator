import {AfterViewInit, Component, ElementRef, HostListener, ViewChild} from '@angular/core';
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

  private itemPositions: Record<string, {x: number, y: number}> = {};

  // Interne Mal Zustände
  private paintMode: 'on' | 'off' | null = null;
  private previewCells = new Set<string>();
  private touchedCells = new Set<string>();

  // Initialisierung nach View Build
  ngAfterViewInit(): void {
    this.calculateColumnsAndCreateGrid();
    this.setupInteractDragging();
  }

  // Berechnet Spaltenanzahl u
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
  private key(r: number, c: number) {
    return `${r}:${c}`;
  }

  // Prüft auf aktive Mal Vorschau
  isPaintPreview(r: number, c: number): boolean {
    return this.previewCells.has(this.key(r, c));
  }

  // Startet Mal Vorgang 
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

    const next = this.paintMode === 'on';
    this.conveyorGrid[rowIndex][colIndex] = next;
  }

  // Dokument weiter Mouse-Down Listener
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

  // Unterdrückt Standard Kontextmenü
  @HostListener('document:contextmenu', ['$event'])
  onContextMenu(event: MouseEvent) {
    event.preventDefault();
  }

  // Konfiguriert interact.js Drag & Drop
  private setupInteractDragging(): void {
    interact('.draggable-item').draggable({
      origin: this.gridTableRef.nativeElement,
      modifiers: [
        // Raster Magnet Effekt
        interact.modifiers.snap({
          targets: [interact.createSnapGrid({x: this.gridCellSizePx, y: this.gridCellSizePx})],
          relativePoints: [{x: 0, y: 0}],
        }),
        // Spielfeldbegrenzung
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

          if (!this.isOverlapping(element)) {
            this.itemPositions[element.id] = {x: nextX, y: nextY};
          }
        },
        end: (event) => {
          this.isDraggingItem = false;
          const element = event.target as HTMLElement;
          if (this.isOverlapping(element)) {
            // Zurücksetzen auf letzte gültige Position oder Startposition
            const pos = this.itemPositions[element.id] ?? {x: 0, y: 0};
            element.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
            element.setAttribute('data-x', String(pos.x));
            element.setAttribute('data-y', String(pos.y));
          }
        },
      },
    });
  }
}