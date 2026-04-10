import {Injectable} from '@angular/core';
import {ConveyorSegment} from '../models/conveyor-segment.model';
import {DraggableItems} from '../models/draggable-item.model';
import {ItemBasePosition, ItemState} from '../models/item-position.model';
import {LayoutService} from './layout.service';

@Injectable({
  providedIn: 'root',
})
export class FactoryItemsService {
  constructor(private layoutService: LayoutService) {
  }

  initializeItemStates(items: DraggableItems[]): Record<string, ItemState> {
    const itemStates: Record<string, ItemState> = {};

    for (const item of items) {
      itemStates[item.id] = {
        col: 0,
        row: 0,
        isAtStartPosition: true,
      };
    }

    return itemStates;
  }

  captureItemBasePositions(
    items: DraggableItems[],
    gridRect: DOMRect,
    itemStates?: Record<string, ItemState>,
    existingPositions?: Record<string, ItemBasePosition>,
  ): Record<string, ItemBasePosition> {
    const itemBasePositions: Record<string, ItemBasePosition> = {};

    for (const item of items) {
      const element = document.getElementById(item.id);
      if (!element) continue;

      const state = itemStates?.[item.id];

      // Bereits platzierte Items behalten ihre bestehende base-Position —
      // sonst würde das temporäre Entfernen des Transforms die Basis verfälschen
      if (state && !state.isAtStartPosition && existingPositions?.[item.id]) {
        itemBasePositions[item.id] = existingPositions[item.id];
        continue;
      }

      const oldTransform = element.style.transform;
      element.style.transform = '';

      const rect = element.getBoundingClientRect();

      itemBasePositions[item.id] = {
        x: rect.left - gridRect.left,
        y: rect.top - gridRect.top,
      };

      element.style.transform = oldTransform;
    }

    return itemBasePositions;
  }

  applyItemPosition(
    element: HTMLElement,
    col: number,
    row: number,
    itemBasePositions: Record<string, ItemBasePosition>,
    gridCellSizePx: number,
    gridRect?: DOMRect,
  ): void {
    // Wenn gridRect übergeben wird, messen wir die aktuelle DOM-Position frisch —
    // so ist der Translate korrekt, egal was im DOM passiert ist (Flex-Wrap, appendChild, etc.)
    let baseX: number;
    let baseY: number;

    if (gridRect) {
      const oldTransform = element.style.transform;
      element.style.transform = '';
      const rect = element.getBoundingClientRect();
      element.style.transform = oldTransform;
      baseX = rect.left - gridRect.left;
      baseY = rect.top - gridRect.top;
    } else {
      const base = itemBasePositions[element.id] ?? {x: 0, y: 0};
      baseX = base.x;
      baseY = base.y;
    }

    const translate = this.layoutService.getTranslateForGridPosition(
      baseX,
      baseY,
      col,
      row,
      gridCellSizePx,
    );

    element.style.transform = `translate(${translate.x}px, ${translate.y}px)`;
    element.setAttribute('data-x', String(translate.x));
    element.setAttribute('data-y', String(translate.y));
  }

  saveItemGridPosition(
    element: HTMLElement,
    itemBasePositions: Record<string, ItemBasePosition>,
    itemStates: Record<string, ItemState>,
    gridCellSizePx: number,
  ): void {
    const base = itemBasePositions[element.id] ?? {x: 0, y: 0};

    const translateX = Number(element.getAttribute('data-x') ?? '0');
    const translateY = Number(element.getAttribute('data-y') ?? '0');

    const absoluteX = base.x + translateX;
    const absoluteY = base.y + translateY;

    const col = this.layoutService.pxToGrid(absoluteX, gridCellSizePx);
    const row = this.layoutService.pxToGrid(absoluteY, gridCellSizePx);

    itemStates[element.id] = {
      col,
      row,
      isAtStartPosition: false,
    };
  }

  repositionAllItems(
    items: DraggableItems[],
    itemStates: Record<string, ItemState>,
    itemBasePositions: Record<string, ItemBasePosition>,
    gridCellSizePx: number,
    gridRect?: DOMRect,
  ): void {
    for (const item of items) {
      const element = document.getElementById(item.id);
      if (!element) continue;

      const state = itemStates[item.id];

      if (!state || state.isAtStartPosition) {
        element.style.transform = '';
        element.setAttribute('data-x', '0');
        element.setAttribute('data-y', '0');
        continue;
      }

      if (element.parentElement?.id === 'grid-items-container') {
        this.placeItemInGrid(element, state.col * gridCellSizePx, state.row * gridCellSizePx);
      } else {
        this.applyItemPosition(
          element,
          state.col,
          state.row,
          itemBasePositions,
          gridCellSizePx,
          gridRect,
        );
      }
    }
  }

  placeItemInGrid(element: HTMLElement, finalX: number, finalY: number) {
    element.style.position = 'absolute';
    element.style.left = '0px';
    element.style.top = '0px';
    element.style.transform = `translate(${finalX}px, ${finalY}px)`;
    element.setAttribute('data-x', String(finalX));
    element.setAttribute('data-y', String(finalY));
    element.style.pointerEvents = 'auto';
    element.style.zIndex = '';
  }

  isOverlappingWithItem(checkItem: HTMLElement, items: DraggableItems[]): boolean {
    const checkItemRect = checkItem.getBoundingClientRect();

    for (const item of items) {
      if (item.id === checkItem.id) continue;

      const itemRect = document.getElementById(item.id)?.getBoundingClientRect();
      if (!itemRect) continue;

      if (
        checkItemRect.top + 1.5 >= itemRect.bottom - 1.5 ||
        checkItemRect.right - 1.5 <= itemRect.left + 1.5 ||
        checkItemRect.bottom - 1.5 <= itemRect.top + 1.5 ||
        checkItemRect.left + 1.5 >= itemRect.right - 1.5
      ) {
        continue;
      }

      return true;
    }

    return false;
  }

  isOverlappingWithConveyor(
    checkItem: HTMLElement,
    conveyorRect: DOMRect,
    gridCellSizePx: number,
    gridRowCount: number,
    gridColumns: number,
    conveyorGrid: ConveyorSegment[][],
  ): boolean {
    const checkItemRect = checkItem.getBoundingClientRect();

    const x = checkItemRect.left - conveyorRect.left;
    const y = checkItemRect.top - conveyorRect.top;
    const width = checkItemRect.width;
    const height = checkItemRect.height;

    const colStart = Math.floor((x + 1) / gridCellSizePx);
    const rowStart = Math.floor((y + 1) / gridCellSizePx);
    const colEnd = Math.floor((x + width - 1) / gridCellSizePx);
    const rowEnd = Math.floor((y + height - 1) / gridCellSizePx);

    for (let row = rowStart; row <= rowEnd; row++) {
      for (let col = colStart; col <= colEnd; col++) {
        if (
          row >= 0 &&
          row < gridRowCount &&
          col >= 0 &&
          col < gridColumns &&
          conveyorGrid[row][col].active
        ) {
          return true;
        }
      }
    }

    return false;
  }
}
