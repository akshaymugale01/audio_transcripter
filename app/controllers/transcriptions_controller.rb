require 'base64'
require 'httparty'

class TranscriptionsController < ApplicationController
  before_action :set_transcription, only: [:show, :summary, :update_transcription]
  skip_before_action :verify_authenticity_token, only: [:create, :update_transcription, :streaming_token]

  # GET /transcribe - The main transcription interface
  def new
    @transcription = Transcription.new
  end

  # GET /transcriptions - List all transcriptions
  def index
    @transcriptions = Transcription.all.order(created_at: :desc)
  end

  # GET /transcriptions/:id - Show specific transcription
  def show
  end

  # POST /transcriptions - Create new transcription session
  def create
    @transcription = Transcription.new(transcription_params)
    
    if @transcription.save
      render json: { 
        id: @transcription.id, 
        session_id: @transcription.session_id,
        status: @transcription.status 
      }, status: :created
    else
      render json: { errors: @transcription.errors }, status: :unprocessable_entity
    end
  end

  def update_transcription
    if params[:audio_blob].present?
      uploaded = params[:audio_blob]
      begin
        data = if uploaded.respond_to?(:read)
          uploaded.read
        elsif uploaded.respond_to?(:path)
          File.binread(uploaded.path)
        else
          uploaded.to_s
        end

        encoded = Base64.strict_encode64(data)

        ProcessAudioJob.perform_later(@transcription.id, encoded)
        render json: { status: 'processing' }
      rescue => e
        Rails.logger.error "Failed to enqueue audio processing: #{e.message}"
        render json: { error: 'Failed to enqueue audio processing' }, status: :internal_server_error
      end
    elsif params[:final_text].present?
      # Update with final transcription text
      @transcription.update!(
        raw_text: params[:final_text],
        status: 'completed',
        duration_seconds: params[:duration_seconds],
        speaker_data: params[:speaker_data]
      )
      
      GenerateSummaryJob.perform_later(@transcription)
      
      render json: { status: 'completed', transcription: @transcription }
    else
      render json: { error: 'No audio data or text provided' }, status: :bad_request
    end
  end

  # GET /transcriptions/:id/summary - Get transcription summary
  def summary
    if @transcription.summary.present?
      render json: { 
        summary: @transcription.summary,
        raw_text: @transcription.raw_text,
        status: @transcription.status,
        speakers: @transcription.speakers
      }
    else
      render json: { error: 'Summary not yet available' }, status: :not_found
    end
  end

  # POST /transcriptions/streaming_token - Generate AssemblyAI streaming token
  def streaming_token
    api_key = "2f0ed507a18c4acd8284fd60a9230212"
    
    Rails.logger.info "Attempting to generate streaming token..."
    
    response = HTTParty.get(
      'https://streaming.assemblyai.com/v3/token',
      headers: {
        'Authorization' => "Bearer #{api_key}"
      },
      query: {
        expires_in_seconds: 600 # 10 minutes (max allowed)
      }
    )

    Rails.logger.info "AssemblyAI response status: #{response.code}"
    Rails.logger.info "AssemblyAI response body: #{response.body}"

    if response.success?
      render json: { token: response.parsed_response['token'] }
    else
      Rails.logger.error "AssemblyAI API error: #{response.code} - #{response.body}"
      render json: { error: 'Failed to generate streaming token' }, status: :internal_server_error
    end
  rescue => e
    Rails.logger.error "Failed to generate streaming token: #{e.message}"
    Rails.logger.error e.backtrace.join("\n")
    render json: { error: 'Failed to generate streaming token' }, status: :internal_server_error
  end

  private

  def set_transcription
    @transcription = Transcription.find(params[:id])
  rescue ActiveRecord::RecordNotFound
    render json: { error: 'Transcription not found' }, status: :not_found
  end

  def transcription_params
    params.permit(:session_id, :metadata)
  end
end
