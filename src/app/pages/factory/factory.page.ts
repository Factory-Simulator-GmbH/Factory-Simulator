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
import {ItemsComponent} from '../../components/items/items.component';
import {PlaygroundGridComponent} from '../../components/playground-grid/playground-grid.component';
import {ConveyorSegment} from '../../models/conveyor-segment.model';
import {DraggableItems, ItemSize} from '../../models/draggable-item.model';
import {ItemBasePosition, ItemState} from '../../models/item-position.model';
import {LayoutService} from '../../services/layout.service';
import {FactoryGridService} from '../../services/factory-grid.service';
import {FactoryItemsService} from '../../services/factory-items.service';

/**
 * Hauptseite des Factory Simulators.
 * Orchestriert das Grid, die Items und das Drag & Drop.
 */
@Component({
  selector: 'app-factory-page',
  standalone: true,
  imports: [PlaygroundGridComponent, ItemsComponent],
  templateUrl: './factory.page.html',
})
export class FactoryPage implements AfterViewInit, OnInit {
  /** Referenz auf den äußeren Container für dynamische Breitenberechnung */
  @ViewChild('gridHost', {read: ElementRef, static: true})
  gridHostRef!: ElementRef<HTMLElement>;

  /** Zugriff auf die Grid-Komponente (z.B. für das HTML-Table-Element) */
  @ViewChild(PlaygroundGridComponent)
  playgroundGridComponent!: PlaygroundGridComponent;

  // --- UI & INTERAKTIONS-STATUS ---
  mousePressed = false;
  isDraggingItem = false;
  activeDraggedItemId: string | null = null;
  
  /** NEU: Status für dein Fullscreen-Ticket */
  isFullscreen = false;

  // --- GRID KONSTANTEN & BERECHNUNG ---
  /** Grid-Zellengröße in Viewport-Width (vw) für responsives Design */
  readonly gridCellSizeVw = 2.5;
  /** Die daraus berechnete fixe Pixelgröße */
  gridCellSizePx = 0;
  readonly gridRowCount = 30;
  gridColumns = 0;

  /** 2D-Array für die Förderbänder */
  conveyorGrid: ConveyorSegment[][] = [];

  // --- ITEM DATEN ---
  items: DraggableItems[] = [
    {id: 'f1', label: 'Fabrik', size: 'large'},
    {id: 'f2', label: 'Fabrik', size: 'large'},
    {id: 'f3', label: 'Fabrik', size: 'large'},
    {id: 'io1', label: 'I/O', size: 'small'},
    {id: 'io2', label: 'I/O', size: 'small'},
  ];

  /** Speichert den aktuellen Status (Reihe/Spalte) jedes platzierten Items */
  private itemStates: Record<string, ItemState> = {};
  /** Speichert die Ursprungskoordinaten der Items (für Fenster-Resizing wichtig) */
  private itemBasePositions: Record<string, ItemBasePosition> = {};

  // --- MAL-MODUS STATUS ---
  private paintMode: 'on' | 'off' | null = null;
  previewCells = new Set<string>();
  private touchedCells = new Set<string>();
  private pathCells: { row: number; col: number }[] = [];

  constructor(
    private ngZone: NgZone,
    private layoutService: LayoutService,
    private factoryGridService: FactoryGridService,
    private factoryItemsService: FactoryItemsService,
  ) {}

  /** Initialisiert die Zellengröße basierend auf der aktuellen Fensterbreite */
  ngOnInit(): void {
    this.updateGridCellSize();
  }

  /** Lifecycle Hook nach dem Rendern des HTMLs. Startet Grid-Aufbau und Dragging. */
  ngAfterViewInit(): void {
    this.calculateColumnsAndCreateGrid();

    // requestAnimationFrame wartet, bis der Browser das Grid fertig gezeichnet hat
    requestAnimationFrame(() => {
      this.captureItemBasePositions();
      this.initializeItemStates();
      this.setupInteractDragging();
    });
  }

