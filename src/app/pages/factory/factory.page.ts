import {
  AfterViewInit,
  ApplicationRef,
  ChangeDetectorRef,
  Component,
  ComponentRef,
  createComponent,
  ElementRef,
  EnvironmentInjector,
  HostListener,
  NgZone,
  OnInit,
  ViewChild,
} from '@angular/core';
import { delay, filter } from 'rxjs';
import interact from 'interactjs';
import itemsData from '../../../../public/assets/items.json';
import { ItemsComponent } from '../../components/items/items.component';
import { PlaygroundGridComponent } from '../../components/playground-grid/playground-grid.component';
import { ConveyorSegment } from '../../models/conveyor-segment.model';
import { DraggableItems, ItemSize } from '../../models/draggable-item.model';
import { ItemBasePosition, ItemState } from '../../models/item-position.model';
import { LayoutService } from '../../services/layout.service';
import { FactoryGridService } from '../../services/factory-grid.service';
import { FactoryItemsService } from '../../services/factory-items.service';
import { ResourceExchangeService } from '../../services/resource-exchange.service';
import { DraggableItemComponent } from '../../components/draggable-item/draggable-item.component';

@Component({
  selector: 'app-factory-page',
  standalone: true,
  imports: [PlaygroundGridComponent, ItemsComponent],
  templateUrl: './factory.page.html',
})
export class FactoryPage implements AfterViewInit, OnInit {
  @ViewChild('gridHost', { read: ElementRef, static: true })
  gridHostRef!: ElementRef<HTMLElement>;

  @ViewChild(PlaygroundGridComponent)
  playgroundGridComponent!: PlaygroundGridComponent;

  @ViewChild('scrollContainer')
  scrollContainerRef!: ElementRef<HTMLElement>;


  mousePressed = false;
  isDraggingItem = false;
  activeDraggedItemId: string | null = null;

  private lastRightClickTime = 0;
  private lastRightClickId: string | null = null;

  isFullscreen = false;


  zoomLevel = 1.0;
  readonly minZoom = 0.3;
  readonly maxZoom = 2.0;
  readonly zoomStep = 0.1;

  minimapViewport = { left: '0%', top: '0%', width: '100%', height: '100%' };


  readonly gridCellSizeVw = 2.5;
  gridCellSizePx = 0;
  readonly gridRowCount = 30;
  gridColumns = 0;

  conveyorGrid: ConveyorSegment[][] = [];

