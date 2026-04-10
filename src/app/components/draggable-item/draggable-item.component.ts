import {Component, Input} from '@angular/core';
import {TooltipDirective} from '../../directives/tooltip.directive';
import {DraggableItems} from '../../models/draggable-item.model';

@Component({
  selector: 'app-draggable-item',
  standalone: true,
  imports: [TooltipDirective],
  template: `
    <div
      [appTooltip]="item.helpText || ''"
      class="grid draggable-item select-none place-items-center rounded-xl border border-white/20 bg-white/10 text-white shadow-sm backdrop-blur touch-none"
      [attr.data-item-id]="item.id"
      [attr.id]="itemId"
      [style.width.px]="sizePx"
      [style.height.px]="sizePx"
    >
      {{ item.label }}
    </div>
  `,
})
export class DraggableItemComponent {
  @Input() item!: DraggableItems;
  @Input() itemId!: string;
  @Input() sizePx!: number;
}
