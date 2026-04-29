import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-minimap',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="minimap-container relative w-48 h-32 bg-gray-900/80 rounded-lg overflow-hidden border border-gray-700">
      <!-- Minimap Content -->
      <div #minimapContent class="absolute inset-0" (mousedown)="onMouseDown($event)">
        <!-- Items -->
        <div *ngFor="let item of items"
             class="absolute bg-blue-500 rounded-sm"
             [style.left.%]="(item.col / totalCols) * 100"
             [style.top.%]="(item.row / totalRows) * 100"
             [style.width.%]="(item.span / totalCols) * 100"
             [style.height.%]="(item.span / totalRows) * 100">
        </div>
      </div>
      
      <!-- Viewport Indicator -->
      <div class="absolute border-2 border-yellow-400/80 pointer-events-none transition-all duration-75"
           [style.left]="viewport.left"
           [style.top]="viewport.top"
           [style.width]="viewport.width"
           [style.height]="viewport.height">
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .minimap-container { box-shadow: 0 0 10px rgba(0,0,0,0.5); }
  `]
})
export class MinimapComponent {
  @Input() items: { id: string; col: number; row: number; span: number }[] = [];
  @Input() viewport = { left: '0%', top: '0%', width: '100%', height: '100%' };
  @Input() totalRows = 30;
  @Input() totalCols = 50;
  
  @Output() navigate = new EventEmitter<MouseEvent>();

  onMouseDown(event: MouseEvent): void {
    this.navigate.emit(event);
  }
}