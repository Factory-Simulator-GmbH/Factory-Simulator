import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MenuService {
  showMenu = false;
  showShortcutsModal = false;
  showRecipesModal = false;
  showHelpModal = false;
  showItemTooltips = true;

  helpCurrentStep = 0;
  helpAnimationDirection: 'left' | 'right' = 'right';
  readonly helpTotalSteps = 5;

  toggleMenu(): void { this.showMenu = !this.showMenu; }
  closeMenu(): void { this.showMenu = false; }

  openShortcuts(): void {
    this.showMenu = false;
    this.showShortcutsModal = true;
  }
  closeShortcuts(): void { this.showShortcutsModal = false; }


  openRecipes() {
    this.showMenu = false;
    this.showRecipesModal = true;
  }
  closeRecipes() { this.showRecipesModal = false;}

  openHelp(): void {
    this.showMenu = false;
    this.helpCurrentStep = 0;
    this.helpAnimationDirection = 'right';
    this.showHelpModal = true;
  }
  closeHelp(): void { this.showHelpModal = false; }

  toggleItemTooltips(): void { this.showItemTooltips = !this.showItemTooltips; }

  nextHelpStep(): void {
    if (this.helpCurrentStep < this.helpTotalSteps - 1) {
      this.helpAnimationDirection = 'right';
      this.helpCurrentStep++;
    }
  }

  prevHelpStep(): void {
    if (this.helpCurrentStep > 0) {
      this.helpAnimationDirection = 'left';
      this.helpCurrentStep--;
    }
  }
}
