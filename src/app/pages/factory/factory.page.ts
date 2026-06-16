import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, NgZone, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { DatePipe, NgClass } from '@angular/common';
import { interval, ReplaySubject, Subscription, take } from 'rxjs';
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
export class FactoryPage implements AfterViewInit, OnInit, OnDestroy {
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

  // Globaler 1-Sekunden-Tick, der die komplette Ressourcen-Weitergabe abarbeitet.
  private tickSub?: Subscription;

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
    // Globaler Tick: jede Sekunde wird der gesamte Ressourcen-Fluss einmal abgearbeitet.
    this.tickSub = interval(1000).subscribe(() => {
      const { changedItems, inputs } = this.resourceExchangeService.tick(
        this.itemManager.clonedItems,
        this.itemManager.itemStates,
        this.conveyorGrid,
      );
      for (const itemid of changedItems) {
        const item = this.itemManager.clonedItems.find(i => i.id === itemid);
        this.updateItemResourceBadge(itemid, item?.resource ?? null);
      }
      for (const { inputId, accepted } of inputs) {
        this.markInputAcceptance(inputId, accepted);
      }
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy(): void {
    this.tickSub?.unsubscribe();
  }

  // Markiert einen Input grün (Maschine akzeptiert die Ressource) bzw. rot (lehnt ab).
  private markInputAcceptance(inputId: string, accepted: boolean): void {
    const el = document.getElementById(inputId);
    if (!el) return;
    if (accepted) {
      el.classList.remove('ring-red-500', 'shadow-[0_0_20px_rgba(239,68,68,0.6)]');
      el.classList.add('ring-4', 'ring-green-500', 'shadow-[0_0_20px_rgba(34,197,94,0.6)]');
    } else {
      el.classList.remove('ring-green-500', 'shadow-[0_0_20px_rgba(34,197,94,0.6)]');
      el.classList.add('ring-4', 'ring-red-500', 'shadow-[0_0_20px_rgba(239,68,68,0.6)]');
    }
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
    // Ein einzeln verlegtes Rollband-Feld ohne Ein- und Ausgang (entry/exit beide null)
    // wieder entfernen – es hängt an nichts dran.
    if (this.interaction.paintMode === 'on' && this.interaction.pathCells.length === 1) {
      const { row, col } = this.interaction.pathCells[0];
      const cell = this.conveyorGrid[row][col];
      if (!cell.entry && !cell.exit) {
        this.conveyorGrid[row][col] = { active: false, entry: null, exit: null, resource: null, endpoint: null };
      }
    }
    this.interaction.resetInteractions();
    this.connectionEvaluator.evaluate(
      this.conveyorGrid, this.itemManager.clonedItems, this.itemManager.itemStates,
      this.gridRowCount, this.gridColumns, this.getItemSizePx, this.gridCellSizePx,
    );
    // Festsitzende Ressourcen müssen nicht mehr manuell re-getriggert werden —
    // der globale Tick (siehe ngOnInit) bewegt sie automatisch im nächsten Durchlauf.
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
