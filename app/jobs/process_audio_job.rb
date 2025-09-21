require 'base64'

class ProcessAudioJob < ApplicationJob
  queue_as :default

  def perform(transcription_id, audio_b64)
    transcription = nil
    begin
      transcription = Transcription.find(transcription_id)
      audio_blob = Base64.decode64(audio_b64)
      service = SpeechToTextService.new
      result = service.transcribe(audio_blob)

      if result[:success]
        transcription.update!(  
          raw_text: result[:text],
          status: 'completed',
          speaker_data: result[:speakers]&.to_json,
          duration_seconds: result[:duration]
        )

        ActionCable.server.broadcast(
          "transcription_#{transcription.session_id}",
          {
            type: 'transcription_complete',
            text: result[:text],
            speakers: result[:speakers]
          }
        )

        GenerateSummaryJob.perform_later(transcription)
      else
        transcription.mark_failed!
        
        ActionCable.server.broadcast(
          "transcription_#{transcription.session_id}",
          {
            type: 'error',
            message: result[:error]
          }
        )
      end
    rescue => e
      Rails.logger.error "ProcessAudioJob failed: #{e.class}: #{e.message}\n#{e.backtrace&.first(5)&.join("\n")}"
      transcription&.mark_failed!
      
      if transcription
        ActionCable.server.broadcast(
          "transcription_#{transcription.session_id}",
          {
            type: 'error',
            message: "Audio processing failed: #{e.message}"
          }
        )
      end
    end
  end
end
