import { Controller } from "@hotwired/stimulus"
import consumer from "channels/consumer"

export default class extends Controller {
  static targets = ["startBtn", "stopBtn", "statusText", "statusAlert", "liveTranscription", "summaryContent", "finalResults", "finalTranscription", "speakerInfo", "speakersList"]

  connect() {
    this.mediaRecorder = null
    this.audioChunks = []
    this.currentTranscriptionId = null
    this.currentSessionId = null
    this.cable = null
    this.subscription = null
    this.clearTranscriptionTimer = null
    this.pauseTimeout = 3000 
    this.assemblySocket = null
    this.audioContext = null
    this.processor = null
    this.isStreaming = false
    
    // Check for browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.updateStatus("error", "Your browser doesn't support audio recording.")
      return
    }

    // Enable start button
    this.startBtnTarget.disabled = false
    this.updateStatus("info", "Click 'Start Listening' to begin transcription")
  }

  disconnect() {
    if (this.subscription) {
      this.subscription.unsubscribe()
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop()
    }
    if (this.assemblySocket) {
      this.assemblySocket.close()
    }
    if (this.audioContext) {
      this.audioContext.close()
    }
    // Clear any pending timer
    if (this.clearTranscriptionTimer) {
      clearTimeout(this.clearTranscriptionTimer)
    }
  }

  async getStreamingToken() {
    try {
      const response = await fetch('/transcriptions/streaming_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content
        }
      })

      if (!response.ok) {
        throw new Error('Failed to get streaming token')
      }

      const data = await response.json()
      return data.token
    } catch (error) {
      console.error('Error getting streaming token:', error)
      throw error
    }
  }

  async startRecording() {
    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        } 
      })

      // Create new transcription session
      const response = await fetch('/transcriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content
        },
        body: JSON.stringify({})
      })

      if (!response.ok) {
        throw new Error('Failed to create transcription session')
      }

      const transcriptionData = await response.json()
      this.currentTranscriptionId = transcriptionData.id
      this.currentSessionId = transcriptionData.session_id
      
      // Set up ActionCable connection for real-time updates
      this.setupActionCable(this.currentSessionId)

      // Start AssemblyAI streaming
      await this.startAssemblyAIStreaming(stream)

      // Set up traditional recording for backup
      this.setupTraditionalRecording(stream)

      // Update UI
      this.startBtnTarget.style.display = 'none'
      this.stopBtnTarget.style.display = 'inline-block'
      this.updateStatus("success", "Recording... Speak clearly into your microphone")
      this.liveTranscriptionTarget.textContent = "Listening..."
      this.liveTranscriptionTarget.classList.add('text-muted')

    } catch (error) {
      console.error('Error starting recording:', error)
      this.updateStatus("error", `Error: ${error.message}`)
    }
  }

  async startAssemblyAIStreaming(stream) {
    try {
      // Get streaming token
      const token = await this.getStreamingToken()
      
      // Create WebSocket connection to AssemblyAI
      this.assemblySocket = new WebSocket('wss://streaming.assemblyai.com/v3/ws?token=' + token)
      
      this.assemblySocket.onopen = () => {
        // console.log('Connected Streaming Api')
        this.isStreaming = true
        
        // Set up audio processing
        this.setupAudioProcessing(stream)
      }
      
      this.assemblySocket.onmessage = (event) => {
        const data = JSON.parse(event.data)
        this.handleAssemblyAIMessage(data)
      }
      
      this.assemblySocket.onerror = (error) => {
        console.error('AssemblyAI WebSocket error:', error)
        this.updateStatus("error", "Streaming connection error")
      }
      
      this.assemblySocket.onclose = () => {
        // console.log('AssemblyAI streaming connection closed')
        this.isStreaming = false
      }
      
    } catch (error) {
      console.error('Failed to start AssemblyAI streaming:', error)
      this.updateStatus("error", "Failed to start real-time transcription")
    }
  }

  setupAudioProcessing(stream) {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
    const source = this.audioContext.createMediaStreamSource(stream)
    
    // Create a ScriptProcessorNode for audio processing
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1)
    
    this.processor.onaudioprocess = (event) => {
      if (this.isStreaming && this.assemblySocket && this.assemblySocket.readyState === WebSocket.OPEN) {
        const inputBuffer = event.inputBuffer.getChannelData(0)
        
        // Convert Float32Array to Int16Array (16-bit PCM)
        const pcmData = new Int16Array(inputBuffer.length)
        for (let i = 0; i < inputBuffer.length; i++) {
          pcmData[i] = Math.max(-32768, Math.min(32767, inputBuffer[i] * 32768))
        }
        
        // Send audio data to AssemblyAI
        this.assemblySocket.send(pcmData.buffer)
      }
    }
    
    source.connect(this.processor)
    this.processor.connect(this.audioContext.destination)
  }

  setupTraditionalRecording(stream) {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ]
    const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type)) || ''

    this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    
    this.audioChunks = []

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data)
      }
    }

    this.mediaRecorder.onstop = () => {
      this.processRecording()
      stream.getTracks().forEach(track => track.stop())
    }

    // Start recording (collect data every second)
    this.mediaRecorder.start(1000)
  }

  handleAssemblyAIMessage(data) {
    if (data.message_type === 'PartialTranscript' || data.message_type === 'FinalTranscript') {
      const text = data.text
      if (text && text.trim()) {
        this.displayLiveTranscription(text)
      }
    } else if (data.message_type === 'Error') {
      console.error('AssemblyAI error:', data.error)
      this.updateStatus("error", `Transcription error: ${data.error}`)
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop()
    }

    // Stop speech recognition
    this.stopSpeechRecognition()

    // Clear any pending subtitle timer
    if (this.clearTranscriptionTimer) {
      clearTimeout(this.clearTranscriptionTimer)
      this.clearTranscriptionTimer = null
    }

    // Update UI
    this.startBtnTarget.style.display = 'inline-block'
    this.stopBtnTarget.style.display = 'none'
    this.updateStatus("info", "Processing recording...")
  }

  startSpeechRecognition() {
    if (!window.SpeechRecognition || this.isRecognitionActive) {
      return
    }

    try {
      this.speechRecognition = new window.SpeechRecognition()
      this.speechRecognition.continuous = true
      this.speechRecognition.interimResults = true
      this.speechRecognition.lang = 'en-US'

      this.speechRecognition.onstart = () => {
        this.isRecognitionActive = true
        console.log('Speech recognition started')
      }

      this.speechRecognition.onresult = (event) => {
        let interimTranscript = ''
        let finalTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript
          } else {
            interimTranscript += transcript
          }
        }

        // Show the current speech (interim or final) as subtitles
        const currentText = (finalTranscript + interimTranscript).trim()
        if (currentText) {
          this.displayLiveTranscription(currentText)
        }
      }

      this.speechRecognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        if (event.error === 'not-allowed') {
          this.updateStatus("error", "Microphone access denied. Please allow microphone access and try again.")
        }
      }

      this.speechRecognition.onend = () => {
        this.isRecognitionActive = false
        console.log('Speech recognition ended')
        // Auto-restart if still recording
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
          setTimeout(() => {
            this.startSpeechRecognition()
          }, 100)
        }
      }

      this.speechRecognition.start()
    } catch (error) {
      console.error('Failed to start speech recognition:', error)
    }
  }

  stopSpeechRecognition() {
    if (this.speechRecognition && this.isRecognitionActive) {
      this.speechRecognition.stop()
      this.isRecognitionActive = false
    }
  }

  displayLiveTranscription(text) {
    // Show the transcription immediately (subtitle-like behavior)
    this.liveTranscriptionTarget.textContent = text
    this.liveTranscriptionTarget.classList.remove('text-muted')
    
    // Clear any existing timer
    if (this.clearTranscriptionTimer) {
      clearTimeout(this.clearTranscriptionTimer)
    }
    
    // Set a new timer to clear the transcription after pause
    this.clearTranscriptionTimer = setTimeout(() => {
      this.liveTranscriptionTarget.textContent = "Listening..."
      this.liveTranscriptionTarget.classList.add('text-muted')
      this.clearTranscriptionTimer = null
    }, this.pauseTimeout)
  }

  async processRecording() {
    if (this.audioChunks.length === 0) return

    // Create blob from recorded audio
    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm;codecs=opus' })
    
    // Create FormData for upload
    const formData = new FormData()
    formData.append('audio_blob', audioBlob, 'recording.webm')

    try {
      // Upload audio for processing
      const response = await fetch(`/transcriptions/${this.currentTranscriptionId}/update_transcription`, {
        method: 'PATCH',
        headers: {
          'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content
        },
        body: formData
      })

      if (!response.ok) {
        throw new Error('Failed to upload audio')
      }

      this.updateStatus("info", "Transcribing audio...")

    } catch (error) {
      console.error('Error processing recording:', error)
      this.updateStatus("error", `Error: ${error.message}`)
    }
  }

  setupActionCable(sessionId) {
    // Reuse the global Action Cable consumer created via importmap
    this.cable = consumer
    
    // Subscribe to the transcription channel
    this.subscription = this.cable.subscriptions.create(
      { 
        channel: "TranscriptionChannel", 
        session_id: sessionId 
      },
      {
        connected: () => {
          // console.log("Connected to TranscriptionChannel")
        },
        
        disconnected: () => {
          // console.log("Disconnected from TranscriptionChannel")
        },
        
        received: (data) => {
          this.handleRealtimeUpdate(data)
        }
      }
    )
  }

  handleRealtimeUpdate(data) {
    switch (data.type) {
      case 'partial_transcription':
        // This is from ActionCable - show immediately
        this.displayLiveTranscription(data.text)
        break
        
      case 'transcription_complete':
        // Clear the timer since we're done
        if (this.clearTranscriptionTimer) {
          clearTimeout(this.clearTranscriptionTimer)
          this.clearTranscriptionTimer = null
        }
        
        this.liveTranscriptionTarget.textContent = data.text
        this.liveTranscriptionTarget.classList.remove('text-muted')
        this.finalTranscriptionTarget.textContent = data.text
        this.finalResultsTarget.style.display = 'block'
        
        if (data.speakers && data.speakers.length > 0) {
          this.displaySpeakerInfo(data.speakers)
        }
        
        this.updateStatus("info", "Generating summary...")
        break
        
      case 'summary_complete':
        this.summaryContentTarget.innerHTML = `<div class="alert alert-success">${data.summary}</div>`
        this.updateStatus("success", "Transcription and summary complete!")
        break
        
      case 'error':
        // Clear timer on error
        if (this.clearTranscriptionTimer) {
          clearTimeout(this.clearTranscriptionTimer)
          this.clearTranscriptionTimer = null
        }
        this.liveTranscriptionTarget.classList.add('text-muted')
        this.updateStatus("error", data.message)
        break
    }
  }

  displaySpeakerInfo(speakers) {
    const speakersHtml = speakers.map((speaker, index) => {
      return `<div class="badge bg-secondary me-2">Speaker ${speaker.speaker || index + 1}</div>`
    }).join('')
    
    this.speakersListTarget.innerHTML = speakersHtml
    this.speakerInfoTarget.style.display = 'block'
  }

  copyTranscription() {
    const text = this.finalTranscriptionTarget.textContent
    navigator.clipboard.writeText(text).then(() => {
      // Show temporary success message
      const btn = event.target
      const originalText = btn.innerHTML
      btn.innerHTML = '<i class="bi bi-check me-1"></i> Copied!'
      btn.classList.remove('btn-outline-primary')
      btn.classList.add('btn-success')
      
      setTimeout(() => {
        btn.innerHTML = originalText
        btn.classList.remove('btn-success')
        btn.classList.add('btn-outline-primary')
      }, 2000)
    })
  }

  updateStatus(type, message) {
    this.statusTextTarget.textContent = message
    
    // Update alert class
    this.statusAlertTarget.className = `alert alert-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info'}`
  }
}