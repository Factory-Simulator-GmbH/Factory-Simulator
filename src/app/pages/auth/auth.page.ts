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
  password = '';
  showPassword = signal(false);

  get passwordChecks() {
    return {
      length: this.password.length >= 6,
      lowercase: /[a-z]/.test(this.password),
      uppercase: /[A-Z]/.test(this.password),
      number: /[0-9]/.test(this.password),
    };
  }

  get passwordStrength(): 'weak' | 'medium' | 'strong' {
    const count = Object.values(this.passwordChecks).filter(Boolean).length;
    if (count <= 1) return 'weak';
    if (count <= 3) return 'medium';
    return 'strong';
  }

  get passwordValid(): boolean {
    const c = this.passwordChecks;
    return c.length && c.lowercase && c.uppercase && c.number;
  }
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
        await this.auth.signUp(this.username.trim(), this.password);
      } else {
        await this.auth.signIn(this.username.trim(), this.password);
      }
      await this.router.navigate(['/factory']);
    } catch (e: any) {
      console.error('Auth error:', e?.message);
      this.error.set(this.mapError(e?.message));
    } finally {
      this.loading.set(false);
    }
  }

  toggleMode(): void {
    this.error.set(null);
    this.mode.set(this.mode() === 'login' ? 'signup' : 'login');
  }

  private mapError(msg: string): string {
    if (msg?.includes('already registered')) return 'Dieser Name ist bereits vergeben.';
    if (msg?.includes('Invalid login')) return 'Name oder Passwort falsch.';
    if (msg?.includes('Password should')) return 'Passwort muss mindestens 6 Zeichen haben.';
    return 'Etwas ist schiefgelaufen. Bitte versuche es erneut.';
  }
}
