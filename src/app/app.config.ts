import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';

import { routes } from './app.routes';

// Firebase 設定（後で環境変数から読み込むように変更）
const firebaseConfig = {
  apiKey: 'dummy-api-key',
  authDomain: 'dummy-auth-domain',
  projectId: 'si-manager-13eb4',
  storageBucket: 'dummy-storage-bucket',
  messagingSenderId: 'dummy-messaging-sender-id',
  appId: 'dummy-app-id'
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideFirestore(() => getFirestore()),
    provideAuth(() => getAuth())
  ]
};
