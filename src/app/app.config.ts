// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDV-s3hs85ghafmAGZY4gSVv5aGOo8ItDM',
  authDomain: 'kensyu10114.firebaseapp.com',
  projectId: 'kensyu10114',
  storageBucket: 'kensyu10114.firebasestorage.app',
  messagingSenderId: '179609855427',
  appId: '1:179609855427:web:acc450c4e168e6dfcdc976',
  measurementId: 'G-9LTS9ZXVGS',
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
  ],
};
