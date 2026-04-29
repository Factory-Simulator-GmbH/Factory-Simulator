import { Injectable } from '@angular/core';
import { FactoryGridService } from './factory-grid.service';
import { ConveyorGridService } from './conveyor-grid.service';

@Injectable({
  providedIn: 'root'
})
export class ConnectionEvaluatorService {
  constructor(
    private gridService: FactoryGridService,
    private conveyorGrid: ConveyorGridService
  ) {}

  evaluateConnections(conveyorGrid: any[][], clonedItems: any[], itemStates: Record<string, any>, gridRowCount: number, gridColumns: number, gridCellSizePx: number, getItemSizePx: (size: any) => number): void {
    for (const item of clonedItems) {
      const state = itemStates[item.id];
      const element = document.getElementById(item.id);
      if (!element || !state) continue;
      const itemSizePx = getItemSizePx(item.size);
      const cellSpan = Math.max(1, Math.round(itemSizePx / gridCellSizePx));
      const startRow = state.row;
      const startCol = state.col;
      let isConnected = false;
      for (let r = startRow - 1; r <= startRow + cellSpan; r++) {
        for (let c = startCol - 1; c <= startCol + cellSpan; c++) {
          const isTopOrBottom = (r === startRow - 1 || r === startRow + cellSpan) && (c >= startCol && c < startCol + cellSpan);
          const isLeftOrRight = (c === startCol - 1 || c === startCol + cellSpan) && (r >= startRow && r < startRow + cellSpan);
          if (isTopOrBottom || isLeftOrRight) {
            if (r >= 0 && r < gridRowCount && c >= 0 && c < gridColumns) {
              if (conveyorGrid[r]?.[c]?.active) { isConnected = true; break; }
            }
          }
        }
        if (isConnected) break;
      }
      (state as any).isConnected = isConnected;
      this.updateVisualConnection(element, isConnected);
    }
  }

  private updateVisualConnection(element: HTMLElement, isConnected: boolean): void {
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