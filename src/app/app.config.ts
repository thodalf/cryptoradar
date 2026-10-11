import { ApplicationConfig, Provider, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  provideRouter, withComponentInputBinding, withHashLocation, withInMemoryScrolling,
} from '@angular/router';
import { routes } from './app.routes';
import { DEMO_MODE } from './core/data-mode';
import { BinanceRestService } from './core/api/binance-rest.service';
import { BinanceWsService } from './core/api/binance-ws.service';
import { DemoMarketService } from './core/api/demo-market.service';

/** En mode démo, la source simulée remplace les deux services Binance. */
const marketProviders: Provider[] = DEMO_MODE
  ? [
      { provide: BinanceRestService, useExisting: DemoMarketService },
      { provide: BinanceWsService, useExisting: DemoMarketService },
    ]
  : [];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    ...marketProviders,
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
      // une page hébergée en sous-chemin (artifact) a besoin du routage par #
      ...(DEMO_MODE ? [withHashLocation()] : []),
    ),
  ],
};
