import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, NgZone, OnInit, signal, ViewChild } from '@angular/core';
import { DatePipe, NgClass } from '@angular/common';
import { delay, filter, mergeMap, of, ReplaySubject, take } from 'rxjs';
import { FormsModule } from '@angular/forms';
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
import { FactoryLayoutService, SavedLayout } from '../../services/factoryLayout.service';

@Component({
  selector: 'app-factory-page',
  standalone: true,
  imports: [PlaygroundGridComponent, ItemsComponent, FormsModule, DatePipe, NgClass],
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

  // Active layout (toolbar)
  activeLayoutId: string | null = null;
  activeLayoutName = '';
  isDirty = false;
  showSavePopover = false;
  savePopoverName = '';
  layoutSaving = false;

  // Layouts dropdown (load / delete / reset)
  showLayoutsDropdown = false;
  savedLayouts: SavedLayout[] = [];
  layoutsLoading = false;
  layoutLoadingId: string | null = null;
  layoutError = '';
  confirmResetOpen = false;
  confirmDeleteId: string | null = null;
  pendingSwitchLayout: SavedLayout | null = null;
  discardHolding = false;
  resetHolding = false;
  private discardHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private resetHoldTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly resourceEmoji: Record<string, string> = { metall: '🔩', kupfer: '🟤', plastik: '🧴' };

  constructor(
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
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
    private factoryLayoutService: FactoryLayoutService,
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
    const wasPainting = this.interaction.paintMode === 'on';
    this.interaction.resetInteractions();
    this.connectionEvaluator.evaluate(
      this.conveyorGrid, this.itemManager.clonedItems, this.itemManager.itemStates,
      this.gridRowCount, this.gridColumns, this.getItemSizePx, this.gridCellSizePx,
    );
    if (wasPainting) {
      this.retriggerStuckConveyorResources();
    }
  }

  private retriggerStuckConveyorResources(): void {
    for (let row = 0; row < this.gridRowCount; row++) {
      for (let col = 0; col < this.gridColumns; col++) {
        const cell = this.conveyorGrid[row]?.[col];
        if (!cell?.active || !cell.resource || !cell.exit) continue;
        let nr = row, nc = col;
        if (cell.exit === 'up') nr--;
        else if (cell.exit === 'down') nr++;
        else if (cell.exit === 'left') nc--;
        else if (cell.exit === 'right') nc++;
        if (this.conveyorGrid[nr]?.[nc]?.active) {
          this.resourceExchangeService.conveyorResourceChanged$.next({ row, col, resource: cell.resource });
        }
      }
    }
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
    if (itemEl) { this.dragDrop.removePlacedItem(itemEl, itemEl.id); this.markDirty(); }
  }

  onCellMouseDown(event: MouseEvent, rowIndex: number, colIndex: number): void {
    if (this.interaction.isDraggingItem) return;
    event.preventDefault();
    this.interaction.mousePressed = true;
    this.painter.startPainting(this.conveyorGrid, rowIndex, colIndex, event.button === 2 ? 'off' : 'on');
    this.markDirty();
  }

  onCellMouseEnter(rowIndex: number, colIndex: number): void {
    if (!this.interaction.mousePressed || this.interaction.isDraggingItem) return;
    this.painter.continuePainting(this.conveyorGrid, rowIndex, colIndex);
    this.markDirty();
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

  get hasFactoryContent(): boolean {
    for (const item of this.itemManager.clonedItems) {
      if (!this.itemManager.itemStates[item.id]?.isAtStartPosition) return true;
    }
    for (const row of this.conveyorGrid) {
      for (const cell of row) {
        if (cell.active) return true;
      }
    }
    return false;
  }

  private markDirty(): void {
    if (!this.isDirty) {
      this.isDirty = true;
      this.cdr.detectChanges();
    }
  }

  // ── Toolbar: save button ─────────────────────────────────────────────────

  onSaveButtonClick(): void {
    if (this.activeLayoutId) {
      this.performSaveOverwrite();
    } else {
      this.showSavePopover = !this.showSavePopover;
      this.savePopoverName = '';
    }
  }

  async confirmSaveNew(): Promise<void> {
    const name = this.savePopoverName.trim();
    if (!name) return;
    this.layoutSaving = true;
    this.cdr.detectChanges();
    try {
      const saved = await this.factoryLayoutService.saveLayout(name, this.buildLayoutSnapshot());
      this.ngZone.run(() => {
        this.activeLayoutId = saved.id;
        this.activeLayoutName = saved.name;
        this.isDirty = false;
        this.showSavePopover = false;
        this.savePopoverName = '';
      });
    } catch {
      // silent – user can retry
    } finally {
      this.ngZone.run(() => {
        this.layoutSaving = false;
        this.cdr.detectChanges();
      });
    }
  }

  private async performSaveOverwrite(): Promise<void> {
    if (!this.activeLayoutId) return;
    this.layoutSaving = true;
    this.cdr.detectChanges();
    try {
      await this.factoryLayoutService.overwriteLayout(this.activeLayoutId, this.buildLayoutSnapshot());
      this.ngZone.run(() => { this.isDirty = false; });
    } catch {
      // silent
    } finally {
      this.ngZone.run(() => {
        this.layoutSaving = false;
        this.cdr.detectChanges();
      });
    }
  }

  // ── Layouts modal (load / switch / delete / reset) ────────────────────────

  async openLayoutsDropdown(): Promise<void> {
    this.dropdownOpen.set(false);
    this.showLayoutsDropdown = true;
    this.layoutError = '';
    this.confirmDeleteId = null;
    this.confirmResetOpen = false;
    await this.refreshLayouts();
  }

  closeLayoutsDropdown(): void {
    this.showLayoutsDropdown = false;
    this.layoutError = '';
    this.confirmDeleteId = null;
    this.confirmResetOpen = false;
  }

  private async refreshLayouts(): Promise<void> {
    this.layoutsLoading = true;
    this.cdr.detectChanges();
    try {
      const list = await this.factoryLayoutService.listLayouts();
      this.ngZone.run(() => { this.savedLayouts = list; });
    } catch {
      this.ngZone.run(() => { this.layoutError = 'Spielstände konnten nicht geladen werden.'; });
    } finally {
      this.ngZone.run(() => {
        this.layoutsLoading = false;
        this.cdr.detectChanges();
      });
    }
  }

  async loadLayout(layout: SavedLayout): Promise<void> {
    if (this.activeLayoutId === layout.id) { this.closeLayoutsDropdown(); return; }

    // Bei ungespeicherten Änderungen: Nutzer entscheiden lassen
    if (this.activeLayoutId && this.isDirty) {
      this.pendingSwitchLayout = layout;
      this.cdr.detectChanges();
      return;
    }

    await this.doLoadLayout(layout);
  }

  async confirmSwitchWithSave(): Promise<void> {
    const target = this.pendingSwitchLayout;
    if (!target) return;
    this.pendingSwitchLayout = null;
    if (this.activeLayoutId) {
      try {
        await this.factoryLayoutService.overwriteLayout(this.activeLayoutId, this.buildLayoutSnapshot());
      } catch { /* fall through */ }
    }
    await this.doLoadLayout(target);
  }

  async confirmSwitchDiscard(): Promise<void> {
    const target = this.pendingSwitchLayout;
    if (!target) return;
    this.pendingSwitchLayout = null;
    await this.doLoadLayout(target);
  }

  cancelSwitch(): void {
    this.pendingSwitchLayout = null;
    this.onDiscardHoldEnd();
  }

  onDiscardHoldStart(event: Event): void {
    event.preventDefault();
    if (this.discardHoldTimer) return;
    this.discardHolding = true;
    this.cdr.detectChanges();
    this.discardHoldTimer = setTimeout(() => {
      this.discardHoldTimer = null;
      this.discardHolding = false;
      this.confirmSwitchDiscard();
    }, 3000);
  }

  onDiscardHoldEnd(): void {
    this.discardHolding = false;
    if (this.discardHoldTimer) {
      clearTimeout(this.discardHoldTimer);
      this.discardHoldTimer = null;
    }
    this.cdr.detectChanges();
  }

  onResetHoldStart(event: Event): void {
    event.preventDefault();
    if (this.resetHoldTimer) return;
    this.resetHolding = true;
    this.cdr.detectChanges();
    this.resetHoldTimer = setTimeout(() => {
      this.resetHoldTimer = null;
      this.resetHolding = false;
      this.resetFactory();
    }, 1000);
  }

  onResetHoldEnd(): void {
    this.resetHolding = false;
    if (this.resetHoldTimer) {
      clearTimeout(this.resetHoldTimer);
      this.resetHoldTimer = null;
    }
    this.cdr.detectChanges();
  }

  private async doLoadLayout(layout: SavedLayout): Promise<void> {
    this.layoutError = '';
    this.layoutLoadingId = layout.id;
    this.cdr.detectChanges();
    try {
      const raw = await this.factoryLayoutService.loadLayoutData(layout.id) as {
        conveyorGrid: ConveyorSegment[][];
        items: Array<{ label: string; col: number; row: number }>;
      };
      this.ngZone.run(() => {
        this.applyLayoutSnapshot(raw);
        this.activeLayoutId = layout.id;
        this.activeLayoutName = layout.name;
        this.isDirty = false;
        this.closeLayoutsDropdown();
      });
    } catch {
      this.ngZone.run(() => { this.layoutError = 'Laden fehlgeschlagen.'; });
    } finally {
      this.ngZone.run(() => {
        this.layoutLoadingId = null;
        this.cdr.detectChanges();
      });
    }
  }

  async deleteLayout(id: string): Promise<void> {
    this.layoutError = '';
    this.confirmDeleteId = null;
    try {
      await this.factoryLayoutService.deleteLayout(id);
      if (this.activeLayoutId === id) {
        this.activeLayoutId = null;
        this.activeLayoutName = '';
        this.isDirty = false;
      }
      await this.refreshLayouts();
    } catch {
      this.layoutError = 'Löschen fehlgeschlagen.';
      this.cdr.detectChanges();
    }
  }

  async createNewLayout(): Promise<void> {
    if (this.activeLayoutId && this.isDirty) {
      try {
        await this.factoryLayoutService.overwriteLayout(this.activeLayoutId, this.buildLayoutSnapshot());
      } catch { /* silent */ }
    }
    this.dragDrop.clearAllItems(this.items);
    for (const row of this.conveyorGrid) {
      for (const cell of row) {
        cell.active = false; cell.entry = null; cell.exit = null;
        cell.resource = null; cell.endpoint = null;
      }
    }
    this.activeLayoutId = null;
    this.activeLayoutName = '';
    this.isDirty = false;
    this.closeLayoutsDropdown();
    this.updateMinimap();
    this.cdr.detectChanges();
    // Sofort den Namen abfragen
    this.savePopoverName = '';
    this.showSavePopover = true;
  }

  resetFactory(): void {
    this.dragDrop.clearAllItems(this.items);
    for (const row of this.conveyorGrid) {
      for (const cell of row) {
        cell.active = false; cell.entry = null; cell.exit = null;
        cell.resource = null; cell.endpoint = null;
      }
    }
    this.confirmResetOpen = false;
    this.updateMinimap();
    if (this.activeLayoutId) {
      this.markDirty();
    } else {
      this.isDirty = false;
      this.cdr.detectChanges();
    }
  }

  private buildLayoutSnapshot(): unknown {
    return {
      conveyorGrid: this.conveyorGrid,
      items: this.itemManager.clonedItems
        .filter(i => !this.itemManager.itemStates[i.id]?.isAtStartPosition)
        .map(i => ({
          label: i.label,
          col: this.itemManager.itemStates[i.id].col,
          row: this.itemManager.itemStates[i.id].row,
        })),
    };
  }

  private applyLayoutSnapshot(raw: { conveyorGrid: ConveyorSegment[][]; items: Array<{ label: string; col: number; row: number }> }): void {
    this.dragDrop.clearAllItems(this.items);
    for (let r = 0; r < this.conveyorGrid.length; r++) {
      for (let c = 0; c < this.conveyorGrid[r].length; c++) {
        const saved = raw.conveyorGrid[r]?.[c];
        Object.assign(this.conveyorGrid[r][c], saved ?? { active: false, entry: null, exit: null, resource: null, endpoint: null });
      }
    }
    requestAnimationFrame(() => {
      for (const entry of raw.items) {
        const source = this.items.find(i => i.label === entry.label);
        if (!source || (source.currentAvailableCount ?? source.maxAvailableCount ?? 1) <= 0) continue;
        this.dragDrop.placeItemAt(source, entry.col, entry.row, this.items);
      }
      this.itemManager.captureBasePositions([...this.items, ...this.itemManager.clonedItems], this.getGridRect());
      this.setupInteractDragging();
      this.updateMinimap();
      this.cdr.detectChanges();
    });
  }

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
      onLayoutChange: () => this.markDirty(),
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
