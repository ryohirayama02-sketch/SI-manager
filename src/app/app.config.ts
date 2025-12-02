// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideAuth, getAuth } from '@angular/fire/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDLqLcEdEZgD3Q98x1nWH21ib_wO1zN6tI',
  authDomain: 'si-manager-13eb4.firebaseapp.com',
  projectId: 'si-manager-13eb4',
  storageBucket: 'si-manager-13eb4.appspot.com',
  messagingSenderId: '418747360580',
  appId: '1:418747360580:web:77028b37a5aba65da72311',
  measurementId: 'G-D7H9LGEN31',
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),

    // 🔥 Firebase 初期化（App）
    provideFirebaseApp(() => {
      console.log('[AppConfig] Firebase初期化開始', {
        projectId: firebaseConfig.projectId,
        authDomain: firebaseConfig.authDomain,
      });
      const app = initializeApp(firebaseConfig);
      console.log('[AppConfig] Firebase初期化完了', {
        name: app.name,
        options: app.options,
      });
      return app;
    }),

    // ✅ Auth 初期化（getAuthを使用して既存のインスタンスを取得または新規作成）
    provideAuth(() => {
      const auth = getAuth();
      console.log('[AppConfig] Auth初期化完了', {
        app: auth.app.name,
        currentUser: auth.currentUser ? 'あり' : 'なし',
      });
      return auth;
    }),

    provideFirestore(() => getFirestore()),
  ],
};
