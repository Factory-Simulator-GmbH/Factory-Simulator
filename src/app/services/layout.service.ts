import {Injectable} from '@angular/core';
import {ItemSize} from '../models/draggable-item.model';

@Injectable({
  providedIn: 'root',
})
export class LayoutService {
  getItemSizePx(size: ItemSize, gridCellSizePx: number): number {
    return size === 'large' ? gridCellSizePx * 3 : gridCellSizePx;
  }

  pxToGrid(valuePx: number, gridCellSizePx: number): number {
    if (!gridCellSizePx) return 0;
    return Math.round(valuePx / gridCellSizePx);
  }

  getTranslateForGridPosition(
    baseX: number,
    baseY: number,
    col: number,
    row: number,
    gridCellSizePx: number,
  ) {
    const targetX = col * gridCellSizePx;
    const targetY = row * gridCellSizePx;

    return {
      x: targetX - baseX,
      y: targetY - baseY,
    };
  }
}
