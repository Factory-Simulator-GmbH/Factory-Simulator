import { Injectable } from '@angular/core';
import { DraggableItems } from '../models/draggableItem.model';
import { ItemState } from '../models/itemPosition.model';
import { ConveyorSegment } from '../models/conveyorSegment.model';
import { Subject } from 'rxjs';

@Injectable({
    providedIn: 'root',
})
export class ResourceExchangeService {

    conveyorResourceChanged$ = new Subject<{ row: number; col: number; resource: string | null }>();
    itemResourceChanged$ = new Subject<{ itemid: string; resource: string | null }>();

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
    // prüft, ob neben einem Spawner ein Input liegt, und gibt die itemid des Items zurück oder null, wenn kein Output nebenan liegt
    checkAdjacentInput(
        conveyorCol: number,
        conveyorRow: number,
        items: DraggableItems[],
        itemStates: Record<string, ItemState>,
    ): { itemid: string } | null {
        const conveyorSize = 1;
        const minCol = conveyorCol - 1;
        const maxCol = conveyorCol + conveyorSize;
        const minRow = conveyorRow - 1;
        const maxRow = conveyorRow + conveyorSize;
        for (const item of items) {
            if (item.type !== 'input') continue;
            const state = itemStates[item.id];
            if (!state || state.isAtStartPosition) continue;
            const c = state.col;
            const r = state.row;
            const inRing = c >= minCol && c <= maxCol && r >= minRow && r <= maxRow;
            const insideConveyor =
                c >= conveyorCol && c < conveyorCol + conveyorSize &&
                r >= conveyorRow && r < conveyorRow + conveyorSize;
            const isCorner =
                (c === minCol && r === minRow) ||
                (c === maxCol && r === minRow) ||
                (c === minCol && r === maxRow) ||
                (c === maxCol && r === maxRow);
            if (inRing && !insideConveyor && !isCorner) return { itemid: item.id };
        }
        return null;
    }

    // prüft, ob neben einem Input eine Maschine liegt, und gibt deren Position zurück oder null
    checkAdjacentMachine(
        inputCol: number,
        inputRow: number,
        items: DraggableItems[],
        itemStates: Record<string, ItemState>,
    ): { col: number; row: number } | null {
        const machineSize = 3;
        for (const item of items) {
            if (item.type !== 'machine') continue;
            const state = itemStates[item.id];
            if (!state || state.isAtStartPosition) continue;
            const minCol = state.col - 1;
            const maxCol = state.col + machineSize;
            const minRow = state.row - 1;
            const maxRow = state.row + machineSize;
            const inRing = inputCol >= minCol && inputCol <= maxCol && inputRow >= minRow && inputRow <= maxRow;
            const insideMachine =
                inputCol >= state.col && inputCol < state.col + machineSize &&
                inputRow >= state.row && inputRow < state.row + machineSize;
            const isCorner =
                (inputCol === minCol && inputRow === minRow) ||
                (inputCol === maxCol && inputRow === minRow) ||
                (inputCol === minCol && inputRow === maxRow) ||
                (inputCol === maxCol && inputRow === maxRow);
            if (inRing && !insideMachine && !isCorner) return { col: state.col, row: state.row };
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
            if (conveyorGrid[n.row]?.[n.col]?.active && conveyorGrid[n.row]?.[n.col]?.entry === n.entry && conveyorGrid[n.row]?.[n.col]?.resource === null) {
                return { col: n.col, row: n.row };
            } else if (conveyorGrid[n.row]?.[n.col]?.active && conveyorGrid[n.row]?.[n.col]?.entry === n.entry && conveyorGrid[n.row]?.[n.col]?.resource !== null) {
                this.conveyorJam$.next({ row: n.row, col: n.col });
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
            if (outputState) {
                const outputItem = items.find(i => i.id === adjacentOutput.itemid);
                if (outputItem) {
                    outputItem.resource = items.find(i => i.id === id)?.spawningResource ?? null;
                    this.itemResourceChanged$.next({ itemid: adjacentOutput.itemid, resource: outputItem.resource });
                }
            }
        }
    }

    onOutputResourceChanged(
        id: string,
        col: number,
        row: number,
        adjacentConveyor: { col: number; row: number } | null,
        items: DraggableItems[],
        conveyorGrid: ConveyorSegment[][],
    ): void {
        if (adjacentConveyor) {
            const outputItem = items.find(i => i.id === id);
            conveyorGrid[adjacentConveyor.row][adjacentConveyor.col].resource = outputItem?.resource ?? null;
            const resource = conveyorGrid[adjacentConveyor.row][adjacentConveyor.col].resource;
            if (outputItem) {
                outputItem.resource = null;
                this.itemResourceChanged$.next({ itemid: id, resource: null });
            }
            this.conveyorResourceChanged$.next({
                row: adjacentConveyor.row,
                col: adjacentConveyor.col,
                resource,
            });
        }
    }

    onInputResourceChanged(
        id: string,
        col: number,
        row: number,
        adjacentMaschine: { col: number; row: number } | null,
        items: DraggableItems[],
        itemStates: Record<string, ItemState>,
    ): void {
        const inputItem = items.find(i => i.id === id);
        if (!inputItem?.resource) return;

        if (adjacentMaschine) {
            const machineItem = items.find(i =>
                i.type === 'machine' &&
                itemStates[i.id]?.col === adjacentMaschine.col &&
                itemStates[i.id]?.row === adjacentMaschine.row
            );
            if (machineItem) {
                machineItem.resource = inputItem.resource;
                this.itemResourceChanged$.next({ itemid: machineItem.id, resource: machineItem.resource });
                inputItem.resource = null;
                this.itemResourceChanged$.next({ itemid: id, resource: null });
            }
        }
    }
    onConveyorResourceChanged(
        resource: string | null,
        col: number,
        row: number,
        conveyorGrid: ConveyorSegment[][],
        items: DraggableItems[],
        itemStates: Record<string, ItemState>,
    ): boolean {
        const cell = conveyorGrid[row]?.[col];

        // 1. Erst prüfen ob Weitergabe an nächstes Rollband möglich
        if (cell?.active && cell.exit) {
            const nextCell = this.getNextCellByExit(cell.exit, col, row);
            const next = conveyorGrid[nextCell.row]?.[nextCell.col];
            if (next?.active) {
                if (next.resource === null) {
                    next.resource = resource;
                    this.conveyorResourceChanged$.next({ row: nextCell.row, col: nextCell.col, resource });
                    return true;
                } else {
                    this.conveyorJam$.next({ row: nextCell.row, col: nextCell.col });
                    return false;
                }
            }
        }

        // 2. Prüfen ob Weitergabe an Input möglich
        if (!cell) return false;
        const adjacentInput = this.checkAdjacentInput(col, row, items, itemStates);
        if (adjacentInput) {
            const inputState = itemStates[adjacentInput.itemid];
            if (inputState) {
                const inputItem = items.find(i => i.id === adjacentInput.itemid);
                if (inputItem) {
                    inputItem.resource = resource;
                    cell.resource = null;
                    this.conveyorResourceChanged$.next({ row, col, resource: null });
                    this.itemResourceChanged$.next({ itemid: adjacentInput.itemid, resource: inputItem.resource });
                }
            }
        }
        return false;
    }

    private getNextCellByExit(exit: string, col: number, row: number): { col: number; row: number } {
        if (exit === 'up') return { col, row: row - 1 };
        if (exit === 'down') return { col, row: row + 1 };
        if (exit === 'left') return { col: col - 1, row };
        if (exit === 'right') return { col: col + 1, row };
        return { col, row };
    }
}
