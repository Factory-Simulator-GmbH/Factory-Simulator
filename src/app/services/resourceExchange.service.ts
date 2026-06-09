import { Injectable } from '@angular/core';
import { DraggableItems } from '../models/draggableItem.model';
import { ItemState } from '../models/itemPosition.model';
import { ConveyorSegment } from '../models/conveyorSegment.model';

@Injectable({
    providedIn: 'root',
})
export class ResourceExchangeService {

    // Resultat eines Tick-Durchlaufs: welche Items/Conveyor-Zellen sich geändert haben,
    // damit die Page nur die betroffenen Badges neu zeichnen muss.
    // changedInputs: Inputs, die in diesem Tick einer Maschine zugeordnet wurden, samt
    // Info ob die Maschine die Ressource akzeptiert (grün) oder nicht (rot).

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
            }
        }
        return null;
    }

    // Wird beim Platzieren eines Spawners aufgerufen: legt die Ressource direkt auf
    // einen daneben liegenden Output. Die Weitergabe übernimmt danach tick().
    onSpawnerPlaced(
        id: string,
        col: number,
        row: number,
        adjacentOutput: { itemid: string } | null,
        items: DraggableItems[],
        itemStates: Record<string, ItemState>,
    ): void {
        if (!adjacentOutput) return;
        const outputState = itemStates[adjacentOutput.itemid];
        if (!outputState) return;
        const outputItem = items.find(i => i.id === adjacentOutput.itemid);
        if (outputItem && !outputItem.resource) {
            outputItem.resource = items.find(i => i.id === id)?.spawningResource ?? null;
        }
    }

    // Verarbeitet den gesamten Spielstand genau einmal (ein "Tick").
    // Reihenfolge: Senke zuerst (Input→Maschine, Conveyor→Input, Conveyor→Conveyor,
    // Output→Conveyor), damit eine Ressource pro Tick höchstens ein Feld weiterrückt.
    // Bereits in diesem Tick befüllte Conveyor-Zellen werden gemerkt, damit eine frisch
    // aufgelegte Ressource nicht im selben Tick weiterspringt.
    // Gibt die geänderten Item-Ids zurück (für Badge-Aktualisierung) sowie die
    // Input→Maschine-Zuordnungen für die grün/rot-Markierung.
    tick(
        items: DraggableItems[],
        itemStates: Record<string, ItemState>,
        conveyorGrid: ConveyorSegment[][],
    ): { changedItems: Set<string>; inputs: { inputId: string; accepted: boolean }[] } {
        const changedItems = new Set<string>();
        const inputs: { inputId: string; accepted: boolean }[] = [];
        const filledThisTick = new Set<string>();
        const key = (c: number, r: number) => `${c},${r}`;

        // 1. Input → Maschine
        for (const input of items) {
            if (input.type !== 'input' || !input.resource) continue;
            const state = itemStates[input.id];
            if (!state || state.isAtStartPosition) continue;
            const adjacentMachine = this.checkAdjacentMachine(state.col, state.row, items, itemStates);
            if (!adjacentMachine) continue;
            const machineItem = items.find(i =>
                i.type === 'machine' &&
                itemStates[i.id]?.col === adjacentMachine.col &&
                itemStates[i.id]?.row === adjacentMachine.row
            );
            if (!machineItem) continue;
            const accepted = !!(machineItem.input && input.resource in machineItem.input);
            inputs.push({ inputId: input.id, accepted });
            if (accepted) {
                machineItem.resource = input.resource;
                input.resource = null;
                changedItems.add(machineItem.id);
                changedItems.add(input.id);
            }
        }

        // 2. Conveyor → Input
        for (let row = 0; row < conveyorGrid.length; row++) {
            const cols = conveyorGrid[row]?.length ?? 0;
            for (let col = 0; col < cols; col++) {
                const cell = conveyorGrid[row][col];
                if (!cell?.active || !cell.resource) continue;
                const adjacentInput = this.checkAdjacentInput(col, row, items, itemStates);
                if (!adjacentInput) continue;
                const inputItem = items.find(i => i.id === adjacentInput.itemid);
                if (inputItem && !inputItem.resource) {
                    inputItem.resource = cell.resource;
                    cell.resource = null;
                    changedItems.add(adjacentInput.itemid);
                }
            }
        }

        // 3. Conveyor → Conveyor (entlang exit)
        for (let row = 0; row < conveyorGrid.length; row++) {
            const cols = conveyorGrid[row]?.length ?? 0;
            for (let col = 0; col < cols; col++) {
                const cell = conveyorGrid[row][col];
                if (!cell?.active || !cell.resource || !cell.exit) continue;
                if (filledThisTick.has(key(col, row))) continue;
                const nextCell = this.getNextCellByExit(cell.exit, col, row);
                const next = conveyorGrid[nextCell.row]?.[nextCell.col];
                if (next?.active && next.resource === null) {
                    next.resource = cell.resource;
                    cell.resource = null;
                    filledThisTick.add(key(nextCell.col, nextCell.row));
                }
            }
        }

        // 4. Output → Conveyor
        for (const output of items) {
            if (output.type !== 'output' || !output.resource) continue;
            const state = itemStates[output.id];
            if (!state || state.isAtStartPosition) continue;
            const adjacentConveyor = this.checkAdjacentConveyor(state.col, state.row, conveyorGrid);
            if (!adjacentConveyor) continue;
            conveyorGrid[adjacentConveyor.row][adjacentConveyor.col].resource = output.resource;
            output.resource = null;
            changedItems.add(output.id);
        }

        return { changedItems, inputs };
    }

    private getNextCellByExit(exit: string, col: number, row: number): { col: number; row: number } {
        if (exit === 'up') return { col, row: row - 1 };
        if (exit === 'down') return { col, row: row + 1 };
        if (exit === 'left') return { col: col - 1, row };
        if (exit === 'right') return { col: col + 1, row };
        return { col, row };
    }
}
