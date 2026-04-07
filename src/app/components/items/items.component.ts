import {Component, EventEmitter, Input, Output} from '@angular/core';
import {DraggableItems, ItemSize} from '../../models/draggable-item.model';
import {TooltipDirective} from '../../directives/tooltip.directive';

@Component({
  selector: 'app-items',
  standalone: true,
  imports: [TooltipDirective],
  templateUrl: './items.component.html',
})
export class ItemsComponent {
  @Input({required: true}) items!: DraggableItems[];
  @Input({required: true}) activeDraggedItemId!: string | null;
  @Input({required: true}) getItemSizePx!: (size: ItemSize) => number;
  @Input({required: true}) isDraggingItem!: boolean;

  @Output() itemMouseDown = new EventEmitter<string>();

  onMouseDown(itemId: string): void {
    this.itemMouseDown.emit(itemId);
  }
}
