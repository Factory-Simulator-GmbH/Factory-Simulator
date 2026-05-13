import {Injectable, signal} from '@angular/core';
import {Router} from '@angular/router';
import {User} from '@supabase/supabase-js';
import {SupabaseService} from './supabase.service';

const DOMAIN = 'factorysim.local';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  currentUser = signal<User | null>(null);
  private sessionReady: Promise<void>;

  constructor(
    private supabase: SupabaseService,
    private router: Router,
  ) {
    this.sessionReady = this.supabase.client.auth.getSession().then(({data}) => {
      this.currentUser.set(data.session?.user ?? null);
    });

    this.supabase.client.auth.onAuthStateChange((_, session) => {
      this.currentUser.set(session?.user ?? null);
    });
  }

  async waitForSession(): Promise<void> {
    return this.sessionReady;
  }

  async signUp(username: string, password: string): Promise<void> {
    const {error} = await this.supabase.client.auth.signUp({
      email: `${username}@${DOMAIN}`,
      password,
      options: {data: {username, role: 'user'}},
    });
    if (error) throw error;
  }

  async signIn(username: string, password: string): Promise<void> {
    const {error} = await this.supabase.client.auth.signInWithPassword({
      email: `${username}@${DOMAIN}`,
      password,
    });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    await this.router.navigate(['/']);
  }

  get username(): string | null {
    return this.currentUser()?.user_metadata?.['username'] ?? null;
  }

  get role(): string {
    return this.currentUser()?.user_metadata?.['role'] ?? 'user';
  }
}
