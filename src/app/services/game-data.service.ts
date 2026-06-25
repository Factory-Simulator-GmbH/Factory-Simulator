import {Injectable} from '@angular/core';
import {DraggableItems} from '../models/draggableItem.model';
import {SupabaseService} from './supabase.service';

@Injectable({
  providedIn: 'root',
})
export class GameDataService {
  constructor(private supabase: SupabaseService) {}

  async loadItems(): Promise<DraggableItems[]> {
    const {data, error} = await this.supabase.client
      .from('items')
      .select('*')
      .order('size', {ascending: true})
      .order('id', {ascending: true});

    if (error) throw error;

    return (data ?? []).map(row => ({
      id: row['id'],
      type: row['type'],
      label: row['label'],
      size: row['size'],
      helpText: row['help_text'],
      maxAvailableCount: row['max_available_count'] ?? undefined,
      spawningResource: row['spawning_resource'] ?? undefined,
      rate: row['rate'] ?? undefined,
      input: row['input'] ?? undefined,
      output: row['output'] ?? undefined,
      duration: row['duration'] ?? undefined,
      outputcount: false,
    }));
  }
}
