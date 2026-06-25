import {Component, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {AuthService} from '../../services/auth.service';

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './auth.page.html',
})
export class AuthPage {
  mode = signal<'login' | 'signup'>('login');
  username = '';
  error = signal<string | null>(null);
  loading = signal(false);

  constructor(
    private auth: AuthService,
    private router: Router,
    route: ActivatedRoute,
  ) {
    route.queryParams.subscribe(params => {
      this.mode.set(params['mode'] === 'signup' ? 'signup' : 'login');
    });
  }

  async submit(): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    try {
      if (this.mode() === 'signup') {
        await this.auth.signUp(this.username.trim());
      } else {
        await this.auth.signIn(this.username.trim());
        if (this.auth.role === 'admin') {
          await this.auth.signOut();
          this.error.set('Bitte melde dich im Admin-Bereich an.');
          return;
        }
      }
      await this.router.navigate(['/factory']);
    } catch (e: any) {
      console.error('Auth error:', e?.message);
      this.error.set(this.mapError(e?.message));
    } finally {
      this.loading.set(false);
    }
  }

  private mapError(msg: string): string {
    if (msg?.includes('already registered')) return 'Dieser Name ist bereits vergeben.';
    if (msg?.includes('Invalid login')) return 'Name nicht gefunden.';
    return 'Etwas ist schiefgelaufen. Bitte versuche es erneut.';
  }
}
