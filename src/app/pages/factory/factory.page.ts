import {AfterViewInit, Component, ElementRef, HostListener, NgZone, OnInit, ViewChild,} from '@angular/core';
import interact from 'interactjs';
import {ItemsComponent} from '../../components/items/items.component';
import {PlaygroundGridComponent} from '../../components/playground-grid/playground-grid.component';
import {ConveyorSegment} from '../../models/conveyor-segment.model';
import {DraggableItems, ItemSize} from '../../models/draggable-item.model';
import {ItemBasePosition, ItemState} from '../../models/item-position.model';
import {LayoutService} from '../../services/layout.service';
import {FactoryGridService} from '../../services/factory-grid.service';
import {FactoryItemsService} from '../../services/factory-items.service';

@Component({
  selector: 'app-factory-page',
  standalone: true,
  imports: [PlaygroundGridComponent, ItemsComponent],
  templateUrl: './factory.page.html',
})
export class FactoryPage implements AfterViewInit, OnInit {
  @ViewChild('gridHost', {read: ElementRef, static: true})
  gridHostRef!: ElementRef<HTMLElement>;

  @ViewChild(PlaygroundGridComponent)
  playgroundGridComponent!: PlaygroundGridComponent;

  @ViewChild('scrollContainer')
  scrollContainerRef!: ElementRef<HTMLElement>;


  mousePressed = false;
  isDraggingItem = false;
  activeDraggedItemId: string | null = null;


  isFullscreen = false;


  zoomLevel = 1.0;
  readonly minZoom = 0.3;
  readonly maxZoom = 2.0;
  readonly zoomStep = 0.1;

  minimapViewport = {left: '0%', top: '0%', width: '100%', height: '100%'};


  readonly gridCellSizeVw = 2.5;
  gridCellSizePx = 0;
  readonly gridRowCount = 30;
  gridColumns = 0;

  conveyorGrid: ConveyorSegment[][] = [];

  items: DraggableItems[] = [
    {id: 'f1', label: 'Maschine', size: 'large', helpText: '<strong>Maschine</strong><br>Verarbeitet Materialien zu Produkten.<br>Benötigt mindestens eine Input- und eine Output-Seite.<br><bold>Rezept:</bold><br><img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRSyZz79wlfw2jtpya-0ZmYsGeKqK6Mkpzy8g&s" alt="Rezept für Diaschwert" style="width: 100%;">'},
    {id: 'f2', label: 'Maschine', size: 'large', helpText: '<strong>Maschine</strong><br>Verarbeitet Materialien zu Produkten.<br>Benötigt mindestens eine Input- und eine Output-Seite.<br><bold>Rezept:</bold><br><img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRSyZz79wlfw2jtpya-0ZmYsGeKqK6Mkpzy8g&s" alt="Rezept für Diaschwert" style="width: 100%;">'},
    {id: 'f3', label: 'Maschine', size: 'large', helpText: '<strong>Maschine</strong><br>Verarbeitet Materialien zu Produkten.<br>Benötigt mindestens eine Input- und eine Output-Seite.<br><bold>Rezept:</bold><br><img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRSyZz79wlfw2jtpya-0ZmYsGeKqK6Mkpzy8g&s" alt="Rezept für Diaschwert" style="width: 100%;">'},
    {id: 'io1', label: 'I/O', size: 'small', helpText: '<strong>I/O-Modul</strong><br>Schnittstelle für den Ressourcen austausch zwischen Rollbändern und Maschinen.'},
    {id: 'io2', label: 'I/O', size: 'small', helpText: '<strong>I/O-Modul</strong><br>Schnittstelle für den Ressourcen austausch zwischen Rollbändern und Maschinen.'},
  ];

  private itemStates: Record<string, ItemState> = {};
  private itemBasePositions: Record<string, ItemBasePosition> = {};

  private paintMode: 'on' | 'off' | null = null;
  previewCells = new Set<string>();
  private touchedCells = new Set<string>();
  private pathCells: { row: number; col: number }[] = [];

  constructor(
    private ngZone: NgZone,
    private layoutService: LayoutService,
    private factoryGridService: FactoryGridService,
    private factoryItemsService: FactoryItemsService,
  ) {
  }

