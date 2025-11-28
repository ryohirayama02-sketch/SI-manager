// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

import { provideFirebaseApp, initializeApp, getApp } from '@angular/fire/app';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideAuth } from '@angular/fire/auth';

// ✅ firebase/auth から必要なものをインポート
import {
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
} from 'firebase/auth';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),

    // 🔥 Firebase 初期化（App）
    provideFirebaseApp(() =>
      initializeApp({
        apiKey: 'AIzaSyDLqLcEdEZgD3Q98x1nWH21ib_wO1zN6tI',
        authDomain: 'si-manager-13eb4.firebaseapp.com',
        projectId: 'si-manager-13eb4',
        storageBucket: 'si-manager-13eb4.appspot.com',
        messagingSenderId: '418747360580',
        appId: '1:418747360580:web:77028b37a5aba65da72311',
        measurementId: 'G-D7H9LGEN31',
      })
    ),

    // ✅ Auth 初期化（signInWithRedirectを使用するため、redirectResolverは不要）
    provideAuth(() =>
      initializeAuth(getApp(), {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      })
    ),

    provideFirestore(() => getFirestore()),
  ],
};
