import {AfterViewInit, Component} from '@angular/core';
import interact from 'interactjs';

type ItemSize = 'large' | 'small'; // adjustable

interface DraggableItem {
  id: string;
  label: string;
  size: ItemSize;
}

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
})
export class App implements AfterViewInit {
  readonly gridSize = 50;

  items: DraggableItem[] = [
    {id: 'f1', label: 'Fabrik', size: 'large'},
    {id: 'f2', label: 'Fabrik', size: 'large'},
    {id: 'f3', label: 'Fabrik', size: 'large'},
    {id: 'io1', label: 'I/O', size: 'small'}, // Input Output
    {id: 'io2', label: 'I/O', size: 'small'},
  ];

  ngAfterViewInit(): void {
    this.initInteract();
  }

// Snap dragging in 50px steps
  private initInteract(): void {
    interact('.draggable').draggable({
      origin: '#item-area',
      modifiers: [
        interact.modifiers.snap({
          targets: [interact.snappers.grid({x: this.gridSize, y: this.gridSize})],
          relativePoints: [{x: 0, y: 0}],
        }),
        interact.modifiers.restrictRect({
          restriction: '.factory-container',
          endOnly: true,
        }),
      ],
      listeners: {
        move: (event) => {
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
