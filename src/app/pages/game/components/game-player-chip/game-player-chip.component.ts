import { Component, Input } from '@angular/core';
import { Player } from '../../../../game/game.models';

@Component({
  selector: 'app-game-player-chip',
  standalone: true,
  templateUrl: './game-player-chip.component.html',
  styleUrl: './game-player-chip.component.css'
})
export class GamePlayerChipComponent {
  @Input({ required: true }) player!: Player;
  @Input({ required: true }) roundPoints = 0;
  @Input() avatar = '';
  @Input() showAvatar = true;
  @Input() showName = true;
  @Input() extraClass = '';
  @Input() isTrickLeader = false;
  @Input() isPassTarget = false;
  @Input() isPassSource = false;
}
