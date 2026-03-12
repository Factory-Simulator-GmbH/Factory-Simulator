import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnInit,
  ViewChild,
} from '@angular/core';
import interact from 'interactjs';
import {ItemsComponent} from '../../components/items/items.component';
import {PlaygroundGridComponent} from '../../components/playground-grid/playground-grid.component';
import {ConveyorSegment} from '../../models/conveyor-segment.model';
import {DraggableItems, ItemSize} from '../../models/draggable-item.model';
import {ItemBasePosition, ItemState} from '../../models/item-position.model';
import {LayoutService} from '../../services/layout.service';
import {FactoryGridService} from '../../services/factory-grid.service';
import {FactoryItemsService} from '../../services/factory-items.service';

@Component({
  selector: 'app-factory-page',
  standalone: true,
  imports: [PlaygroundGridComponent, ItemsComponent],
  templateUrl: './factory.page.html',
})
export class FactoryPage implements AfterViewInit, OnInit {
  @ViewChild('gridHost', {read: ElementRef, static: true})
  gridHostRef!: ElementRef<HTMLElement>;

  @ViewChild(PlaygroundGridComponent)
  playgroundGridComponent!: PlaygroundGridComponent;

  mousePressed = false;
  isDraggingItem = false;
  activeDraggedItemId: string | null = null;

  readonly gridCellSizeVw = 2.5;
  gridCellSizePx = 0;
  readonly gridRowCount = 30;
  gridColumns = 0;

  conveyorGrid: ConveyorSegment[][] = [];

  items: DraggableItems[] = [
    {id: 'f1', label: 'Fabrik', size: 'large'},
    {id: 'f2', label: 'Fabrik', size: 'large'},
    {id: 'f3', label: 'Fabrik', size: 'large'},
    {id: 'io1', label: 'I/O', size: 'small'},
    {id: 'io2', label: 'I/O', size: 'small'},
  ];

  private itemStates: Record<string, ItemState> = {};
  private itemBasePositions: Record<string, ItemBasePosition> = {};

  private paintMode: 'on' | 'off' | null = null;
  previewCells = new Set<string>();
  private touchedCells = new Set<string>();
  private pathCells: { row: number; col: number }[] = [];

  constructor(
    private ngZone: NgZone,
    private layoutService: LayoutService,
    private factoryGridService: FactoryGridService,
    private factoryItemsService: FactoryItemsService,
  ) {
  }

  ngOnInit(): void {
    this.updateGridCellSize();
  }

  ngAfterViewInit(): void {
    this.calculateColumnsAndCreateGrid();

    requestAnimationFrame(() => {
      this.captureItemBasePositions();
      this.initializeItemStates();
      this.setupInteractDragging();
    });
  }

  private initializeItemStates(): void {
    this.itemStates = this.factoryItemsService.initializeItemStates(this.items);
  }

  private calculateColumnsAndCreateGrid(): void {
    const container = this.gridHostRef.nativeElement;
    const availableWidthPx = container?.clientWidth ?? window.innerWidth;

    this.gridColumns = this.factoryGridService.calculateColumns(
      this.gridCellSizePx,
      availableWidthPx,
    );

    this.conveyorGrid = this.factoryGridService.createOrResizeGrid(
      this.conveyorGrid,
      this.gridRowCount,
      this.gridColumns,
    );
  }

  private getGridTableRect(): DOMRect {
    return this.playgroundGridComponent.gridTableRef.nativeElement.getBoundingClientRect();
  }

  getItemSizePx(size: ItemSize): number {
    return this.layoutService.getItemSizePx(size, this.gridCellSizePx);
  }

  private updateGridCellSize(): void {
    this.gridCellSizePx = (window.innerWidth * this.gridCellSizeVw) / 100;
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updateGridCellSize();
    this.calculateColumnsAndCreateGrid();

    requestAnimationFrame(() => {
      this.captureItemBasePositions();
      this.repositionAllItems();
      this.setupInteractDragging();
    });
  }

  onCellMouseDown(event: MouseEvent, rowIndex: number, colIndex: number): void {
    if (this.isDraggingItem) return;

    this.paintMode = event.button === 2 ? 'off' : 'on';

    event.preventDefault();
    this.mousePressed = true;
    this.previewCells.clear();
    this.touchedCells.clear();
    this.pathCells = [];

    this.applyPreview(rowIndex, colIndex);
  }

  onCellMouseEnter(rowIndex: number, colIndex: number): void {
    if (!this.mousePressed || this.isDraggingItem || !this.paintMode) return;
    this.applyPreview(rowIndex, colIndex);
  }

