// Emergency service worker cleanup (must run before any other imports)
// This will unregister any cached service workers that might be causing issues
if ('serviceWorker' in navigator) {
  // Unregister all existing service workers
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    registrations.forEach(function(registration) {
      console.log('Unregistering service worker:', registration.scope);
      registration.unregister().then(function(success) {
        if (success) {
          console.log('Service worker unregistered successfully');
        }
      }).catch(function(error) {
        console.log('Service worker unregistration failed:', error);
      });
    });
  });

  // Listen for messages from service worker
  navigator.serviceWorker.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'FORCE_RELOAD') {
      console.log('Service worker requested reload:', event.data.message);
      // Small delay to ensure service worker cleanup is complete
      setTimeout(() => {
        window.location.reload(true);
      }, 1000);
    }
  });
}

// Configure your import map in config/importmap.rb. Read more: https://github.com/rails/importmap-rails
import "@hotwired/turbo-rails"
import "controllers"
import * as bootstrap from "bootstrap"
import "channels"
