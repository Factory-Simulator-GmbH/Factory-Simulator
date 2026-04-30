import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ViewportService {
  readonly minZoom = 0.3;
  readonly maxZoom = 2.0;
  readonly zoomStep = 0.1;
}