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
  {
    path: 'alertes',
    title: 'Alertes · Crypto Radar',
    loadComponent: () => import('./features/alerts/alerts').then((m) => m.Alerts),
  },
  {
    path: 'simulateur',
    title: 'Simulateur · Crypto Radar',
    loadComponent: () => import('./features/dca/dca').then((m) => m.Dca),
  },
  {
    path: 'fiscalite',
    title: 'Fiscalité · Crypto Radar',
    loadComponent: () => import('./features/tax/tax').then((m) => m.Tax),
  },
  { path: '**', redirectTo: 'marche' },
];
