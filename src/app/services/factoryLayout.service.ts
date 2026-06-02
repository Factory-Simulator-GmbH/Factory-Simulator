import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface SavedLayout {
  id: string;
  name: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  data: unknown;
}

@Injectable({ providedIn: 'root' })
export class FactoryLayoutService {
  constructor(private supabase: SupabaseService) {}

  async listLayouts(): Promise<SavedLayout[]> {
    const { data, error } = await this.supabase.client
      .from('layouts')
      .select('id, name, is_public, created_at, updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as SavedLayout[];
  }

  async saveLayout(name: string, layoutData: unknown): Promise<SavedLayout> {
    const { data: { user } } = await this.supabase.client.auth.getUser();
    if (!user) throw new Error('Nicht angemeldet');

    const { data, error } = await this.supabase.client
      .from('layouts')
      .insert({ user_id: user.id, name, data: layoutData })
      .select('id, name, is_public, created_at, updated_at')
      .single();
    if (error) throw error;
    return data as SavedLayout;
  }

  async overwriteLayout(id: string, layoutData: unknown): Promise<void> {
    const { error } = await this.supabase.client
      .from('layouts')
      .update({ data: layoutData })
      .eq('id', id);
    if (error) throw error;
  }

  async renameLayout(id: string, name: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('layouts')
      .update({ name })
      .eq('id', id);
    if (error) throw error;
  }

  async deleteLayout(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('layouts')
      .delete()
      .eq('id', id);
    if (error) throw error;
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
}
