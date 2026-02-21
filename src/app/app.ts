import { Component, HostListener, OnDestroy, OnInit, inject, isDevMode } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './theme.service';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  private readonly themeService = inject(ThemeService);
  isMobile = false;
  isInstalled = false;
  isIos = false;
  canPromptInstall = false;
  private deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

  ngOnInit(): void {
    this.themeService.initialize();
    this.updateClientState();
    window.addEventListener('beforeinstallprompt', this.onBeforeInstallPrompt);
    window.addEventListener('appinstalled', this.onAppInstalled);
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeinstallprompt', this.onBeforeInstallPrompt);
    window.removeEventListener('appinstalled', this.onAppInstalled);
  }

  get showInstallGate(): boolean {
    return !isDevMode() && this.isMobile && !this.isInstalled;
  }

  @HostListener('window:resize')
  @HostListener('window:orientationchange')
  @HostListener('window:focus')
  onViewportChange(): void {
    this.updateClientState();
  }

  private updateClientState(): void {
    this.isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    this.isMobile = this.matchesMedia('(max-width: 900px) and (pointer: coarse)');
    this.isInstalled = this.isRunningInstalled();
    this.canPromptInstall = Boolean(this.deferredInstallPrompt) && !this.isInstalled;
  }

  private isRunningInstalled(): boolean {
    const standaloneDisplayMode = this.matchesMedia('(display-mode: standalone)');
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
    const iosStandalone = Boolean(navigatorWithStandalone.standalone);

    return standaloneDisplayMode || iosStandalone;
  }

  private matchesMedia(query: string): boolean {
    if (typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(query).matches;
  }

  async promptInstall(): Promise<void> {
    if (!this.deferredInstallPrompt) {
      return;
    }

    await this.deferredInstallPrompt.prompt();
    await this.deferredInstallPrompt.userChoice;
    this.deferredInstallPrompt = null;
    this.updateClientState();
  }

  private onBeforeInstallPrompt = (event: Event): void => {
    event.preventDefault();
    this.deferredInstallPrompt = event as BeforeInstallPromptEvent;
    this.updateClientState();
  };

  private onAppInstalled = (): void => {
    this.deferredInstallPrompt = null;
    this.updateClientState();
  };
}
