import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, NgZone, OnInit, signal, ViewChild } from '@angular/core';
import { delay, filter, mergeMap, of, ReplaySubject, take } from 'rxjs';
import { PlaygroundGridComponent } from '../../components/playgroundGrid/playgroundGrid.component';
import { ItemsComponent } from '../../components/items/items.component';
import { ConveyorSegment } from '../../models/conveyorSegment.model';
import { DraggableItems, ItemSize } from '../../models/draggableItem.model';
import { FactoryGridService } from '../../services/factoryGrid.service';
import { FactoryItemsService } from '../../services/factoryItems.service';
import { LayoutService } from '../../services/layout.service';
import { ResourceExchangeService } from '../../services/resourceExchange.service';
import { MenuService } from '../../services/menu.service';
import { MinimapService } from '../../services/minimap.service';
import { InteractionStateService } from '../../services/interactionState.service';
import { ConveyorPainterService } from '../../services/conveyorPainter.service';
import { DragDropManagerService } from '../../services/dragDropManager.service';
import { ConnectionEvaluatorService } from '../../services/connectionEvaluator.service';
import { ItemManagerService } from '../../services/itemManager.service';
import { AuthService } from '../../services/auth.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-factory-page',
  standalone: true,
  imports: [PlaygroundGridComponent, ItemsComponent],
  templateUrl: './factory.page.html',
  styleUrl: './factory.page.scss'
})
export class FactoryPage implements AfterViewInit, OnInit {
  @ViewChild(PlaygroundGridComponent) playgroundGrid!: PlaygroundGridComponent;
  @ViewChild('scrollContainer') scrollContainerRef!: ElementRef<HTMLElement>;
  @ViewChild('minimapContent') minimapContentRef!: ElementRef<HTMLElement>;

  // Grid state (used by template)
  dropdownOpen = signal(false);

  readonly gridCellSizeVw = 2.5;
  gridCellSizePx = 0;
  readonly gridRowCount = 30;
  gridColumns = 0;
  zoomLevel = 1.0;
  isFullscreen = false;
  conveyorGrid: ConveyorSegment[][] = [];
  items: DraggableItems[] = [];
  private itemsReady$ = new ReplaySubject<void>(1);
  showFullscreenItemBar = false;

  private readonly resourceEmoji: Record<string, string> = { metall: '🔩', kupfer: '🟤', plastik: '🧴' };

