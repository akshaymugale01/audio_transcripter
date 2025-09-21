class SummarizationService
  include HTTParty

  def initialize
    @provider = ENV.fetch('SUMMARIZATION_PROVIDER', 'assemblyai')
    setup_provider
  end

  def summarize(text)
    return nil if text.blank?

    case @provider.downcase
    when 'openai'
      summarize_with_openai(text)
    when 'anthropic'
      summarize_with_anthropic(text)
    when 'assemblyai'
      summarize_with_assemblyai(text)
    else
      simple_summarization(text)
    end
  rescue => e
    Rails.logger.error "SummarizationService error: #{e.message}"
    nil
  end

  private

  def setup_provider
    case @provider.downcase
    when 'openai'
      @api_key = ENV['OPENAI_API_KEY'] || ENV['OPENAI_SUMMARIZATION_API_KEY']
      @base_url = 'https://api.openai.com/v1'
    when 'anthropic'
      @api_key = ENV['ANTHROPIC_API_KEY']
      @base_url = 'https://api.anthropic.com/v1'
    when 'assemblyai'
      @api_key = ENV['ASSEMBLYAI_API_KEY'] || "2f0ed507a18c4acd8284fd60a9230212"
      @base_url = 'https://api.assemblyai.com'
    end
  end

  def summarize_with_openai(text)
    return simple_summarization(text) if @api_key.blank?

    url = "#{@base_url}/chat/completions"
    
    response = HTTParty.post(
      url,
      headers: {
        'Authorization' => "Bearer #{@api_key}",
        'Content-Type' => 'application/json'
      },
      body: {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: build_summarization_prompt
          },
          {
            role: 'user',
            content: text
          }
        ],
        max_tokens: 200,
        temperature: 0.3
      }.to_json
    )
    if response.success?
      data = response.parsed_response
      data.dig('choices', 0, 'message', 'content')&.strip
    else
      Rails.logger.error "OpenAI API error: #{response.code} - #{response.message}"
      simple_summarization(text)
    end
  end

  def summarize_with_anthropic(text)
    return simple_summarization(text) if @api_key.blank?

    url = "#{@base_url}/messages"
    response = HTTParty.post(
      url,
      headers: {
        'x-api-key' => @api_key,
        'Content-Type' => 'application/json',
        'anthropic-version' => '2023-06-01'
      },
      body: {
        model: 'claude-3-haiku-20240307',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: "#{build_summarization_prompt}\n\nText to summarize:\n#{text}"
          }
        ]
      }.to_json
    )

    if response.success?
      data = response.parsed_response
      data.dig('content', 0, 'text')&.strip
    else
      Rails.logger.error "Anthropic API error: #{response.code} - #{response.message}"
      simple_summarization(text)
    end
  end

  def summarize_with_assemblyai(text)
    return simple_summarization(text) if @api_key.blank?
    url = "#{@base_url}/lemur/v3/generate/summary"
    response = HTTParty.post(
      url,
      headers: {
        'Authorization' => @api_key,
        'Content-Type' => 'application/json'
      },
      body: {
        final_model: 'anthropic/claude-3-haiku', 
        context: build_summarization_prompt,
        max_output_size: 3000,
        temperature: 0,
        input_text: text 
      }.to_json
    )

    Rails.logger.info "Ai Summary response: #{response.code} - #{response.body}"
    if response.success?
      data = response.parsed_response
      summary = data['response']&.strip
      # If Sucess with 200 ok 
      Rails.logger.info "Generated AssemblyAI summary: #{summary}"
      summary
    else
      Rails.logger.error "AssemblyAI LeMUR API error: #{response.code} - #{response.message}"
      # If fallback
      simple_summarization(text)
    end
  rescue => e
    Rails.logger.error "AssemblyAI summarization error: #{e.message}"
    simple_summarization(text)
  end

  def simple_summarization(text, max_sentences: 3)
  sentences = text.split(/(?<=[.!?])\s+/).map(&:strip).reject(&:empty?)
  return text if sentences.length <= max_sentences

  stopwords = %w[the a an and or but if then with of to in on at for from by is are was were be been it this that]
  word_freq = Hash.new(0)

  sentences.each do |sentence|
    sentence.downcase.scan(/\w+/).each do |word|
      word_freq[word] += 1 unless stopwords.include?(word)
    end
  end
  #frequency of words  
  scored_sentences = sentences.map do |sentence|
    score = sentence.downcase.scan(/\w+/).map { |w| word_freq[w] }.sum
    [sentence, score]
  end

  # Pick top N scored sentences but preserve main order
  top_sentences = scored_sentences.sort_by { |_, score| -score }
                                  .first(max_sentences)
                                  .map(&:first)
  ordered_summary = sentences.select { |s| top_sentences.include?(s) }

  "Summary: #{ordered_summary.join(' ')}"
end


  def build_summarization_prompt
    <<~PROMPT
      Please provide a concise summary of the following transcribed conversation or speech. 
      Focus on the main points, key topics discussed, and any important conclusions or decisions made.
      Keep the summary brief but informative, ideally 2-3 sentences.
      If multiple speakers are involved, mention the key points from each speaker.
      
      Format the response as a clear, readable summary without unnecessary formatting.
    PROMPT
  end
end