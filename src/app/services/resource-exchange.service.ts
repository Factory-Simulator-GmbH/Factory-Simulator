import { Injectable } from '@angular/core';
import { DraggableItems } from '../models/draggable-item.model';
import { ItemState } from '../models/item-position.model';
import { ConveyorSegment } from '../models/conveyor-segment.model';
import { Subject } from 'rxjs';

@Injectable({
    providedIn: 'root',
})
export class ResourceExchangeService {

    resourceChanged$ = new Subject<{ row: number; col: number; resource: string | null }>();

    // prüft, ob neben einem Spawner ein Output liegt, und gibt die itemid des Outputs zurück oder null, wenn kein Output nebenan liegt
    checkAdjacentOutput(
        spawnerCol: number,
        spawnerRow: number,
        items: DraggableItems[],
        itemStates: Record<string, ItemState>,
    ): { itemid: string } | null {
        const spawnerSize = 3;
        const minCol = spawnerCol - 1;
        const maxCol = spawnerCol + spawnerSize;
        const minRow = spawnerRow - 1;
        const maxRow = spawnerRow + spawnerSize;
        for (const item of items) {
            if (item.type !== 'output') continue;
            const state = itemStates[item.id];
            if (!state || state.isAtStartPosition) continue;
            const c = state.col;
            const r = state.row;
            const inRing = c >= minCol && c <= maxCol && r >= minRow && r <= maxRow;
            const insideSpawner =
                c >= spawnerCol && c < spawnerCol + spawnerSize &&
                r >= spawnerRow && r < spawnerRow + spawnerSize;
            const isCorner =
                (c === minCol && r === minRow) ||
                (c === maxCol && r === minRow) ||
                (c === minCol && r === maxRow) ||
                (c === maxCol && r === maxRow);
            if (inRing && !insideSpawner && !isCorner) return { itemid: item.id };
        }
        return null;
    }
    // prüft, ob neben einem Output ein aktives Rollband liegt, und gibt die Koordinaten des Rollbands zurück oder null, wenn kein Rollband nebenan liegt
    checkAdjacentConveyor(
        outputCol: number,
        outputRow: number,
        conveyorGrid: ConveyorSegment[][],
    ): { col: number; row: number } | null {
        const neighbors = [
            { col: outputCol, row: outputRow - 1, entry: 'down' },
            { col: outputCol, row: outputRow + 1, entry: 'up' },
            { col: outputCol - 1, row: outputRow, entry: 'right' },
            { col: outputCol + 1, row: outputRow, entry: 'left' },
        ];
        for (const n of neighbors) {
            if (conveyorGrid[n.row]?.[n.col]?.active && conveyorGrid[n.row]?.[n.col]?.entry === n.entry) {
                return { col: n.col, row: n.row };
            }
        }
        return null;
    }

    onSpawnerPlaced(
        id: string,
        col: number,
        row: number,
        adjacentOutput: { itemid: string } | null,
        items: DraggableItems[],
        itemStates: Record<string, ItemState>,
    ): void {
        if (adjacentOutput) {
            const outputState = itemStates[adjacentOutput.itemid];
            console.log(`Spawner "${id}" platziert bei (${col}, ${row}). Output "${adjacentOutput.itemid}" nebenan bei (${outputState?.col}, ${outputState?.row})`);
            if (outputState) {
                const outputItem = items.find(i => i.id === adjacentOutput.itemid);
                if (outputItem) {
                    outputItem.resource = items.find(i => i.id === id)?.spawningResource ?? null;
                    console.log(`Ressource "${outputItem.resource}" in Output "${adjacentOutput.itemid}" gespeichert.`);
                }
            }
        } else {
            console.log(`Spawner "${id}" platziert bei (${col}, ${row}). Kein Output nebenan.`);
        }
    }

    onOutputPlaced(
        id: string,
        col: number,
        row: number,
        adjacentConveyor: { col: number; row: number } | null,
        items: DraggableItems[],
        conveyorGrid: ConveyorSegment[][],
    ): void {
        if (adjacentConveyor) {
            console.log(`Output "${id}" platziert bei (${col}, ${row}). Rollband nebenan bei (${adjacentConveyor.col}, ${adjacentConveyor.row})`);
            conveyorGrid[adjacentConveyor.row][adjacentConveyor.col].resource = items.find(i => i.id === id)?.resource ?? null;
            const resource = conveyorGrid[adjacentConveyor.row][adjacentConveyor.col].resource;
            console.log(`Ressource "${resource}" in Rollband bei (${adjacentConveyor.col}, ${adjacentConveyor.row}) platziert.`);
            this.resourceChanged$.next({
                row: adjacentConveyor.row,
                col: adjacentConveyor.col,
                resource,
            });
        } else {
            console.log(`Output "${id}" platziert bei (${col}, ${row}). Kein Rollband nebenan.`);
        }
    }
    onConveyorResourceChanged(
        resource: string | null,
        col: number,
        row: number,
        conveyorGrid: ConveyorSegment[][],
    ): void {
        const cell = conveyorGrid[row]?.[col];
        if (!cell?.active || !cell.exit) return;

        const nextCell = this.getNextCellByExit(cell.exit, col, row);
        const next = conveyorGrid[nextCell.row]?.[nextCell.col];
        if (!next?.active) return;

        next.resource = resource;
        console.log(`Ressource "${resource}" weitergegeben an Rollband bei (${nextCell.col}, ${nextCell.row}).`);
        this.resourceChanged$.next({ row: nextCell.row, col: nextCell.col, resource });
    }

    private getNextCellByExit(exit: string, col: number, row: number): { col: number; row: number } {
        if (exit === 'up')    return { col, row: row - 1 };
        if (exit === 'down')  return { col, row: row + 1 };
        if (exit === 'left')  return { col: col - 1, row };
        if (exit === 'right') return { col: col + 1, row };
        return { col, row };
    }   
}
