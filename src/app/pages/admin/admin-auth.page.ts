import {AfterViewInit, Component, ElementRef, signal, ViewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {environment} from '../../../environments/environment';
import {AuthService} from '../../services/auth.service';

@Component({
  selector: 'app-admin-auth-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-auth.page.html',
  styleUrl: './admin-auth.page.scss',
})
export class AdminAuthPage implements AfterViewInit {
  mode = signal<'login' | 'signup'>('login');
  username = '';
  password = '';
  showPassword = signal(false);
  error = signal<string | null>(null);
  loading = signal(false);

  pinModalOpen = signal(false);
  pinInput = signal('');
  pinShake = signal(false);
  pinVerified = signal(false);

  readonly PIN_LENGTH = environment.adminMasterPin.length;

  get passwordChecks() {
    return {
      length: this.password.length >= 8,
      uppercase: /[A-Z]/.test(this.password),
      lowercase: /[a-z]/.test(this.password),
      number: /[0-9]/.test(this.password),
    };
  }

  get passwordStrength(): 'weak' | 'medium' | 'strong' {
    const count = Object.values(this.passwordChecks).filter(Boolean).length;
    if (count <= 2) return 'weak';
    if (count === 3) return 'medium';
    return 'strong';
  }

  get passwordValid(): boolean {
    return Object.values(this.passwordChecks).every(Boolean);
  }

  @ViewChild('pinField') pinField?: ElementRef<HTMLInputElement>;

  constructor(
    private auth: AuthService,
    private router: Router,
    route: ActivatedRoute,
  ) {
    route.queryParams.subscribe(params => {
      const isSignup = params['mode'] === 'signup';
      this.mode.set(isSignup ? 'signup' : 'login');
      if (isSignup) {
        this.openPinModal();
      }
    });
  }

  ngAfterViewInit(): void {
    if (this.pinModalOpen()) {
      setTimeout(() => this.pinField?.nativeElement.focus(), 50);
    }
  }

  openPinModal(): void {
    this.pinInput.set('');
    this.pinShake.set(false);
    this.pinVerified.set(false);
    this.pinModalOpen.set(true);
    setTimeout(() => this.pinField?.nativeElement.focus(), 50);
  }

  onPinKey(event: KeyboardEvent): void {
    if (this.pinVerified()) return;

    if (event.key === 'Backspace') {
      this.pinInput.set(this.pinInput().slice(0, -1));
      return;
    }
    if (!/^\d$/.test(event.key)) return;
    if (this.pinInput().length >= this.PIN_LENGTH) return;

    const next = this.pinInput() + event.key;
    this.pinInput.set(next);

    if (next.length === this.PIN_LENGTH) {
      if (next === environment.adminMasterPin) {
        this.pinVerified.set(true);
        setTimeout(() => {
          this.pinModalOpen.set(false);
        }, 500);
      } else {
        this.pinShake.set(true);
        setTimeout(() => {
          this.pinInput.set('');
          this.pinShake.set(false);
          this.pinField?.nativeElement.focus();
        }, 600);
      }
    }
  }

  closePinModal(): void {
    this.pinModalOpen.set(false);
    if (!this.pinVerified()) {
      this.router.navigate(['/auth']);
    }
  }

  async submit(): Promise<void> {
    this.error.set(null);
    if (this.mode() === 'signup') {
      if (!this.passwordValid) {
        this.error.set('Passwort ist nicht sicher genug.');
        return;
      }
      if (!this.pinVerified()) {
        this.openPinModal();
        return;
      }
      await this.doSignup();
    } else {
      await this.doLogin();
    }
  }

  private async doSignup(): Promise<void> {
    this.loading.set(true);
    try {
      await this.auth.signUpAdmin(this.username.trim(), this.password);
      await this.router.navigate(['/factory']);
    } catch (e: any) {
      this.error.set(this.mapError(e?.message));
    } finally {
      this.loading.set(false);
    }
  }

  private async doLogin(): Promise<void> {
    this.loading.set(true);
    try {
      await this.auth.signInAdmin(this.username.trim(), this.password);
      if (this.auth.role !== 'admin') {
        await this.auth.signOut();
        this.error.set('Dieser Account ist kein Admin.');
        return;
      }
      await this.router.navigate(['/factory']);
    } catch (e: any) {
      this.error.set(this.mapError(e?.message));
    } finally {
      this.loading.set(false);
    }
  }

  private mapError(msg: string): string {
    if (msg?.includes('already registered')) return 'Dieser Name ist bereits vergeben.';
    if (msg?.includes('Invalid login')) return 'Name oder Passwort falsch.';
    if (msg?.includes('Password should')) return 'Passwort muss mindestens 6 Zeichen haben.';
    return 'Etwas ist schiefgelaufen. Bitte versuche es erneut.';
  }
}
