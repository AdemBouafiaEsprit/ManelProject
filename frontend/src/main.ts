import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// Patch to prevent 'Unable to preventDefault' error in ApexCharts
const originalAddEventListener = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function(this: any, eventName: string, eventHandler: any, options?: boolean | AddEventListenerOptions) {
  if (eventName === 'wheel' || eventName === 'mousewheel' || eventName === 'touchstart' || eventName === 'touchmove') {
    if (typeof options === 'object') {
      options.passive = false;
    } else if (options === undefined) {
      options = { passive: false };
    }
  }
  return originalAddEventListener.call(this, eventName, eventHandler, options);
} as any;

bootstrapApplication(AppComponent, appConfig)
  .catch((err: any) => console.error(err));
