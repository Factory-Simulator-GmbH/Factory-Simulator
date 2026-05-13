import {inject} from '@angular/core';
import {ResolveFn} from '@angular/router';
import {DraggableItems} from '../models/draggableItem.model';
import {GameDataService} from '../services/game-data.service';

export const itemsResolver: ResolveFn<DraggableItems[]> = () => {
  return inject(GameDataService).loadItems();
};
