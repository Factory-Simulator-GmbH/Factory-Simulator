import {Component, Input} from '@angular/core';
import {TooltipDirective} from '../../directives/tooltip.directive';
import {DraggableItems} from '../../models/draggableItem.model';

@Component({
  selector: 'app-draggable-item',
  standalone: true,
  imports: [TooltipDirective],
  templateUrl: './draggableItem.component.html',
})
export class DraggableItemComponent {
  @Input() item!: DraggableItems;
  @Input() itemId!: string;
  @Input() sizePx!: number;
}
