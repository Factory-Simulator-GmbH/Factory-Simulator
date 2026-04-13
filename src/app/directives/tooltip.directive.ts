import {Directive, HostListener, Input, OnDestroy, Renderer2} from '@angular/core';

@Directive({
  selector: '[appTooltip]',
  standalone: true,
})
export class TooltipDirective implements OnDestroy {
  @Input('appTooltip') content: string = '';

  private tooltipEl: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private mouseX = 0;
  private mouseY = 0;
  private mousePressed = false;

  constructor(private renderer: Renderer2) {}

  @HostListener('mouseenter')
  onMouseEnter(): void {
    if (!this.content || this.mousePressed) return;
    this.timer = setTimeout(() => this.show(), 1500);
  }
  
  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    this.mouseX = event.clientX;
    this.mouseY = event.clientY;
    if (this.tooltipEl) {
      this.positionTooltip();
    }
  }

  @HostListener('mouseleave')
  onMouseLeave(): void {
    this.hide();
  }

  @HostListener('document:mousedown')
  onMouseDown(): void {
    this.mousePressed = true;
    this.hide();
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    this.mousePressed = false;
    this.hide();
  }

  

  private show(): void {
    if (!this.content || this.tooltipEl) return;

    this.tooltipEl = this.renderer.createElement('div');
    this.tooltipEl!.className =
      'fixed z-[9999] max-w-xs rounded-xl border border-white/20 bg-slate-900/95 backdrop-blur-sm p-3 text-sm text-white shadow-xl pointer-events-none';

    // Content ist developer-kontrolliert (nicht User-Input), direktes innerHTML ist sicher
    this.tooltipEl!.innerHTML = this.content;

    this.renderer.appendChild(document.body, this.tooltipEl);
    this.positionTooltip();
  }

  private positionTooltip(): void {
    if (!this.tooltipEl) return;
    const offset = 15;
    const tooltipW = this.tooltipEl.offsetWidth;
    const tooltipH = this.tooltipEl.offsetHeight;

    let left = this.mouseX + offset;
    let top = this.mouseY + offset;

    if (left + tooltipW > window.innerWidth - 8) {
      left = this.mouseX - tooltipW - offset;
    }
    if (top + tooltipH > window.innerHeight - 8) {
      top = this.mouseY - tooltipH - offset;
    }

    this.tooltipEl.style.left = left + 'px';
    this.tooltipEl.style.top = top + 'px';
  }

  private hide(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.tooltipEl) {
      document.body.removeChild(this.tooltipEl);
      this.tooltipEl = null;
    }
  }

  ngOnDestroy(): void {
    this.hide();
  }
}
