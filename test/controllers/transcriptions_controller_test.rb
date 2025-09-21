require "test_helper"

class TranscriptionsControllerTest < ActionDispatch::IntegrationTest
  def setup
    @transcription = Transcription.create!(
      raw_text: "This is a test transcription",
      status: "completed",
      summary: "Test summary"
    )
  end

  test "should get new transcription page" do
    get transcribe_url
    assert_response :success
    assert_select "button", text: /Start Listening/
  end

  test "should get index" do
    get transcriptions_url
    assert_response :success
    assert_select "h2", text: /All Transcriptions/
  end

  test "should get show" do
    get transcription_url(@transcription)
    assert_response :success
    assert_select "h2", text: /Transcription Details/
  end

  test "should create transcription" do
    assert_difference('Transcription.count') do
      post transcriptions_url, 
           params: { transcription: { session_id: "test-session" } },
           as: :json
    end
    
    assert_response :created
    
    json_response = JSON.parse(response.body)
    assert json_response["id"]
    assert json_response["session_id"]
    assert_equal "processing", json_response["status"]
  end

  test "should get summary" do
    get summary_transcription_url(@transcription)
    assert_response :success
    
    json_response = JSON.parse(response.body)
    assert_equal @transcription.summary, json_response["summary"]
    assert_equal @transcription.raw_text, json_response["raw_text"]
  end

  test "should return 404 for missing transcription summary" do
    transcription_without_summary = Transcription.create!(
      raw_text: "Test without summary",
      status: "completed"
    )
    
    get summary_transcription_url(transcription_without_summary)
    assert_response :not_found
  end

  test "should update transcription with final text" do
    patch update_transcription_transcription_url(@transcription),
          params: { 
            final_text: "Updated transcription text",
            duration_seconds: 30
          }
    
    assert_response :success
    @transcription.reload
    assert_equal "Updated transcription text", @transcription.raw_text
    assert_equal 30, @transcription.duration_seconds
  end

  test "should return error for missing audio data or text" do
    patch update_transcription_transcription_url(@transcription),
          params: {}
    
    assert_response :bad_request
    json_response = JSON.parse(response.body)
    assert json_response["error"].include?("No audio data or text provided")
  end
end
