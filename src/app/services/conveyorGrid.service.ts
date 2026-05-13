import {Injectable} from '@angular/core';
import {ConveyorSegment, Direction} from '../models/conveyorSegment.model';


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

    // Fehlende Entry/Exit aus bestehenden aktiven Nachbarzellen ableiten
    // (z.B. wenn eine Zelle einzeln neu platziert wird und an ein bestehendes Band anschliesst)
    for (const { row, col } of pathCells) {
      const cell = conveyorGrid[row][col];

      if (!cell.entry) {
        if (conveyorGrid[row]?.[col - 1]?.active && conveyorGrid[row]?.[col - 1]?.exit === 'right') cell.entry = 'left';
        else if (conveyorGrid[row]?.[col + 1]?.active && conveyorGrid[row]?.[col + 1]?.exit === 'left') cell.entry = 'right';
        else if (conveyorGrid[row - 1]?.[col]?.active && conveyorGrid[row - 1]?.[col]?.exit === 'down') cell.entry = 'up';
        else if (conveyorGrid[row + 1]?.[col]?.active && conveyorGrid[row + 1]?.[col]?.exit === 'up') cell.entry = 'down';
      }

      if (!cell.exit) {
        if (conveyorGrid[row]?.[col - 1]?.active && conveyorGrid[row]?.[col - 1]?.entry === 'right') cell.exit = 'left';
        else if (conveyorGrid[row]?.[col + 1]?.active && conveyorGrid[row]?.[col + 1]?.entry === 'left') cell.exit = 'right';
        else if (conveyorGrid[row - 1]?.[col]?.active && conveyorGrid[row - 1]?.[col]?.entry === 'down') cell.exit = 'up';
        else if (conveyorGrid[row + 1]?.[col]?.active && conveyorGrid[row + 1]?.[col]?.entry === 'up') cell.exit = 'down';
      }

      // Fallback: fehlende Richtung als Umkehrung der bekannten setzen (isolierter Start/End)
      if (!cell.entry && cell.exit === 'up') cell.entry = 'down';
      else if (!cell.entry && cell.exit === 'down') cell.entry = 'up';
      else if (!cell.entry && cell.exit === 'left') cell.entry = 'right';
      else if (!cell.entry && cell.exit === 'right') cell.entry = 'left';

      if (!cell.exit && cell.entry === 'up') cell.exit = 'down';
      else if (!cell.exit && cell.entry === 'down') cell.exit = 'up';
      else if (!cell.exit && cell.entry === 'left') cell.exit = 'right';
      else if (!cell.exit && cell.entry === 'right') cell.exit = 'left';

      // endpoint: false wenn die Ausgangsrichtung auf eine aktive Zelle zeigt
      if (cell.exit && cell.endpoint) {
        let nr = row, nc = col;
        if (cell.exit === 'up') nr--;
        else if (cell.exit === 'down') nr++;
        else if (cell.exit === 'left') nc--;
        else if (cell.exit === 'right') nc++;
        if (conveyorGrid[nr]?.[nc]?.active) cell.endpoint = false;
      }
    }

    // Nachbar-Zellen außerhalb von pathCells aktualisieren: wenn eine neu gemalte Zelle
    // an eine bestehende Endpoint-Zelle angrenzt, muss deren endpoint-Flag gecleart werden
    for (const { row, col } of pathCells) {
      for (const { dr, dc } of [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }]) {
        const neighbor = conveyorGrid[row + dr]?.[col + dc];
        if (!neighbor?.active || !neighbor.endpoint || !neighbor.exit) continue;
        let nr = row + dr, nc = col + dc;
        if (neighbor.exit === 'up') nr--;
        else if (neighbor.exit === 'down') nr++;
        else if (neighbor.exit === 'left') nc--;
        else if (neighbor.exit === 'right') nc++;
        if (conveyorGrid[nr]?.[nc]?.active) neighbor.endpoint = false;
      }
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
