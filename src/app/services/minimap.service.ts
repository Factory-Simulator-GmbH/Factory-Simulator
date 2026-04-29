import { Injectable } from '@angular/core';

export interface MinimapViewport {
  left: string;
  top: string;
  width: string;
  height: string;
}

@Injectable({
  providedIn: 'root'
})
export class MinimapService {
  viewport: MinimapViewport = { left: '0%', top: '0%', width: '100%', height: '100%' };
  ready = false;
  isNavigating = false;

  updateViewport(container: HTMLElement): void {
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;
    const scrollWidth = container.scrollWidth;
    const scrollHeight = container.scrollHeight;
    const clientWidth = container.clientWidth;
    const clientHeight = container.clientHeight;
    
    if (scrollWidth === 0 || scrollHeight === 0) return;
    
    this.ready = true;
    this.viewport = {
      left: `${(scrollLeft / scrollWidth) * 100}%`,
      top: `${(scrollTop / scrollHeight) * 100}%`,
      width: `${(clientWidth / scrollWidth) * 100}%`,
      height: `${(clientHeight / scrollHeight) * 100}%`
    };
  }

  navigate(container: HTMLElement, event: MouseEvent, contentElement: HTMLElement): void {
    const rect = contentElement.getBoundingClientRect();
    const relX = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
    const relY = Math.max(0, Math.min(event.clientY - rect.top, rect.height));
    
    container.scrollLeft = Math.max(0, (relX / rect.width) * container.scrollWidth - container.clientWidth / 2);
    container.scrollTop = Math.max(0, (relY / rect.height) * container.scrollHeight - container.clientHeight / 2);
  }

  startNavigation(): void {
    this.isNavigating = true;
    document.body.style.cursor = 'grabbing';
  }

  endNavigation(): void {
    this.isNavigating = false;
    document.body.style.cursor = '';
  }
}