  items: DraggableItems[] = itemsData as DraggableItems[];
  private clonedItems: DraggableItems[] = [];
  private componentRefs = new Map<string, ComponentRef<DraggableItemComponent>>();

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
    private resourceExchangeService: ResourceExchangeService,
    private cdr: ChangeDetectorRef,
    private appRef: ApplicationRef,
    private environmentInjector: EnvironmentInjector,
  ) {
  }

  ngOnInit(): void {
    this.updateGridCellSize();
    this.calculateColumnsAndCreateGrid();

    this.resourceExchangeService.conveyorResourceChanged$.pipe(filter(({ resource }) => resource !== null), delay(1000)).subscribe(({ row, col, resource }) => {
        this.resourceExchangeService.onConveyorResourceChanged(resource, col, row, this.conveyorGrid);
      this.conveyorGrid[row][col].resource = null;
      console.log(`Ressource bei (${col}, ${row}) geändert zu: ${resource}`);
    });

    this.resourceExchangeService.outputResourceChanged$.pipe(filter(({ resource }) => resource !== null)).subscribe(({ itemid, resource }) => {
      const outputState = this.itemStates[itemid];
      if (!outputState || outputState.isAtStartPosition) return;
      const adjacentConveyor = this.resourceExchangeService.checkAdjacentConveyor(outputState.col, outputState.row, this.conveyorGrid);
      this.resourceExchangeService.onOutputPlaced(itemid, outputState.col, outputState.row, adjacentConveyor, this.clonedItems, this.conveyorGrid);

      console.log(`Output "${itemid}" hat neue Ressource: ${resource}`);
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void this.playgroundGridComponent.gridTableRef.nativeElement.getBoundingClientRect();
          this.captureItemBasePositions();
          this.initializeItemStates();
          this.setupInteractDragging();
          this.updateMinimap();
        });
      });
    }, 100);
  }

  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;

    requestAnimationFrame(() => {
      setTimeout(() => {
        // BUGFIX: Zwingend Zellengröße VOR der Grid-Kalkulation neu updaten!
        this.updateGridCellSize(); 
        this.calculateColumnsAndCreateGrid();
        this.captureItemBasePositions();
        this.repositionAllItems();
        this.setupInteractDragging();
        this.updateMinimap();
      }, 150); // Minimal längeres Timeout, damit die Fullscreen-Animation vom Browser durch ist
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

    requestAnimationFrame(() => {
      this.captureItemBasePositions();
      this.setupInteractDragging();
      this.cdr.detectChanges();
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
    const availableWidthPx = scrollContainer?.clientWidth ?? window.innerWidth;

    const innerContainer = scrollContainer?.firstElementChild as HTMLElement | null;
    const horizontalPadding = innerContainer
      ? this.getContainerPadding(innerContainer)
      : 0;

    const effectiveWidth = availableWidthPx - horizontalPadding;

    this.gridColumns = this.factoryGridService.calculateColumns(
      this.gridCellSizePx,
      effectiveWidth);

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
    this.gridCellSizePx = Math.floor((window.innerWidth * this.gridCellSizeVw) / 100);
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updateGridCellSize();
    this.calculateColumnsAndCreateGrid();

    requestAnimationFrame(() => {
      setTimeout(() => {
        this.updateGridCellSize();
        this.captureItemBasePositions();

        for (const item of this.clonedItems) {
          const ref = this.componentRefs.get(item.id);
          if (ref) {
            ref.instance.sizePx = this.getItemSizePx(item.size);
            ref.changeDetectorRef.detectChanges();
          }
        }

        this.repositionAllItems();
        this.setupInteractDragging();
        this.cdr.detectChanges();
        this.updateMinimap();
      }, 50);
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

  onItemMouseDown(data: { itemId: string, event: MouseEvent }): void {
    if (data.event.button === 2) return; 

    const state = this.itemStates[data.itemId];
    const stateAny = state as any;

    if (stateAny && stateAny.isConnected) {
      return;
    }
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    this.mousePressed = true;

    const target = event.target as HTMLElement;
    const itemElement = target.closest('.draggable-item') as HTMLElement | null;

    if (itemElement) {
      const itemId = itemElement.getAttribute('data-item-id') || itemElement.id;
      const state = this.itemStates[itemId];
      const stateAny = state as any;

      if (stateAny && stateAny.isConnected && event.button === 0) {
        this.paintMode = 'on';
        this.previewCells.clear();
        this.touchedCells.clear();

        this.pathCells = [{row: state.row, col: state.col}];
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
      if (el) el.style.pointerEvents = '';
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
      const itemId = target.id;
      const state = this.itemStates[itemId];
      const stateAny = state as any;
      const isConnected = stateAny && stateAny.isConnected;

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
    const ref = this.componentRefs.get(itemId);
    if (ref) {
      this.appRef.detachView(ref.hostView);
      ref.destroy();
      this.componentRefs.delete(itemId);
    }

    target.remove();

    this.clonedItems = this.clonedItems.filter(i => i.id !== itemId);
    delete this.itemStates[itemId];

    this.evaluateConnections();
    this.cdr.detectChanges();

    requestAnimationFrame(() => {
      this.captureItemBasePositions();
      this.repositionAllItems();
      this.setupInteractDragging();
    });
  }

  private captureItemBasePositions(): void {
    this.itemBasePositions = this.factoryItemsService.captureItemBasePositions(
      [...this.items, ...this.clonedItems],
      this.getGridTableRect(),
      this.itemStates,
      this.itemBasePositions,
    );
  }

  private applyItemPosition(element: HTMLElement, col: number, row: number): void {
    this.factoryItemsService.applyItemPosition(
      element,
      col,
      row,
      this.itemBasePositions,
      this.gridCellSizePx,
      this.getGridTableRect(),
    );
  }

  private saveItemGridPosition(element: HTMLElement): void {
    this.factoryItemsService.saveItemGridPosition(element, this.itemBasePositions, this.itemStates, this.gridCellSizePx);
  }

  private syncDataAttributes(element: HTMLElement): void {
    const transform = element.style.transform;
    const match = transform.match(/translate(?:3d)?\(\s*(-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px/);
    if (match) {
      element.setAttribute('data-x', match[1]);
      element.setAttribute('data-y', match[2]);
    }
  }

  private repositionAllItems(): void {
    this.factoryItemsService.repositionAllItems(
      this.clonedItems,
      this.itemStates,
      this.itemBasePositions,
      this.gridCellSizePx,
      this.getGridTableRect(),
    );
  }

  private isOverlapping(checkItem: HTMLElement): boolean {
    return (
      this.factoryItemsService.isOverlappingWithItem(checkItem, this.clonedItems) ||
      this.factoryItemsService.isOverlappingWithConveyor(
        checkItem, this.getGridTableRect(), this.gridCellSizePx,
        this.gridRowCount, this.gridColumns, this.conveyorGrid,
      )
    );
  }

  private setupInteractDragging(): void {
    interact('.draggable-item').unset();

    // BUGFIX: Das fehleranfällige interact.modifiers.snap wurde KOMPLETT entfernt! 
    // Dadurch ziehst du jetzt butterweich über das Zoom-Feld ohne visuelles Stottern oder falsche Offsets.
    interact('.draggable-item').draggable({
      cursorChecker: (_action, _interactable, element) => {
        const itemId = (element as HTMLElement).id;
        const state = this.itemStates[itemId];
        const stateAny = state as any;
        if (stateAny?.isConnected) {
          return 'default';
        }
        return 'move';
      },
      listeners: {
        start: (event) => {
          const element = event.target as HTMLElement;
          const itemId = element.id;
          const state = this.itemStates[itemId];
          const stateAny = state as any;

          if (stateAny && stateAny.isConnected) {
            event.interaction.stop();
            return;
          }

          this.ngZone.run(() => {
            this.isDraggingItem = true;
            this.activeDraggedItemId = itemId;
            this.cdr.detectChanges();
          });

          const transform = element.style.transform;
          const match = transform.match(/translate(?:3d)?\(\s*(-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px/);
          if (match) {
            element.setAttribute('data-x', match[1]);
            element.setAttribute('data-y', match[2]);
          } else {
            element.setAttribute('data-x', '0');
            element.setAttribute('data-y', '0');
          }

          element.style.position = 'relative';
          element.style.zIndex = '9999';
        },

        move: (event) => {
          const element = event.target as HTMLElement;
          const isInGridContainer = element.parentElement?.id === 'grid-items-container';

          const currentX = Number(element.getAttribute('data-x') ?? '0');
          const currentY = Number(element.getAttribute('data-y') ?? '0');

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
            this.cdr.detectChanges();
          });

          const element = event.target as HTMLElement;
          const gridContainer = document.getElementById('grid-items-container');
          element.style.zIndex = '';

          // BUGFIX: Mathematische Berechnung statt unzuverlässiger CSS "can-drop" Klasse
          // So verschwinden Items nicht mehr beim Neu-Zeichnen durch Fließbänder!
          let isInGrid = false;
          if (gridContainer) {
             const itemRect = element.getBoundingClientRect();
             const gridRect = gridContainer.getBoundingClientRect();
             
             // Wir prüfen, ob die exakte Mitte des Items über dem Grid schwebt
             const centerX = itemRect.left + itemRect.width / 2;
             const centerY = itemRect.top + itemRect.height / 2;
             
             isInGrid = centerX >= gridRect.left && centerX <= gridRect.right &&
                        centerY >= gridRect.top && centerY <= gridRect.bottom;
          }

          let overlap = false;
          try {
            overlap = this.isOverlapping(element);
          } catch (e) {}

          if (!isInGrid || overlap || !gridContainer) {
            const state = this.itemStates[element.id];

            if (state && !state.isAtStartPosition && state.col >= 0 && state.row >= 0) {
              // Item an letzte valide Position im Gitter zurückwerfen
              const finalX = state.col * this.gridCellSizePx;
              const finalY = state.row * this.gridCellSizePx;
              if (gridContainer) gridContainer.appendChild(element);
              this.factoryItemsService.placeItemInGrid(element, finalX, finalY);
              
              // WICHTIG: Teleport-Bug verhindern!
              this.syncDataAttributes(element); 
            } else {
              this.removePlacedItem(element, element.id);
              return;
            }
          } else {
            // Drop war erfolgreich -> In Grid-Zelle übersetzen (mit Zoom-Faktor!)
            const itemRect = element.getBoundingClientRect();
            const gridRect = gridContainer.getBoundingClientRect();

            const relativeX = (itemRect.left - gridRect.left) / this.zoomLevel;
            const relativeY = (itemRect.top - gridRect.top) / this.zoomLevel;
            
            let targetCol = Math.round(relativeX / this.gridCellSizePx);
            let targetRow = Math.round(relativeY / this.gridCellSizePx);

            targetCol = Math.max(0, Math.min(targetCol, this.gridColumns - 1));
            targetRow = Math.max(0, Math.min(targetRow, this.gridRowCount - 1));

            this.itemStates[element.id] = {
              col: targetCol,
              row: targetRow,
              isAtStartPosition: false
            };

            // Check for spawner placement and output
            const placedItem = this.clonedItems.find(i => i.id === element.id);
            if (placedItem?.spawningResource) {
              const adjacentOutput = this.resourceExchangeService.checkAdjacentOutput(targetCol, targetRow, this.clonedItems, this.itemStates);
              this.resourceExchangeService.onSpawnerPlaced(element.id, targetCol, targetRow, adjacentOutput, this.clonedItems, this.itemStates);
            }

            gridContainer.appendChild(element);

            // Perfektes Snapping auf die errechneten Zelle
            const finalX = targetCol * this.gridCellSizePx;
            const finalY = targetRow * this.gridCellSizePx;
            this.factoryItemsService.placeItemInGrid(element, finalX, finalY);
            
            // WICHTIG: Teleport-Bug verhindern!
            this.syncDataAttributes(element); 
          }

          this.evaluateConnections();
          this.cdr.detectChanges();
        },
      },
    });

    interact('.source-item').on('move', (event) => {
      const interaction = event.interaction

      if (interaction.pointerIsDown && !interaction.interacting()) {
        const original = event.currentTarget as HTMLElement;
        const originalItemId = original.getAttribute('data-item-id') || original.id;
        const uniqueId = `${originalItemId}-clone-${Date.now()}`;
        const sourceItem = this.items.find(i => i.id === originalItemId);

        if (!sourceItem) return;

        const componentRef = createComponent(DraggableItemComponent, {
          environmentInjector: this.environmentInjector,
        });

        componentRef.instance.item = sourceItem;
        componentRef.instance.itemId = uniqueId;
        componentRef.instance.sizePx = this.getItemSizePx(sourceItem.size);

        const clone = componentRef.location.nativeElement as HTMLElement;

        document.body.appendChild(clone);
        this.appRef.attachView(componentRef.hostView);
        componentRef.changeDetectorRef.detectChanges();

        const innerDiv = clone.querySelector('.draggable-item') as HTMLElement;

        document.body.appendChild(innerDiv);
        clone.remove(); 

        innerDiv.setAttribute('data-item-id', uniqueId);
        innerDiv.setAttribute('id', uniqueId);
        innerDiv.style.position = 'fixed';
        innerDiv.style.zIndex = '999';

        this.componentRefs.set(uniqueId, componentRef);

        this.clonedItems.push({
          id: uniqueId,
          type: sourceItem?.type || '',
          label: sourceItem?.label || '',
          size: sourceItem?.size || 'large',
          helpText: sourceItem?.helpText || '',
          spawningResource: sourceItem?.spawningResource,
          resource: null,
        });

        this.itemStates[uniqueId] = {
          col: -1,
          row: -1,
          isAtStartPosition: true,
        };

        const sizePx = this.getItemSizePx(sourceItem.size);
        let startX = event.clientX - sizePx / 2;
        let startY = event.clientY - sizePx / 2;
        innerDiv.setAttribute('data-x', String(startX));
        innerDiv.setAttribute('data-y', String(startY));
        innerDiv.style.transform = `translate(${startX}px, ${startY}px)`;

        interaction.start({name: 'drag'}, interact('.draggable-item'), innerDiv)
      }
    })
  }

  public evaluateConnections(): void {
    for (const item of this.clonedItems) {
      const state = this.itemStates[item.id];
      const stateAny = state as any;
      const element = document.getElementById(item.id);

      if (!element || !state) continue;

      const itemSizePx = this.getItemSizePx(item.size);
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

      stateAny.isConnected = isConnected;
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