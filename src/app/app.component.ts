import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component';
import { Firestore } from '@angular/fire/firestore';
import { cleanupMissingRoomId } from './scripts/cleanup-missing-roomid';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  title = 'si-manager';

  // NOTE: 一時的なメンテ実行用。実行後に削除してください。
  firestore = inject(Firestore);

  async ngOnInit(): Promise<void> {
    await cleanupMissingRoomId(this.firestore);
  }
}
