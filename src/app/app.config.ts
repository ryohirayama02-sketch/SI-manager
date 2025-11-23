import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

import { provideFirebaseApp, initializeApp as ngInitApp } from '@angular/fire/app';
import { provideFirestore, getFirestore as ngGetFirestore } from '@angular/fire/firestore';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideFirebaseApp(() => ngInitApp({
      apiKey: "AIzaSyDLqLcEdEZgD3Q98x1nWH21ib_wO1zN6tI",
      authDomain: "si-manager-13eb4.firebaseapp.com",
      projectId: "si-manager-13eb4",
      storageBucket: "si-manager-13eb4.firebasestorage.app",
      messagingSenderId: "418747360580",
      appId: "1:418747360580:web:77028b37a5aba65da72311",
      measurementId: "G-D7H9LGEN31"
    })),
    provideFirestore(() => ngGetFirestore())
  ]
};
