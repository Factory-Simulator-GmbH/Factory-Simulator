import {bootstrapApplication} from '@angular/platform-browser';
import {appConfig} from './app/app.config';
import {App} from './app/apps';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