  constructor(
    private cdr: ChangeDetectorRef,
    private factoryGridService: FactoryGridService,
    private factoryItemsService: FactoryItemsService,
    private layoutService: LayoutService,
    private resourceExchangeService: ResourceExchangeService,
    // Public — template binds directly to service properties
    public menu: MenuService,
    public minimap: MinimapService,
    public interaction: InteractionStateService,
    private painter: ConveyorPainterService,
    private dragDrop: DragDropManagerService,
    private connectionEvaluator: ConnectionEvaluatorService,
    public itemManager: ItemManagerService,
    public auth: AuthService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.updateGridCellSize();
    this.calculateColumnsAndCreateGrid();

    this.items = this.route.snapshot.data['items'];
    this.itemsReady$.next();

    this.resourceExchangeService.conveyorJam$.subscribe(({ row, col }: { row: number; col: number }) => {
      this.resourceExchangeService.conveyorResourceChanged$.pipe(
        filter(e => e.row === row && e.col === col && e.resource === null),
        take(1)
      ).subscribe(() => {
        // Outputs mit wartender Ressource erneut prüfen
        for (const item of this.itemManager.clonedItems) {
          if (item.type !== 'output' || item.resource === null) continue;
          const state = this.itemManager.itemStates[item.id];
          if (!state || state.isAtStartPosition) continue;
          const adjacentConveyor = this.resourceExchangeService.checkAdjacentConveyor(
            state.col, state.row, this.conveyorGrid
          );
          if (adjacentConveyor) {
            this.resourceExchangeService.onOutputResourceChanged(
              item.id, state.col, state.row, adjacentConveyor, this.itemManager.clonedItems, this.conveyorGrid
            );
            this.cdr.detectChanges();
          }
        }
        // Rollband-Nachbarn erneut anstoßen, die auf die freigewordene Zelle zeigen
        const pointsTo = [
          { dr: -1, dc: 0, exit: 'down' },
          { dr:  1, dc: 0, exit: 'up'   },
          { dr:  0, dc: -1, exit: 'right' },
          { dr:  0, dc:  1, exit: 'left'  },
        ];
        for (const { dr, dc, exit } of pointsTo) {
          const waiting = this.conveyorGrid[row + dr]?.[col + dc];
          if (waiting?.active && waiting.resource && waiting.exit === exit) {
            this.resourceExchangeService.conveyorResourceChanged$.next({
              row: row + dr, col: col + dc, resource: waiting.resource,
            });
          }
        }
      });
    });

    this.resourceExchangeService.conveyorResourceChanged$
      .pipe(filter(({ resource }) => resource !== null), mergeMap(event => of(event).pipe(delay(1000))))
      .subscribe(({ row, col, resource }) => {
        const moved = this.resourceExchangeService.onConveyorResourceChanged(resource, col, row, this.conveyorGrid, this.itemManager.clonedItems, this.itemManager.itemStates);
        if (moved) {
          this.conveyorGrid[row][col].resource = null;
          this.resourceExchangeService.conveyorResourceChanged$.next({ row, col, resource: null });
        } else if (this.conveyorGrid[row][col]?.resource !== null) {
          this.resourceExchangeService.conveyorResourceChanged$.next({ row, col, resource });
        }
        this.cdr.detectChanges();
      });

    this.resourceExchangeService.itemResourceChanged$.subscribe(({ itemid, resource }) => {
      this.updateItemResourceBadge(itemid, resource);
      if (resource === null) { this.cdr.detectChanges(); return; }

      const itemState = this.itemManager.itemStates[itemid];
      if (!itemState || itemState.isAtStartPosition) { this.cdr.detectChanges(); return; }

      const item = this.itemManager.clonedItems.find(i => i.id === itemid);
      if (item?.type === 'output') {
        const adjacentConveyor = this.resourceExchangeService.checkAdjacentConveyor(itemState.col, itemState.row, this.conveyorGrid);
        this.resourceExchangeService.onOutputResourceChanged(itemid, itemState.col, itemState.row, adjacentConveyor, this.itemManager.clonedItems, this.conveyorGrid);
      } else if (item?.type === 'input') {
        const adjacentMachine = this.resourceExchangeService.checkAdjacentMachine(itemState.col, itemState.row, this.itemManager.clonedItems, this.itemManager.itemStates);
        if (adjacentMachine) {
          const machineItem = this.itemManager.clonedItems.find(i =>
            i.type === 'machine' && this.itemManager.itemStates[i.id]?.col === adjacentMachine.col && this.itemManager.itemStates[i.id]?.row === adjacentMachine.row
          );
          if (machineItem && resource) {
            const el = document.getElementById(itemid);
            if (machineItem.input && resource in machineItem.input) {
              el?.classList.remove('ring-red-500', 'shadow-[0_0_20px_rgba(239,68,68,0.6)]');
              el?.classList.add('ring-4', 'ring-green-500', 'shadow-[0_0_20px_rgba(34,197,94,0.6)]');
              this.resourceExchangeService.onInputResourceChanged(itemid, itemState.col, itemState.row, adjacentMachine, this.itemManager.clonedItems, this.itemManager.itemStates);
            } else {
              el?.classList.remove('ring-green-500', 'shadow-[0_0_20px_rgba(34,197,94,0.6)]');
              el?.classList.add('ring-4', 'ring-red-500', 'shadow-[0_0_20px_rgba(239,68,68,0.6)]');
            }
          }
        }
      }
      this.cdr.detectChanges();
    });
  }

