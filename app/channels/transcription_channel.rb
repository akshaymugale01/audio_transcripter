class TranscriptionChannel < ApplicationCable::Channel
  def subscribed
    session_id = params[:session_id]
    
    if session_id.present?
      stream_from "transcription_#{session_id}"
      Rails.logger.info "Subscribed to transcription_#{session_id}"
    else
      reject
    end
  end

  def unsubscribed
    Rails.logger.info "Unsubscribed from transcription channel"
  end

  def receive(data)
    # Handle incoming data from the client (like partial transcription updates)
    session_id = params[:session_id]
    
    case data['type']
    when 'partial_transcription'
      # Broadcast partial transcription to all subscribers
      ActionCable.server.broadcast(
        "transcription_#{session_id}",
        {
          type: 'partial_transcription',
          text: data['text'],
          timestamp: Time.current
        }
      )
    end
  end
end
