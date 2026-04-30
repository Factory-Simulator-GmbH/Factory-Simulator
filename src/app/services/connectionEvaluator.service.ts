import { Injectable } from '@angular/core';
import { ConveyorSegment } from '../models/conveyorSegment.model';
import { DraggableItems, ItemSize } from '../models/draggableItem.model';
import { ItemState } from '../models/itemPosition.model';

@Injectable({ providedIn: 'root' })
export class ConnectionEvaluatorService {

  evaluate(
    conveyorGrid: ConveyorSegment[][],
    clonedItems: DraggableItems[],
    itemStates: Record<string, ItemState>,
    gridRowCount: number,
    gridColumns: number,
    getItemSizePx: (size: ItemSize) => number,
    gridCellSizePx: number,
  ): void {
    for (const item of clonedItems) {
      const state = itemStates[item.id];
      const element = document.getElementById(item.id);
      if (!element || !state) continue;

      const cellSpan = Math.max(1, Math.round(getItemSizePx(item.size) / gridCellSizePx));
      const { row: startRow, col: startCol } = state;
      let isConnected = false;

      outer: for (let r = startRow - 1; r <= startRow + cellSpan; r++) {
        for (let c = startCol - 1; c <= startCol + cellSpan; c++) {
          const isTopOrBottom = (r === startRow - 1 || r === startRow + cellSpan) && c >= startCol && c < startCol + cellSpan;
          const isLeftOrRight = (c === startCol - 1 || c === startCol + cellSpan) && r >= startRow && r < startRow + cellSpan;
          if ((isTopOrBottom || isLeftOrRight) && r >= 0 && r < gridRowCount && c >= 0 && c < gridColumns) {
            if (conveyorGrid[r]?.[c]?.active) { isConnected = true; break outer; }
          }
        }
      }

      (state as any).isConnected = isConnected;
      this.updateVisual(element, isConnected);
    }
  }

  private updateVisual(element: HTMLElement, isConnected: boolean): void {
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