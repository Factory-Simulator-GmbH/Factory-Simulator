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
        resource: null,
        endpoint: null,
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
          resource: grid[row][col].resource,
          endpoint: grid[row][col].endpoint,
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
        cell.entry = this.getEntryDirection(prev.row, prev.col, current.row, current.col);
      }

      if (next) {
        cell.exit = this.getExitDirection(current.row, current.col, next.row, next.col);
        
      }
      if (pathCells[0] === current) {
        if (cell.exit === 'up') cell.entry = 'down';
        if (cell.exit === 'down') cell.entry = 'up';
        if (cell.exit === 'left') cell.entry = 'right';
        if (cell.exit === 'right') cell.entry = 'left';
        
      }
      if(pathCells.length === i + 1){
        if (cell.entry === 'up') cell.exit = 'down';
        if (cell.entry === 'down') cell.exit = 'up';
        if (cell.entry === 'left') cell.exit = 'right';
        if (cell.entry === 'right') cell.exit = 'left';
        cell.endpoint = true;
      }
      else {
        cell.endpoint = false;
      }
      console.log(`Zelle: (${current.row}, ${current.col}), Entry: ${cell.entry}, Exit: ${cell.exit}`);
      
    }
  }

  getExitDirection(
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

  getEntryDirection(
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
  ): Direction | null {
    if (toRow === fromRow + 1 && toCol === fromCol) return 'up';
    if (toRow === fromRow - 1 && toCol === fromCol) return 'down';
    if (toRow === fromRow && toCol === fromCol + 1) return 'left';
    if (toRow === fromRow && toCol === fromCol - 1) return 'right';
    return null;
  }
  

  getConveyorSymbol(cell: ConveyorSegment): string {
    if (!cell.active) return '';

    if (cell.endpoint) {
        if (cell.exit === 'right') return '→';
        if (cell.exit === 'left') return '←';
        if (cell.exit === 'up') return '↑';
        if (cell.exit === 'down') return '↓';
    }
    

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
        (cell.entry === 'down' && cell.exit === 'right') ||
        (cell.entry === 'right' && cell.exit === 'down')
      ) {
        return '┌';
      }

      if (
        (cell.entry === 'down' && cell.exit === 'left') ||
        (cell.entry === 'left' && cell.exit === 'down')
      ) {
        return '┐';
      }

      if (
        (cell.entry === 'up' && cell.exit === 'right') ||
        (cell.entry === 'right' && cell.exit === 'up')
      ) {
        return '└';
      }

      if (
        (cell.entry === 'up' && cell.exit === 'left') ||
        (cell.entry === 'left' && cell.exit === 'up')
      ) {
        return '┘';
      }
    }

    if (!cell.entry && cell.exit) {
      if (cell.exit === 'left' || cell.exit === 'right') return '─';
      if (cell.exit === 'up' || cell.exit === 'down') return '│';
    }

    if (cell.entry === 'left' || cell.entry === 'right') return '─';
    if (cell.entry === 'up' || cell.entry === 'down') return '│';

    return '';
  }
}
