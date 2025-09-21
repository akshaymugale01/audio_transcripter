Rails.application.routes.draw do

  get "up" => "rails/health#show", as: :rails_health_check
  get "transcribe" => "transcriptions#new", as: :transcribe
  resources :transcriptions, only: [:create, :show, :index] do
    member do
      get :summary
      patch :update_transcription
    end
    collection do
      post :streaming_token
    end
  end

  mount ActionCable.server => '/cable'

  get '/service-worker.js', to: proc { [200, { 'Content-Type' => 'application/javascript' }, ["self.addEventListener('install', e => self.skipWaiting());self.addEventListener('activate', e => self.clients.claim());self.addEventListener('fetch', ()=>{});"]] }

  root "transcriptions#new"
end
