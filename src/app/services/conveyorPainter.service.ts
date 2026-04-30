import { Injectable } from '@angular/core';
import { FactoryGridService } from './factoryGrid.service';
import { InteractionStateService } from './interactionState.service';
import { ConveyorSegment } from '../models/conveyorSegment.model';

@Injectable({ providedIn: 'root' })
export class ConveyorPainterService {
  constructor(
    private gridService: FactoryGridService,
    private interactionState: InteractionStateService,
  ) {}

  startPainting(conveyorGrid: ConveyorSegment[][], row: number, col: number, mode: 'on' | 'off'): void {
    this.interactionState.paintMode = mode;
    this.interactionState.previewCells.clear();
    this.interactionState.touchedCells.clear();
    this.interactionState.pathCells = [];
    this.applyPreview(conveyorGrid, row, col);
  }

  continuePainting(conveyorGrid: ConveyorSegment[][], row: number, col: number): void {
    if (!this.interactionState.paintMode) return;
    this.applyPreview(conveyorGrid, row, col);
  }

  private applyPreview(conveyorGrid: ConveyorSegment[][], row: number, col: number): void {
    this.gridService.applyPreview(
      conveyorGrid, row, col,
      this.interactionState.paintMode as 'on' | 'off',
      this.interactionState.touchedCells,
      this.interactionState.previewCells,
      this.interactionState.pathCells,
    );
  }
}