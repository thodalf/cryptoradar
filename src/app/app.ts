import { BreakpointObserver } from '@angular/cdk/layout';
import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { DEMO_MODE } from './core/data-mode';
import { MarketStore } from './core/state/market.store';
import { OpportunitiesStore } from './core/state/opportunities.store';
import { AlertsStore } from './core/state/alerts.store';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, DatePipe,
    MatSidenavModule, MatToolbarModule, MatListModule, MatIconModule,
    MatButtonModule, MatTooltipModule, MatBadgeModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly market = inject(MarketStore);
  protected readonly opps = inject(OpportunitiesStore);
  /** Instancié dès le démarrage pour surveiller les alertes sur toutes les pages. */
  protected readonly alerts = inject(AlertsStore);

  protected readonly isHandset = toSignal(
    inject(BreakpointObserver).observe('(max-width: 900px)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  protected readonly demo = DEMO_MODE;

  protected readonly nav = [
    { path: '/marche', icon: 'monitoring', label: 'Marché' },
    { path: '/opportunites', icon: 'radar', label: 'Opportunités' },
    { path: '/portefeuille', icon: 'account_balance_wallet', label: 'Portefeuille' },
    { path: '/alertes', icon: 'notifications', label: 'Alertes' },
    { path: '/simulateur', icon: 'calendar_month', label: 'Simulateur DCA' },
    { path: '/fiscalite', icon: 'receipt_long', label: 'Fiscalité' },
  ];

  protected badge(path: string): number | null {
    const n = path === '/opportunites' ? this.signalCount() : path === '/alertes' ? this.alerts.unseen() : 0;
    return n || null;
  }

  protected readonly signalCount = computed(() => {
    const c = this.opps.counts();
    return c.buy + c.sell;
  });

  protected readonly connectionLabel = computed(() => {
    switch (this.market.connection()) {
      case 'live': return DEMO_MODE ? 'Simulation' : 'Temps réel';
      case 'connecting': return 'Connexion…';
      case 'reconnecting': return 'Reconnexion…';
      default: return 'Hors ligne';
    }
  });

  constructor() {
    inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
    this.market.start();
  }
}
