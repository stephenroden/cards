import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HeartsPageComponent } from '../hearts/hearts.page';
import { PokerPageComponent } from '../poker/poker.page';
import { BlackjackPageComponent } from '../blackjack/blackjack.page';
import { isGameId } from '../../games/game-pack.models';

@Component({
  selector: 'app-game-host-page',
  standalone: true,
  imports: [HeartsPageComponent, PokerPageComponent, BlackjackPageComponent],
  templateUrl: './game-host.page.html'
})
export class GameHostPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly gameId = computed(() => {
    const value = this.route.snapshot.paramMap.get('gameId');
    if (!isGameId(value)) {
      void this.router.navigate(['/']);
      return 'hearts';
    }
    return value;
  });
}
