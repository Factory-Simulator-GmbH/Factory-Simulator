export type Direction = 'up' | 'down' | 'left' | 'right';

export interface ConveyorSegment {
  active: boolean;
  entry: Direction[];
  exit: Direction[];
  resource: string | null;
  endpoint: boolean | null;
}
