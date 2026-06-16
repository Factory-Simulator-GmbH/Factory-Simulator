import { Injectable } from '@angular/core';
import { ConveyorSegment, Direction } from '../models/conveyorSegment.model';

@Injectable({
  providedIn: 'root',
})
export class ConveyorGridService {
  
  createGrid(rows: number, cols: number): ConveyorSegment[][] {
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({
        active: false,
        entry: [], // Korrekte Objekt-Syntax (nicht cell.entry = [])
        exit: [],  // Korrekte Objekt-Syntax
        resource: null,
        endpoint: false, // Initialer Boolean-Wert
      }))
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
        // Arrays müssen beim Klonen kopiert werden, um Referenzfehler zu vermeiden
        next[row][col] = {
          active: grid[row][col].active,
          entry: [...grid[row][col].entry], 
          exit: [...grid[row][col].exit],   
          resource: grid[row][col].resource,
          endpoint: grid[row][col].endpoint,
        };
      }
    }

    return next;
  }

  // NEU: Diese Methode sammelt alle geänderten Zellen + deren Nachbarn und baut sie neu
  updateNeighborsAfterPlacement(
    conveyorGrid: ConveyorSegment[][],
    pathCells: { row: number; col: number }[]
  ): void {
    const cellsToUpdate = new Map<string, { row: number; col: number }>();

    // 1. Ursprüngliche Zellen hinzufügen
    pathCells.forEach(cell => {
      cellsToUpdate.set(`${cell.row}-${cell.col}`, cell);
      
      // 2. Alle potenziellen 4 Nachbarn hinzufügen (falls sie auf dem Grid existieren)
      const neighbors = [
        { row: cell.row - 1, col: cell.col }, // Up
        { row: cell.row + 1, col: cell.col }, // Down
        { row: cell.row, col: cell.col - 1 }, // Left
        { row: cell.row, col: cell.col + 1 }, // Right
      ];

      neighbors.forEach(n => {
        if (conveyorGrid[n.row]?.[n.col]?.active) {
          cellsToUpdate.set(`${n.row}-${n.col}`, n);
        }
      });
    });

    // 3. Rebuild für alle betroffenen Zellen ausführen
    this.rebuildPathDirections(conveyorGrid, Array.from(cellsToUpdate.values()));
  }

  rebuildPathDirections(
    conveyorGrid: ConveyorSegment[][],
    cellsToUpdate: { row: number; col: number }[],
  ): void {
    
    // Zuerst alle Arrays der betroffenen Zellen zurücksetzen
    for (const { row, col } of cellsToUpdate) {
      if (conveyorGrid[row]?.[col]) {
        conveyorGrid[row][col].entry = [];
        conveyorGrid[row][col].exit = [];
        conveyorGrid[row][col].endpoint = false;
      }
    }

    // Nun die Verbindungen basierend auf den Nachbarn neu berechnen
    for (const { row, col } of cellsToUpdate) {
      const cell = conveyorGrid[row][col];
      if (!cell.active) continue;

      const top = conveyorGrid[row - 1]?.[col];
      const bottom = conveyorGrid[row + 1]?.[col];
      const left = conveyorGrid[row]?.[col - 1];
      const right = conveyorGrid[row]?.[col + 1];

      // Nachbar OBEN (Top)
      if (top?.active) {
        if (!cell.entry.includes('up')) cell.entry.push('up' as Direction);
        if (!cell.exit.includes('up')) cell.exit.push('up' as Direction);
      }
      // Nachbar UNTEN (Bottom)
      if (bottom?.active) {
        if (!cell.entry.includes('down')) cell.entry.push('down' as Direction);
        if (!cell.exit.includes('down')) cell.exit.push('down' as Direction);
      }
      // Nachbar LINKS (Left)
      if (left?.active) {
        if (!cell.entry.includes('left')) cell.entry.push('left' as Direction);
        if (!cell.exit.includes('left')) cell.exit.push('left' as Direction);
      }
      // Nachbar RECHTS (Right)
      if (right?.active) {
        if (!cell.entry.includes('right')) cell.entry.push('right' as Direction);
        if (!cell.exit.includes('right')) cell.exit.push('right' as Direction);
      }

      // Endpoint-Logik: Ein Endpoint liegt vor, wenn das Band nur in EINE Richtung eine Verbindung hat
      const totalConnections = Array.from(new Set([...cell.entry, ...cell.exit])).length;
      if (totalConnections <= 1) {
        cell.endpoint = true;
      } else {
        cell.endpoint = false;
      }
    }
  }

  getConveyorSymbol(cell: ConveyorSegment): string {
    if (!cell.active) return '';

    // Kombiniere Entry und Exit um alle physischen Verbindungsrichtungen zu sehen
    const connections = Array.from(new Set([...cell.entry, ...cell.exit]));
    
    const hasUp = connections.includes('up' as Direction);
    const hasDown = connections.includes('down' as Direction);
    const hasLeft = connections.includes('left' as Direction);
    const hasRight = connections.includes('right' as Direction);

    const count = connections.length;

    // 4 Richtungen (Kreuzung)
    if (count === 4) return '╬';

    // 3 Richtungen (T-Stücke)
    if (count === 3) {
      if (!hasDown) return '┴';
      if (!hasUp) return '┬';
      if (!hasRight) return '┤';
      if (!hasLeft) return '├';
    }

    // 2 Richtungen (Geraden & Kurven)
    if (count === 2) {
      if (hasUp && hasDown) return '│';
      if (hasLeft && hasRight) return '─';
      if (hasDown && hasRight) return '┌';
      if (hasDown && hasLeft) return '┐';
      if (hasUp && hasRight) return '└';
      if (hasUp && hasLeft) return '┘';
    }

    // 1 Richtung (Endpunkte/Startpunkte)
    if (count === 1) {
      if (hasRight && cell.endpoint) return '→'; // Optional: Richtungs-Pfeile beibehalten
      if (hasLeft && cell.endpoint) return '←';
      if (hasUp && cell.endpoint) return '↑';
      if (hasDown && cell.endpoint) return '↓';
      
      // Fallback
      if (hasUp || hasDown) return '│';
      if (hasLeft || hasRight) return '─';
    }

    // Default Fallback
    return '─';
  }
}