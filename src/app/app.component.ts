import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component';
import { Firestore } from '@angular/fire/firestore';
import { cleanupMissingRoomId } from './scripts/cleanup-missing-roomid';
import { RoomIdService } from './services/room-id.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  title = 'si-manager';

  // NOTE: 一時的なメンテ実行用。通常起動では呼ばない。
  firestore = inject(Firestore);
  roomIdService = inject(RoomIdService);

  async ngOnInit(): Promise<void> {
    // cleanupMissingRoomId を自動実行すると employeeChangeHistory が削除され
    // 資格変更アラートの元データが消えるため、通常起動では実行しない。
    // 必要なときだけ手動で呼び出してください。
    // const roomId = this.roomIdService.requireRoomId();
    // await cleanupMissingRoomId(this.firestore, roomId);
  }
}