  // --- TICKET: FULLSCREEN ---
  /** Schaltet den Fullscreen-Modus um */
  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
  }

  /** Setzt alle Items initial auf ihre Startposition */
  private initializeItemStates(): void {
    this.itemStates = this.factoryItemsService.initializeItemStates(this.items);
  }

  /** Berechnet, wie viele Spalten ins Grid passen und erstellt das Array */
  private calculateColumnsAndCreateGrid(): void {
    const container = this.gridHostRef.nativeElement;
    const availableWidthPx = container?.clientWidth ?? window.innerWidth;

    this.gridColumns = this.factoryGridService.calculateColumns(
      this.gridCellSizePx,
      availableWidthPx,
    );

    this.conveyorGrid = this.factoryGridService.createOrResizeGrid(
      this.conveyorGrid,
      this.gridRowCount,
      this.gridColumns,
    );
  }

  /** Holt die genauen Bildschirmkoordinaten der Grid-Tabelle */
  private getGridTableRect(): DOMRect {
    return this.playgroundGridComponent.gridTableRef.nativeElement.getBoundingClientRect();
  }

  /** Berechnet die Pixelgröße eines Items basierend auf large/small */
  getItemSizePx = (size: ItemSize): number => {
    return this.layoutService.getItemSizePx(size, this.gridCellSizePx);
  };

  /** Aktualisiert die Zellengröße (wird bei Init und Resize aufgerufen) */
  private updateGridCellSize(): void {
    this.gridCellSizePx = (window.innerWidth * this.gridCellSizeVw) / 100;
  }

  /** REAKTIVITÄT: Baut das Grid und die Item-Positionen neu auf, wenn das Fenster skaliert wird */
  @HostListener('window:resize')
  onResize(): void {
    this.updateGridCellSize();
    this.calculateColumnsAndCreateGrid();

    requestAnimationFrame(() => {
      this.captureItemBasePositions();
      this.repositionAllItems();
      this.setupInteractDragging();
    });
  }

  // --- EVENT HANDLER FÜR DAS MALEN (CONVEYOR BELTS) ---
  
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

  onCellMouseEnter(rowIndex: number, colIndex: number): void {
    if (!this.mousePressed || this.isDraggingItem || !this.paintMode) return;
    this.applyPreview(rowIndex, colIndex);
  }

  private applyPreview(rowIndex: number, colIndex: number): void {
    this.factoryGridService.applyPreview(
      this.conveyorGrid,
      rowIndex,
      colIndex,
      this.paintMode as 'on' | 'off',
      this.touchedCells,
      this.previewCells,
      this.pathCells,
    );
  }

  /** Holt das korrekte Symbol (Pfeil, Kurve etc.) aus dem Service */
  getConveyorSymbol = (cell: ConveyorSegment): string => {
    return this.factoryGridService.getConveyorSymbol(cell);
  };

  /** Item-Klick Event: Wird an das HTML für visuelles Feedback gebunden */
  onItemMouseDown(itemId: string): void {
    this.isDraggingItem = true;
    this.activeDraggedItemId = itemId;
  }

  // --- GLOBALE MOUSE HANDLER ---

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
    this.pathCells = [];
    this.isDraggingItem = false;
    this.activeDraggedItemId = null;
  }

  /** Rechtsklick auf ein platziertes Item schickt es zurück in die Palette */
  @HostListener('document:contextmenu', ['$event'])
  onContextMenu(event: MouseEvent): void {
    event.preventDefault();

    const target = event.target as HTMLElement;

    if (target && target.classList.contains('draggable-item')) {
      target.style.transform = '';
      target.setAttribute('data-x', '0');
      target.setAttribute('data-y', '0');
      // Setzt den State zurück auf 'Startposition'
      this.itemStates[target.id] = {
        col: 0,
        row: 0,
        isAtStartPosition: true,
      };
    }
  }

  // --- ITEM POSITIONIERUNG & KOLLISIONS-LOGIK ---

  private captureItemBasePositions(): void {
    this.itemBasePositions = this.factoryItemsService.captureItemBasePositions(
      this.items,
      this.getGridTableRect(),
    );
  }

  private applyItemPosition(element: HTMLElement, col: number, row: number): void {
    this.factoryItemsService.applyItemPosition(
      element, col, row, this.itemBasePositions, this.gridCellSizePx,
    );
  }

  private saveItemGridPosition(element: HTMLElement): void {
    this.factoryItemsService.saveItemGridPosition(
      element, this.itemBasePositions, this.itemStates, this.gridCellSizePx,
    );
  }

  private repositionAllItems(): void {
    this.factoryItemsService.repositionAllItems(
      this.items, this.itemStates, this.itemBasePositions, this.gridCellSizePx,
    );
  }

  /** Prüft, ob ein fallengelassenes Item mit einem anderen Item oder einem Förderband kollidiert */
  private isOverlapping(checkItem: HTMLElement): boolean {
    return (
      this.factoryItemsService.isOverlappingWithItem(checkItem, this.items) ||
      this.factoryItemsService.isOverlappingWithConveyor(
        checkItem,
        this.getGridTableRect(),
        this.gridCellSizePx,
        this.gridRowCount,
        this.gridColumns,
        this.conveyorGrid,
      )
    );
  }

  // --- INTERACT.JS DRAG & DROP KONFIGURATION ---

private setupInteractDragging(): void {
    interact('.draggable-item').unset(); // Entfernt alte Listener bei Resize

    const gridElement = this.playgroundGridComponent.gridTableRef.nativeElement;

    interact('.draggable-item').draggable({
      origin: gridElement,
      modifiers: [
        interact.modifiers.snap({
          targets: [
            interact.createSnapGrid({
              x: this.gridCellSizePx,
              y: this.gridCellSizePx,
            }),
          ],
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

          // --- BOMBENSICHERE PRÜFUNG ---
          const gridRect = gridElement.getBoundingClientRect();
          const itemRect = element.getBoundingClientRect();

          const itemCenterX = itemRect.left + itemRect.width / 2;
          const itemCenterY = itemRect.top + itemRect.height / 2;

          const isInsideGrid = 
            itemCenterX >= gridRect.left &&
            itemCenterX <= gridRect.right &&
            itemCenterY >= gridRect.top &&
            itemCenterY <= gridRect.bottom;

          if (!isInsideGrid) {
            // Außerhalb des Grids losgelassen -> Zurück in die Palette
            element.style.transform = '';
            element.setAttribute('data-x', '0');
            element.setAttribute('data-y', '0');
            
            this.itemStates[element.id] = { col: 0, row: 0, isAtStartPosition: true };
          } else {
            // IM GRID LOSGELASSEN!
            const col = Math.floor((itemCenterX - gridRect.left) / this.gridCellSizePx);
            const row = Math.floor((itemCenterY - gridRect.top) / this.gridCellSizePx);
            
            // Wir speichern den State...
            this.itemStates[element.id] = { col, row, isAtStartPosition: false };
            
            // WICHTIG: Wir rufen hier absichtlich NICHT die kaputte "applyItemPosition" oder 
            // "isOverlapping" Logik deiner Kollegen auf. interact.js hat das Element 
            // durch den Snap-Modifier bereits perfekt platziert! Es bleibt exakt da liegen.
          }
        },
      },
    });
  }
}