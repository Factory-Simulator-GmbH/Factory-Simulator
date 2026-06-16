import { Injectable } from '@angular/core';
import { ConveyorSegment } from '../models/conveyorSegment.model';
import { ConveyorGridService } from './conveyorGrid.service';

@Injectable({
  providedIn: 'root',
})
export class FactoryGridService {
  constructor(private conveyorGridService: ConveyorGridService) {}

  calculateColumns(gridCellSizePx: number, availableWidthPx: number): number {
    return Math.max(1, Math.floor(availableWidthPx / gridCellSizePx)) * 2;
  }

  createOrResizeGrid(
    currentGrid: ConveyorSegment[][],
    rowCount: number,
    columnCount: number,
  ): ConveyorSegment[][] {
    if (!currentGrid.length) {
      return this.conveyorGridService.createGrid(rowCount, columnCount);
    }

    return this.conveyorGridService.cloneGridToSize(
      currentGrid,
      rowCount,
      columnCount,
    );
  }

  key(r: number, c: number): string {
    return `${r}:${c}`;
  }

  applyPreview(
    conveyorGrid: ConveyorSegment[][],
    rowIndex: number,
    colIndex: number,
    paintMode: 'on' | 'off',
    touchedCells: Set<string>,
    previewCells: Set<string>,
    pathCells: { row: number; col: number }[],
  ): void {
    const key = this.key(rowIndex, colIndex);

    if (touchedCells.has(key)) return;

    touchedCells.add(key);
    previewCells.add(key);

    if (paintMode === 'off') {
      // 1. Arrays nutzen statt null
      // 2. endpoint als Boolean (false) initialisieren
      conveyorGrid[rowIndex][colIndex] = {
        active: false,
        entry: [],
        exit: [],
        resource: null,
        endpoint: false,
      };
      
      // 3. WICHTIG: Die gelöschte Zelle muss registriert werden,
      // damit benachbarte Bänder ihre Verbindungen kappen können.
      pathCells.push({ row: rowIndex, col: colIndex });
      
      // Update direkt nach dem Löschen triggern
      this.conveyorGridService.updateNeighborsAfterPlacement(conveyorGrid, pathCells);
      return;
    }

    // Beim Malen ('on'):
    conveyorGrid[rowIndex][colIndex].active = true;
    pathCells.push({ row: rowIndex, col: colIndex });

    // 4. Die neue Update-Methode aufrufen, die Nachbarn automatisch mit einbezieht
    this.conveyorGridService.updateNeighborsAfterPlacement(conveyorGrid, pathCells);
  }

  getConveyorSymbol(cell: ConveyorSegment): string {
    return this.conveyorGridService.getConveyorSymbol(cell);
  }
}