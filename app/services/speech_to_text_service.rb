class SpeechToTextService
  include HTTParty

  def initialize
    @api_key = "2f0ed507a18c4acd8284fd60a9230212"
    @base_url = 'https://api.assemblyai.com/v2'

    if defined?(Rails) && Rails.env.development?
      masked = if @api_key.present? && @api_key.length >= 8
        "#{@api_key[0,4]}...#{@api_key[-4,4]}"
      elsif @api_key.present?
        "#{@api_key[0,2]}..."
      else
        'nil'
      end
      Rails.logger.info("SpeechToTextService init: provider=assemblyai key_present=#{@api_key.present?} key_len=#{@api_key.to_s.length} key_mask=#{masked}")
    end

  end

  def transcribe(audio_blob)
    if @api_key.blank?
      return { success: false, error: 'Api key not configured' }
    end
    if audio_blob.nil? || audio_blob.bytesize.zero?
      return { success: false, error: 'No audio received' }
    end
    if defined?(Rails) && Rails.env.development?
      Rails.logger.info "SpeechToTextService: audio size=#{audio_blob.bytesize} bytes"
    end
    transcribe_with_assemblyai(audio_blob)
  rescue => e
    Rails.logger.error "SpeechToTextService error: #{e.message}"
    { success: false, error: e.message }
  end

  private

  def transcribe_with_assemblyai(audio_blob)
    # AssemblyAI flow: upload -> create transcript -> poll until completed
    upload_url = "#{@base_url}/upload"

    # 1) Upload raw audio bytes
    upload_resp = HTTParty.post(
      upload_url,
      headers: {
        'Authorization' => @api_key,
        'Content-Type' => 'application/octet-stream'
      },
      body: audio_blob
    )

    unless upload_resp.success?
      body = begin
        upload_resp.parsed_response.is_a?(String) ? upload_resp.parsed_response : upload_resp.parsed_response.inspect
      rescue
        upload_resp.body.to_s
      end
      Rails.logger.error "AssemblyAI upload error: status=#{upload_resp.code} body=#{body}"
      return { success: false, error: "AssemblyAI upload error: #{upload_resp.code} #{upload_resp.message}" }
    end

    uploaded_url = upload_resp.parsed_response['upload_url'] || upload_resp.parsed_response['url']
    return { success: false, error: 'AssemblyAI upload did not return an upload_url' } if uploaded_url.blank?

    # 2) Create transcript request
    transcript_create_url = "#{@base_url}/transcript"
    create_resp = HTTParty.post(
      transcript_create_url,
      headers: {
        'Authorization' => @api_key,
        'Content-Type' => 'application/json'
      },
      body: {
        audio_url: uploaded_url,
        language_code: 'en_us',
        punctuate: true,
        format_text: true,
        speaker_labels: true, 
        speech_model: 'universal'
      }.to_json
    )

    unless create_resp.success?
      body = begin
        create_resp.parsed_response.is_a?(String) ? create_resp.parsed_response : create_resp.parsed_response.inspect
      rescue
        create_resp.body.to_s
      end
      Rails.logger.error "AssemblyAI create transcript error: status=#{create_resp.code} body=#{body}"
      return { success: false, error: "AssemblyAI transcript creation error: #{create_resp.code} #{create_resp.message}" }
    end

    transcript_id = create_resp.parsed_response['id']
    return { success: false, error: 'AssemblyAI did not return a transcript id' } if transcript_id.blank?

    polling_url = "#{@base_url}/transcript/#{transcript_id}"
    max_attempts = 30
    attempt = 0
    poll_body = nil
    loop do
      attempt += 1
      poll_resp = HTTParty.get(
        polling_url,
        headers: { 'Authorization' => @api_key }
      )

      unless poll_resp.success?
        body = begin
          poll_resp.parsed_response.is_a?(String) ? poll_resp.parsed_response : poll_resp.parsed_response.inspect
        rescue
          poll_resp.body.to_s
        end
        Rails.logger.error "AssemblyAI polling error: status=#{poll_resp.code} body=#{body}"
        return { success: false, error: "AssemblyAI polling error: #{poll_resp.code} #{poll_resp.message}" }
      end

      poll_body = poll_resp.parsed_response
      case poll_body['status']
      when 'completed'
        break
      when 'error'
        return { success: false, error: "AssemblyAI transcription failed: #{poll_body['error']}" }
      else
        return { success: false, error: 'AssemblyAI transcription timed out' } if attempt >= max_attempts
        sleep 1.5
      end
    end

    parse_assemblyai_response(poll_body)
  end

  def parse_assemblyai_response(data)
    text = data['text']
    duration = data['audio_duration']
    confidence = data['confidence']

    speakers = []
    if data['utterances'].is_a?(Array)
      speakers = data['utterances'].map do |utt|
        {
          speaker: utt['speaker'],
          start: (utt['start'] / 1000.0 rescue utt['start']),
          end: (utt['end'] / 1000.0 rescue utt['end']),
          text: utt['text'] || (utt['words']&.map { |w| w['text'] }&.join(' '))
        }
      end
    end

    {
      success: true,
      text: text,
      speakers: speakers,
      duration: duration,
      confidence: confidence,
      provider: 'assemblyai'
    }
  end
end