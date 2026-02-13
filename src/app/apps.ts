import {AfterViewInit, Component, ElementRef, HostListener, ViewChild} from '@angular/core';
import interact from 'interactjs';

type ItemSize = 'large' | 'small';

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
  @ViewChild('playArea', {static: true}) playAreaRef!: ElementRef<HTMLTableElement>;

  mousePressed = false;
  dragging = false;

  readonly cellSizePx = 50;
  readonly rows = 9;

  cols = 0;
  grid: boolean[][] = [];

  items: DraggableItem[] = [
    {id: 'f1', label: 'Fabrik', size: 'large'},
    {id: 'f2', label: 'Fabrik', size: 'large'},
    {id: 'f3', label: 'Fabrik', size: 'large'},
    {id: 'io1', label: 'I/O', size: 'small'},
    {id: 'io2', label: 'I/O', size: 'small'},
  ];

  ngAfterViewInit(): void {
    this.computeColsAndInitGrid();
    this.initInteract();
  }

  private computeColsAndInitGrid(): void {
    const table = this.playAreaRef.nativeElement;

    const wrapper = table.parentElement;
    const width = wrapper?.clientWidth ?? 1000;

    this.cols = Math.max(1, Math.floor(width / this.cellSizePx));

    this.grid = Array.from({length: this.rows}, () =>
      Array.from({length: this.cols}, () => false),
    );
  }

  toggleCell(r: number, c: number): void {
    if (this.dragging) return;
    this.grid[r][c] = !this.grid[r][c];
  }

  toggleCellIfPainting(r: number, c: number): void {
    if (!this.mousePressed || this.dragging) return;
    this.grid[r][c] = !this.grid[r][c];
  }

  @HostListener('document:mousedown')
  onDocMouseDown(): void {
    this.mousePressed = true;
  }

  @HostListener('document:mouseup')
  onDocMouseUp(): void {
    this.mousePressed = false;
  }

  private initInteract(): void {
    interact('.draggable').draggable({
      origin: '#item-area',
      modifiers: [
        // Snap dragging to a 50px grid.
        interact.modifiers.snap({
          targets: [interact.snappers.grid({x: this.cellSizePx, y: this.cellSizePx})],
          relativePoints: [{x: 0, y: 0}],
        }),
        interact.modifiers.restrictRect({
          restriction: '.factory-container',
          endOnly: true,
        }),
      ],
      listeners: {
        start: () => {
          this.dragging = true;
        },
        move: (event) => {
          const target = event.target as HTMLElement;

          const x = (parseFloat(target.getAttribute('data-x') || '0') || 0) + event.dx;
          const y = (parseFloat(target.getAttribute('data-y') || '0') || 0) + event.dy;

          target.style.transform = `translate(${x}px, ${y}px)`;
          target.setAttribute('data-x', String(x));
          target.setAttribute('data-y', String(y));
        },
        end: () => {
          this.dragging = false;
        },
      },
    });
  }
}
