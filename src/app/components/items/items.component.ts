import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {DraggableItems, ItemSize} from '../../models/draggable-item.model';
import {TooltipDirective} from '../../directives/tooltip.directive';
import {TitleCasePipe} from '@angular/common';

@Component({
  selector: 'app-items',
  standalone: true,
  imports: [TooltipDirective, TitleCasePipe],
  templateUrl: './items.component.html',
  styleUrl: './items.component.scss'
})
export class ItemsComponent implements OnInit {
  @Input({required: true}) items!: DraggableItems[];
  @Input({required: true}) activeDraggedItemId!: string | null;
  @Input({required: true}) getItemSizePx!: (size: ItemSize) => number;
  @Input({required: true}) isDraggingItem!: boolean;
  @Input() tooltipsEnabled = true;

  @Output() itemMouseDown = new EventEmitter<{ itemId: string; event: MouseEvent }>();

  filters: string[] = [];
  activeFilter: string | null = null;

  ngOnInit(): void {
    for (let item of this.items) {
      if (!this.filters.includes(item.type)) {
        this.filters.push(item.type);
      }
    }
  }

  onMouseDown(itemId: string, event: MouseEvent): void {
    this.itemMouseDown.emit({ itemId, event });
  }

  isAvailable(itemId: string): boolean {
    return this.items.find(i => i.id === itemId)?.currentAvailableCount !== 0;
  }

  setActiveFilter(filter: string) {
    if (this.activeFilter === filter) {
      this.activeFilter = null;
    } else {
      this.activeFilter = filter;
    }
    console.log(this.activeFilter)
  }
}
