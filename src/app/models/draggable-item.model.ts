export type Direction = 'up' | 'down' | 'left' | 'right';

export type ItemSize = 'large' | 'small';

export interface DraggableItems {
  id: string;
  type: string;
  label: string;
  size: ItemSize;
  helpText: string;
  showHelpText?: boolean;
  maxAvailableCount?: number;
  currentAvailableCount?: number;
  spawningResource?: string;
  rate?: number;
  entry?: Direction | null;
  exit?: Direction | null;
  resource?: string | null;
}