  private applyPreview(rowIndex: number, colIndex: number): void {
    this.factoryGridService.applyPreview(
      this.conveyorGrid,
      rowIndex,
      colIndex,
      this.paintMode as 'on' | 'off',
      this.touchedCells,
      this.previewCells,
      this.pathCells,
    );
  }

  getConveyorSymbol = (cell: ConveyorSegment): string => {
    return this.factoryGridService.getConveyorSymbol(cell);
  };

  onItemMouseDown(itemId: string): void {
    this.isDraggingItem = true;
    this.activeDraggedItemId = itemId;
  }

  @HostListener('document:mousedown')
  onDocumentMouseDown(): void {
    this.mousePressed = true;
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.mousePressed = false;
    this.paintMode = null;
    this.previewCells.clear();
    this.touchedCells.clear();
    this.pathCells = [];
    this.isDraggingItem = false;
    this.activeDraggedItemId = null;
  }

  @HostListener('document:contextmenu', ['$event'])
  onContextMenu(event: MouseEvent): void {
    event.preventDefault();

    const target = event.target as HTMLElement;

    if (target && target.classList.contains('draggable-item')) {
      target.style.transform = '';
      target.setAttribute('data-x', '0');
      target.setAttribute('data-y', '0');
      this.itemStates[target.id] = {
        col: 0,
        row: 0,
        isAtStartPosition: true,
      };
    }
  }

  private captureItemBasePositions(): void {
    this.itemBasePositions = this.factoryItemsService.captureItemBasePositions(
      this.items,
      this.getGridTableRect(),
    );
  }

  private applyItemPosition(element: HTMLElement, col: number, row: number): void {
    this.factoryItemsService.applyItemPosition(
      element,
      col,
      row,
      this.itemBasePositions,
      this.gridCellSizePx,
    );
  }

  private saveItemGridPosition(element: HTMLElement): void {
    this.factoryItemsService.saveItemGridPosition(
      element,
      this.itemBasePositions,
      this.itemStates,
      this.gridCellSizePx,
    );
  }

  private repositionAllItems(): void {
    this.factoryItemsService.repositionAllItems(
      this.items,
      this.itemStates,
      this.itemBasePositions,
      this.gridCellSizePx,
    );
  }

  private isOverlapping(checkItem: HTMLElement): boolean {
    return (
      this.factoryItemsService.isOverlappingWithItem(checkItem, this.items) ||
      this.factoryItemsService.isOverlappingWithConveyor(
        checkItem,
        this.getGridTableRect(),
        this.gridCellSizePx,
        this.gridRowCount,
        this.gridColumns,
        this.conveyorGrid,
      )
    );
  }

  private setupInteractDragging(): void {
    interact('.draggable-item').unset();

    interact('.draggable-item').draggable({
      origin: this.playgroundGridComponent.gridTableRef.nativeElement,
      modifiers: [
        interact.modifiers.snap({
          targets: [
            interact.createSnapGrid({
              x: this.gridCellSizePx,
              y: this.gridCellSizePx,
            }),
          ],
          relativePoints: [{x: 0, y: 0}],
        }),
        interact.modifiers.restrictRect({
          restriction: '.factory-surface',
          endOnly: true,
        }),
      ],
      listeners: {
        start: (event) => {
          const element = event.target as HTMLElement;
          const itemId = element.getAttribute('data-item-id');

          this.ngZone.run(() => {
            this.isDraggingItem = true;
            this.activeDraggedItemId = itemId;
          });

          element.style.position = 'relative';
          element.style.zIndex = '60';
        },

        move: (event) => {
          const element = event.target as HTMLElement;

          const currentX = Number(element.getAttribute('data-x') ?? '0');
          const currentY = Number(element.getAttribute('data-y') ?? '0');

          const nextX = currentX + event.dx;
          const nextY = currentY + event.dy;

          element.style.transform = `translate(${nextX}px, ${nextY}px)`;
          element.setAttribute('data-x', String(nextX));
          element.setAttribute('data-y', String(nextY));
        },

        end: (event) => {
          this.ngZone.run(() => {
            this.isDraggingItem = false;
            this.activeDraggedItemId = null;
          });

          const element = event.target as HTMLElement;

          if (this.isOverlapping(element)) {
            const state = this.itemStates[element.id];

            if (!state || state.isAtStartPosition) {
              element.style.transform = '';
              element.setAttribute('data-x', '0');
              element.setAttribute('data-y', '0');
            } else {
              this.applyItemPosition(element, state.col, state.row);
            }
          } else {
            this.saveItemGridPosition(element);
            const pos = this.itemStates[element.id];
            this.applyItemPosition(element, pos.col, pos.row);
          }

          element.style.zIndex = '';
          element.style.position = '';
        },
      },
    });
  }
}
