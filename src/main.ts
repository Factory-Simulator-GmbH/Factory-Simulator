// Import the function for bootstrapping the Angular application
import {bootstrapApplication} from '@angular/platform-browser';
import {appConfig} from './app/app.config';
import {AppComponent} from './app/app.component';

//Starts the application with the app configurations.
bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
