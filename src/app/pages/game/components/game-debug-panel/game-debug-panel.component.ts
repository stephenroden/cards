import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { TraceLike, genericContext, jDiamondContext, qSpadeContext, reasonLabel } from '../../game-page.utils';

export interface GameDebugEntry {
  index: number;
  type: 'play' | 'system';
  playerName: string;
  playerClass: string;
  cardLabel: string;
  trace: TraceLike;
}

@Component({
  selector: 'app-game-debug-panel',
  standalone: true,
  templateUrl: './game-debug-panel.component.html',
  styleUrl: './game-debug-panel.component.css'
})
export class GameDebugPanelComponent implements OnChanges, AfterViewInit {
  @Input({ required: true }) entries: GameDebugEntry[] = [];
  @Output() readonly close = new EventEmitter<void>();
  @ViewChild('debugLog') private debugLogRef?: ElementRef<HTMLDivElement>;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entries']) {
      this.scrollToBottomSoon();
    }
  }

  ngAfterViewInit(): void {
    this.scrollToBottomSoon();
  }

  emitClose(): void {
    this.close.emit();
  }

  reasonLabel(reasonCode: string): string {
    return reasonLabel(reasonCode);
  }

  qSpadeContext(trace: TraceLike): string {
    return qSpadeContext(trace);
  }

  jDiamondContext(trace: TraceLike): string {
    return jDiamondContext(trace);
  }

  genericContext(trace: TraceLike): string {
    return genericContext(trace);
  }

  private scrollToBottomSoon(): void {
    setTimeout(() => {
      const container = this.debugLogRef?.nativeElement;
      if (!container) {
        return;
      }
      container.scrollTop = container.scrollHeight;
    }, 0);
  }
}
