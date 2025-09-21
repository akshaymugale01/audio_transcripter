require "test_helper"

class SummarizationServiceTest < ActiveSupport::TestCase
  def setup
    @service = SummarizationService.new
    @sample_text = "This is a long conversation about project planning. We discussed the timeline, budget, and resource allocation. The team agreed on the next steps and decided to meet again next week. Everyone was satisfied with the progress made so far."
  end

  test "should return summary for valid text" do
    # Since we can't rely on external APIs in tests, we'll test the simple summarization
    summary = @service.send(:simple_summarization, @sample_text)
    
    assert_not_nil summary
    assert summary.start_with?("Summary:")
    assert summary.length < @sample_text.length
  end

  test "should return original text for short text" do
    short_text = "Short sentence."
    summary = @service.send(:simple_summarization, short_text)
    
    assert_equal short_text, summary
  end

  test "should handle empty text" do
    summary = @service.summarize("")
    assert_nil summary
  end

  test "should handle nil text" do
    summary = @service.summarize(nil)
    assert_nil summary
  end

  test "should build proper summarization prompt" do
    prompt = @service.send(:build_summarization_prompt)
    
    assert prompt.include?("concise summary")
    assert prompt.include?("main points")
    assert prompt.include?("key topics")
  end

  test "should extract key sentences for summarization" do
    long_text = "First sentence here. Second sentence in the middle. Third sentence at the end. Fourth sentence after that. Fifth and final sentence."
    summary = @service.send(:simple_summarization, long_text)
    
    # Should include first and last sentences
    assert summary.include?("First sentence here")
    assert summary.include?("Fifth and final sentence")
  end

  test "should handle text with various punctuation" do
    text_with_punctuation = "What is the plan? We need to decide! This is important. Let's move forward."
    summary = @service.send(:simple_summarization, text_with_punctuation)
    
    assert_not_nil summary
    assert summary.start_with?("Summary:")
  end
end