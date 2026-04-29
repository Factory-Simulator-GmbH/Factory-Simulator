
import { Component, ViewChild, ElementRef } from '@angular/core';
import { PlaygroundGridComponent } from '../../components/playground-grid/playground-grid.component';
import { ItemsComponent } from '../../components/items/items.component';
import { InteractionStateService } from '../../services/interaction-state.service';
import { ViewportService } from '../../services/viewport.service';
import { DragDropManagerService } from '../../services/drag-drop-manager.service';
import { ConnectionEvaluatorService } from '../../services/connection-evaluator.service';
import { MenuService } from '../../services/menu.service';
import { MinimapService } from '../../services/minimap.service';
import { ConveyorPainterService } from '../../services/conveyor-painter.service';
import { ItemManagerService } from '../../services/item-manager.service';
import { FactoryGridService } from '../../services/factory-grid.service';
import { FactoryItemsService } from '../../services/factory-items.service';
import { LayoutService } from '../../services/layout.service';
import { ResourceExchangeService } from '../../services/resource-exchange.service';
import { ConveyorSegment } from '../../models/conveyor-segment.model';
import { DraggableItems, ItemSize } from '../../models/draggable-item.model';
import { ItemState, ItemBasePosition } from '../../models/item-position.model';
import itemsData from '../../../../public/assets/items.json';

@Component({
  selector: 'app-factory-page',
  standalone: true,
  imports: [PlaygroundGridComponent, ItemsComponent],
  templateUrl: './factory.page.html',
})
export class FactoryPage {
  // ViewChilds für Template-Interaktion
  @ViewChild('gridHost', { read: ElementRef, static: true })
  gridHostRef!: ElementRef<HTMLElement>;

  @ViewChild(PlaygroundGridComponent)
  playgroundGridComponent!: PlaygroundGridComponent;

  @ViewChild('scrollContainer')
  scrollContainerRef!: ElementRef<HTMLElement>;

  @ViewChild('minimapContent')
  minimapContentRef!: ElementRef<HTMLElement>;

  // Properties für Template (kommen aus Services oder sind hier definiert)
  conveyorGrid: ConveyorSegment[][] = [];
  items: DraggableItems[] = itemsData as DraggableItems[];
  clonedItems: DraggableItems[] = [];
  itemStates: Record<string, ItemState> = {};
  itemBasePositions: Record<string, ItemBasePosition> = {};
  
  gridCellSizeVw = 2.5;
  gridCellSizePx = 0;
  gridRowCount = 30;
  gridColumns = 0;
  
  zoomLevel = 1.0;
  isFullscreen = false;
  showMenu = false;
  showShortcutsModal = false;
  showHelpModal = false;
  showItemTooltips = true;
  isDraggingItem = false;
  isNavigatingMinimap = false;
  minimapReady = false;
  minimapViewport = { left: '0%', top: '0%', width: '100%', height: '100%' };
  previewCells = new Set<string>();
  activeDraggedItemId: string | null = null;

  // Service-Injection
  constructor(
    public interactionState: InteractionStateService,
    public viewport: ViewportService,
    public dragDropManager: DragDropManagerService,
    public connectionEvaluator: ConnectionEvaluatorService,
    public menuService: MenuService,
    public minimapService: MinimapService,
    public conveyorPainter: ConveyorPainterService,
    public itemManager: ItemManagerService,
    private layoutService: LayoutService,
    private factoryGridService: FactoryGridService,
    private factoryItemsService: FactoryItemsService,
    private resourceExchangeService: ResourceExchangeService,
  ) {}

  // Helper-Methoden für Template
  getItemSizePx = (size: ItemSize): number => {
    return this.layoutService.getItemSizePx(size, this.gridCellSizePx);
  };

  getConveyorSymbol = (cell: ConveyorSegment): string => {
    return this.factoryGridService.getConveyorSymbol(cell);
  };

  get minimapItems() {
    return this.clonedItems
      .filter(item => {
        const state = this.itemStates[item.id];
        return state && !state.isAtStartPosition;
      })
      .map(item => {
        const state = this.itemStates[item.id];
        const span = Math.max(1, Math.round(this.getItemSizePx(item.size) / this.gridCellSizePx));
        return { id: item.id, col: state.col, row: state.row, span };
      });
  }

  // Event-Handler für Template
  toggleMenu(): void { this.showMenu = !this.showMenu; }
  openShortcuts(): void { this.showMenu = false; this.showShortcutsModal = true; }
  openHelp(): void { this.showMenu = false; this.showHelpModal = true; }
  toggleFullscreen(): void { this.isFullscreen = !this.isFullscreen; }
  onWheel(_event: WheelEvent): void { /* Zoom deaktiviert */ }
  onScroll(_event: Event): void { /* Scroll handled by service */ }
  onCellMouseDown(event: MouseEvent, rowIndex: number, colIndex: number): void {
    if (this.isDraggingItem) return;
    this.conveyorPainter.startPainting(rowIndex, colIndex, event.button === 2 ? 'off' : 'on');
  }
  onCellMouseEnter(rowIndex: number, colIndex: number): void {
    this.conveyorPainter.continuePainting(rowIndex, colIndex);
  }
  onMinimapMouseDown(event: MouseEvent): void {
    this.isNavigatingMinimap = true;
    document.body.style.cursor = 'grabbing';
  }
  onItemMouseDown(data: { itemId: string; event: MouseEvent }): void {
    if (data.event.button === 2) return;
    const state = this.itemStates[data.itemId];
    if ((state as any)?.isConnected) return;
  }
}