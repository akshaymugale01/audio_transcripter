# Configure MIME types for JavaScript modules
# This ensures that .js files are served with the correct MIME type for ES modules

# Register JavaScript MIME type for importmap
Mime::Type.register "application/javascript", :js, %w(text/javascript application/x-javascript)

# Ensure JS files are served with correct content type
Rails.application.config.to_prepare do
  ActionController::Renderers.add :js do |js, options|
    self.content_type = 'application/javascript'
    js.respond_to?(:to_s) ? js.to_s : js
  end
end

# Configure public file server to serve JS with correct MIME type
Rails.application.config.public_file_server.headers = {
  'Cache-Control' => 'public, max-age=31536000'
}