import { ApplicationRef, ComponentRef, createComponent, EnvironmentInjector, Injectable, NgZone } from '@angular/core';
import { Subscription, timer } from 'rxjs';
import interact from 'interactjs';
import { ConveyorSegment } from '../models/conveyorSegment.model';
import { DraggableItems } from '../models/draggableItem.model';
import { DraggableItemComponent } from '../components/draggableItem/draggableItem.component';
import { FactoryItemsService } from './factoryItems.service';
import { ResourceExchangeService } from './resourceExchange.service';
import { LayoutService } from './layout.service';
import { ItemManagerService } from './itemManager.service';
import { InteractionStateService } from './interactionState.service';
import { ConnectionEvaluatorService } from './connectionEvaluator.service';

export interface DragSetupOptions {
  gridElement: HTMLElement;
  getGridRect: () => DOMRect;
  gridCellSizePx: number;
  zoomLevel: number;
  gridColumns: number;
  gridRowCount: number;
  conveyorGrid: ConveyorSegment[][];     // reference — mutations visible
  items: DraggableItems[];               // reference — mutations visible
  detectChanges: () => void;
  postRemove: () => void;                // re-runs setupInteractDragging after item deletion
  onLayoutChange?: () => void;           // fires when items are placed/moved/removed
}

@Injectable({ providedIn: 'root' })
export class DragDropManagerService {
  private opts: DragSetupOptions | null = null;
  private spawnerIntervals = new Map<string, Subscription>();

  constructor(
    private ngZone: NgZone,
    private appRef: ApplicationRef,
    private envInjector: EnvironmentInjector,
    private factoryItemsService: FactoryItemsService,
    private resourceExchangeService: ResourceExchangeService,
    private layoutService: LayoutService,
    private itemManager: ItemManagerService,
    private interactionState: InteractionStateService,
    private connectionEvaluator: ConnectionEvaluatorService,
  ) {}

