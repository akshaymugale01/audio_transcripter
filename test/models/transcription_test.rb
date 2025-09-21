require "test_helper"

class TranscriptionTest < ActiveSupport::TestCase
  def setup
    @transcription = Transcription.new(
      raw_text: "This is a test transcription",
      status: "processing"
    )
  end

  test "should be valid with valid attributes" do
    assert @transcription.valid?
  end

  test "should not validate session_id presence since it's auto-generated" do
    @transcription.session_id = nil
    assert @transcription.valid?
    # session_id should be generated on validation
    assert_not_nil @transcription.session_id
  end

  test "should validate status inclusion" do
    @transcription.status = "invalid_status"
    assert_not @transcription.valid?
    assert_includes @transcription.errors[:status], "is not included in the list"
  end

  test "should generate session_id before create" do
    transcription = Transcription.create!(raw_text: "Test")
    assert_not_nil transcription.session_id
    assert_match(/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/, transcription.session_id)
  end

  test "should parse speaker data correctly" do
    speaker_data = [
      { speaker: 0, text: "Hello world" },
      { speaker: 1, text: "Hi there" }
    ].to_json
    
    @transcription.speaker_data = speaker_data
    speakers = @transcription.speakers
    
    assert_equal 2, speakers.length
    assert_equal 0, speakers.first["speaker"]
    assert_equal "Hello world", speakers.first["text"]
  end

  test "should return empty array for invalid speaker data" do
    @transcription.speaker_data = "invalid json"
    assert_equal [], @transcription.speakers
  end

  test "should identify ready for summary" do
    @transcription.status = "completed"
    @transcription.raw_text = "Some text"
    @transcription.summary = nil
    
    assert @transcription.ready_for_summary?
  end

  test "should not be ready for summary without text" do
    @transcription.status = "completed"
    @transcription.raw_text = nil
    
    assert_not @transcription.ready_for_summary?
  end

  test "should not be ready for summary if already has summary" do
    @transcription.status = "completed"
    @transcription.raw_text = "Some text"
    @transcription.summary = "Existing summary"
    
    assert_not @transcription.ready_for_summary?
  end

  test "should mark as completed" do
    @transcription.save!
    @transcription.mark_completed!
    assert_equal "completed", @transcription.status
  end

  test "should mark as failed" do
    @transcription.save!
    @transcription.mark_failed!
    assert_equal "failed", @transcription.status
  end

  test "scopes should work correctly" do
    completed = Transcription.create!(raw_text: "Test", status: "completed")
    processing = Transcription.create!(raw_text: "Test", status: "processing")
    failed = Transcription.create!(raw_text: "Test", status: "failed")

    assert_includes Transcription.completed, completed
    assert_includes Transcription.processing, processing
    assert_includes Transcription.failed, failed
    
    assert_not_includes Transcription.completed, processing
    assert_not_includes Transcription.processing, completed
  end
end
