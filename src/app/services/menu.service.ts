import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MenuService {
  // UI State Signals
  showMenu = signal(false);
  showShortcutsModal = signal(false);
  showHelpModal = signal(false);
  isFullscreen = signal(false);
  showItemTooltips = signal(true);

  toggleMenu(): void {
    this.showMenu.update(v => !v);
  }

  closeMenu(): void {
    this.showMenu.set(false);
  }

  openShortcuts(): void {
    this.showMenu.set(false);
    this.showShortcutsModal.set(true);
  }

  openHelp(): void {
    this.showMenu.set(false);
    this.showHelpModal.set(true);
  }

  closeShortcuts(): void {
    this.showShortcutsModal.set(false);
  }

  closeHelp(): void {
    this.showHelpModal.set(false);
  }

  toggleFullscreen(): void {
    this.isFullscreen.update(v => !v);
  }

  toggleItemTooltips(): void {
    this.showItemTooltips.update(v => !v);
  }
}