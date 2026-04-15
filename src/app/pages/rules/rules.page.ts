import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GameId, isGameId } from '../../games/game-pack.models';

@Component({
  selector: 'app-rules-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './rules.page.html',
  styleUrl: './rules.page.css'
})
export class RulesPageComponent {
  private readonly route = inject(ActivatedRoute);

  readonly gameId = computed<GameId>(() => {
    const value = this.route.snapshot.paramMap.get('gameId');
    return isGameId(value) ? value : 'hearts';
  });
}
