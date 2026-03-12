import {Injectable} from '@angular/core';
import {ConveyorSegment, Direction} from '../models/conveyor-segment.model';

@Injectable({
  providedIn: 'root',
})
export class ConveyorGridService {
  createGrid(rows: number, cols: number): ConveyorSegment[][] {
    return Array.from({length: rows}, () =>
      Array.from({length: cols}, () => ({
        active: false,
        entry: null,
        exit: null,
      })),
    );
  }

  cloneGridToSize(
    grid: ConveyorSegment[][],
    rows: number,
    cols: number,
  ): ConveyorSegment[][] {
    const next = this.createGrid(rows, cols);

    for (let row = 0; row < Math.min(rows, grid.length); row++) {
      for (let col = 0; col < Math.min(cols, grid[row].length); col++) {
        next[row][col] = {
          active: grid[row][col].active,
          entry: grid[row][col].entry,
          exit: grid[row][col].exit,
        };
      }
    }

    return next;
  }

  rebuildPathDirections(
    conveyorGrid: ConveyorSegment[][],
    pathCells: { row: number; col: number }[],
  ): void {
    for (const {row, col} of pathCells) {
      conveyorGrid[row][col].entry = null;
      conveyorGrid[row][col].exit = null;
    }

    for (let i = 0; i < pathCells.length; i++) {
      const current = pathCells[i];
      const prev = pathCells[i - 1] ?? null;
      const next = pathCells[i + 1] ?? null;

      const cell = conveyorGrid[current.row][current.col];

      if (prev) {
        cell.entry = this.getDirection(prev.row, prev.col, current.row, current.col);
      }

      if (next) {
        cell.exit = this.getDirection(current.row, current.col, next.row, next.col);
      }
    }
  }

  getDirection(
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
  ): Direction | null {
    if (toRow === fromRow - 1 && toCol === fromCol) return 'up';
    if (toRow === fromRow + 1 && toCol === fromCol) return 'down';
    if (toRow === fromRow && toCol === fromCol - 1) return 'left';
    if (toRow === fromRow && toCol === fromCol + 1) return 'right';
    return null;
  }

  getConveyorSymbol(cell: ConveyorSegment): string {
    if (!cell.active) return '';

    if (cell.entry && cell.exit) {
      if (
        (cell.entry === 'left' && cell.exit === 'right') ||
        (cell.entry === 'right' && cell.exit === 'left')
      ) {
        return '─';
      }

      if (
        (cell.entry === 'up' && cell.exit === 'down') ||
        (cell.entry === 'down' && cell.exit === 'up')
      ) {
        return '│';
      }

      if (
        (cell.entry === 'up' && cell.exit === 'right') ||
        (cell.entry === 'left' && cell.exit === 'down')
      ) {
        return '┌';
      }

      if (
        (cell.entry === 'up' && cell.exit === 'left') ||
        (cell.entry === 'right' && cell.exit === 'down')
      ) {
        return '┐';
      }

      if (
        (cell.entry === 'down' && cell.exit === 'right') ||
        (cell.entry === 'left' && cell.exit === 'up')
      ) {
        return '└';
      }

      if (
        (cell.entry === 'down' && cell.exit === 'left') ||
        (cell.entry === 'right' && cell.exit === 'up')
      ) {
        return '┘';
      }
    }

    if (!cell.entry && cell.exit) {
      if (cell.exit === 'left' || cell.exit === 'right') return '─';
      if (cell.exit === 'up' || cell.exit === 'down') return '│';
    }

    if (cell.entry && !cell.exit) {
      if (cell.entry === 'right') return '→';
      if (cell.entry === 'left') return '←';
      if (cell.entry === 'up') return '↑';
      if (cell.entry === 'down') return '↓';
    }

    if (cell.entry === 'left' || cell.entry === 'right') return '─';
    if (cell.entry === 'up' || cell.entry === 'down') return '│';

    return '';
  }
}
