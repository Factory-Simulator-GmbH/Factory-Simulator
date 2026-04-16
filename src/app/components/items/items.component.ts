import {Component, EventEmitter, Input, Output} from '@angular/core';
import {DraggableItems, ItemSize} from '../../models/draggable-item.model';
import {TooltipDirective} from '../../directives/tooltip.directive';

@Component({
  selector: 'app-items',
  standalone: true,
  imports: [TooltipDirective],
  templateUrl: './items.component.html',
  styleUrl: './items.component.scss'
})
export class ItemsComponent {
  @Input({required: true}) items!: DraggableItems[];
  @Input({required: true}) activeDraggedItemId!: string | null;
  @Input({required: true}) getItemSizePx!: (size: ItemSize) => number;
  @Input({required: true}) isDraggingItem!: boolean;

  @Output() itemMouseDown = new EventEmitter<{ itemId: string; event: MouseEvent }>();

  onMouseDown(itemId: string, event: MouseEvent): void {
    this.itemMouseDown.emit({ itemId, event });
  }

  isAvailable(itemId: string): boolean {
    return this.items.find(i => i.id === itemId)?.currentAvailableCount !== 0;
  }
}
