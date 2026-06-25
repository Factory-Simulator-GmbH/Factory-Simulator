import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, NgZone, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import {DatePipe, NgClass, TitleCasePipe} from '@angular/common';
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
import {GameDataService} from '../../services/game-data.service';

@Component({
  selector: 'app-factory-page',
  standalone: true,
  imports: [PlaygroundGridComponent, ItemsComponent, FormsModule, DatePipe, NgClass, TitleCasePipe],
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

  // Popover anchor positions (set dynamically from button click position)
  savePopoverAnchor = { top: 0, right: 0 };
  resetPopoverAnchor = { top: 0, right: 0 };
  menuPopoverAnchor = { top: 0, right: 0 };
  quickLookActive = false;
  private quickLookSnapshot: unknown = null;
  quickLookLayoutData: unknown = null;
  private quickLookLayoutId: string | null = null;

  // Layouts dropdown (load / delete / reset)
  showLayoutsDropdown = false;
  savedLayouts: SavedLayout[] = [];
  publicLayouts: SavedLayout[] = [];
  layoutsLoading = false;
  layoutLoadingId: string | null = null;
  layoutError = '';
  confirmResetOpen = false;
  confirmDeleteId: string | null = null;
  pendingSwitchLayout: SavedLayout | null = null;
  discardHolding = false;
  resetHolding = false;
  shareHoldingId: string | null = null;
  private discardHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private resetHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private shareHoldTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly resourceEmoji: Record<string, string> = { metall: '🔩', kupfer: '🟤', plastik: '🧴', kabel: '🔌', gehäuse: '🏠', leiterplatte: '🟩', elektronik: '📱' };

  // Globaler 1-Sekunden-Tick, der die komplette Ressourcen-Weitergabe abarbeitet.
  private tickSub?: Subscription;

  constructor(
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private factoryGridService: FactoryGridService,
    private factoryItemsService: FactoryItemsService,
    private layoutService: LayoutService,
    protected gameDataService: GameDataService,
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
      if (changedItems.size > 0) this.markDirty();
      for (const itemid of changedItems) {
        const item = this.itemManager.clonedItems.find(i => i.id === itemid);
        this.updateItemResourceBadge(itemid, item?.resource ?? null);
      }
      for (const { inputId, accepted } of inputs) {
        this.markInputAcceptance(inputId, accepted);
      }
      for (const item of this.itemManager.clonedItems) {
        if (item.type !== 'machine' && item.type !== 'warehouse') continue;
        const state = this.itemManager.itemStates[item.id];
        if (!state || state.isAtStartPosition) continue;
        this.updateMachineStatus(item);
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

  private anchorBelow(event: MouseEvent): { top: number; right: number } {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return { top: rect.bottom + 8, right: window.innerWidth - rect.right };
  }

  onSaveButtonClick(event?: MouseEvent): void {
    if (this.activeLayoutId) {
      this.performSaveOverwrite();
    } else {
      if (event) this.savePopoverAnchor = this.anchorBelow(event);
      this.showSavePopover = !this.showSavePopover;
      this.savePopoverName = '';
    }
  }

  onResetButtonClick(event: MouseEvent): void {
    this.resetPopoverAnchor = this.anchorBelow(event);
    this.confirmResetOpen = !this.confirmResetOpen;
  }

  onMenuButtonClick(event: MouseEvent): void {
    if (!this.menu.showMenu) this.menuPopoverAnchor = this.anchorBelow(event);
    this.menu.toggleMenu();
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
    if (this.quickLookActive) this.exitQuickLook();
  }

  async loadQuickLookData(layout: SavedLayout): Promise<void> {
    this.quickLookLayoutId = layout.id;
    this.quickLookLayoutData = null;
    try {
      const data = await this.factoryLayoutService.loadLayoutData(layout.id);
      if (this.quickLookLayoutId === layout.id) this.quickLookLayoutData = data;
    } catch { /* silent */ }
  }

  clearQuickLookData(): void {
    if (!this.quickLookActive) {
      this.quickLookLayoutData = null;
      this.quickLookLayoutId = null;
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.code !== 'Space') return;
    const tag = (event.target as HTMLElement).tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (!this.showLayoutsDropdown || !this.quickLookLayoutData || this.quickLookActive) return;
    event.preventDefault();
    this.enterQuickLook();
  }

  @HostListener('document:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent): void {
    if (event.code !== 'Space' || !this.quickLookActive) return;
    event.preventDefault();
    this.exitQuickLook();
  }

  private enterQuickLook(): void {
    this.quickLookSnapshot = this.buildLayoutSnapshot();
    this.quickLookActive = true;
    this.tickSub?.unsubscribe();
    this.dragDrop.previewMode = true;
    this.cdr.detectChanges();
    this.applyLayoutSnapshot(this.quickLookLayoutData as any);
  }

  private exitQuickLook(): void {
    this.quickLookActive = false;
    this.dragDrop.previewMode = false;
    this.cdr.detectChanges();
    this.applyLayoutSnapshot(this.quickLookSnapshot as any);
    this.quickLookSnapshot = null;
    this.tickSub = interval(1000).subscribe(() => {
      const { changedItems, inputs } = this.resourceExchangeService.tick(
        this.itemManager.clonedItems, this.itemManager.itemStates, this.conveyorGrid,
      );
      if (changedItems.size > 0) this.markDirty();
      for (const itemid of changedItems) {
        const item = this.itemManager.clonedItems.find(i => i.id === itemid);
        this.updateItemResourceBadge(itemid, item?.resource ?? null);
      }
      for (const { inputId, accepted } of inputs) this.markInputAcceptance(inputId, accepted);
      for (const item of this.itemManager.clonedItems) {
        if (item.type !== 'machine' && item.type !== 'warehouse') continue;
        const state = this.itemManager.itemStates[item.id];
        if (!state || state.isAtStartPosition) continue;
        this.updateMachineStatus(item);
      }
      this.cdr.detectChanges();
    });
  }



  private async refreshLayouts(): Promise<void> {
    this.layoutsLoading = true;
    this.cdr.detectChanges();
    try {
      const [list, publicList] = await Promise.all([
        this.factoryLayoutService.listLayouts(),
        this.factoryLayoutService.listPublicLayouts(),
      ]);
      this.ngZone.run(() => {
        this.savedLayouts = list;
        this.publicLayouts = publicList.filter(p => !list.some(l => l.id === p.id));
      });
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
    }, 800);
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
    }, 800);
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

  onShareHoldStart(layout: SavedLayout, event: Event): void {
    event.preventDefault();
    if (this.shareHoldTimer || layout.is_public) return;
    this.shareHoldingId = layout.id;
    this.cdr.detectChanges();
    this.shareHoldTimer = setTimeout(() => {
      this.shareHoldTimer = null;
      this.shareHoldingId = null;
      this.shareLayout(layout);
    }, 800);
  }

  onShareHoldEnd(): void {
    this.shareHoldingId = null;
    if (this.shareHoldTimer) {
      clearTimeout(this.shareHoldTimer);
      this.shareHoldTimer = null;
    }
    this.cdr.detectChanges();
  }

  async shareLayout(layout: SavedLayout): Promise<void> {
    const next = !layout.is_public;
    try {
      await this.factoryLayoutService.publishLayout(layout.id, next);
      layout.is_public = next;
      await this.refreshLayouts();
    } catch {
      this.layoutError = 'Teilen fehlgeschlagen.';
      this.cdr.detectChanges();
    }
  }

  async loadPublicLayout(layout: SavedLayout): Promise<void> {
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
        // Shared layouts laden ohne activeLayoutId — Änderungen gehen in neuen Spielstand
        this.activeLayoutId = null;
        this.activeLayoutName = layout.name + ' (Kopie)';
        this.isDirty = true;
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
      conveyorGrid: this.conveyorGrid.map(row => row.map(cell => ({ ...cell }))),
      items: this.itemManager.clonedItems
        .filter(i => !this.itemManager.itemStates[i.id]?.isAtStartPosition)
        .map(i => ({
          ...i,
          col: this.itemManager.itemStates[i.id].col,
          row: this.itemManager.itemStates[i.id].row,
        })),
    };
  }

  private applyLayoutSnapshot(raw: { conveyorGrid: ConveyorSegment[][]; items: Array<Partial<DraggableItems> & { label: string; col: number; row: number }> }): void {
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
        if (!source || (source.maxAvailableCount && (source.currentAvailableCount ?? source.maxAvailableCount) <= 0)) continue;
        this.dragDrop.placeItemAt(source, entry.col, entry.row, this.items);
        const placed = this.itemManager.clonedItems.find(
          i => this.itemManager.itemStates[i.id]?.col === entry.col && this.itemManager.itemStates[i.id]?.row === entry.row,
        );
        if (placed) {
          const { id: _id, col: _col, row: _row, ...state } = entry;
          Object.assign(placed, state);
        }
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

  // Zeigt auf einer Maschine je Input-Ressource "Emoji aktuell/Soll" an und,
  // sobald ein fertiges Produkt bereitliegt (outputcount), eine "➡️ Output"-Zeile.
  private updateMachineStatus(machine: DraggableItems): void {
    const el = document.getElementById(machine.id);
    if (!el) return;
    let panel = el.querySelector('.machine-status') as HTMLElement | null;
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'machine-status absolute top-1 left-1 flex flex-col gap-0.5 text-xs leading-none pointer-events-none';
      el.appendChild(panel);
    }
    const lines: string[] = [];
    if (machine.input) {
      for (const res of Object.keys(machine.input)) {
        const have = machine.inputcount?.[res] ?? 0;
        if (machine.type === 'warehouse') {
          lines.push(`${this.resourceEmoji[res] ?? res} ${have}`)
        } else {
          const need = machine.input[res];
          lines.push(`${this.resourceEmoji[res] ?? res} ${have}/${need}`);
        }
      }
    }
    if (machine.outputcount && machine.output) {
      lines.push(`➡️ ${this.resourceEmoji[machine.output] ?? machine.output}`);
    }
    panel.textContent = lines.join('\n');
    panel.style.whiteSpace = 'pre';

    this.updateMachineProgressBar(machine, el);
  }

  // Zeigt unten in der Maschine einen Ladebalken, der den Fortschritt des
  // Produktions-Timers darstellt. Läuft per CSS-Transition flüssig zwischen den
  // Ticks; wird ausgeblendet, sobald kein Timer aktiv ist.
  private updateMachineProgressBar(machine: DraggableItems, el: HTMLElement): void {
    let track = el.querySelector('.machine-progress') as HTMLElement | null;
    if (!track) {
      track = document.createElement('div');
      track.className = 'machine-progress absolute bottom-1 left-1 right-1 h-1.5 rounded-full bg-white/20 overflow-hidden pointer-events-none';
      const fill = document.createElement('div');
      fill.className = 'machine-progress-fill h-full w-0 rounded-full bg-green-400';
      track.appendChild(fill);
      el.appendChild(track);
    }
    const fill = track.querySelector('.machine-progress-fill') as HTMLElement;

    const progress = this.resourceExchangeService.getOutputProgress(machine.id);
    if (!progress || progress.duration <= 0) {
      track.style.display = 'none';
      fill.style.transition = 'none';
      fill.style.width = '0%';
      delete (track.dataset as any)['running'];
      return;
    }

    track.style.display = 'block';
    // Animation nur einmal pro Timer-Lauf starten, sonst würde sie jeden Tick
    // neu von vorne beginnen.
    if (track.dataset['running'] !== 'true') {
      track.dataset['running'] = 'true';
      const elapsed = progress.duration - progress.remaining;
      const startPct = Math.min(100, (elapsed / progress.duration) * 100);
      fill.style.transition = 'none';
      fill.style.width = `${startPct}%`;
      // Im nächsten Frame auf 100% über die Restdauer animieren.
      requestAnimationFrame(() => {
        fill.style.transition = `width ${progress.remaining}ms linear`;
        fill.style.width = '100%';
      });
    }
  }
}