  ngOnInit(): void {
    this.updateGridCellSize();
    this.calculateColumnsAndCreateGrid();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {

      requestAnimationFrame(() => {
        this.captureItemBasePositions();
        this.initializeItemStates();
        this.setupInteractDragging();
        this.updateMinimap();
      });
    }, 0);
  }

  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;

    requestAnimationFrame(() => {
      setTimeout(() => {
        this.calculateColumnsAndCreateGrid();
        this.captureItemBasePositions();
        this.repositionAllItems();
        this.setupInteractDragging();
        this.updateMinimap();
      }, 50);
    });
  }

  onWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();

      if (event.deltaY < 0) {
        this.zoomLevel = Math.min(this.zoomLevel + this.zoomStep, this.maxZoom);
      } else {
        this.zoomLevel = Math.max(this.zoomLevel - this.zoomStep, this.minZoom);
      }

      setTimeout(() => {
        this.updateMinimap();
        this.captureItemBasePositions();
        this.repositionAllItems();
        this.setupInteractDragging();
      }, 10);
    }
  }

  onScroll(event: Event): void {
    this.updateMinimap(event.target as HTMLElement);

//Hier wird eine Anmat
    requestAnimationFrame(() => {
      this.captureItemBasePositions();
      this.repositionAllItems();
    });
  }

  private updateMinimap(container?: HTMLElement): void {
    const el = container || this.scrollContainerRef?.nativeElement;
    if (!el) return;

    const scrollLeft = el.scrollLeft;
    const scrollTop = el.scrollTop;
    const scrollWidth = el.scrollWidth;
    const scrollHeight = el.scrollHeight;
    const clientWidth = el.clientWidth;
    const clientHeight = el.clientHeight;

    if (scrollWidth === 0 || scrollHeight === 0) return;

    this.minimapViewport = {
      left: `${(scrollLeft / scrollWidth) * 100}%`,
      top: `${(scrollTop / scrollHeight) * 100}%`,
      width: `${(clientWidth / scrollWidth) * 100}%`,
      height: `${(clientHeight / scrollHeight) * 100}%`
    };
  }

  private initializeItemStates(): void {
    this.itemStates = this.factoryItemsService.initializeItemStates(this.items);
  }

  private getContainerPadding(element: HTMLElement): number {
    const style = window.getComputedStyle(element);
    return parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  }

  private calculateColumnsAndCreateGrid(): void {
    const scrollContainer = this.scrollContainerRef?.nativeElement;

    // scrollContainer.clientWidth = sichtbare Breite ohne Scrollbar
    const availableWidthPx = scrollContainer?.clientWidth ?? window.innerWidth;

    // Padding des inneren p-8 Containers dynamisch lesen
    const innerContainer = scrollContainer?.firstElementChild as HTMLElement | null;
    const horizontalPadding = innerContainer
      ? this.getContainerPadding(innerContainer)
      : 0;

    const effectiveWidth = availableWidthPx - horizontalPadding;

    this.gridColumns = this.factoryGridService.calculateColumns(
      this.gridCellSizePx,
      effectiveWidth,);

    this.conveyorGrid = this.factoryGridService.createOrResizeGrid(
      this.conveyorGrid,
      this.gridRowCount,
      this.gridColumns,
    );
  }


  private getGridTableRect(): DOMRect {
    return this.playgroundGridComponent.gridTableRef.nativeElement.getBoundingClientRect();
  }

  getItemSizePx = (size: ItemSize): number => {
    return this.layoutService.getItemSizePx(size, this.gridCellSizePx);
  };

  private updateGridCellSize(): void {
    this.gridCellSizePx = (window.innerWidth * this.gridCellSizeVw) / 100;
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updateGridCellSize();
    this.calculateColumnsAndCreateGrid();

    requestAnimationFrame(() => {
      this.captureItemBasePositions();
      this.repositionAllItems();
      this.setupInteractDragging();
      this.updateMinimap();
    });
  }

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
      this.conveyorGrid, rowIndex, colIndex, this.paintMode as 'on' | 'off',
      this.touchedCells, this.previewCells, this.pathCells,
    );
  }

  getConveyorSymbol = (cell: ConveyorSegment): string => {
    return this.factoryGridService.getConveyorSymbol(cell);
  };

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
    this.pathCells = [];
    this.isDraggingItem = false;
    this.activeDraggedItemId = null;
  }

  @HostListener('document:contextmenu', ['$event'])
  onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    const target = event.target as HTMLElement;

    if (target && target.classList.contains('draggable-item')) {
      const paletteContainer = document.getElementById('item-palette');

      if (paletteContainer) {
        paletteContainer.appendChild(target); // Physisch zurückschieben

        target.style.position = 'relative';
        target.style.transform = '';
        target.setAttribute('data-x', '0');
        target.setAttribute('data-y', '0');

        this.itemStates[target.id] = {col: 0, row: 0, isAtStartPosition: true};
      }
    }
  }

  private captureItemBasePositions(): void {
    this.itemBasePositions = this.factoryItemsService.captureItemBasePositions(this.items, this.getGridTableRect());
  }

  private applyItemPosition(element: HTMLElement, col: number, row: number): void {
    this.factoryItemsService.applyItemPosition(element, col, row, this.itemBasePositions, this.gridCellSizePx);
  }

  private saveItemGridPosition(element: HTMLElement): void {
    this.factoryItemsService.saveItemGridPosition(element, this.itemBasePositions, this.itemStates, this.gridCellSizePx);
  }

  private repositionAllItems(): void {
    this.factoryItemsService.repositionAllItems(this.items, this.itemStates, this.itemBasePositions, this.gridCellSizePx);
  }

  private isOverlapping(checkItem: HTMLElement): boolean {
    return (
      this.factoryItemsService.isOverlappingWithItem(checkItem, this.items) ||
      this.factoryItemsService.isOverlappingWithConveyor(
        checkItem, this.getGridTableRect(), this.gridCellSizePx,
        this.gridRowCount, this.gridColumns, this.conveyorGrid,
      )
    );
  }

  private setupInteractDragging(): void {
    interact('.draggable-item').unset();

    const gridElement = this.playgroundGridComponent.gridTableRef.nativeElement;

    interact(gridElement).dropzone({
      accept: '.draggable-item',
      overlap: 0.5,
      ondragenter: (event) => event.relatedTarget.classList.add('can-drop'),
      ondragleave: (event) => event.relatedTarget.classList.remove('can-drop')
    });

    interact('.draggable-item').draggable({
      origin: 'parent', // WICHTIG: Origin auf parent, nicht mehr auf gridElement!
      modifiers: [
        interact.modifiers.snap({
          targets: [
            interact.createSnapGrid({
              // MAGIE: Wir zwingen das Raster, den Zoom-Faktor mitzurechnen!
              x: this.gridCellSizePx * this.zoomLevel,
              y: this.gridCellSizePx * this.zoomLevel,
            }),
          ],
          relativePoints: [{x: 0, y: 0}],
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

          // Wir schmeißen das 'fixed' weg! Das hat die Koordinaten zerstört.
          element.style.zIndex = '9999';
          element.classList.remove('can-drop');
        },

        move: (event) => {
          const element = event.target as HTMLElement;
          const isInGridContainer = element.parentElement?.id === 'grid-items-container';

          const currentX = Number(element.getAttribute('data-x') ?? '0');
          const currentY = Number(element.getAttribute('data-y') ?? '0');

          // Wenn das Item im Grid liegt, müssen wir die Mausbewegung durch den Zoomfaktor teilen
          const effectiveZoom = isInGridContainer ? this.zoomLevel : 1.0;

          const nextX = currentX + (event.dx / effectiveZoom);
          const nextY = currentY + (event.dy / effectiveZoom);

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
          const gridContainer = document.getElementById('grid-items-container');
          const paletteContainer = document.getElementById('item-palette');

          element.style.zIndex = '';

          const isInGrid = element.classList.contains('can-drop');
          let overlap = false;
          try {
            overlap = this.isOverlapping(element);
          } catch (e) {
          }

          if (!isInGrid || overlap || !gridContainer) {

            if (paletteContainer) paletteContainer.appendChild(element);

            element.style.position = 'relative';
            element.style.transform = '';
            element.setAttribute('data-x', '0');
            element.setAttribute('data-y', '0');
            element.style.pointerEvents = 'auto';
            this.itemStates[element.id] = {col: 0, row: 0, isAtStartPosition: true};
          } else {


            const itemRect = element.getBoundingClientRect();
            const gridRect = gridContainer.getBoundingClientRect();


            const relativeX = itemRect.left - gridRect.left;
            const relativeY = itemRect.top - gridRect.top;
            let targetCol = Math.round((relativeX / this.zoomLevel) / this.gridCellSizePx);
            let targetRow = Math.round((relativeY / this.zoomLevel) / this.gridCellSizePx);


            targetCol = Math.max(0, Math.min(targetCol, this.gridColumns - 1));
            targetRow = Math.max(0, Math.min(targetRow, this.gridRowCount - 1));


            this.itemStates[element.id] = {
              col: targetCol,
              row: targetRow,
              isAtStartPosition: false
            };

            gridContainer.appendChild(element);

            const finalX = targetCol * this.gridCellSizePx;
            const finalY = targetRow * this.gridCellSizePx;

            element.style.position = 'absolute';
            element.style.left = '0px';
            element.style.top = '0px';
            element.style.transform = `translate(${finalX}px, ${finalY}px)`;
            element.setAttribute('data-x', String(finalX));
            element.setAttribute('data-y', String(finalY));
            element.style.pointerEvents = 'auto';
          }
        },
      },
    });
  }
}
