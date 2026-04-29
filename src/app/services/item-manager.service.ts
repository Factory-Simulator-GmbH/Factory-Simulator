import { Injectable } from '@angular/core';
import { DraggableItems } from '../models/draggable-item.model';
import { ItemState, ItemBasePosition } from '../models/item-position.model';
import { FactoryItemsService } from './factory-items.service';

@Injectable({
  providedIn: 'root'
})
export class ItemManagerService {
  private clonedItems: DraggableItems[] = [];
  private itemStates: Record<string, ItemState> = {};
  private itemBasePositions: Record<string, ItemBasePosition> = {};

  constructor(private factoryItemsService: FactoryItemsService) {}

  setItems(clonedItems: DraggableItems[], itemStates: Record<string, ItemState>, itemBasePositions: Record<string, ItemBasePosition>): void {
    this.clonedItems = clonedItems;
    this.itemStates = itemStates;
    this.itemBasePositions = itemBasePositions;
  }

  initializeItemStates(items: DraggableItems[]): Record<string, ItemState> {
    return this.factoryItemsService.initializeItemStates(items);
  }

  captureBasePositions(allItems: any[], gridRect: DOMRect): Record<string, ItemBasePosition> {
    return this.factoryItemsService.captureItemBasePositions(
      allItems,
      gridRect,
      this.itemStates,
      this.itemBasePositions,
    );
  }

  repositionAll(gridCellSizePx: number, gridRect: DOMRect): void {
    this.factoryItemsService.repositionAllItems(
      this.clonedItems,
      this.itemStates,
      this.itemBasePositions,
      gridCellSizePx,
      gridRect,
    );
  }

  isOverlapping(checkItem: HTMLElement, conveyorGrid: any[][], gridRowCount: number, gridColumns: number, gridCellSizePx: number, gridRect: DOMRect): boolean {
    return (
      this.factoryItemsService.isOverlappingWithItem(checkItem, this.clonedItems) ||
      this.factoryItemsService.isOverlappingWithConveyor(checkItem, gridRect, gridCellSizePx, gridRowCount, gridColumns, conveyorGrid)
    );
  }

  placeItem(element: HTMLElement, x: number, y: number): void {
    this.factoryItemsService.placeItemInGrid(element, x, y);
  }

  getClonedItems(): DraggableItems[] {
    return this.clonedItems;
  }

  getItemStates(): Record<string, ItemState> {
    return this.itemStates;
  }
}