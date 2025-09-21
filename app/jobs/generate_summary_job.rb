class GenerateSummaryJob < ApplicationJob
  queue_as :default

  def perform(transcription)
    return unless transcription.ready_for_summary?

    begin
      service = SummarizationService.new
      summary = service.summarize(transcription.raw_text)

      if summary.present?
        transcription.update!(summary: summary)

        ActionCable.server.broadcast(
          "transcription_#{transcription.session_id}",
          {
            type: 'summary_complete',
            summary: summary
          }
        )

        Rails.logger.info "Generated summary for transcription #{transcription.id}"
      else
        Rails.logger.error "Failed to generate summary for transcription #{transcription.id}"
      end
    rescue => e
      Rails.logger.error "GenerateSummaryJob failed: #{e.message}"
      
      ActionCable.server.broadcast(
        "transcription_#{transcription.session_id}",
        {
          type: 'error',
          message: 'Summary generation failed'
        }
      )
    end
  end
end