  ngAfterViewInit(): void {
    this.itemsReady$.pipe(take(1)).subscribe(() => {
      setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        void this.playgroundGrid.gridTableRef.nativeElement.getBoundingClientRect();
        this.itemManager.captureBasePositions([...this.items, ...this.itemManager.clonedItems], this.getGridRect());
        this.itemManager.initializeStates(this.items);
        this.setupInteractDragging();
        this.updateMinimap();
      })), 100);
    });
  }

  // ── Grid helpers ──────────────────────────────────────────────────────────

  getItemSizePx = (size: ItemSize): number => this.layoutService.getItemSizePx(size, this.gridCellSizePx);

  getConveyorSymbol = (cell: ConveyorSegment): string => this.factoryGridService.getConveyorSymbol(cell);

  get minimapItems() {
    return this.itemManager.clonedItems
      .filter(item => this.itemManager.itemStates[item.id] && !this.itemManager.itemStates[item.id].isAtStartPosition)
      .map(item => {
        const state = this.itemManager.itemStates[item.id];
        const span = Math.max(1, Math.round(this.getItemSizePx(item.size) / this.gridCellSizePx));
        return { id: item.id, col: state.col, row: state.row, span };
      });
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  @HostListener('window:resize')
  onResize(): void {
    this.updateGridCellSize();
    this.calculateColumnsAndCreateGrid();
    requestAnimationFrame(() => setTimeout(() => {
      this.updateGridCellSize();
      this.itemManager.captureBasePositions([...this.items, ...this.itemManager.clonedItems], this.getGridRect());
      for (const item of this.itemManager.clonedItems) {
        const ref = this.itemManager.componentRefs.get(item.id);
        if (ref) { ref.instance.sizePx = this.getItemSizePx(item.size); ref.changeDetectorRef.detectChanges(); }
      }
      this.itemManager.repositionAll(this.gridCellSizePx, this.getGridRect());
      this.setupInteractDragging();
      this.cdr.detectChanges();
      this.updateMinimap();
    }, 50));
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    this.interaction.mousePressed = true;
    this.interaction.lastMouseButton = event.button;
    const itemEl = (event.target as HTMLElement).closest('.draggable-item') as HTMLElement | null;
    if (itemEl) {
      const id = itemEl.getAttribute('data-item-id') || itemEl.id;
      const state = this.itemManager.itemStates[id];
      if ((state as any)?.isConnected && event.button === 0) {
        this.interaction.paintMode = 'on';
        this.interaction.previewCells.clear();
        this.interaction.touchedCells.clear();
        this.interaction.pathCells = [{ row: state.row, col: state.col }];
      }
    }
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.interaction.resetInteractions();
    this.connectionEvaluator.evaluate(
      this.conveyorGrid, this.itemManager.clonedItems, this.itemManager.itemStates,
      this.gridRowCount, this.gridColumns, this.getItemSizePx, this.gridCellSizePx,
    );
  }

  @HostListener('window:blur')
  @HostListener('document:mouseleave')
  onInterrupt(): void { this.interaction.resetInteractions(); }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent): void {
    if (this.interaction.isNavigatingMinimap) {
      this.minimap.navigate(this.playgroundGrid.gridViewportRef.nativeElement, event, this.minimapContentRef.nativeElement);
      this.updateMinimap();
    }
  }

  @HostListener('document:contextmenu', ['$event'])
  onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    const itemEl = (event.target as HTMLElement)?.closest('.draggable-item') as HTMLElement | null;
    if (itemEl) { this.dragDrop.removePlacedItem(itemEl, itemEl.id); }
  }

  onCellMouseDown(event: MouseEvent, rowIndex: number, colIndex: number): void {
    if (this.interaction.isDraggingItem) return;
    event.preventDefault();
    this.interaction.mousePressed = true;
    this.painter.startPainting(this.conveyorGrid, rowIndex, colIndex, event.button === 2 ? 'off' : 'on');
  }

  onCellMouseEnter(rowIndex: number, colIndex: number): void {
    if (!this.interaction.mousePressed || this.interaction.isDraggingItem) return;
    this.painter.continuePainting(this.conveyorGrid, rowIndex, colIndex);
  }

  onMinimapMouseDown(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.interaction.isNavigatingMinimap = true;
    document.body.style.cursor = 'grabbing';
    this.minimap.navigate(this.playgroundGrid.gridViewportRef.nativeElement, event, this.minimapContentRef.nativeElement);
    this.updateMinimap();
  }

  onItemMouseDown(data: { itemId: string; event: MouseEvent }): void {
    if (data.event.button === 2) return;
    if ((this.itemManager.itemStates[data.itemId] as any)?.isConnected) return;
  }

  onScroll(event: Event): void {
    this.updateMinimap(event.target as HTMLElement);
    requestAnimationFrame(() => {
      this.itemManager.captureBasePositions([...this.items, ...this.itemManager.clonedItems], this.getGridRect());
      this.setupInteractDragging();
      this.cdr.detectChanges();
      this.itemManager.repositionAll(this.gridCellSizePx, this.getGridRect());
    });
  }

  onWheel(_event: WheelEvent): void { /* zoom deaktiviert */ }

  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    requestAnimationFrame(() => setTimeout(() => {
      this.calculateColumnsAndCreateGrid();
      this.itemManager.captureBasePositions([...this.items, ...this.itemManager.clonedItems], this.getGridRect());
      this.itemManager.repositionAll(this.gridCellSizePx, this.getGridRect());
      this.setupInteractDragging();
      this.updateMinimap();
    }, 50));
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private setupInteractDragging(): void {
    this.dragDrop.setup({
      gridElement: this.playgroundGrid.gridTableRef.nativeElement,
      getGridRect: () => this.getGridRect(),
      gridCellSizePx: this.gridCellSizePx,
      zoomLevel: this.zoomLevel,
      gridColumns: this.gridColumns,
      gridRowCount: this.gridRowCount,
      conveyorGrid: this.conveyorGrid as any,
      items: this.items,
      detectChanges: () => this.cdr.detectChanges(),
      postRemove: () => this.setupInteractDragging(),
    });
  }

  private updateMinimap(container?: HTMLElement): void {
    const el = container ?? this.playgroundGrid?.gridViewportRef?.nativeElement;
    if (el) this.minimap.updateViewport(el);
  }

  private calculateColumnsAndCreateGrid(): void {
    const scrollContainer = this.scrollContainerRef?.nativeElement;
    const availableWidthPx = scrollContainer?.clientWidth ?? window.innerWidth;
    const innerContainer = scrollContainer?.firstElementChild as HTMLElement | null;
    const padding = innerContainer ? parseFloat(window.getComputedStyle(innerContainer).paddingLeft) + parseFloat(window.getComputedStyle(innerContainer).paddingRight) : 0;
    this.gridColumns = this.factoryGridService.calculateColumns(this.gridCellSizePx, availableWidthPx - padding);
    this.conveyorGrid = this.factoryGridService.createOrResizeGrid(this.conveyorGrid, this.gridRowCount, this.gridColumns);
  }

  private updateGridCellSize(): void {
    this.gridCellSizePx = Math.floor((window.innerWidth * this.gridCellSizeVw) / 100);
  }

  private getGridRect(): DOMRect {
    return this.playgroundGrid.gridTableRef.nativeElement.getBoundingClientRect();
  }

  private updateItemResourceBadge(itemid: string, resource: string | null): void {
    const el = document.getElementById(itemid);
    if (!el) return;
    let badge = el.querySelector('.resource-badge') as HTMLElement | null;
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'resource-badge absolute bottom-1 right-1 text-base leading-none pointer-events-none';
      el.appendChild(badge);
    }
    badge.textContent = resource ? (this.resourceEmoji[resource] ?? resource) : '';
  }
}
