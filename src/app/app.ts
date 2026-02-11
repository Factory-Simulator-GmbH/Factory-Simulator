import {Component, signal, AfterViewInit} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import interact from 'interactjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  standalone: true,
})
export class App implements AfterViewInit {
  protected readonly title = signal('factory-simulator');

  ngAfterViewInit() {
    interact('.draggable').draggable({
      listeners: {
        move(event) {
          const target = event.target as HTMLElement;
          const x = (parseFloat(target.getAttribute('data-x') || '0') || 0) + event.dx;
          const y = (parseFloat(target.getAttribute('data-y') || '0') || 0) + event.dy;

          target.style.transform = `translate(${x}px, ${y}px)`;
          target.setAttribute('data-x', String(x));
          target.setAttribute('data-y', String(y));
        },
      },
    });
  }
}
