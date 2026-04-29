import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ViewportService {
  // Zoom & Viewport
  zoomLevel = 1.0;
  readonly minZoom = 0.3;
  readonly maxZoom = 2.0;
  readonly zoomStep = 0.1;

  minimapViewport = { left: '0%', top: '0%', width: '100%', height: '100%' };
  minimapReady = false;
  isNavigatingMinimap = false;

  // UI State
  isFullscreen = false;
  showMenu = false;
  showShortcutsModal = false;
  showHelpModal = false;
  showItemTooltips = true;
}