  setup(options: DragSetupOptions): void {
    this.opts = options;
    const { gridElement, getGridRect, gridCellSizePx, zoomLevel, gridColumns, gridRowCount, conveyorGrid, items, detectChanges } = options;

    interact('.draggable-item').unset();

    interact(gridElement).dropzone({
      accept: '.draggable-item',
      overlap: 0.5,
      ondragenter: (event) => event.relatedTarget.classList.add('can-drop'),
      ondragleave: (event) => event.relatedTarget.classList.remove('can-drop'),
    });

    interact('.draggable-item').draggable({
      cursorChecker: (_action, _interactable, element) => {
        return (this.itemManager.itemStates[(element as HTMLElement).id] as any)?.isConnected ? 'default' : 'move';
      },
      modifiers: [
        interact.modifiers.snap({
          targets: [(x: number, y: number) => {
            const rect = getGridRect();
            if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
              return null as any;
            }
            return {
              x: Math.round((x - rect.left) / gridCellSizePx) * gridCellSizePx + rect.left,
              y: Math.round((y - rect.top) / gridCellSizePx) * gridCellSizePx + rect.top,
            };
          }],
          relativePoints: [{ x: 0, y: 0 }],
        }),
      ],
      listeners: {
        start: (event) => {
          const element = event.target as HTMLElement;
          const itemId = element.id;
          if ((this.itemManager.itemStates[itemId] as any)?.isConnected) {
            event.interaction.stop();
            return;
          }

          this.ngZone.run(() => {
            this.interactionState.isDraggingItem = true;
            this.interactionState.activeDraggedItemId = itemId;
            detectChanges();
          });

          const transform = element.style.transform;
          const match = transform.match(/translate(?:3d)?\(\s*(-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px/);
          element.setAttribute('data-x', match ? match[1] : '0');
          element.setAttribute('data-y', match ? match[2] : '0');
          element.style.position = 'relative';
          element.style.zIndex = '9999';
          element.classList.remove('can-drop');
        },

        move: (event) => {
          const element = event.target as HTMLElement;
          const isInGrid = element.parentElement?.id === 'grid-items-container';
          const currentX = Number(element.getAttribute('data-x') ?? '0');
          const currentY = Number(element.getAttribute('data-y') ?? '0');
          const effectiveZoom = isInGrid ? zoomLevel : 1.0;
          let nextX = currentX + event.dx / effectiveZoom;
          let nextY = currentY + event.dy / effectiveZoom;
          if (isInGrid) {
            const maxX = gridColumns * gridCellSizePx - element.offsetWidth / effectiveZoom;
            const maxY = gridRowCount * gridCellSizePx - element.offsetHeight / effectiveZoom;
            nextX = Math.min(nextX, maxX);
            nextY = Math.min(nextY, maxY);
          }
          element.style.transform = `translate(${nextX}px, ${nextY}px)`;
          element.setAttribute('data-x', String(nextX));
          element.setAttribute('data-y', String(nextY));
        },

        end: (event) => {
          this.ngZone.run(() => {
            this.interactionState.isDraggingItem = false;
            this.interactionState.activeDraggedItemId = null;
            detectChanges();
          });

          const element = event.target as HTMLElement;
          const gridContainer = document.getElementById('grid-items-container');
          element.style.zIndex = '';

          const hasCanDrop = element.classList.contains('can-drop');
          const currentGridRect = getGridRect();
          const viewportEl = gridElement.closest('[data-grid-viewport]') ?? gridElement.parentElement;
          const viewportRect = viewportEl?.getBoundingClientRect() ?? currentGridRect;
          const visibleGridBottom = Math.min(currentGridRect.bottom, viewportRect.bottom);
          const visibleGridRight = Math.min(currentGridRect.right, viewportRect.right);
          const cursorInGrid = event.clientX >= currentGridRect.left &&
                               event.clientX <= visibleGridRight &&
                               event.clientY >= currentGridRect.top &&
                               event.clientY <= visibleGridBottom;
          const isInGrid = hasCanDrop && cursorInGrid;
          let overlap = false;
          try {
            overlap = this.itemManager.isOverlapping(element, conveyorGrid, gridRowCount, gridColumns, gridCellSizePx, currentGridRect);
          } catch (_) {}

          if (!isInGrid || overlap || !gridContainer) {
            const state = this.itemManager.itemStates[element.id];
            if (state && !state.isAtStartPosition) {
              if (gridContainer) gridContainer.appendChild(element);
              this.factoryItemsService.placeItemInGrid(element, state.col * gridCellSizePx, state.row * gridCellSizePx);
            } else {
              this.removePlacedItem(element, element.id);
              return;
            }
          } else {
            const itemRect = element.getBoundingClientRect();
            const containerRect = gridContainer.getBoundingClientRect();
            const currentGridRect = getGridRect();
            const rawRow = (itemRect.top - currentGridRect.top) / zoomLevel / gridCellSizePx;
            const rawCol = (itemRect.left - currentGridRect.left) / zoomLevel / gridCellSizePx;
            if (rawRow >= gridRowCount || rawCol >= gridColumns) {
              this.removePlacedItem(element, element.id);
              return;
            }
            let targetCol = Math.max(0, Math.min(Math.round(((itemRect.left - containerRect.left) / zoomLevel) / gridCellSizePx), gridColumns - 1));
            let targetRow = Math.max(0, Math.min(Math.round(((itemRect.top - containerRect.top) / zoomLevel) / gridCellSizePx), gridRowCount - 1));

            if (this.itemManager.itemStates[element.id].isAtStartPosition) {
              const clone = this.itemManager.clonedItems.find(i => i.id === element.id);
              const sourceItem = items.find(i => i.label === clone?.label);
              if (sourceItem) sourceItem.currentAvailableCount = (sourceItem.currentAvailableCount ?? sourceItem.maxAvailableCount ?? 1) - 1;
            }

            this.itemManager.itemStates[element.id] = { col: targetCol, row: targetRow, isAtStartPosition: false };

            const placedItem = this.itemManager.clonedItems.find(i => i.id === element.id);
            if (placedItem?.spawningResource) {
              this.spawnerIntervals.get(element.id)?.unsubscribe();
              const spawnRate = placedItem.rate ?? 5000;
              const sub = timer(spawnRate, spawnRate).subscribe(() => {
                this.ngZone.run(() => {
                  const adjacentOutput = this.resourceExchangeService.checkAdjacentOutput(targetCol, targetRow, this.itemManager.clonedItems, this.itemManager.itemStates);
                  this.resourceExchangeService.onSpawnerPlaced(element.id, targetCol, targetRow, adjacentOutput, this.itemManager.clonedItems, this.itemManager.itemStates);
                });
              });
              this.spawnerIntervals.set(element.id, sub);
            }

            gridContainer.appendChild(element);
            this.factoryItemsService.placeItemInGrid(element, targetCol * gridCellSizePx, targetRow * gridCellSizePx);
            this.opts?.onLayoutChange?.();
          }

          this.connectionEvaluator.evaluate(
            conveyorGrid, this.itemManager.clonedItems,
            this.itemManager.itemStates, gridRowCount, gridColumns,
            (size) => this.layoutService.getItemSizePx(size, gridCellSizePx), gridCellSizePx,
          );
          detectChanges();
        },
      },
    });

    interact('.source-item').on('move', (event) => {
      const interaction = event.interaction;
      if (!this.interactionState.mousePressed || !interaction.pointerIsDown || interaction.interacting()) return;

      const original = event.currentTarget as HTMLElement;
      const originalItemId = original.getAttribute('data-item-id') || original.id;
      const sourceItem = items.find(i => i.id === originalItemId);

      if (!sourceItem || (sourceItem.currentAvailableCount ?? 1) <= 0 || this.interactionState.lastMouseButton !== 0) {
        this.interactionState.mousePressed = false;
        return;
      }

      const uniqueId = `${originalItemId}-clone-${Date.now()}`;
      const componentRef = createComponent(DraggableItemComponent, { environmentInjector: this.envInjector });
      componentRef.instance.item = sourceItem;
      componentRef.instance.itemId = uniqueId;
      componentRef.instance.sizePx = this.layoutService.getItemSizePx(sourceItem.size, gridCellSizePx);

      const hostEl = componentRef.location.nativeElement as HTMLElement;
      document.body.appendChild(hostEl);
      this.appRef.attachView(componentRef.hostView);
      componentRef.changeDetectorRef.detectChanges();

      const innerDiv = hostEl.querySelector('.draggable-item') as HTMLElement;
      document.body.appendChild(innerDiv);
      hostEl.remove();

      innerDiv.setAttribute('data-item-id', uniqueId);
      innerDiv.setAttribute('id', uniqueId);
      innerDiv.style.position = 'fixed';
      innerDiv.style.zIndex = '999';

      this.itemManager.componentRefs.set(uniqueId, componentRef);
      this.itemManager.clonedItems.push({
        id: uniqueId, type: sourceItem.type || '', label: sourceItem.label || '',
        size: sourceItem.size || 'large', helpText: sourceItem.helpText || '',
        spawningResource: sourceItem.spawningResource, resource: null,
        input: sourceItem.input, output: sourceItem.output,
        rate: sourceItem.rate,
      });
      this.itemManager.itemStates[uniqueId] = { col: -1, row: -1, isAtStartPosition: true };

      const sizePx = this.layoutService.getItemSizePx(sourceItem.size, gridCellSizePx);
      const startX = event.clientX - sizePx / 2;
      const startY = event.clientY - sizePx / 2;
      innerDiv.setAttribute('data-x', String(startX));
      innerDiv.setAttribute('data-y', String(startY));
      innerDiv.style.transform = `translate(${startX}px, ${startY}px)`;

      interaction.start({ name: 'drag' }, interact('.draggable-item'), innerDiv);
    });
  }

  placeItemAt(sourceItem: DraggableItems, col: number, row: number, items: DraggableItems[]): void {
    if (!this.opts) return;
    const { gridCellSizePx, conveyorGrid, gridRowCount, gridColumns, detectChanges } = this.opts;

    const uniqueId = `${sourceItem.id}-clone-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const componentRef = createComponent(DraggableItemComponent, { environmentInjector: this.envInjector });
    componentRef.instance.item = sourceItem;
    componentRef.instance.itemId = uniqueId;
    componentRef.instance.sizePx = this.layoutService.getItemSizePx(sourceItem.size, gridCellSizePx);

    const hostEl = componentRef.location.nativeElement as HTMLElement;
    document.body.appendChild(hostEl);
    this.appRef.attachView(componentRef.hostView);
    componentRef.changeDetectorRef.detectChanges();

    const innerDiv = hostEl.querySelector('.draggable-item') as HTMLElement;
    document.body.appendChild(innerDiv);
    hostEl.remove();

    innerDiv.setAttribute('data-item-id', uniqueId);
    innerDiv.setAttribute('id', uniqueId);

    const sourceItemRef = items.find(i => i.label === sourceItem.label);
    if (sourceItemRef) {
      sourceItemRef.currentAvailableCount = (sourceItemRef.currentAvailableCount ?? sourceItemRef.maxAvailableCount ?? 1) - 1;
    }

    this.itemManager.componentRefs.set(uniqueId, componentRef);
    this.itemManager.clonedItems.push({
      id: uniqueId, type: sourceItem.type || '', label: sourceItem.label || '',
      size: sourceItem.size || 'large', helpText: sourceItem.helpText || '',
      spawningResource: sourceItem.spawningResource, resource: null,
      input: sourceItem.input, output: sourceItem.output,
      rate: sourceItem.rate,
    });
    this.itemManager.itemStates[uniqueId] = { col, row, isAtStartPosition: false };

    if (sourceItem.spawningResource) {
      this.spawnerIntervals.get(uniqueId)?.unsubscribe();
      const spawnRate = sourceItem.rate ?? 5000;
      const sub = timer(spawnRate, spawnRate).subscribe(() => {
        this.ngZone.run(() => {
          const adjacentOutput = this.resourceExchangeService.checkAdjacentOutput(col, row, this.itemManager.clonedItems, this.itemManager.itemStates);
          this.resourceExchangeService.onSpawnerPlaced(uniqueId, col, row, adjacentOutput, this.itemManager.clonedItems, this.itemManager.itemStates);
        });
      });
      this.spawnerIntervals.set(uniqueId, sub);
    }

    const gridContainer = document.getElementById('grid-items-container');
    if (gridContainer) {
      gridContainer.appendChild(innerDiv);
      this.factoryItemsService.placeItemInGrid(innerDiv, col * gridCellSizePx, row * gridCellSizePx);
    }

    this.connectionEvaluator.evaluate(
      conveyorGrid, this.itemManager.clonedItems,
      this.itemManager.itemStates, gridRowCount, gridColumns,
      (size) => this.layoutService.getItemSizePx(size, gridCellSizePx), gridCellSizePx,
    );
    detectChanges();
  }

  clearAllItems(items: DraggableItems[]): void {
    const ids = this.itemManager.clonedItems.map(i => i.id);
    for (const id of ids) {
      this.spawnerIntervals.get(id)?.unsubscribe();
      this.spawnerIntervals.delete(id);
      const el = document.getElementById(id);
      if (el) el.remove();
      this.itemManager.removeItem(id, items);
    }
  }

  removePlacedItem(target: HTMLElement, itemId: string): void {
    if (!this.opts) return;
    const { items, gridCellSizePx, conveyorGrid, gridRowCount, gridColumns, detectChanges, postRemove, getGridRect } = this.opts;

    this.spawnerIntervals.get(itemId)?.unsubscribe();
    this.spawnerIntervals.delete(itemId);
    this.itemManager.removeItem(itemId, items);
    target.remove();
    this.opts.onLayoutChange?.();

    this.connectionEvaluator.evaluate(
      conveyorGrid, this.itemManager.clonedItems,
      this.itemManager.itemStates, gridRowCount, gridColumns,
      (size) => this.layoutService.getItemSizePx(size, gridCellSizePx), gridCellSizePx,
    );
    detectChanges();

    requestAnimationFrame(() => {
      const gridRect = getGridRect();
      this.itemManager.captureBasePositions([...items, ...this.itemManager.clonedItems], gridRect);
      this.itemManager.repositionAll(gridCellSizePx, gridRect);
      postRemove();
    });
  }
}