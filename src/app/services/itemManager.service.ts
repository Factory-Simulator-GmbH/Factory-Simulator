import { ApplicationRef, ComponentRef, Injectable } from '@angular/core';
import { DraggableItems } from '../models/draggableItem.model';
import { ItemBasePosition, ItemState } from '../models/itemPosition.model';
import { DraggableItemComponent } from '../components/draggableItem/draggableItem.component';
import { FactoryItemsService } from './factoryItems.service';
import { ConveyorSegment } from '../models/conveyorSegment.model';

@Injectable({ providedIn: 'root' })
export class ItemManagerService {
  clonedItems: DraggableItems[] = [];
  itemStates: Record<string, ItemState> = {};
  itemBasePositions: Record<string, ItemBasePosition> = {};
  componentRefs = new Map<string, ComponentRef<DraggableItemComponent>>();

  constructor(
    private factoryItemsService: FactoryItemsService,
    private appRef: ApplicationRef,
  ) {}

  initializeStates(items: DraggableItems[]): void {
    this.itemStates = this.factoryItemsService.initializeItemStates(items);
  }

  captureBasePositions(allItems: DraggableItems[], gridRect: DOMRect): void {
    this.itemBasePositions = this.factoryItemsService.captureItemBasePositions(
      allItems, gridRect, this.itemStates, this.itemBasePositions,
    );
  }

  repositionAll(gridCellSizePx: number, gridRect: DOMRect): void {
    this.factoryItemsService.repositionAllItems(
      this.clonedItems, this.itemStates, this.itemBasePositions, gridCellSizePx, gridRect,
    );
  }

  removeItem(itemId: string, items: DraggableItems[]): void {
    const state = this.itemStates[itemId];
    if (state && !state.isAtStartPosition) {
      const clone = this.clonedItems.find(i => i.id === itemId);
      const sourceItem = items.find(i => i.label === clone?.label);
      if (sourceItem) sourceItem.currentAvailableCount = (sourceItem.currentAvailableCount ?? 0) + 1;
    }

    const ref = this.componentRefs.get(itemId);
    if (ref) {
      this.appRef.detachView(ref.hostView);
      ref.destroy();
      this.componentRefs.delete(itemId);
    }

    this.clonedItems = this.clonedItems.filter(i => i.id !== itemId);
    delete this.itemStates[itemId];
  }

  isOverlapping(checkItem: HTMLElement, conveyorGrid: ConveyorSegment[][], gridRowCount: number, gridColumns: number, gridCellSizePx: number, gridRect: DOMRect): boolean {
    return (
      this.factoryItemsService.isOverlappingWithItem(checkItem, this.clonedItems) ||
      this.factoryItemsService.isOverlappingWithConveyor(checkItem, gridRect, gridCellSizePx, gridRowCount, gridColumns, conveyorGrid)
    );
  }
}