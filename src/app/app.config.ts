// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideAuth, getAuth } from '@angular/fire/auth';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),

    // 🔥 Firebase 初期化（環境変数はそのままでOK）
    provideFirebaseApp(() =>
      initializeApp({
        apiKey: 'AIzaSyDLqLcEdEZgD3Q98x1nWH21ib_wO1zN6tI',
        authDomain: 'si-manager-13eb4.firebaseapp.com',
        projectId: 'si-manager-13eb4',
        storageBucket: 'si-manager-13eb4.appspot.com', // ★ 修正ポイント
        messagingSenderId: '418747360580',
        appId: '1:418747360580:web:77028b37a5aba65da72311',
        measurementId: 'G-D7H9LGEN31',
      })
    ),

    provideFirestore(() => getFirestore()),
    provideAuth(() => getAuth()),
  ],
};
