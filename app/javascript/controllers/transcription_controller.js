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
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.updateStatus("error", "Your browser doesn't support audio recording.")
      return
    }

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
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        } 
      })

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
      
      this.setupActionCable(this.currentSessionId)

      await this.startAssemblyAIStreaming(stream)

      this.setupTraditionalRecording(stream)

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
      const token = await this.getStreamingToken()
      this.assemblySocket = new WebSocket('wss://streaming.assemblyai.com/v3/ws?token=' + token)
      
      this.assemblySocket.onopen = () => {
        this.isStreaming = true
        
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
      
      this.assemblySocket.onclose = (event) => {
        console.log('AssemblyAI streaming connection closed', event.code, event.reason)
        this.isStreaming = false
        
        if (event.code !== 1000 && event.code !== 1001) {
          console.log('Attempting to reconnect to AssemblyAI...')
          setTimeout(() => {
            if (!this.isStreaming) {
              this.startAssemblyAIStreaming(stream)
            }
          }, 2000)
        }
      }
      
    } catch (error) {
      console.error('Failed to start AssemblyAI streaming:', error)
      this.updateStatus("error", "Failed to start real-time transcription")
    }
  }

  async setupAudioProcessing(stream) {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
      console.log('AudioContext sample rate:', this.audioContext.sampleRate)
      
      const processorPath = '/audio-stream-processor.js'
      await this.audioContext.audioWorklet.addModule(processorPath)
      
      const source = this.audioContext.createMediaStreamSource(stream)
      
      this.processor = new AudioWorkletNode(this.audioContext, 'audio-stream-processor')

      this.processor.port.onmessage = (event) => {
        if (this.isStreaming && this.assemblySocket && this.assemblySocket.readyState === WebSocket.OPEN) {
          console.log('Sending audio data to AssemblyAI, size:', event.data.byteLength)
          this.assemblySocket.send(event.data)
        } else {
          console.log('Streaming Socket:', {
            isStreaming: this.isStreaming,
            socketState: this.assemblySocket?.readyState,
            webSocketOpen: WebSocket.OPEN
          })
        }
      }
      
      source.connect(this.processor)
      this.processor.connect(this.audioContext.destination)
    } catch (error) {
      console.error('Error setting up audio processing:', error)
      this.setupAudioProcessingFallback(stream)
    }
  }

  setupAudioProcessingFallback(stream) {
    
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const source = this.audioContext.createMediaStreamSource(stream)
    
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1)
    
    this.processor.onaudioprocess = (event) => {
      if (this.isStreaming && this.assemblySocket && this.assemblySocket.readyState === WebSocket.OPEN) {
        const inputBuffer = event.inputBuffer.getChannelData(0)
        
        const targetSampleRate = 16000
        const sourceSampleRate = this.audioContext.sampleRate
        let resampledData = inputBuffer
        
        if (sourceSampleRate !== targetSampleRate) {
          const ratio = sourceSampleRate / targetSampleRate
          const newLength = Math.round(inputBuffer.length / ratio)
          resampledData = new Float32Array(newLength)
          
          for (let i = 0; i < newLength; i++) {
            const sourceIndex = Math.round(i * ratio)
            resampledData[i] = inputBuffer[Math.min(sourceIndex, inputBuffer.length - 1)]
          }
        }
        
        const pcmData = new Int16Array(resampledData.length)
        for (let i = 0; i < resampledData.length; i++) {
          pcmData[i] = Math.max(-32768, Math.min(32767, resampledData[i] * 32768))
        }
        
        this.assemblySocket.send(pcmData.buffer)
      } else {
        console.log('Not streaming or socket not ready (fallback):', {
          isStreaming: this.isStreaming,
          socketState: this.assemblySocket?.readyState,
          webSocketOpen: WebSocket.OPEN
        })
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

    this.mediaRecorder.start(1000)
  }

  handleAssemblyAIMessage(data) {
    
    if (data.message_type === 'SessionBegins') {
    } else if (data.message_type === 'PartialTranscript' || data.message_type === 'FinalTranscript') {
      const text = data.text
      if (text && text.trim()) {
        this.displayLiveTranscription(text)
      }
    } else if (data.message_type === 'Error') {
      console.error('AssemblyAI error:', data.error)
      this.updateStatus("error", `Transcription error: ${data.error}`)
    } else if (data.transcript !== undefined) {
      const text = data.transcript
      if (text && text.trim()) {
        this.displayLiveTranscription(text)
      }
    } else {
      console.log('Other AssemblyAI message:', data.message_type || 'no message_type', data)
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop()
    }

    // Stop AssemblyAI streaming
    if (this.assemblySocket) {
      this.assemblySocket.close()
    }
    if (this.audioContext) {
      this.audioContext.close()
    }
    this.isStreaming = false

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
          console.log("Connected to TranscriptionChannel")
        },
        
        disconnected: () => {
          console.log("Disconnected from TranscriptionChannel")
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