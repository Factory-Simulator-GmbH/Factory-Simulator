export type Direction = 'up' | 'down' | 'left' | 'right';

export interface ConveyorSegment {
  active: boolean;
  entry: Direction | null;
  exit: Direction | null;
  resource: string | null;
  endpoint: boolean | null;
}
