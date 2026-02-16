import { Routes } from '@angular/router';
import { GamePageComponent } from './pages/game/game.page';
import { HomePageComponent } from './pages/home/home.page';
import { ResultsPageComponent } from './pages/results/results.page';
import { RulesPageComponent } from './pages/rules/rules.page';

export const routes: Routes = [
  { path: '', component: HomePageComponent, title: 'Cards' },
  { path: 'game', component: GamePageComponent, title: 'Hearts' },
  { path: 'results', component: ResultsPageComponent, title: 'Results' },
  { path: 'rules', component: RulesPageComponent, title: 'Rules' },
  { path: '**', redirectTo: '' }
];
