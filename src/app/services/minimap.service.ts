import { Injectable } from '@angular/core';

export interface MinimapViewport {
  left: string;
  top: string;
  width: string;
  height: string;
}

@Injectable({ providedIn: 'root' })
export class MinimapService {
  viewport: MinimapViewport = { left: '0%', top: '0%', width: '100%', height: '100%' };
  ready = false;

  updateViewport(container: HTMLElement): void {
    const { scrollLeft, scrollTop, scrollWidth, scrollHeight, clientWidth, clientHeight } = container;
    if (scrollWidth === 0 || scrollHeight === 0) return;

    this.ready = true;
    this.viewport = {
      left: `${(scrollLeft / scrollWidth) * 100}%`,
      top: `${(scrollTop / scrollHeight) * 100}%`,
      width: `${(clientWidth / scrollWidth) * 100}%`,
      height: `${(clientHeight / scrollHeight) * 100}%`,
    };
  }

  navigate(scrollContainer: HTMLElement, event: MouseEvent, minimapContentEl: HTMLElement): void {
    const rect = minimapContentEl.getBoundingClientRect();
    const relX = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
    const relY = Math.max(0, Math.min(event.clientY - rect.top, rect.height));
    scrollContainer.scrollLeft = Math.max(0, (relX / rect.width) * scrollContainer.scrollWidth - scrollContainer.clientWidth / 2);
    scrollContainer.scrollTop = Math.max(0, (relY / rect.height) * scrollContainer.scrollHeight - scrollContainer.clientHeight / 2);
  }
}