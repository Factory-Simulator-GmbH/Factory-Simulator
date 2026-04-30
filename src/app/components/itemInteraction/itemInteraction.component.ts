import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-item-interaction',
  standalone: true,
  imports: [CommonModule],
  template: ``,
  styles: []
})
export class ItemInteractionComponent {
  @Input() itemStates: Record<string, any> = {};
  @Input() clonedItems: any[] = [];
  @Input() isDraggingItem = false;
  @Input() activeDraggedItemId: string | null = null;

  @Output() itemMouseDown = new EventEmitter<{ itemId: string; event: MouseEvent }>();
  @Output() contextMenu = new EventEmitter<{ itemId: string; event: MouseEvent }>();

  onItemMouseDown(itemId: string, event: MouseEvent): void {
    if (event.button === 2) return;
    const state = this.itemStates[itemId];
    if (state?.isConnected) return;
    this.itemMouseDown.emit({ itemId, event });
  }

  onContextMenu(itemId: string, event: MouseEvent): void {
    event.preventDefault();
    this.contextMenu.emit({ itemId, event });
  }

  isConnected(itemId: string): boolean {
    return this.itemStates[itemId]?.isConnected ?? false;
  }

  isDragging(itemId: string): boolean {
    return this.activeDraggedItemId === itemId;
  }
}