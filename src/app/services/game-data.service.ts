import {Injectable} from '@angular/core';
import {DraggableItems} from '../models/draggableItem.model';
import {SupabaseService} from './supabase.service';

@Injectable({
  providedIn: 'root',
})
export class GameDataService {
  private readonly machineIcons: Record<string, string> = {
    'Metallpresse':           'gavel',
    'Kabelmaschine':          'cable',
    'Leiterplattenfertigung': 'developer_board',
    'Elektronikmontage':      'memory',
    'PC-Montage':             'computer',
  };

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
      filter_category: row['filter_category'] ?? undefined,
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

  getRecipeAsString(item: DraggableItems): string {
    if (!item.input || !item.output) return "";

    const inputRessources: string[] = [];
    for (const [ressource, count] of Object.entries(item.input)) {
      inputRessources.push(`${count}x ${ressource}`);
    }
    return `${inputRessources.join(' + ')} → ${item.output}`;
  }

  getIconBasedOnMachine(item: DraggableItems): string {
    return this.machineIcons[item.label] ?? 'precision_manufacturing';
  }
}
