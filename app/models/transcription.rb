class Transcription < ApplicationRecord
  validates :status, inclusion: { in: %w[processing completed failed] }

  scope :completed, -> { where(status: 'completed') }
  scope :processing, -> { where(status: 'processing') }
  scope :failed, -> { where(status: 'failed') }

  before_validation :ensure_session_id, on: :create

  def speakers
    return [] unless speaker_data.present?
    
    begin
      JSON.parse(speaker_data)
    rescue JSON::ParserError
      []
    end
  end

  def ready_for_summary?
    status == 'completed' && raw_text.present? && summary.blank?
  end

  def mark_completed!
    update!(status: 'completed')
  end

  def mark_failed!
    update!(status: 'failed')
  end

  private

  def ensure_session_id
    self.session_id ||= SecureRandom.uuid
  end
end
