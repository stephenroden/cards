import { Routes } from '@angular/router';
import { GameHostPageComponent } from './pages/game-host/game-host.page';
import { HomePageComponent } from './pages/home/home.page';
import { ResultsPageComponent } from './pages/results/results.page';
import { RulesPageComponent } from './pages/rules/rules.page';

export const routes: Routes = [
  { path: '', component: HomePageComponent, title: 'Cards Pack' },
  { path: 'game/:gameId', component: GameHostPageComponent, title: 'Cards' },
  { path: 'results/:gameId', component: ResultsPageComponent, title: 'Results' },
  { path: 'rules/:gameId', component: RulesPageComponent, title: 'Rules' },
  { path: '**', redirectTo: '' }
];
