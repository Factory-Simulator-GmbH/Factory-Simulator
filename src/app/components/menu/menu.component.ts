import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Menu Button -->
    <button (click)="toggleMenu.emit()" 
            class="fixed top-4 right-4 z-50 p-2 bg-gray-800/90 hover:bg-gray-700 rounded-lg border border-gray-600">
      <span class="text-white text-xl">☰</span>
    </button>

    <!-- Menu Overlay -->
    <div *ngIf="showMenu" 
         class="fixed inset-0 z-40 bg-black/50"
         (click)="closeMenu.emit()">
    </div>

    <!-- Menu Panel -->
    <div *ngIf="showMenu"
         class="fixed top-16 right-4 w-64 bg-gray-900/95 rounded-lg border border-gray-700 shadow-xl z-50 overflow-hidden">
      <div class="p-4 space-y-2">
        <h2 class="text-white text-lg font-bold mb-4">Menu</h2>
        
        <button (click)="onShortcuts.emit()" 
                class="w-full text-left px-4 py-3 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors">
          ⌨️ Shortcuts
        </button>
        
        <button (click)="onHelp.emit()" 
                class="w-full text-left px-4 py-3 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors">
          ❓ Help
        </button>
        
        <button (click)="toggleFullscreen.emit()" 
                class="w-full text-left px-4 py-3 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors">
          ⛶ Fullscreen
        </button>
      </div>
    </div>

    <!-- Shortcuts Modal -->
    <div *ngIf="showShortcutsModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div class="bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-700">
        <h2 class="text-white text-xl font-bold mb-4">Keyboard Shortcuts</h2>
        <div class="space-y-2 text-gray-300">
          <div class="flex justify-between"><span>Left Click</span><span class="text-gray-500">Draw Conveyor</span></div>
          <div class="flex justify-between"><span>Right Click</span><span class="text-gray-500">Erase Conveyor</span></div>
          <div class="flex justify-between"><span>Drag Item</span><span class="text-gray-500">Move Item</span></div>
          <div class="flex justify-between"><span>Right Click Item</span><span class="text-gray-500">Delete Item</span></div>
        </div>
        <button (click)="showShortcutsModal = false" 
                class="mt-4 w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
          Close
        </button>
      </div>
    </div>

    <!-- Help Modal -->
    <div *ngIf="showHelpModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div class="bg-gray-900 rounded-lg p-6 max-w-lg w-full mx-4 border border-gray-700">
        <h2 class="text-white text-xl font-bold mb-4">Factory Simulator Help</h2>
        <div class="space-y-3 text-gray-300 text-sm">
          <p><strong class="text-blue-400">Conveyors:</strong> Click and drag on the grid to create conveyor belts.</p>
          <p><strong class="text-blue-400">Items:</strong> Drag items from the sidebar onto the grid.</p>
          <p><strong class="text-blue-400">Connections:</strong> Items connected to conveyors show a green glow.</p>
          <p><strong class="text-blue-400">Resources:</strong> Watch resources flow from producers to consumers!</p>
        </div>
        <button (click)="showHelpModal = false" 
                class="mt-4 w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
          Close
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
  `]
})
export class MenuComponent {
  @Input() showMenu = false;
  @Input() showShortcutsModal = false;
  @Input() showHelpModal = false;

  @Output() toggleMenu = new EventEmitter<void>();
  @Output() closeMenu = new EventEmitter<void>();
  @Output() onShortcuts = new EventEmitter<void>();
  @Output() onHelp = new EventEmitter<void>();
  @Output() toggleFullscreen = new EventEmitter<void>();
}