import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface SavedLayout {
  id: string;
  user_id: string;
  name: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  data: unknown;
}

const LIST_COLUMNS = 'id, user_id, name, is_public, created_at, updated_at';

@Injectable({ providedIn: 'root' })
export class FactoryLayoutService {
  constructor(private supabase: SupabaseService) {}

  private async requireUserId(): Promise<string> {
    const { data: { user } } = await this.supabase.client.auth.getUser();
    if (!user) throw new Error('Nicht angemeldet');
    return user.id;
  }

  // Schreibzugriffe müssen ausdrücklich nach user_id filtern: RLS meldet bei einem
  // Treffer auf eine fremde Zeile keinen Fehler, sondern liefert einfach 0 Zeilen.
  // Ohne diese Prüfung sieht ein blockiertes Speichern wie ein erfolgreiches aus.
  private assertAffected(rows: unknown[] | null, action: string): void {
    if (!rows || rows.length === 0) {
      throw new Error(`${action} nicht möglich – der Spielstand gehört dir nicht.`);
    }
  }

  async listLayouts(): Promise<SavedLayout[]> {
    const userId = await this.requireUserId();
    const { data, error } = await this.supabase.client
      .from('layouts')
      .select(LIST_COLUMNS)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as SavedLayout[];
  }

  async saveLayout(name: string, layoutData: unknown): Promise<SavedLayout> {
    const userId = await this.requireUserId();

    const { data, error } = await this.supabase.client
      .from('layouts')
      .insert({ user_id: userId, name, data: layoutData })
      .select(LIST_COLUMNS)
      .single();
    if (error) throw error;
    return data as SavedLayout;
  }

  async overwriteLayout(id: string, layoutData: unknown): Promise<void> {
    const userId = await this.requireUserId();
    const { data, error } = await this.supabase.client
      .from('layouts')
      .update({ data: layoutData })
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');
    if (error) throw error;
    this.assertAffected(data, 'Speichern');
  }

  async renameLayout(id: string, name: string): Promise<void> {
    const userId = await this.requireUserId();
    const { data, error } = await this.supabase.client
      .from('layouts')
      .update({ name })
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');
    if (error) throw error;
    this.assertAffected(data, 'Umbenennen');
  }

  async deleteLayout(id: string): Promise<void> {
    const userId = await this.requireUserId();
    const { data, error } = await this.supabase.client
      .from('layouts')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');
    if (error) throw error;
    this.assertAffected(data, 'Löschen');
  }

  async loadLayoutData(id: string): Promise<unknown> {
    const { data, error } = await this.supabase.client
      .from('layouts')
      .select('data')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data['data'];
  }

  async publishLayout(id: string, isPublic: boolean): Promise<void> {
    const userId = await this.requireUserId();
    const { data, error } = await this.supabase.client
      .from('layouts')
      .update({ is_public: isPublic })
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');
    if (error) throw error;
    this.assertAffected(data, 'Teilen');
  }

  async listPublicLayouts(): Promise<SavedLayout[]> {
    const userId = await this.requireUserId();
    const { data, error } = await this.supabase.client
      .from('layouts')
      .select(LIST_COLUMNS)
      .eq('is_public', true)
      .neq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as SavedLayout[];
  }
}
