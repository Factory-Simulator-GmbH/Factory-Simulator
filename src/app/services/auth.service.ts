import {Injectable, signal} from '@angular/core';
import {Router} from '@angular/router';
import {User} from '@supabase/supabase-js';
import {environment} from '../../environments/environment';
import {SupabaseService} from './supabase.service';

const DOMAIN = 'factorysim.local';
const DEFAULT_PASSWORD = environment.supabase.defaultUserPassword;

// Der Benutzername wird zu <name>@factorysim.local. Supabase lehnt Adressen mit
// Leerzeichen, Umlauten oder Sonderzeichen ab ("Unable to validate email address"),
// deshalb wird der Name vorher geprüft statt den Server raten zu lassen.
const USERNAME_RE = /^[a-z0-9]([a-z0-9._+-]*[a-z0-9])?$/;

export const USERNAME_HINT =
  'Nur Buchstaben (a–z), Zahlen und . _ - sind erlaubt – keine Leerzeichen oder Umlaute.';
export const INVALID_USERNAME = 'INVALID_USERNAME';

function toEmail(username: string): string {
  const name = username.trim().toLowerCase();
  if (!USERNAME_RE.test(name)) throw new Error(INVALID_USERNAME);
  return `${name}@${DOMAIN}`;
}

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

  async signUp(username: string, password: string = DEFAULT_PASSWORD, role: string = 'user'): Promise<void> {
    const email = toEmail(username);
    const {error} = await this.supabase.client.auth.signUp({
      email,
      password: password,
      options: {data: {username: username.trim(), role: role}},
    });
    if (error) throw error;
  }

  async signIn(username: string, password: string = DEFAULT_PASSWORD): Promise<void> {
    const {error} = await this.supabase.client.auth.signInWithPassword({
      email: toEmail(username),
      password: password,
    });
    if (error) throw error;
  }

  async signUpAdmin(username: string, password: string): Promise<void> {
    const email = toEmail(username);
    const {error} = await this.supabase.client.auth.signUp({
      email,
      password,
      options: {data: {username: username.trim(), role: 'admin'}},
    });
    if (error) throw error;
  }

  async signInAdmin(username: string, password: string): Promise<void> {
    const {error} = await this.supabase.client.auth.signInWithPassword({
      email: toEmail(username),
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
