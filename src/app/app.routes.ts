import {Routes} from '@angular/router';
import {authGuard} from './guards/auth.guard';
import {itemsResolver} from './resolvers/items.resolver';
import {AuthPage} from './pages/auth/auth.page';
import {HomePage} from './pages/home/home.page';
import {FactoryPage} from './pages/factory/factory.page';

export const routes: Routes = [
  {path: '', component: HomePage},
  {path: 'auth', component: AuthPage},
  {path: 'factory', component: FactoryPage, canActivate: [authGuard], resolve: {items: itemsResolver}},
  {path: '**', redirectTo: ''},
];
