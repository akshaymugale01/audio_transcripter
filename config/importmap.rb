# Pin npm packages by running ./bin/importmap

pin "application"
pin "@hotwired/turbo-rails", to: "turbo.min.js"
pin "@hotwired/stimulus", to: "stimulus.min.js"
pin "@hotwired/stimulus-loading", to: "stimulus-loading.js"
pin_all_from "app/javascript/controllers", under: "controllers"
pin "bootstrap", to: "bootstrap.bundle.min.js"
pin "@rails/actioncable", to: "actioncable.esm.js"

# Explicitly pin channels to avoid MIME type issues
pin "channels", to: "channels/index.js"
pin "channels/consumer", to: "channels/consumer.js"
pin "channels/transcription_channel", to: "channels/transcription_channel.js"

# Pin audio processor for AudioWorklet
pin "audio-stream-processor", to: "audio-stream-processor.js"
