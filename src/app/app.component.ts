import {Component, OnInit, signal} from '@angular/core';
import {NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterOutlet} from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <router-outlet/>
    @if (showLoader()) {
      <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
        <div class="flex flex-col items-center gap-3">
          <div class="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
          <span class="text-sm text-slate-400">Laden...</span>
        </div>
      </div>
    }
  `,
})
export class AppComponent implements OnInit {
  showLoader = signal(false);

  private loaderTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.loaderTimer = setTimeout(() => this.showLoader.set(true), 1000);
      } else if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) {
        if (this.loaderTimer) clearTimeout(this.loaderTimer);
        this.showLoader.set(false);
      }
    });
  }
}
