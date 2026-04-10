export type ItemSize = 'large' | 'small';

export interface DraggableItems {
  id: string;
  label: string;
  size: ItemSize;
  helpText: string;
  showHelpText?: boolean;
  maxAvailableCount?: number;
}
