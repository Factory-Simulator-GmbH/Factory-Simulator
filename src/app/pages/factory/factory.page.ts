import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnInit,
  ViewChild,
  ChangeDetectorRef
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

  mousePressed = false;
  isDraggingItem = false;
  activeDraggedItemId: string | null = null;

  private lastRightClickTime = 0;
  private lastRightClickId: string | null = null;

  readonly gridCellSizeVw = 2.5;
  gridCellSizePx = 0;
  readonly gridRowCount = 30;
  gridColumns = 0;

  conveyorGrid: ConveyorSegment[][] = [];

  items: DraggableItems[] = [
    {id: 'f1', label: 'Fabrik', size: 'large'},
    {id: 'f2', label: 'Fabrik', size: 'large'},
    {id: 'f3', label: 'Fabrik', size: 'large'},
    {id: 'io1', label: 'I/O', size: 'small'},
    {id: 'io2', label: 'I/O', size: 'small'},
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
    private cdr: ChangeDetectorRef
  ) {
  }

  ngOnInit(): void {
    this.updateGridCellSize();
    this.calculateColumnsAndCreateGrid();
  }

  ngAfterViewInit(): void {
    requestAnimationFrame(() => {
      this.captureItemBasePositions();
      this.initializeItemStates();
      this.setupInteractDragging();
      this.cdr.detectChanges();
    });
  }

  private initializeItemStates(): void {
    this.itemStates = this.factoryItemsService.initializeItemStates(this.items);
  }

  private calculateColumnsAndCreateGrid(): void {
    const container = this.gridHostRef.nativeElement;
    const containerWidthPx = container?.clientWidth ?? 0;
    const availableWidthPx = containerWidthPx > 0 ? containerWidthPx : window.innerWidth;

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

  private getGridTableRect(): DOMRect {
    return this.playgroundGridComponent.gridTableRef.nativeElement.getBoundingClientRect();
  }

  getItemSizePx(size: ItemSize): number {
    return this.layoutService.getItemSizePx(size, this.gridCellSizePx);
  }

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
      this.cdr.detectChanges();
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
      this.conveyorGrid,
      rowIndex,
      colIndex,
      this.paintMode as 'on' | 'off',
      this.touchedCells,
      this.previewCells,
      this.pathCells,
    );
  }

  getConveyorSymbol = (cell: ConveyorSegment): string => {
    return this.factoryGridService.getConveyorSymbol(cell);
  };

  onItemMouseDown(itemId: string): void {
    const state = this.itemStates[itemId];
    
    if (state && (state as any).isConnected) {
      return; 
    }

    this.isDraggingItem = true;
    this.activeDraggedItemId = itemId;
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    if (this.isDraggingItem) return;

    this.mousePressed = true;

    const target = event.target as HTMLElement;
    const itemElement = target.closest('.draggable-item') as HTMLElement | null;

    if (itemElement) {
      const itemId = itemElement.getAttribute('data-item-id') || itemElement.id;
      const state = this.itemStates[itemId];
      
      if (state && (state as any).isConnected && event.button === 0) {
        this.paintMode = 'on'; 
        this.previewCells.clear();
        this.touchedCells.clear();
        
        this.pathCells = [{ row: state.row, col: state.col }];
        
        itemElement.style.pointerEvents = 'none';
        this.activeDraggedItemId = itemId;
      }
    }
  }

  private resetInteractions(): void {
    this.mousePressed = false;
    this.paintMode = null;
    this.previewCells.clear();
    this.touchedCells.clear();
    this.pathCells = [];
    this.isDraggingItem = false;

    if (this.activeDraggedItemId) {
      const el = document.getElementById(this.activeDraggedItemId);
      if (el) el.style.pointerEvents = 'auto';
    }
    this.activeDraggedItemId = null;
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.resetInteractions();
    this.evaluateConnections();
  }

  @HostListener('window:blur')
  @HostListener('document:mouseleave')
  onInterrupt(): void {
    this.resetInteractions();
  }

  @HostListener('document:contextmenu', ['$event'])
  onContextMenu(event: MouseEvent): void {
    event.preventDefault();

    if (this.isDraggingItem || this.mousePressed) {
      return;
    }

    const target = event.target as HTMLElement;

    if (target && target.classList.contains('draggable-item')) {
      const itemId = target.getAttribute('data-item-id') || target.id;
      const state = this.itemStates[itemId];
      const isConnected = state && (state as any).isConnected;

      if (isConnected) {
        const now = Date.now();
        if (this.lastRightClickId === itemId && now - this.lastRightClickTime < 400) {
          this.removePlacedItem(target, itemId);
          this.lastRightClickId = null;
        } else {
          this.lastRightClickTime = now;
          this.lastRightClickId = itemId;
        }
      } else {
        this.removePlacedItem(target, itemId);
      }
    }
  }

  private removePlacedItem(target: HTMLElement, itemId: string): void {
    target.style.transform = '';
    target.setAttribute('data-x', '0');
    target.setAttribute('data-y', '0');
    
    target.style.position = ''; 

    this.itemStates[itemId] = { col: 0, row: 0, isAtStartPosition: true };
    
    const paletteContainer = document.getElementById('item-palette');
    if (paletteContainer) {
      paletteContainer.appendChild(target);
    }

    this.evaluateConnections();
    this.cdr.detectChanges(); 
  }

  private captureItemBasePositions(): void {
    this.itemBasePositions = this.factoryItemsService.captureItemBasePositions(
      this.items,
      this.getGridTableRect(),
    );
  }

  private applyItemPosition(element: HTMLElement, col: number, row: number): void {
    this.factoryItemsService.applyItemPosition(
      element,
      col,
      row,
      this.itemBasePositions,
      this.gridCellSizePx,
    );
  }

  private saveItemGridPosition(element: HTMLElement): void {
    this.factoryItemsService.saveItemGridPosition(
      element,
      this.itemBasePositions,
      this.itemStates,
      this.gridCellSizePx,
    );
  }

  private repositionAllItems(): void {
    this.factoryItemsService.repositionAllItems(
      this.items,
      this.itemStates,
      this.itemBasePositions,
      this.gridCellSizePx,
    );
  }

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

  private setupInteractDragging(): void {
    interact('.draggable-item').unset();

    interact('.draggable-item').draggable({
      origin: this.playgroundGridComponent.gridTableRef.nativeElement,
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
          const itemId = element.getAttribute('data-item-id') || element.id;
          const state = this.itemStates[itemId];

          if (state && (state as any).isConnected) {
            event.interaction.stop();
            return;
          }

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
          
          // ZURÜCKGESETZT auf deine Version!
          element.style.position = '';

          this.evaluateConnections();
          this.cdr.detectChanges(); // NEU: Behebt den Render-Absturz beim Platzieren
        },
      },
    });
  }

  public evaluateConnections(): void {
    for (const itemId in this.itemStates) {
      const state = this.itemStates[itemId];
      const element = document.getElementById(itemId);
      
      const itemData = this.items.find(i => i.id === itemId);
      
      if (!element || !itemData) continue;

      if (state.isAtStartPosition) {
        (state as any).isConnected = false;
        this.updateVisualConnection(element, false);
        continue;
      }

      const itemSizePx = this.getItemSizePx(itemData.size);
      const cellSpan = Math.max(1, Math.round(itemSizePx / this.gridCellSizePx));

      const startRow = state.row;
      const startCol = state.col;
      let isConnected = false;

      for (let r = startRow - 1; r <= startRow + cellSpan; r++) {
        for (let c = startCol - 1; c <= startCol + cellSpan; c++) {
          
          const isTopOrBottom = (r === startRow - 1 || r === startRow + cellSpan) && (c >= startCol && c < startCol + cellSpan);
          const isLeftOrRight = (c === startCol - 1 || c === startCol + cellSpan) && (r >= startRow && r < startRow + cellSpan);

          if (isTopOrBottom || isLeftOrRight) {
            if (r >= 0 && r < this.gridRowCount && c >= 0 && c < this.gridColumns) {
              if (this.conveyorGrid[r][c]?.active) {
                isConnected = true;
                break; 
              }
            }
          }
        }
        if (isConnected) break; 
      }

      (state as any).isConnected = isConnected;
      this.updateVisualConnection(element, isConnected);
    }
  }

  private updateVisualConnection(element: HTMLElement, isConnected: boolean): void {
    if (isConnected) {
      element.classList.add('ring-4', 'ring-green-500', 'shadow-[0_0_20px_rgba(34,197,94,0.6)]');
      element.classList.remove('border-white/20');
      element.setAttribute('data-connected', 'true');
    } else {
      element.classList.remove('ring-4', 'ring-green-500', 'shadow-[0_0_20px_rgba(34,197,94,0.6)]');
      element.classList.add('border-white/20');
      element.setAttribute('data-connected', 'false');
    }
  }
}