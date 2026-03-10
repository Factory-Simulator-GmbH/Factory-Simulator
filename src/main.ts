// Import the function for bootstrapping the Angular application
import {bootstrapApplication} from '@angular/platform-browser';
import {appConfig} from './app/app.config';
import {App} from './app/apps';

//Starts the application with the app configurations.
bootstrapApplication(App, appConfig).catch((err) => console.error(err));
