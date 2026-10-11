import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'marche' },
  {
    path: 'marche',
    title: 'Marché · Crypto Radar',
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'opportunites',
    title: 'Opportunités · Crypto Radar',
    loadComponent: () => import('./features/opportunities/opportunities').then((m) => m.Opportunities),
  },
  {
    path: 'portefeuille',
    title: 'Portefeuille · Crypto Radar',
    loadComponent: () => import('./features/portfolio/portfolio').then((m) => m.Portfolio),
  },
  { path: '**', redirectTo: 'marche' },
];
